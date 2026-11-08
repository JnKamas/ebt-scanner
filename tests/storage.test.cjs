const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readLocalState, writeLocalState, writePendingSubmission } = require('./load-ts.cjs')('app/lib/local-state.ts');
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
  assert.equal(writePendingSubmission(store, ['one']), '');
  assert.deepEqual(readLocalState(store).pendingIds, ['one']);
  assert.equal(writePendingSubmission(store, []), '');
  assert.deepEqual(readLocalState(store).pendingIds, []);
});

test('storage exceptions are surfaced instead of silently claiming a saved queue', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert(readLocalState(blocked).error);
  assert.match(writeLocalState(blocked, [note], draft), /could not be saved/i);
  assert.match(writePendingSubmission(blocked, ['one']), /cannot save submission status/i);
});

test('a stale tab editing a draft cannot overwrite another tab queue or unrelated draft fields', () => {
  const store = storage();
  writeLocalState(store, [], draft);
  const stale = readLocalState(store);
  writeLocalState(store, [note], { ...draft, comment: 'other tab' }, stale);
  assert.equal(writeLocalState(store, [], { ...draft, city: 'Wien' }, stale), '');
  assert.deepEqual(readLocalState(store).notes, [note]);
  assert.equal(readLocalState(store).draft.city, 'Wien');
  assert.equal(readLocalState(store).draft.comment, 'other tab');
});

test('stale queue edits and deletions pause saving without overwriting newer notes', () => {
  const store = storage();
  writeLocalState(store, [note], draft);
  const stale = readLocalState(store);
  writeLocalState(store, [note, { ...note, id: 'two' }], draft);
  for (const notes of [[], [{ ...note, comment: 'stale edit' }]]) {
    assert.match(writeLocalState(store, notes, draft, stale), /another tab/);
    assert.equal(readLocalState(store).notes.length, 2);
  }
});
