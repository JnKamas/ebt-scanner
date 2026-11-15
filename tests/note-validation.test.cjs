const { test } = require('node:test');
const assert = require('node:assert/strict');
const { noteErrors, isSerialValid, isSerialFormatValid, isCodeValid, clean, isDraft } = require('./load-ts.cjs')('app/lib/note-validation.ts');
const valid = { serial: 'X00000000002', printerCode: 'R001A1', denomination: '20', country: 'Slovakia', city: 'Bratislava', postalCode: '', comment: '' };

test('shared validation accepts both series and optional postcodes', () => {
  assert.deepEqual(noteErrors(valid), []);
  assert(isSerialValid('MA0000000002'));
  assert(!isSerialValid('X00000000000'));
});

// Synthetic fixtures only. Use repeated decimal digit reduction as an independent
// checksum oracle, rather than the production character-sum/remainder formula.
function checksumMatches(prefix, digits) {
  let expanded = [...prefix].map(letter => String(letter.charCodeAt(0) - (prefix.length === 2 ? 64 : 0))).join('') + digits;
  while (expanded.length > 1) expanded = String([...expanded].reduce((sum, digit) => sum + Number(digit), 0));
  return expanded === (prefix.length === 1 ? '9' : '7');
}

test('both serial checksums cover every letter prefix, varied digits and every character position', () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefixes = [...letters, ...[...letters].flatMap(first => [...letters].map(second => first + second))];
  for (const prefix of prefixes) {
    for (const seed of ['0000000000', '1234567890', '9999999999']) {
      const body = seed.slice(0, 11 - prefix.length);
      const check = '123456789'.split('').find(digit => checksumMatches(prefix, body + digit));
      assert.notEqual(check, undefined, prefix);
      const serial = prefix + body + check;
      assert.equal(isSerialFormatValid(serial), true, serial);
      assert.equal(isSerialValid(serial), true, serial);
      for (let position = 0; position < prefix.length; position++) {
        const letter = serial[position] === 'Z' ? 'A' : String.fromCharCode(serial.charCodeAt(position) + 1);
        const changed = serial.slice(0, position) + letter + serial.slice(position + 1);
        assert.equal(isSerialValid(changed), false, changed);
      }
      // All ten check digits are checked independently, including the modulo-9
      // equivalence of 0 and 9. This is a checksum check, not proof of issuance.
      for (const digit of '0123456789') {
        assert.equal(isSerialValid(prefix + body + digit), checksumMatches(prefix, body + digit), prefix + body + digit);
      }
      for (let position = prefix.length; position < serial.length; position++) {
        const digit = serial[position] === '9' ? '1' : String(Number(serial[position]) + 1);
        const changed = serial.slice(0, position) + digit + serial.slice(position + 1);
        assert.equal(isSerialValid(changed), false, changed);
      }
    }
  }
});

test('fixed synthetic checksum examples include nonzero bodies and both end-of-alphabet letters', () => {
  for (const serial of ['X00000000002', 'X00000000011', 'X00000000020', 'A00000000007', 'M00000000004',
    'MA0000000002', 'AA0000000005', 'ZZ0000000000']) assert.equal(isSerialValid(serial), true, serial);
});

test('serial shape rejects wrong lengths, misplaced letters and non-ASCII digits', () => {
  for (const serial of ['', 'X', 'X0000000000', 'X000000000020', 'MA000000000', 'MA00000000020',
    '000000000002', 'ABC000000002', 'X000000000A2', 'M000000000A2', 'X００００００００００２']) {
    assert.equal(isSerialFormatValid(serial), false, serial);
    assert.equal(isSerialValid(serial), false, serial);
  }
  for (const serial of ['X00000000000', 'MA0000000000']) {
    assert.equal(isSerialFormatValid(serial), true, serial);
    assert.equal(isSerialValid(serial), false, serial);
    assert.match(noteErrors({ ...valid, serial }).join(' '), /checksum/);
  }
});

