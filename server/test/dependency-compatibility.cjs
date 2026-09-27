// Exercise overridden APIs through their actual parent resolution, without networking.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { test } = require('node:test');

test('GCS gaxios builds multipart requests with the overridden UUID implementation', async () => {
  const storageRequire = createRequire(require.resolve('@google-cloud/storage'));
  const { Gaxios } = storageRequire('gaxios');
  let intercepted = false;
  const response = await new Gaxios().request({
    url: 'https://storage.invalid/never-contacted',
    method: 'POST',
    multipart: [
      { headers: { 'Content-Type': 'application/json' }, content: '{"name":"test"}' },
      { headers: { 'Content-Type': 'text/plain' }, content: 'attachment bytes' },
    ],
    adapter: async (options) => {
      intercepted = true;
      const type = options.headers['Content-Type'];
      assert.match(type, /^multipart\/related; boundary=[0-9a-f-]{36}$/);
      const boundary = type.split('boundary=')[1];
      let body = '';
      for await (const chunk of options.body) body += chunk.toString();
      assert.ok(body.includes(`--${boundary}`));
      assert.ok(body.includes('{"name":"test"}'));
      assert.ok(body.includes('attachment bytes'));
      return { status: 200, statusText: 'OK', headers: {}, data: 'ok', config: options };
    },
  });
  assert.equal(intercepted, true);
  assert.equal(response.data, 'ok');
});

test('Prisma config deepmerge preserves the plain configuration contract', () => {
  const prismaRequire = createRequire(require.resolve('prisma/config'));
  const configRequire = createRequire(prismaRequire.resolve('@prisma/config'));
  const { deepmerge } = configRequire('deepmerge-ts');
  const base = { migrations: { path: 'prisma/migrations' }, datasource: { url: 'old' } };
  const override = { datasource: { url: 'postgresql://localhost/isolated_test' } };
  assert.deepEqual(deepmerge(base, override), {
    migrations: { path: 'prisma/migrations' },
    datasource: { url: 'postgresql://localhost/isolated_test' },
  });
  assert.equal(base.datasource.url, 'old');
});
