const { test } = require('node:test');
const assert = require('node:assert/strict');
const { noteErrors, isSerialValid } = require('./load-ts.cjs')('app/lib/note-validation.ts');
const valid = { serial: 'X00000000002', printerCode: 'R001A1', denomination: '20', country: 'Slovakia', city: 'Bratislava', postalCode: '', comment: '' };

test('shared validation accepts both series and optional postcodes', () => {
  assert.deepEqual(noteErrors(valid), []);
  assert(isSerialValid('MA0000000002'));
  assert(!isSerialValid('X00000000000'));
});

test('every invalid field has actionable feedback', () => {
  for (const field of ['serial', 'printerCode', 'denomination', 'country', 'city']) assert(noteErrors({ ...valid, [field]: '' }).length);
  assert.match(noteErrors({ ...valid, serial: 'X00000000000' }).join(' '), /checksum/);
  for (const comment of ['line one\nline two', 'x'.repeat(501), '\u0000']) assert.match(noteErrors({ ...valid, comment }).join(' '), /Comment/);
  for (const [field, length] of [['country', 101], ['city', 101], ['postalCode', 51]]) assert(noteErrors({ ...valid, [field]: 'x'.repeat(length) }).length);
});
