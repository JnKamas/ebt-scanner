const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readLocalState, writeLocalState } = require('./load-ts.cjs')('app/lib/local-state.ts');
const draft = { serial: 'X000', printerCode: 'R', denomination: '20', country: 'Slovakia', city: 'Bratislava', postalCode: '', comment: 'shop' };
const note = { ...draft, id: 'one', createdAt: '2026-11-06' };
function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }

test('queue and every draft field survive a reload, without credentials', () => {
  const store = storage();
  assert.equal(writeLocalState(store, [note], { ...draft, password: 'never-save' }), '');
  const loaded = readLocalState(store);
  assert.deepEqual(loaded.notes, [note]);
  assert.deepEqual(loaded.draft, draft);
  assert(!store.getItem('ebt-web-draft').includes('never-save'));
});

test('bad JSON and wrong shapes are recovered without crashing', () => {
  for (const value of ['{', 'null', '{}', '[null]']) {
    const store = storage(); store.setItem('ebt-web-queue', value);
    const loaded = readLocalState(store);
    assert.deepEqual(loaded.notes, []);
    assert(loaded.error);
    assert.equal(store.getItem('ebt-web-queue'), value);
  }
});

test('an interrupted submission remains marked as uncertain after reload', () => {
  const store = storage();
  writeLocalState(store, [note], draft);
  store.setItem('ebt-web-pending-submission', '["one"]');
  assert.deepEqual(readLocalState(store).pendingIds, ['one']);
});

test('storage exceptions are surfaced instead of silently claiming a saved queue', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert(readLocalState(blocked).error);
  assert.match(writeLocalState(blocked, [note], draft), /could not be saved/i);
});
