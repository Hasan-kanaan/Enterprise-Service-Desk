import assert from 'node:assert/strict'

export const storageAuditScript = `(() => {
  window.__storageWrites = [];
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    window.__storageWrites.push({ key: String(key), value: String(value), session: this === sessionStorage });
    return original.call(this, key, value);
  };
})()`

export async function assertPrivateStorage(evaluate) {
  const storage = await evaluate(`(async () => ({
    local: Object.entries(localStorage), session: Object.entries(sessionStorage),
    writes: window.__storageWrites ?? [], cookie: document.cookie,
    databases: indexedDB.databases ? (await indexedDB.databases()).map(db => db.name) : [],
    caches: await caches.keys()
  }))()`)
  assert.deepEqual(storage.session, [])
  assert.deepEqual(storage.databases, [])
  assert.deepEqual(storage.caches, [])
  assert(!/refresh|access|opaque-/i.test(storage.cookie))
  for (const { key, value, session } of [
    ...storage.local.map(([key, value]) => ({ key, value })), ...storage.writes,
  ]) {
    assert(!session, 'Application never writes sessionStorage')
    if (key === 'kino-theme') { assert(['light', 'dark'].includes(value)); continue }
    if (key === 'service-desk:auth:v1:probe') { assert.equal(value, '1'); continue }
    assert.equal(key, 'service-desk:auth:v1', 'No unapproved durable application keys')
    const fence = JSON.parse(value)
    assert.match(fence.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert(['session', 'out', 'pending', 'network'].includes(fence.kind))
    assert.deepEqual(Object.keys(fence).sort(), (fence.kind === 'network' ? ['id', 'kind', 'until'] : ['id', 'kind']))
    if (fence.kind === 'network') assert(Number.isSafeInteger(fence.until))
  }
}
