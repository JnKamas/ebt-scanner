const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const load = require('./load-ts.cjs');
// Public test fixture only; never used by deployed servers.
process.env.EBT_SESSION_BINDING_SECRET = 'ab'.repeat(32);
const { sessionKey } = load('app/api/ebt/shared.ts');
const note = { id: 'one', serial: 'X00000000002', printerCode: 'R001A1', denomination: '20', country: 'Slovakia', city: 'Bratislava', postalCode: '', comment: '' };
function request(body, headers = {}) {
  return new NextRequest('https://app.test/api/ebt/notes', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test', Cookie: 'ebt-web-session=session', 'X-EBT-Session': sessionKey('session'), ...headers }, body: JSON.stringify(body) });
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
    assert(!JSON.stringify(response.body).includes(process.env.EBT_SESSION_BINDING_SECRET));
  }
  assert.deepEqual(login.body.account, session.body.account);
  assert.equal(login.body.sessionKey, sessionKey('secret-session'));
  assert.equal(session.body.sessionKey, sessionKey('session'));
});

test('submission binds the displayed sign-in to the exact cookie, including account switches', async () => {
  for (const key of ['', sessionKey('alice-session')]) {
    const target = api('notes');
    const response = await target.POST(request({ notes: [note] }, { Cookie: 'ebt-web-session=bob-session', 'X-EBT-Session': key }));
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'session_changed');
    assert.equal(target.calls.length, 0);
  }
});

test('session binding requires the server secret and rejects fingerprints after key rotation', () => {
  const shared = load('app/api/ebt/shared.ts');
  const original = process.env.EBT_SESSION_BINDING_SECRET;
  try {
    const key = shared.sessionKey('fixture-session');
    assert(shared.matchesSessionKey('fixture-session', key));
    assert(!shared.matchesSessionKey('another-session', key));
    for (const invalid of [null, '', 'z'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
      assert.equal(shared.matchesSessionKey('fixture-session', invalid), false);
    }
    const plain = require('node:crypto').createHash('sha256').update('ebt-scanner-session:fixture-session').digest('hex');
    assert(!shared.matchesSessionKey('fixture-session', plain));
    process.env.EBT_SESSION_BINDING_SECRET = 'cd'.repeat(32);
    assert.notEqual(shared.sessionKey('fixture-session'), key);
    assert(!shared.matchesSessionKey('fixture-session', key));
    for (const invalid of ['', 'short', 'z'.repeat(64)]) {
      process.env.EBT_SESSION_BINDING_SECRET = invalid;
      assert.equal(shared.sessionBindingConfigured(), false);
      assert.throws(() => shared.sessionKey('fixture-session'), /not configured/);
    }
    delete process.env.EBT_SESSION_BINDING_SECRET;
    assert.throws(() => shared.sessionKey('fixture-session'), /not configured/);
  } finally { process.env.EBT_SESSION_BINDING_SECRET = original; }
});

test('missing or malformed binding secrets block account actions before any upstream call', async () => {
  const original = process.env.EBT_SESSION_BINDING_SECRET;
  const req = request({ notes: [note], email: 'fixture@example.test', password: 'fixture' });
  try {
    for (const value of ['', 'invalid']) {
      process.env.EBT_SESSION_BINDING_SECRET = value;
      for (const route of ['login', 'session', 'notes']) {
        const target = api(route);
        const response = await target[route === 'session' ? 'GET' : 'POST'](req);
        assert.equal(response.status, 503);
        assert.equal(target.calls.length, 0);
        assert(!JSON.stringify(response.body).includes(value || 'EBT_SESSION_BINDING_SECRET'));
      }
    }
  } finally { process.env.EBT_SESSION_BINDING_SECRET = original; }
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
  assert.equal(remembered.cookies[0][2].maxAge, 30 * 86400);
  assert(!('rememberMe' in remembered.calls[0]), 'The local cookie preference is not sent to EBT');
  for (const rememberMe of ['true', 1, null, {}]) {
    const target = api('login', () => account);
    assert.equal((await target.POST(request({ ...credentials, rememberMe }))).status, 400);
    assert.equal(target.calls.length, 0);
  }
});

test('remember-me is limited to 30 days and retains cookie protections', () => {
  const { loginCookieOptions } = load('app/api/ebt/shared.ts');
  for (const remembered of [false, true]) {
    const cookie = loginCookieOptions(remembered);
    assert.equal(cookie.maxAge, remembered ? 30 * 86400 : undefined);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'lax');
  }
});

test('logout clears the cookie only after EBT rejects the previous token', async () => {
  const target = api('logout', p => p.m === 'logout' ? true : false);
  const response = await target.POST(request({}));
  assert.equal(response.status, 200);
  assert.equal(response.body.upstreamInvalidated, true);
  assert.equal(response.cleared, true);
  assert.deepEqual(target.calls.map(p => p.m), ['logout', 'sessioncheck']);
  assert(target.calls.every(p => p.PHPSESSID === 'session'));
  const absent = api('logout', () => { throw new Error('No session to revoke'); });
  const noSession = await absent.POST(request({}, { Cookie: '' }));
  assert.equal(noSession.body.noSession, true);
  assert.equal(noSession.body.upstreamInvalidated, false);
  assert.equal(absent.calls.length, 0);
  const oldClient = api('logout', p => p.m === 'logout' ? true : false);
  const legacyRequest = new NextRequest('https://app.test/api/ebt/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test', Cookie: 'ebt-web-session=session' } });
  assert.equal((await oldClient.POST(legacyRequest)).body.upstreamInvalidated, true);
  assert.deepEqual(oldClient.calls.map(p => p.m), ['logout', 'sessioncheck']);
});

test('unconfirmed logout retains the cookie for retry; local-only sign-out is explicit', async () => {
  for (const answer of [() => { throw new Error('unreachable'); }, () => true, () => ({ username: 'Tracker' })]) {
    const target = api('logout', answer);
    const response = await target.POST(request({}));
    assert.equal(response.status, 502);
    assert.equal(response.cleared, undefined);
    assert.equal(response.body.upstreamInvalidated, false);
  }
  const target = api('logout', () => { throw new Error('must not call upstream'); });
  const response = await target.POST(request({ localOnly: true }));
  assert.equal(response.cleared, true);
  assert.equal(response.body.upstreamInvalidated, false);
  assert.equal(target.calls.length, 0);
  assert.equal((await target.POST(request({ localOnly: 'true' }))).status, 400);
});


test('insertion responses normalize numeric strings and mark malformed individual results unknown', async () => {
  for (const status of [null, false, '', [], -1, '0x0']) {
    const target = api('notes', () => ({ note0: { status }, note1: { status: '1', billId: 42 } }));
    const response = await target.POST(request({ notes: [note, { ...note, id: 'two' }] }));
    assert.equal(response.body.results[0].result, null);
    assert.equal(response.body.results[1].result.status, 1);
  }
});
