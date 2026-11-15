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

test('both scan targets enforce the confidence boundary on every fragment', () => {
  for (const [target, value, parts] of [
    ['printerCode', 'R001A1', ['R001', 'A1']],
    ['serial', 'X00000000002', ['X00000', '000002']],
    ['serial', 'MA0000000002', ['MA0000', '000002']],
  ]) {
    for (const score of [0, 0.69, 0.699999]) assert.equal(findValidCode([item(value, 10, 10, score)], target), null);
    for (const score of [0.7, 0.700001, 1]) assert.equal(findValidCode([item(value, 10, 10, score)], target).value, value);
    for (let low = 0; low < 2; low++) {
      assert.equal(findValidCode(parts.map((text, index) => item(text, 10 + index * 55, 10, index === low ? 0.699999 : 1)), target), null);
    }
    assert.equal(findValidCode([{ ...item(value), poly: [] }], target), null);
  }
});

test('two, three and four out-of-order fragments form codes but five fragments cannot', () => {
  for (const [target, value, splits] of [
    ['printerCode', 'R001A1', [['R001', 'A1'], ['R0', '01', 'A1'], ['R', '001', 'A', '1']]],
    ['serial', 'X00000000002', [['X00000', '000002'], ['X000', '0000', '0002'], ['X00', '000', '000', '002']]],
    ['serial', 'MA0000000002', [['MA0000', '000002'], ['MA00', '0000', '0002'], ['MA0', '000', '000', '002']]],
  ]) {
    for (const parts of splits) {
      const fragments = parts.map((text, index) => item(text, 10 + index * 55));
      const match = findValidCode([...fragments].reverse(), target);
      assert.equal(match.value, value);
      assert.equal(match.boxes.length, parts.length);
      assert.deepEqual(match.confidences, parts.map(() => 0.95));
    }
  }
  for (const [target, parts] of [['printerCode', ['R', '0', '01', 'A', '1']], ['serial', ['X', '000', '000', '000', '02']]]) {
    assert.equal(findValidCode(parts.map((text, index) => item(text, 10 + index * 55)), target), null);
  }
});

test('fragment joining respects exact horizontal and vertical distance limits', () => {
  // Test boxes are 50x20: allowed gap is 120px, baseline difference 30px.
  for (const [target, parts, value] of [['printerCode', ['R001', 'A1'], 'R001A1'], ['serial', ['MA0000', '000002'], 'MA0000000002']]) {
    assert.equal(findValidCode([item(parts[0]), item(parts[1], 180)], target).value, value);
    assert.equal(findValidCode([item(parts[0]), item(parts[1], 180.01)], target), null);
    assert.equal(findValidCode([item(parts[0]), item(parts[1], 65, 40)], target).value, value);
    assert.equal(findValidCode([item(parts[0]), item(parts[1], 65, 40.01)], target), null);
  }
});

test('scan selection ignores unreadable noise and preserves the first valid complete result', () => {
  assert.equal(findValidCode([], 'serial'), null);
  const values = [item('noise'), item('X00000000000'), item('X00000000002', 100), item('MA0000000002', 200)];
  const match = findValidCode(values, 'serial');
  assert.equal(match.value, 'X00000000002');
  assert.deepEqual(match.boxes, [{ x0: 100, y0: 10, x1: 150, y1: 30 }]);
  for (const value of ['XX00000000002', 'X00000000002X', 'X000000000020', 'MA00000000020', 'XOOOOOOOOOO2']) {
    assert.equal(findValidCode([item(value)], 'serial'), null, value);
  }
  assert.equal(findValidCode([item('x 00000000002')], 'serial').value, 'X00000000002');
});
