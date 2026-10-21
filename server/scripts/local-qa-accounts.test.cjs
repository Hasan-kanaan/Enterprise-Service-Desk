const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment } = require('./local-qa-accounts.cjs');
const env = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://fixture:fixture@localhost:5432/enterprise_service_desk?schema=public' };
const args = ['--confirm-local=enterprise_service_desk'];
test('accepts only the explicitly confirmed local development target', () => {
  assert.doesNotThrow(() => validateEnvironment(env, args));
});
for (const mode of ['production', 'test', '', undefined]) {
  test(`refuses runtime mode ${String(mode)}`, () => {
    assert.throws(() => validateEnvironment({ ...env, NODE_ENV: mode }, args));
  });
}
for (const url of [
  'postgresql://fixture:fixture@cloud.example.test:5432/enterprise_service_desk',
  'postgresql://fixture:fixture@localhost:5432/enterprise_service_desk_test',
  'postgresql://fixture:fixture@localhost:5433/enterprise_service_desk',
  'postgresql://fixture:fixture@localhost:5432/enterprise_service_desk?host=cloud.example.test',
  'postgresql://fixture:fixture@localhost:5432/enterprise_service_desk?schema=private',
  'postgresql://fixture:fixture@localhost:5432/enterprise_service_desk#other',
  'https://localhost:5432/enterprise_service_desk',
]) {
  test(`refuses ambiguous or non-development target ${new URL(url).host}${new URL(url).pathname}${new URL(url).search}`, () => {
    assert.throws(() => validateEnvironment({ ...env, DATABASE_URL: url }, args));
  });
}
test('refuses missing, different, or extra confirmation arguments', () => {
  for (const supplied of [[], ['--confirm-local=other'], [...args, '--production']])
    assert.throws(() => validateEnvironment(env, supplied));
});
