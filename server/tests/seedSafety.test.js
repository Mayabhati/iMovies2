const h = require('./helpers');
const config = require('../src/config/env');
const { Movie, Theater, Show, SeatInventory } = h.models;
const { seedFutureShows, localSlot } = require('../src/seed/seed');
const { databaseNameFromUri, validateResetTarget } = require('../src/seed/resetGuard');

const DAY = 86400000;
let originalWindow;

beforeAll(() => h.connectDb('seed-safety'));
afterAll(() => h.disconnectDb());
beforeEach(async () => {
  await h.resetDb();
  originalWindow = config.seedShowDays;
});
afterEach(() => { config.seedShowDays = originalWindow; });

describe('seed:reset safeguards', () => {
  test('resolves only the database path, including SRV connection strings', () => {
    expect(databaseNameFromUri('mongodb://localhost:27017/imovies_demo?replicaSet=rs0')).toBe('imovies_demo');
    expect(databaseNameFromUri('mongodb+srv://user:pass@cluster.example.mongodb.net/imovies_dev')).toBe('imovies_dev');
  });
  test('always refuses production reset, even with confirmation', () => {
    expect(() => validateResetTarget({ isProd: true, mongoUri: 'mongodb://localhost/imovies_demo', allowedDb: 'imovies_demo', confirmation: 'RESET-IMOVIES-DEMO-DATABASE' })).toThrow(/production/i);
  });
  test('refuses a mismatched/non-demo database and a missing explicit confirmation', () => {
    expect(() => validateResetTarget({ isProd: false, mongoUri: 'mongodb://localhost/imovies', allowedDb: 'imovies', confirmation: 'RESET-IMOVIES-DEMO-DATABASE' })).toThrow(/dedicated database/i);
    expect(() => validateResetTarget({ isProd: false, mongoUri: 'mongodb://localhost/imovies_demo', allowedDb: 'imovies_demo', confirmation: '' })).toThrow(/confirmation is missing/i);
    expect(() => validateResetTarget({ isProd: false, mongoUri: 'mongodb://localhost/imovies_demo', allowedDb: 'imovies_dev', confirmation: 'RESET-IMOVIES-DEMO-DATABASE' })).toThrow(/dedicated database/i);
  });
  test('permits only a confirmed, exact demo database target', () => {
    expect(validateResetTarget({ isProd: false, mongoUri: 'mongodb://localhost/imovies_demo?replicaSet=rs0', allowedDb: 'imovies_demo', confirmation: 'RESET-IMOVIES-DEMO-DATABASE' })).toBe('imovies_demo');
  });
});

describe('future show seeding', () => {
  test('normal repeat seeding is idempotent and does not schedule before release date', async () => {
    config.seedShowDays = 2;
    const [released, upcoming] = await Movie.create([
      { title: 'Seed Released Movie', description: 'A movie released before the seed test.', genres: ['Drama'], durationMinutes: 100, language: 'English', releaseDate: new Date(Date.now() - 5 * DAY) },
      { title: 'Seed Upcoming Movie', description: 'A movie whose release date is later.', genres: ['Drama'], durationMinutes: 100, language: 'English', releaseDate: new Date(Date.now() + 5 * DAY) },
    ]);
    const theater = await Theater.create({ name: 'Seed Test Theater', city: 'Indore', address: '1 Seed Test Road', screens: [{ name: 'Screen 1', rows: 2, seatsPerRow: 4, premiumRows: 1 }] });

    await seedFutureShows([released, upcoming], [theater]);
    const firstCount = await Show.countDocuments({});
    expect(firstCount).toBe(6); // 2 days × 3 show slots × 1 screen
    const seededShows = await Show.find({}).sort({ startsAt: 1 });
    expect(seededShows.every((show) => show.startsAt > new Date())).toBe(true);
    expect(seededShows.every((show) => String(show.movie) === String(released._id))).toBe(true);
    expect(seededShows.every((show) => show.startsAt >= released.releaseDate)).toBe(true);
    expect(seededShows.every((show) => show.startsAt < localSlot(3, 0, 0))).toBe(true);
    expect(await SeatInventory.countDocuments({})).toBe(48);

    await seedFutureShows([released, upcoming], [theater]);
    expect(await Show.countDocuments({})).toBe(firstCount);
    expect(await SeatInventory.countDocuments({})).toBe(48);
  });
});
