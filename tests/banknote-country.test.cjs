const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { banknoteCountry, locationCountry } = require('./load-ts.cjs')('app/lib/banknote-country.ts');

test('serial flags distinguish commissioning countries from Europa printing countries', () => {
  assert.equal(banknoteCountry('E00000000000').code, 'sk');
  assert.equal(banknoteCountry('EA0000000000').code, 'fr');
  assert.equal(banknoteCountry('F00000000000').code, 'mt');
  assert.equal(banknoteCountry('FA0000000000').code, 'bg');
  assert.equal(banknoteCountry('H00000000000').code, 'si');
  assert.equal(banknoteCountry('HA0000000000').code, 'gb');
  assert.equal(banknoteCountry('X00000000000').description, 'Commissioned by: Germany');
  assert.equal(banknoteCountry('XA0000000000').description, 'Printed in: Germany');
});

test('printer flags use the correct series independently of the issuer', () => {
  assert.equal(banknoteCountry('X00000000000', 'N001A1').code, 'gr');
  assert.equal(banknoteCountry('NA0000000000', 'N001A1').code, 'at');
  assert.equal(banknoteCountry('X00000000000', 'F001A1').code, 'at');
  assert.equal(banknoteCountry('FA0000000000', 'F001A1').code, 'bg');
});

test('flags appear from unambiguous prefixes before codes are complete', () => {
  assert.equal(banknoteCountry('X').code, 'de');
  assert.equal(banknoteCountry('M').code, 'pt');
  assert.equal(banknoteCountry('X0').description, 'Commissioned by: Germany');
  assert.equal(banknoteCountry('MA').description, 'Printed in: Portugal');
  for (const printer of ['R', 'R0', 'R001', 'R001A', 'R001A1']) {
    assert.equal(banknoteCountry('', printer).code, 'de');
  }
  assert.equal(banknoteCountry('X0', 'N').code, 'gr');
  assert.equal(banknoteCountry('NA', 'N').code, 'at');
});

test('ambiguous prefixes and unknown or malformed codes never invent a flag', () => {
  for (const serial of ['', 'E', 'F', 'H', 'not a serial', 'A00000000000', 'AA0000000000']) assert.equal(banknoteCountry(serial), null);
  assert.equal(banknoteCountry('', 'N'), null);
  assert.equal(banknoteCountry('', 'M'), null);
  assert.equal(banknoteCountry('', 'RA'), null);
  assert.equal(banknoteCountry('X00000000000', 'Q001A1'), null);
  assert.equal(banknoteCountry('X00000000000', 'R001A0'), null);
});

test('all displayed countries have local SVG assets', () => {
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const serial of [`${letter}00000000000`, `${letter}A0000000000`]) {
      const country = banknoteCountry(serial);
      if (country) assert(fs.existsSync(`public/flags/${country.code}.svg`));
      for (const printer of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const printing = banknoteCountry(serial, `${printer}001A1`);
        if (printing) assert(fs.existsSync(`public/flags/${printing.code}.svg`));
      }
    }
  }
});

test('location flags use the location country independently of banknote origin', () => {
  assert.deepEqual(locationCountry(' Slovakia '), { code: 'sk', name: 'Slovakia' });
  assert.deepEqual(locationCountry('AT'), { code: 'at', name: 'Austria' });
  assert.deepEqual(locationCountry('portugal'), { code: 'pt', name: 'Portugal' });
  assert.equal(locationCountry(''), null);
  assert.equal(locationCountry('unknown'), null);
});
