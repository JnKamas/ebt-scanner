const { test } = require('node:test');
const assert = require('node:assert/strict');
const { printerCodeFromOcr } = require('./load-ts.cjs')('app/lib/printer-code-ocr.ts');

test('preserves correctly recognized printer codes, including I and L', () => {
  for (const code of ['R001I1', 'I123A1', 'L001L1', 'R001A1']) assert.equal(printerCodeFromOcr(code), code);
  assert.equal(printerCodeFromOcr('r 001 i 1'), 'R001I1');
});

test('recovers I and 1 confusion according to character position', () => {
  assert.equal(printerCodeFromOcr('R00111'), 'R001I1');
  assert.equal(printerCodeFromOcr('1123A1'), 'I123A1');
  assert.equal(printerCodeFromOcr('R00II1'), 'R001I1');
  assert.equal(printerCodeFromOcr('R00lIl'), 'R001I1');
  assert.equal(printerCodeFromOcr('R00IAI'), 'R001A1');
});

test('still rejects incomplete codes, unrelated letters, and an invalid final zero', () => {
  for (const text of ['', 'R001I', 'R00ZI1', 'R001I0', 'R00110', '12345', 'hello', '111111', 'R001A123', 'XR001A1', 'R001A1X']) {
    assert.equal(printerCodeFromOcr(text), undefined, text);
  }
});
