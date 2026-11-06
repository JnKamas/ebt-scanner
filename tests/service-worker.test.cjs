const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function worker() {
  const handlers = {}, added = [], removed = [], stored = new Map();
  const source = fs.readFileSync('scripts/service-worker.js', 'utf8').replace('__VERSION__', 'test').replace('__ASSETS__', JSON.stringify(['/', '/icon.svg', '/_next/static/app.js']));
  const cache = { addAll: async assets => added.push(...assets), put: async (key, value) => stored.set(typeof key === 'string' ? key : key.url, value) };
  const caches = { open: async () => cache, keys: async () => ['ebt-web-old', 'another-app'], delete: async key => removed.push(key), match: async key => stored.get(key) };
  vm.runInNewContext(source, { self: { addEventListener: (name, callback) => handlers[name] = callback, skipWaiting: async () => {}, clients: { claim: async () => {} }, location: { origin: 'https://app.test' } }, caches, fetch: async () => { throw new Error('offline'); }, URL, Response });
  return { handlers, added, removed, stored };
}

test('installation prepares HTML and build assets; activation removes only our old caches', async () => {
  const w = worker();
  const waits = [];
  w.handlers.install({ waitUntil: p => waits.push(p) });
  w.handlers.activate({ waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  assert(w.added.includes('/'));
  assert(w.added.includes('/_next/static/app.js'));
  assert.deepEqual(w.removed, ['ebt-web-old']);
});

test('API data, RSC responses, third-party requests and non-GET requests bypass caches', () => {
  const w = worker();
  for (const [url, method] of [['https://app.test/api/ebt/session', 'GET'], ['https://app.test/?_rsc=test', 'GET'], ['https://evil.test/map', 'GET'], ['https://app.test/api/ebt/notes', 'POST']]) {
    w.handlers.fetch({ request: { url, method, mode: 'cors' }, respondWith: () => assert.fail(`Must not cache ${url}`) });
  }
});

test('offline navigation returns the prepared document shell', async () => {
  const w = worker();
  w.stored.set('/', new Response('<html>Offline app</html>'));
  let response;
  w.handlers.fetch({ request: { url: 'https://app.test/', method: 'GET', mode: 'navigate' }, respondWith: promise => response = promise });
  assert.match(await (await response).text(), /Offline app/);
});
