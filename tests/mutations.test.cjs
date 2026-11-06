const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const load = require('./load-ts.cjs');
const note = { id: 'one', serial: 'X00000000002', printerCode: 'R001A1', denomination: '20', country: 'Slovakia', city: 'Bratislava', postalCode: '', comment: '' };
function request(body, headers = {}) {
  return new NextRequest('https://app.test/api/ebt/notes', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test', Cookie: 'ebt-web-session=session', ...headers }, body: JSON.stringify(body) });
}
function api(name, respond = () => ({ note0: { status: 0, billId: 42 } })) {
  const calls = [], cookies = [];
  const shared = {
    SESSION_COOKIE: 'ebt-web-session',
    ebtRequest: async p => { calls.push(p); return respond(p); },
    noStoreJson: (body, init = {}) => ({ body, status: init.status || 200, cookies: { set: (...args) => cookies.push(args) } }),
    clearSession: response => ({ ...response, cleared: true }),
  };
  return { ...load(`app/api/ebt/${name}/route.ts`, { '../shared': shared, './shared': shared }), calls, cookies };
}

test('mutations reject foreign origins, cross-site requests and simple content types before upstream calls', async () => {
  for (const route of ['login', 'notes', 'logout']) {
    for (const headers of [{ Origin: 'https://evil.test' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/x-www-form-urlencoded' }]) {
      const target = api(route);
      const response = await target.POST(request({ notes: [note] }, headers));
      assert([403, 415].includes(response.status));
      assert.equal(target.calls.length, 0);
    }
  }
});

test('login and submission reject null, arrays, primitives and oversized JSON without throwing', async () => {
  for (const route of ['login', 'notes']) {
    for (const body of [null, [], 'text', 3, { padding: 'x'.repeat(70000) }]) {
      const target = api(route);
      assert.equal((await target.POST(request(body))).status, 400);
      assert.equal(target.calls.length, 0);
    }
  }
});

test('submission validates checksum, limits, batch size, duplicate IDs and location before inserting', async () => {
  const invalid = [
    [], Array.from({ length: 26 }, (_, i) => ({ ...note, id: String(i) })),
    [note, note], [note, { ...note, id: 'two', city: 'Wien' }],
    [{ ...note, serial: 'X00000000000' }], [{ ...note, comment: 'a\nb' }], [{ ...note, comment: 'x'.repeat(501) }],
    [{ ...note, country: ' ' }], [{ ...note, printerCode: 'R001A0' }],
  ];
  for (const notes of invalid) {
    const target = api('notes');
    assert.equal((await target.POST(request({ notes }))).status, 400);
    assert.equal(target.calls.length, 0);
  }
  const target = api('notes');
  assert.equal((await target.POST(request({ notes: [note] }))).status, 200);
  assert.equal(target.calls[0].serial0, note.serial);
});

test('lost upstream responses preserve an explicitly unknown submission outcome', async () => {
  let inserted = false;
  const target = api('notes', () => { inserted = true; throw new Error('response lost'); });
  const response = await target.POST(request({ notes: [note] }));
  assert(inserted);
  assert.equal(response.status, 502);
  assert.equal(response.body.outcome, 'unknown');
  assert.match(response.body.error, /may have received.*before retrying/);
});

test('expired sessions are distinguished from uncertain insertion responses', async () => {
  assert.equal((await api('notes', () => false).POST(request({ notes: [note] }))).cleared, true);
  assert.equal((await api('notes', () => null).POST(request({ notes: [note] }))).body.outcome, 'unknown');
});

test('login credentials go upstream but only a protected session cookie goes to the browser', async () => {
  const target = api('login', () => ({ sessionid: 'secret-session', username: 'Tracker', totalbills: 1, totalhits: 0 }));
  const response = await target.POST(request({ email: 'test@example.com', password: 'secret-password' }));
  assert.equal(target.calls[0].my_password, 'secret-password');
  assert(!JSON.stringify(response.body).includes('secret-'));
  assert.equal(target.cookies[0][2].httpOnly, true);
  assert.equal(target.cookies[0][2].secure, true);
  assert.equal(target.cookies[0][2].sameSite, 'lax');
});

test('the EBT transport never follows redirects and private JSON is not cacheable', async () => {
  const shared = load('app/api/ebt/shared.ts');
  const original = global.fetch;
  let called;
  global.fetch = async (url, options) => { called = { url, options }; return { ok: true, json: async () => ({ ok: true }) }; };
  try {
    await shared.ebtRequest({ m: 'login', my_password: 'secret' });
    assert.equal(called.url, 'https://api.eurobilltracker.com/');
    assert.equal(called.options.redirect, 'error');
    assert.equal(called.options.cache, 'no-store');
    assert.equal(shared.noStoreJson({ account: 'private' }).headers.get('cache-control'), 'no-store');
  } finally { global.fetch = original; }
});
