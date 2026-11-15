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

test('position-based corrections cover each digit slot and both letter slots', () => {
  for (const letter of ['I', 'L', 'i', 'l']) {
    for (const index of [1, 2, 3, 5]) {
      const text = [...'R111A1'];
      text[index] = letter;
      assert.equal(printerCodeFromOcr(text.join('')), 'R111A1', text.join(''));
    }
  }
  assert.equal(printerCodeFromOcr('1001A1'), 'I001A1');
  assert.equal(printerCodeFromOcr('R00111'), 'R001I1');
  assert.equal(printerCodeFromOcr('100111'), undefined, 'All-digit output must not invent two letters');
  for (const code of ['R001I1', 'R001L1', 'I001A1', 'L001A1']) assert.equal(printerCodeFromOcr(code), code);
  for (const text of ['R0O1A1', 'R00ZA1', 'R001AO', 'R-001A1', 'R001A1!', 'R001A10']) {
    assert.equal(printerCodeFromOcr(text), undefined, text);
  }
});
