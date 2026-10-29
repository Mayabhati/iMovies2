/* Usage: npm run seed | npm run seed:reset (reset is demo/dev-only and has explicit target guards). */
const mongoose = require('mongoose');
const config = require('../config/env');
const { connectDb } = require('../config/db');
const { User, Movie, Theater, Show, ScreenSchedule, SeatInventory, Booking, Payment, Notification } = require('../models');
const { createShow } = require('../services/showService');
const ensureAdmin = require('./ensureAdmin');
const { posterFor, backfillSeedPosters } = require('./posters');
const { hashPassword } = require('../utils/password');
const { validateResetTarget } = require('./resetGuard');

const day = 86400000;
const CLEANING_BUFFER_MIN = 15;
const movies = [
  ['Midnight Monsoon', 'A retired detective returns to Mumbai during the monsoon to solve one last case.', ['Crime', 'Thriller'], 128, 'Hindi', 'UA', -20],
  ['Orbit Station Nine', 'A repair crew discovers that their space station is not as empty as it seems.', ['Sci-Fi', 'Thriller'], 142, 'English', 'UA', -12],
  ['The Last Chai Stall', 'A heartwarming comedy about a street vendor who takes on a billion-dollar café chain.', ['Comedy', 'Drama'], 118, 'Hindi', 'U', -30],
  ['Dragon Kite Festival', 'Two siblings embark on a magical journey to save their village festival.', ['Animation', 'Family', 'Adventure'], 96, 'English', 'U', -8],
  ['Ghats of Varanasi', 'A quiet romance blooms between a boatman and a visiting photographer.', ['Romance', 'Drama'], 135, 'Hindi', 'UA', -15],
  ['Iron Circuit', 'A street racer is pulled into a heist that spans three cities.', ['Action'], 152, 'Telugu', 'UA', -5],
  ['Whispers in the Haveli', 'A family returns to an ancestral mansion where something has been waiting.', ['Horror', 'Mystery'], 112, 'Hindi', 'A', -10],
  ['Stardust Summer', 'Four friends spend one last summer before college changes everything.', ['Comedy', 'Romance'], 124, 'English', 'UA', 12],
].map(([title, description, genres, durationMinutes, language, certificate, offset]) => ({
  title, description, genres, durationMinutes, language, certificate,
  releaseDate: new Date(Date.now() + offset * day), posterUrl: posterFor(title),
}));

const screens = [
  { name: 'Screen 1', rows: 8, seatsPerRow: 12, premiumRows: 2 },
  { name: 'Screen 2', rows: 6, seatsPerRow: 10, premiumRows: 1 },
];
const theaters = [
  { name: 'iMovies Central', city: 'Indore', address: 'MG Road, Indore, Madhya Pradesh', screens },
  { name: 'iMovies Treasure Island', city: 'Indore', address: 'Treasure Island Mall, Indore', screens },
  { name: 'iMovies Vijay Nagar', city: 'Indore', address: 'Vijay Nagar Square, Indore', screens },
];
const times = [[10, 30], [14, 30], [19, 0]];

/** Cinema-local time (TZ_OFFSET_MINUTES) on day +d at hh:mm -> UTC Date. */
function localSlot(d, hh, mm) {
  const local = new Date(Date.now() + config.tzOffsetMinutes * 60000);
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d);
  return new Date(base - config.tzOffsetMinutes * 60000 + (hh * 60 + mm) * 60000);
}

