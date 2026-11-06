const { test } = require('node:test');
const assert = require('node:assert/strict');
const { submissionBatch, sameLocation } = require('./load-ts.cjs')('app/lib/note-queue.ts');
const location = { country: 'Slovakia', city: 'Bratislava', postalCode: '' };

test('batch selection keeps queue order and at most 25 notes for the first location', () => {
  const notes = Array.from({ length: 30 }, (_, i) => ({ ...location, id: String(i) }));
  notes.splice(1, 0, { ...location, id: 'other', city: 'Wien' });
  const batch = submissionBatch(notes);
  assert.equal(batch.length, 25);
  assert.deepEqual(batch.map(note => note.id), Array.from({ length: 25 }, (_, i) => String(i)));
  assert.equal(notes.length, 31);
});

test('an empty queue has no batch and every location field participates in grouping', () => {
  assert.deepEqual(submissionBatch([]), []);
  assert(sameLocation(location, { ...location }));
  for (const field of ['country', 'city', 'postalCode']) assert(!sameLocation(location, { ...location, [field]: 'different' }));
});
