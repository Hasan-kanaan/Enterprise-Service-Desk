// Database-backed tests must be explicitly pointed at a separate test database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error(
    'Set TEST_DATABASE_URL to a migrated PostgreSQL database whose name ends in _test',
  );
}
process.env.DATABASE_URL = testUrl;
