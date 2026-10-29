const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('app/lib/banknote-country.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = { exports: {} };
new Function('exports', source)(compiled.exports);
const { banknoteCountry } = compiled.exports;

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

test('incomplete and unknown codes never invent a flag', () => {
  for (const serial of ['', 'X', 'not a serial', 'A00000000000', 'AA0000000000']) assert.equal(banknoteCountry(serial), null);
  assert.equal(banknoteCountry('', 'R001A1'), null);
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
