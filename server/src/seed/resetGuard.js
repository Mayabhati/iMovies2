function databaseNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  } catch {
    return '';
  }
}

function validateResetTarget({ isProd, mongoUri, allowedDb, confirmation }) {
  if (isProd) {
    throw new Error('Refusing to run seed:reset with NODE_ENV=production. Production resets are not supported, even with an override flag.');
  }
  const actual = databaseNameFromUri(mongoUri || '');
  const allowed = (allowedDb || '').trim();
  if (!['imovies_demo', 'imovies_dev'].includes(actual) || actual !== allowed) {
    throw new Error('Refusing to reset this database. Use a dedicated database named imovies_demo or imovies_dev, set SEED_RESET_ALLOWED_DB to that exact name, and verify MONGO_URI before retrying.');
  }
  if (confirmation !== 'RESET-IMOVIES-DEMO-DATABASE') {
    throw new Error('Reset confirmation is missing. Set SEED_RESET_CONFIRM=RESET-IMOVIES-DEMO-DATABASE only after confirming that MONGO_URI targets disposable demo data.');
  }
  return actual;
}

module.exports = { databaseNameFromUri, validateResetTarget };
