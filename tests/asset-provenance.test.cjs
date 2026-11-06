const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

test('every vendored OCR asset has matching provenance and its upstream license', () => {
  const manifest = JSON.parse(fs.readFileSync('public/ocr/PROVENANCE.json', 'utf8'));
  const records = new Map(manifest.sources.map(record => [record.path, record]));
  assert.equal(records.size, manifest.sources.length, 'No duplicate provenance paths');
  for (const record of records.values()) {
    assert(record.source.startsWith('https://'), record.path);
    assert.equal(createHash('sha256').update(fs.readFileSync(record.path)).digest('hex'), record.sha256, `Asset changed without a provenance update: ${record.path}`);
  }
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(file);
      else if (/\.(tar|mjs|wasm)$/.test(file)) {
        const record = records.get(file);
        assert(record, `Missing asset provenance: ${file}`);
        assert(fs.existsSync(record.licenseFile), `Missing license: ${file}`);
        assert(['MIT', 'Apache-2.0'].includes(record.license));
        if (file.endsWith('.tar')) assert(fs.existsSync(record.modelCard));
        if (record.noticesFile) assert(fs.existsSync(record.noticesFile));
      }
    }
  }
  visit('public/ocr');
});
