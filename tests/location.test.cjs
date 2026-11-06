const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addressFromPhoton, locateAddress, locationPermissionMessage } = require('./load-ts.cjs')('app/lib/location.ts');
const feature = (properties) => ({ features: [{ properties }] });

test('English countries, town names and postcodes are derived from address data', () => {
  assert.deepEqual(addressFromPhoton(feature({ city: 'Vienna', country: 'Österreich', countrycode: 'AT', postcode: '010 10' })), { city: 'Vienna', country: 'Austria', postalCode: '01010' });
  assert.deepEqual(addressFromPhoton(feature({ osm_key: 'place', osm_value: 'village', name: 'Village', countrycode: 'CZ' })), { city: 'Village', country: 'Czech Republic', postalCode: '' });
  assert.throws(() => addressFromPhoton({ features: [] }), /No town or city/);
  assert.throws(() => addressFromPhoton(null), /unreadable/);
});

test('coordinate validation happens before any external request', async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('Must not request'); };
  try {
    await assert.rejects(locateAddress(NaN, 17), /invalid position/);
    await assert.rejects(locateAddress(91, 17), /invalid position/);
    await assert.rejects(locateAddress(48, 181), /invalid position/);
  } finally { global.fetch = original; }
});

test('lookup sends rounded coordinates without credentials and uses the nearest address postcode', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return { ok: true, json: async () => feature(url.searchParams.has('layer')
      ? { name: 'Bratislava', osm_key: 'place', osm_value: 'city', countrycode: 'SK', postcode: '815 18', county: 'District I' }
      : { countrycode: 'SK', postcode: '811 06', county: 'District I' }) };
  };
  try {
    assert.deepEqual(await locateAddress(48.1486123, 17.1077123), { city: 'Bratislava', country: 'Slovakia', postalCode: '81106' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.searchParams.get('lat'), '48.1486');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
    assert.equal(calls[1].url.searchParams.get('layer'), 'city');
  } finally { global.fetch = original; }
});

test('a missing street postcode never falls back to the city-centre postcode', async () => {
  const original = global.fetch;
  global.fetch = async (url) => ({ ok: true, json: async () => feature(url.searchParams.has('layer')
    ? { name: 'Bratislava', osm_key: 'place', osm_value: 'city', countrycode: 'SK', postcode: '815 18' }
    : { countrycode: 'SK' }) });
  try { assert.equal((await locateAddress(48, 17)).postalCode, ''); }
  finally { global.fetch = original; }
});

test('service failures and permission errors give different recovery instructions', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false });
  try { await assert.rejects(locateAddress(48, 17), /lookup is unavailable/); }
  finally { global.fetch = original; }
  assert.match(locationPermissionMessage(1), /Allow location/);
  assert.match(locationPermissionMessage(2), /location services/);
  assert.match(locationPermissionMessage(3), /timed out/);
});