async function seedFutureShows(seedMovies, seedTheaters) {
  const showDays = config.seedShowDays;
  let created = 0;
  let occupied = 0;
  let beforeRelease = 0;
  for (let d = 1; d <= showDays; d++) {
    for (const [ti, theater] of seedTheaters.entries()) {
      for (const screen of theater.screens) {
        for (const [slot, [hh, mm]] of times.entries()) {
          const start = localSlot(d, hh, mm);
          const eligible = seedMovies.filter((movie) => movie.isActive && movie.releaseDate <= start);
          if (!eligible.length) { beforeRelease++; continue; }
          // Stable selection means repeated seeding proposes the same show for each time slot.
          const movie = eligible[(d + ti * 2 + (screen.name === 'Screen 2' ? 1 : 0) + slot) % eligible.length];
          const end = new Date(start.getTime() + (movie.durationMinutes + CLEANING_BUFFER_MIN) * 60000);
          const occupiedSlot = await Show.exists({
            theater: theater._id, screenName: screen.name, status: 'SCHEDULED',
            startsAt: { $lt: end }, endsAt: { $gt: start },
          });
          if (occupiedSlot) { occupied++; continue; }
          try {
            await createShow({
              movieId: movie._id, theaterId: theater._id, screenName: screen.name, startsAt: start,
              pricing: { standard: screen.name === 'Screen 1' ? 180 : 200, premium: screen.name === 'Screen 1' ? 320 : 350 },
            });
            created++;
          } catch (error) {
            // A parallel seeder/admin may have claimed this exact schedule slot; never suppress other errors.
            if (error.status === 409 && /overlapping show|schedule is being changed/i.test(error.message)) occupied++;
            else throw error;
          }
        }
      }
    }
  }
  const lastDay = localSlot(showDays, 23, 59);
  console.log(`Future show seeding: created ${created} show(s), skipped ${occupied} occupied slot(s), skipped ${beforeRelease} pre-release slot(s); configured horizon is ${showDays} days (through ${lastDay.toISOString()}).`);
}

async function main() {
  const resetting = process.argv.includes('--reset');
  config.validate();
  if (resetting) validateResetTarget({ isProd: config.isProd, mongoUri: config.mongoUri, allowedDb: process.env.SEED_RESET_ALLOWED_DB, confirmation: process.env.SEED_RESET_CONFIRM });
  await connectDb();

  if (resetting) {
    // The allowlisted target and confirmation are checked before any connection or deletion.
    await Promise.all([Movie, Theater, Show, ScreenSchedule, SeatInventory, Booking, Payment, Notification].map((m) => m.deleteMany({})));
    console.log('Demo catalogue and booking records reset. User accounts were preserved.');
  }

  const admin = await ensureAdmin();
  console.log(admin.skipped ? 'Admin: skipped (set ADMIN_EMAIL / ADMIN_PASSWORD)' : `Admin ${admin.created ? 'created' : 'already present (left unchanged)'}: ${admin.email}`);
  if (process.env.SEED_CUSTOMER_EMAIL && process.env.SEED_CUSTOMER_PASSWORD && !config.isProd) {
    const email = process.env.SEED_CUSTOMER_EMAIL.trim().toLowerCase();
    if (!(await User.exists({ email }))) {
      await User.create({ name: 'Demo Customer', email, passwordHash: await hashPassword(process.env.SEED_CUSTOMER_PASSWORD) });
      console.log(`Demo customer created: ${email}`);
    }
  }

  const existingMovies = await Movie.estimatedDocumentCount();
  if (existingMovies === 0) {
    const createdMovies = await Movie.insertMany(movies);
    const createdTheaters = await Theater.insertMany(theaters);
    console.log(`Seeded ${createdMovies.length} demo movies and ${createdTheaters.length} demo theaters.`);
  } else {
    const filled = await backfillSeedPosters(Movie, movies.map((m) => m.title));
    if (filled) console.log(`Added posters to ${filled} seeded movie(s) that had none.`);
  }

  // Top up future shows on repeat runs without replacing customer data or duplicating existing shows.
  const seededMovies = await Movie.find({ title: { $in: movies.map((m) => m.title) }, isActive: true }).sort({ title: 1 });
  const seededTheaters = await Theater.find({ name: { $in: theaters.map((t) => t.name) } }).sort({ name: 1 });
  if (seededMovies.length === movies.length && seededTheaters.length === theaters.length) {
    await seedFutureShows(seededMovies, seededTheaters);
  } else {
    console.log('Existing non-demo catalogue detected; demo show top-up skipped. No existing catalogue records were overwritten.');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error('Seed failed:', e.message); // messages do not include credential values
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { main, localSlot, seedFutureShows };
