const { Movie, Theater, Show, ScreenSchedule, SeatInventory, Booking } = require('../models');
const ApiError = require('../utils/ApiError');
const { runTransaction } = require('../utils/transaction');

const CLEANING_BUFFER_MIN = 15;

function buildSeats(show, screen) {
  const seats = [];
  for (let r = 0; r < screen.rows; r++) {
    const row = String.fromCharCode(65 + r);
    const premium = r >= screen.rows - screen.premiumRows;
    for (let n = 1; n <= screen.seatsPerRow; n++) {
      seats.push({
        show: show._id, label: `${row}${n}`, row, number: n,
        category: premium ? 'PREMIUM' : 'STANDARD',
        price: premium ? show.pricing.premium : show.pricing.standard,
        status: 'AVAILABLE',
      });
    }
  }
  return seats;
}

/** Loads and validates everything a show depends on. Pass `session` for transaction-consistent reads. */
async function loadAndValidate({ movieId, theaterId, screenName, startsAt }, session) {
  const opts = session ? { session } : {};
  const movie = await Movie.findById(movieId, null, opts);
  const theater = await Theater.findById(theaterId, null, opts);
  if (!movie || !movie.isActive) throw new ApiError(404, 'Movie not found or inactive');
  if (!theater) throw new ApiError(404, 'Theater not found');
  const screen = theater.screens.find((s) => s.name === screenName);
  if (!screen) throw new ApiError(400, `Screen "${screenName}" does not exist in ${theater.name}`);

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, 'Invalid show start time');
  if (start <= new Date()) throw new ApiError(400, 'Show start time must be in the future');
  if (start < movie.releaseDate) throw new ApiError(400, 'A show cannot start before the movie release date');
  const endsAt = new Date(start.getTime() + (movie.durationMinutes + CLEANING_BUFFER_MIN) * 60000);
  return { movie, theater, screen, start, endsAt };
}

async function ensureScreenLock(theaterId, screenName) {
  try {
    await ScreenSchedule.updateOne({ theater: theaterId, screenName }, { $setOnInsert: { version: 0 } }, { upsert: true });
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
}

async function touchScreenLocks(keys, session) {
  const unique = new Map(keys.map((k) => [`${String(k.theater)}:${k.screenName}`, k]));
  // A stable order avoids lock-order inversions when a show is moved between screens.
  const ordered = [...unique.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, key] of ordered) {
    const result = await ScreenSchedule.updateOne(key, { $inc: { version: 1 } }, { session });
    if (result.matchedCount !== 1) throw new ApiError(409, 'Screen schedule lock is missing; please retry');
  }
}

async function reconcileSeats(show, screen, session) {
  const seats = buildSeats(show, screen);
  const labels = seats.map((seat) => seat.label);
  await SeatInventory.deleteMany({ show: show._id, label: { $nin: labels } }, { session });
  if (!seats.length) return;
  await SeatInventory.bulkWrite(seats.map((seat) => ({
    updateOne: {
      filter: { show: show._id, label: seat.label },
      update: {
        $set: { row: seat.row, number: seat.number, category: seat.category, price: seat.price, status: 'AVAILABLE' },
        $unset: { booking: '', holdExpiresAt: '' },
        $setOnInsert: { show: show._id, label: seat.label },
      },
      upsert: true,
    },
  })), { session, ordered: true });
}

function isTransient(error) {
  return error && typeof error.hasErrorLabel === 'function' && error.hasErrorLabel('TransientTransactionError');
}
function schedulingError(error) {
  if (isTransient(error)) return new ApiError(409, "This screen's schedule is being changed by another request. Please retry.");
  return error;
}

/** Create a show and every seat atomically while serialising schedule changes per screen. */
async function createShow({ movieId, theaterId, screenName, startsAt, pricing }) {
  await loadAndValidate({ movieId, theaterId, screenName, startsAt });
  await ensureScreenLock(theaterId, screenName);
  try {
    return await runTransaction(async (session) => {
      await touchScreenLocks([{ theater: theaterId, screenName }], session);
      const { movie, theater, screen, start, endsAt } = await loadAndValidate({ movieId, theaterId, screenName, startsAt }, session);
      const clash = await Show.exists({ theater: theater._id, screenName, status: 'SCHEDULED', startsAt: { $lt: endsAt }, endsAt: { $gt: start } }).session(session);
      if (clash) throw new ApiError(409, 'This screen already has an overlapping show');
      const [show] = await Show.create([{ movie: movie._id, theater: theater._id, screenName, startsAt: start, endsAt, pricing }], { session });
      await SeatInventory.insertMany(buildSeats(show, screen), { session });
      return show;
    });
  } catch (e) { throw schedulingError(e); }
}

