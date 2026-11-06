const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findValidCode } = require('./load-ts.cjs')('app/lib/banknote-scan.ts');
const item = (text, x = 10, y = 10, score = 0.95) => ({ text, score, poly: [[x,y],[x+50,y],[x+50,y+20],[x,y+20]] });

test('nearby OCR groups share the same validation and retain their original boxes', () => {
  const match = findValidCode([item('R001', 10), item('11', 65)], 'printerCode');
  assert.equal(match.value, 'R001I1');
  assert.deepEqual(match.boxes, [{ x0: 10, y0: 10, x1: 60, y1: 30 }, { x0: 65, y0: 10, x1: 115, y1: 30 }]);
  assert.deepEqual(match.confidences, [0.95, 0.95]);
});

test('low-confidence, distant and unrelated groups cannot manufacture a match', () => {
  for (const group of [
    [item('R001', 10), item('11', 65, 10, 0.69)],
    [item('R001', 10), item('11', 1000)],
    [item('R001', 10), item('11', 65, 1000)],
    [item('111111')], [{ ...item('R001A1'), poly: [] }],
  ]) assert.equal(findValidCode(group, 'printerCode'), null);
  assert.equal(findValidCode([item('R001A1', 10, 10, 0.7)], 'printerCode').value, 'R001A1');
});

test('serial OCR accepts complete checksummed values rather than substrings', () => {
  assert.equal(findValidCode([item('X00000000002')], 'serial').value, 'X00000000002');
  assert.equal(findValidCode([item('MA0000000002')], 'serial').value, 'MA0000000002');
  for (const serial of ['X00000000000', 'X000000000020', 'X000']) assert.equal(findValidCode([item(serial)], 'serial'), null);
});
