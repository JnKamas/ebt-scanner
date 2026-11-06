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
    ...load('app/api/ebt/shared.ts'),
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

test('login and session responses apply the same public account whitelist', async () => {
  const account = { sessionid: 'secret-session', password: 'secret-password', username: 'Tracker', my_city: 'Wien', my_country: 'Austria', my_zip: '1010', totalbills: 42, totalhits: 1 };
  const login = await api('login', () => account).POST(request({ email: 'fixture@example.test', password: 'fixture' }));
  const session = await api('session', () => account).GET(request({}));
  for (const response of [login, session]) {
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body.account).sort(), ['my_city', 'my_country', 'my_zip', 'totalbills', 'totalhits', 'username']);
    assert.equal(response.body.account.username, 'Tracker');
    assert(!JSON.stringify(response.body).includes('secret-'));
  }
  assert.deepEqual(login.body, session.body);
});

test('cookie deletion retains the same security attributes as login', () => {
  const shared = load('app/api/ebt/shared.ts');
  const cookie = shared.clearSession(shared.noStoreJson({ ok: true })).headers.get('set-cookie');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/', 'Max-Age=0']) assert(cookie.toLowerCase().includes(attribute.toLowerCase()));
});

test('sign-in is session-only unless a boolean remember-me choice is explicitly enabled', async () => {
  const credentials = { email: 'fixture@example.test', password: 'fixture' };
  const account = { sessionid: 'fixture-session', username: 'Tracker' };
  for (const choice of [{}, { rememberMe: false }]) {
    const target = api('login', () => account);
    assert.equal((await target.POST(request({ ...credentials, ...choice }))).status, 200);
    assert.equal(target.cookies[0][2].maxAge, undefined);
    assert.equal(target.cookies[0][2].expires, undefined);
  }
  const remembered = api('login', () => account);
  await remembered.POST(request({ ...credentials, rememberMe: true }));
  assert(remembered.cookies[0][2].maxAge >= 180 * 86400);
  assert(remembered.cookies[0][2].maxAge <= 184 * 86400);
  assert(!('rememberMe' in remembered.calls[0]), 'The local cookie preference is not sent to EBT');
  for (const rememberMe of ['true', 1, null, {}]) {
    const target = api('login', () => account);
    assert.equal((await target.POST(request({ ...credentials, rememberMe }))).status, 400);
    assert.equal(target.calls.length, 0);
  }
});

test('remember-me uses six calendar months and clamps month-end and leap-year dates', () => {
  const { loginCookieOptions } = load('app/api/ebt/shared.ts');
  for (const [start, end] of [
    ['2026-11-06T12:00:00Z', '2027-05-06T12:00:00Z'],
    ['2026-08-31T12:00:00Z', '2027-02-28T12:00:00Z'],
    ['2027-08-31T12:00:00Z', '2028-02-29T12:00:00Z'],
    ['2026-05-31T12:00:00Z', '2026-11-30T12:00:00Z'],
  ]) {
    const cookie = loginCookieOptions(true, new Date(start));
    assert.equal(cookie.maxAge, (Date.parse(end) - Date.parse(start)) / 1000);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'lax');
  }
});