/**
 * Updates a show with the same overlap lock used by creation. Structural edits are forbidden once any booking
 * record refers to the show, preserving the customer-facing booking history. Price changes only update AVAILABLE
 * inventory; held/booked seats keep the exact price snapshot selected when the reservation was made.
 */
async function updateShow({ showId, movieId, theaterId, screenName, startsAt, pricing }) {
  const initial = await Show.findById(showId);
  if (!initial) throw new ApiError(404, 'Show not found');
  await loadAndValidate({ movieId, theaterId, screenName, startsAt });
  const oldKey = { theater: initial.theater, screenName: initial.screenName };
  const newKey = { theater: theaterId, screenName };
  await Promise.all([oldKey, newKey].map((k) => ensureScreenLock(k.theater, k.screenName)));

  try {
    return await runTransaction(async (session) => {
      await touchScreenLocks([oldKey, newKey], session);
      const show = await Show.findById(showId, null, { session });
      if (!show) throw new ApiError(404, 'Show not found');
      if (String(show.theater) !== String(initial.theater) || show.screenName !== initial.screenName) {
        throw new ApiError(409, 'This show was changed by another admin. Reload the list and try again.');
      }
      const { movie, theater, screen, start, endsAt } = await loadAndValidate({ movieId, theaterId, screenName, startsAt }, session);
      const structuralChange = String(show.movie) !== String(movie._id)
        || String(show.theater) !== String(theater._id)
        || show.screenName !== screenName
        || new Date(show.startsAt).getTime() !== start.getTime()
        || new Date(show.endsAt).getTime() !== endsAt.getTime();
      const hasBookings = Boolean(await Booking.exists({ show: show._id }).session(session));
      if (hasBookings && structuralChange) {
        throw new ApiError(409, 'This show has booking history. Movie, theater, screen, and start time cannot be changed; adjust only the prices for future available seats.');
      }
      const clash = await Show.exists({
        _id: { $ne: show._id }, theater: theater._id, screenName, status: 'SCHEDULED',
        startsAt: { $lt: endsAt }, endsAt: { $gt: start },
      }).session(session);
      if (clash) throw new ApiError(409, 'This screen already has an overlapping show');

      show.movie = movie._id;
      show.theater = theater._id;
      show.screenName = screenName;
      show.startsAt = start;
      show.endsAt = endsAt;
      show.pricing = pricing;
      await show.save({ session });

      if (structuralChange) {
        // Reconcile by (show, label) instead of delete/reinsert; this respects the unique seat index
        // even when the edited screen retains the same labels.
        await reconcileSeats(show, screen, session);
      } else {
        await SeatInventory.updateMany({ show: show._id, status: 'AVAILABLE', category: 'STANDARD' }, { $set: { price: pricing.standard } }, { session });
        await SeatInventory.updateMany({ show: show._id, status: 'AVAILABLE', category: 'PREMIUM' }, { $set: { price: pricing.premium } }, { session });
      }
      return show;
    });
  } catch (e) { throw schedulingError(e); }
}

/** Physically removes only shows without any booking history, atomically with their seat inventory. */
async function deleteShow(showId) {
  const initial = await Show.findById(showId);
  if (!initial) throw new ApiError(404, 'Show not found');
  const key = { theater: initial.theater, screenName: initial.screenName };
  await ensureScreenLock(key.theater, key.screenName);
  try {
    return await runTransaction(async (session) => {
      await touchScreenLocks([key], session);
      const show = await Show.findById(showId, null, { session });
      if (!show) throw new ApiError(404, 'Show not found');
      if (String(show.theater) !== String(initial.theater) || show.screenName !== initial.screenName) {
        throw new ApiError(409, 'This show was changed by another admin. Reload the list and try again.');
      }
      if (await Booking.exists({ show: show._id }).session(session)) {
        throw new ApiError(409, 'This show has booking history and cannot be deleted. Existing bookings and payment records are preserved.');
      }
      await SeatInventory.deleteMany({ show: show._id }, { session });
      await Show.deleteOne({ _id: show._id }, { session });
      return { id: String(show._id) };
    });
  } catch (e) { throw schedulingError(e); }
}

module.exports = { createShow, updateShow, deleteShow, buildSeats };
