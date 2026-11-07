const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('the retired worker removes only old app caches, unregisters and never handles fetches', async () => {
  const handlers = {}, removed = [];
  let claimed = false, unregistered = false, skipped = false;
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
      registration: { unregister: async () => { unregistered = true; } },
    },
    caches: {
      keys: async () => ['ebt-web-old', 'ebt-web-another-build', 'unrelated-cache'],
      delete: async key => { removed.push(key); },
    },
  });
  const waits = [];
  handlers.install({ waitUntil: promise => waits.push(promise) });
  handlers.activate({ waitUntil: promise => waits.push(promise) });
  await Promise.all(waits);
  assert.deepEqual(removed, ['ebt-web-old', 'ebt-web-another-build']);
  assert(skipped && claimed && unregistered);
  assert.equal(handlers.fetch, undefined);
});
