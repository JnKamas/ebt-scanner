const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-ts.cjs');
const lib = load('app/lib/ebt.ts');
function route(name, respond) {
  const calls = [];
  const shared = {
    SESSION_COOKIE: 'ebt-web-session',
    ebtRequest: async (parameters) => { calls.push(parameters); return respond(parameters); },
    noStoreJson: (body, init = {}) => ({ body, status: init.status || 200 }),
    clearSession: (response) => ({ ...response, cleared: true }),
  };
  return { calls, ...load(`app/api/ebt/${name}/route.ts`, { '../shared': shared, '../../../lib/ebt': lib }) };
}
function request(query = '', authenticated = true) {
  return { cookies: { get: () => authenticated ? { value: 'test-session' } : undefined }, nextUrl: new URL(`https://local.test/?${query}`) };
}

test('all feature endpoints reject unauthenticated requests without calling EBT', async () => {
  for (const name of ['suggestions', 'profile', 'journey']) {
    const api = route(name, () => { throw new Error('Must not call'); });
    assert.equal((await api.GET(request('', false))).status, 401);
    assert.equal(api.calls.length, 0);
  }
});

test('previous cities and postcodes handle associative arrays and preserve leading zeroes', async () => {
  const api = route('suggestions', ({ m }) => m === 'mycities' ? { data: { 4: { city: 'Wien', country: 'Austria', top_zipcode: '0101', nrlocations: '2' } } } : { data: { 3: { zipcode: '0101' } } });
  const cities = await api.GET(request('kind=cities'));
  assert.equal(cities.body.data[0].top_zipcode, '0101');
  const zips = await api.GET(request('kind=zipcodes&city=Wien&country=Austria'));
  assert.deepEqual(zips.body.data, ['0101']);
  assert.equal(api.calls[1].m, 'myzipcodes');
});

test('comments use the exact city/country/postcode and sort by frequency', async () => {
  const api = route('suggestions', () => ({ data: [{ comment: 'shop', amount: '2' }, { comment: 'ATM', amount: '12' }] }));
  const result = await api.GET(request('kind=comments&city=Wien&country=Austria&zip=1010'));
  assert.equal(api.calls[0].zip, '1010');
  assert.equal(result.body.data[0].comment, 'ATM');
  assert.equal((await api.GET(request('kind=comments&city=&country=Austria'))).status, 400);
});

test('expired sessions and upstream failures have actionable responses', async () => {
  const expired = route('suggestions', () => false);
  assert.equal((await expired.GET(request('kind=cities'))).cleared, true);
  const unavailable = route('suggestions', () => { throw new Error('network'); });
  assert.equal((await unavailable.GET(request('kind=cities'))).status, 502);
});

test('profile resolves the authenticated exact username, including paginated results', async () => {
  const api = route('profile', (p) => {
    if (p.m === 'sessioncheck') return { username: 'Tracker' };
    if (p.m === 'search') return { users: p.c === '0' ? Array.from({ length: 50 }, (_, id) => ({ name: `Tracker${id}`, id })) : { 60: { name: 'Tracker', id: 60 } } };
    assert.equal(p.user_id, '60');
    return { data: { user_id: 60, user_name: 'Tracker', join_date: '2005-01-01', total_notes: '100', total_hits: '3', img_url_notes_europe: 'http://www.eurobilltracker.com/map.png', img_url_hits_europe: 'https://evil.test/map' } };
  });
  const result = await api.GET(request('user_id=999'));
  assert.equal(result.status, 200);
  assert.equal(result.body.profile.total_notes, 100);
  assert.equal(result.body.profile.img_url_notes_europe, 'https://www.eurobilltracker.com/map.png');
  assert.equal(result.body.profile.img_url_hits_europe, null);
});

test('journeys normalize and order steps and reject invalid note IDs', async () => {
  const api = route('journey', () => ({ data: { note_id: 42, total_km: '120', total_days: '30', steps: { 1: { step_id: 1, location_name: 'Berlin', timestamp_adjusted: '2026-10-29', hit_km: '120' }, 0: { step_id: 0, location_name: 'Wien' } } } }));
  assert.equal((await api.GET(request('id=../../bad'))).status, 400);
  const result = await api.GET(request('id=42'));
  assert.equal(result.body.journey.steps[0].location_name, 'Wien');
  assert.equal(result.body.journey.total_km, 120);
  assert.equal(result.body.journey.steps[1].hit_km, 120);
});

test('submission errors decode combined bits and duplicate metadata', () => {
  assert.match(lib.submissionMessage({ status: 20 }), /country.*printer code/i);
  assert.match(lib.submissionMessage({ status: 128, alreadyDate: '2020-01-02', alreadyDenom: 20 }), /2020-01-02.*€20/);
  assert.match(lib.submissionMessage({ status: 32768 }), /does not match this denomination/);
  assert.match(lib.submissionMessage(null), /did not confirm/);
  assert.match(lib.submissionMessage({ status: 1 }), /Hit!/);
  assert.match(lib.submissionMessage({ status: 256 }), /256/);
});

test('map links allow only official EBT HTTP(S) URLs', () => {
  assert.equal(lib.ebtImageUrl('javascript:alert(1)'), null);
  assert.equal(lib.ebtImageUrl('https://eurobilltracker.com.evil.test/map'), null);
  assert.equal(lib.ebtImageUrl('//www.eurobilltracker.com/map'), 'https://www.eurobilltracker.com/map');
});


test('submission statuses reject coercible malformed values and preserve integer API statuses', () => {
  for (const value of [null, undefined, false, true, '', ' ', [], [0], {}, -1, 0.5, '0.0', '0x0', '1e0', Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(lib.submissionStatus(value), null, `Malformed status: ${String(value)}`);
    assert.match(lib.submissionMessage({ status: value }), /did not confirm/);
  }
  for (const value of [0, 1, 20, 128, 32768, '0', '1', '20', '32768']) {
    assert.equal(lib.submissionStatus(value), Number(value));
  }
});
