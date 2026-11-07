const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function worker(fetchPage = async () => { throw new Error('offline'); }) {
  const handlers = {}, added = [], removed = [], stored = new Map();
  const source = fs.readFileSync('scripts/service-worker.js', 'utf8').replace('__VERSION__', 'test').replace('__ASSETS__', JSON.stringify(['/', '/icon.svg', '/_next/static/app.js']));
  const cache = { addAll: async assets => added.push(...assets), put: async (key, value) => stored.set(typeof key === 'string' ? key : key.url, value) };
  const caches = { open: async () => cache, keys: async () => ['ebt-web-old', 'another-app'], delete: async key => removed.push(key), match: async key => stored.get(key) };
  vm.runInNewContext(source, { self: { addEventListener: (name, callback) => handlers[name] = callback, skipWaiting: async () => {}, clients: { claim: async () => {} }, location: { origin: 'https://app.test' } }, caches, fetch: fetchPage, URL, Response });
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

test('visiting About preserves the offline scanner and returns the correct cached page', async () => {
  let online = true;
  const w = worker(async () => {
    if (!online) throw new Error('offline');
    return new Response('<html>About and privacy</html>', { headers: { 'content-type': 'text/html' } });
  });
  w.stored.set('/', new Response('<html>Offline scanner</html>'));
  async function navigate(path) {
    let response;
    const waits = [];
    w.handlers.fetch({ request: { url: `https://app.test${path}`, method: 'GET', mode: 'navigate' }, respondWith: p => response = p, waitUntil: p => waits.push(p) });
    const result = await response;
    await Promise.all(waits);
    return result;
  }
  assert.match(await (await navigate('/about')).text(), /About and privacy/);
  online = false;
  assert.match(await (await navigate('/')).text(), /Offline scanner/);
  assert.match(await (await navigate('/about')).text(), /About and privacy/);
  assert.equal((await navigate('/unvisited')).status, 503);
});