test('code cleaning normalizes case and strips separators without OCR substitutions', () => {
  assert.equal(clean(' x-000 000.000/02\n'), 'X00000000002');
  assert.equal(clean('r-001 a1'), 'R001A1');
  assert.equal(isSerialValid(' x-000 000.000/02\n'), true);
  assert.equal(isSerialValid('ma 0000000002'), true);
  assert.equal(isCodeValid('r-001 a1'), true);
  assert.equal(isCodeValid('R00111'), false);
  assert.equal(isSerialValid('XOOOOOOOOOO2'), false);
});

test('printer format accepts its full letter and digit ranges without an issuance allowlist', () => {
  for (const printer of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const row of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      for (const plate of ['000', '001', '123', '456', '789', '999']) {
        for (const column of '123456789') assert.equal(isCodeValid(`${printer}${plate}${row}${column}`), true);
      }
    }
  }
  for (const code of ['', 'R001A', 'R001A10', 'R001A0', '1001A1', 'RA01A1', 'R0A1A1', 'R00AA1',
    'R00111', 'R001AA', 'XR001A1', 'R001A1X', 'R００１A1']) assert.equal(isCodeValid(code), false, code);
});

test('all denominations and exact field-length boundaries are accepted', () => {
  for (const denomination of ['5', '10', '20', '50', '100', '200', '500']) {
    assert.deepEqual(noteErrors({ ...valid, denomination }), []);
  }
  for (const denomination of ['', '0', '1', '25', '1000', '05', '20.0', ' 20']) {
    assert.match(noteErrors({ ...valid, denomination }).join(' '), /Denomination/, denomination);
  }
  for (const [field, max] of [['country', 100], ['city', 100], ['postalCode', 50], ['comment', 500]]) {
    for (const length of [1, max - 1, max]) assert.deepEqual(noteErrors({ ...valid, [field]: 'x'.repeat(length) }), [], `${field}: ${length}`);
    assert.equal(noteErrors({ ...valid, [field]: 'x'.repeat(max + 1) }).length, 1, field);
  }
  assert.deepEqual(noteErrors({ ...valid, postalCode: '', comment: '' }), []);
  for (const field of ['country', 'city']) {
    for (const value of ['', ' ', '\t']) assert(noteErrors({ ...valid, [field]: value }).length, field);
  }
});

test('every ASCII control character is rejected in each location field and comment', () => {
  for (const field of ['country', 'city', 'postalCode', 'comment']) {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      assert.equal(noteErrors({ ...valid, [field]: `a${String.fromCharCode(code)}b` }).length, 1, `${field}: ${code}`);
    }
    assert.deepEqual(noteErrors({ ...valid, [field]: 'Bratislava – café' }), []);
  }
});

test('draft shape requires every field to be a string', () => {
  assert.equal(isDraft(valid), true);
  for (const value of [null, [], 1, 'note', {}]) assert.equal(isDraft(value), false);
  for (const field of Object.keys(valid)) {
    for (const value of [undefined, null, 1, false, [], {}]) assert.equal(isDraft({ ...valid, [field]: value }), false, field);
    const missing = { ...valid };
    delete missing[field];
    assert.equal(isDraft(missing), false, field);
  }
});

test('every invalid field has actionable feedback', () => {
  for (const field of ['serial', 'printerCode', 'denomination', 'country', 'city']) assert(noteErrors({ ...valid, [field]: '' }).length);
  assert.match(noteErrors({ ...valid, serial: 'X00000000000' }).join(' '), /checksum/);
  for (const comment of ['line one\nline two', 'x'.repeat(501), '\u0000']) assert.match(noteErrors({ ...valid, comment }).join(' '), /Comment/);
  for (const [field, length] of [['country', 101], ['city', 101], ['postalCode', 51]]) assert(noteErrors({ ...valid, [field]: 'x'.repeat(length) }).length);
});
