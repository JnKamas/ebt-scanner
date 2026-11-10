const { test, expect } = require('@playwright/test');
const { setup, note } = require('./fixtures.cjs');

test('queue survives Strict Mode startup and development never registers a worker', async ({ page }) => {
  await setup(page, { notes: [note], preferences: { 'ebt-web-result-display-seconds': '7', 'ebt-web-auto-queue-next': 'true' } });
  await page.goto('http://localhost:3002');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Show each scan result for')).toHaveValue('7');
  await expect(page.getByRole('checkbox', { name: 'Scan the next banknote automatically' })).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(list => list.length))).toBe(0);
});

test('draft fields, red validation, and early flags survive a reload', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose €20', exact: true }).click();
  await page.getByLabel('Country', { exact: true }).fill('Slovakia');
  await page.getByLabel('City', { exact: true }).fill('Bratislava');
  await page.getByLabel('Comment').fill('shop');
  await page.locator('#printer-code').fill('R');
  await expect(page.locator('.field-invalid')).toHaveCount(1);
  await expect(page.locator('.banknote-flag')).toHaveCount(1);
  await page.locator('#serial-number').fill('MA');
  await expect(page.locator('#serial-number')).toHaveAttribute('aria-invalid', 'true');
  await page.reload();
  await expect(page.locator('#printer-code')).toHaveValue('R');
  await expect(page.locator('#serial-number')).toHaveValue('MA');
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Bratislava');
  await expect(page.getByLabel('Comment')).toHaveValue('shop');
  await page.locator('#printer-code').fill('R001A1');
  await page.locator('#serial-number').fill(note.serial);
  await expect(page.locator('.field-invalid')).toHaveCount(0);
  await page.getByLabel('Comment').fill('line one\nline two');
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Comment:' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Comment: use at most')).toHaveCount(0);
});

test('editing permits an optional blank postcode and uses the same comment checks', async ({ page }) => {
  await setup(page, { notes: [note] });
  await page.goto('/');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.getByRole('button', { name: `Edit ${note.serial}` }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.banknote-inline-edit')).toHaveCount(0);
});

test('corrupt saved data is retained and warned about instead of overwritten', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('ebt-web-queue', '{broken'));
  await page.goto('/');
  await expect(page.locator('main [role="alert"]')).toContainText('could not be restored');
  expect(await page.evaluate(() => localStorage.getItem('ebt-web-queue'))).toBe('{broken');
});

test('unknown submission outcomes block retry across reloads until acknowledged', async ({ page }) => {
  await setup(page, { notes: [note], signedIn: true });
  let requests = 0;
  await page.route('**/api/ebt/notes', route => { requests++; return route.abort(); });
  await page.goto('/');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.getByRole('button', { name: 'Submit queue (1)' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'I checked EBT; allow retry' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.getByRole('button', { name: 'Submit queue (1)' })).toBeDisabled();
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'I checked EBT; allow retry' }).click();
  await expect(page.getByRole('button', { name: 'Submit queue (1)' })).toBeEnabled();
});

test('no-hit submissions show only the hit count without note links', async ({ page }) => {
  await setup(page, { notes: [note], signedIn: true });
  await page.route('**/api/ebt/notes', route => route.fulfill({ json: { results: [{ id: note.id, result: { status: 0, billId: 42 } }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Last submission: 0 hits' })).toBeVisible();
  await expect(page.locator('.submission-receipts article, .submission-receipts a')).toHaveCount(0);
});

test('a storage failure after insertion cannot restore notes as safe to resubmit', async ({ page }) => {
  await setup(page, { notes: [note], signedIn: true });
  await page.route('**/api/ebt/notes', route => route.fulfill({ json: { results: [{ id: note.id, result: { status: 0, billId: 42 } }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'ebt-web-queue' && value === '[]') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.getByRole('button', { name: 'I checked EBT; allow retry' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.getByRole('button', { name: 'Submit queue (1)' })).toBeDisabled();
});

test('security headers are present and forged mutations fail without forwarding credentials', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  const forged = await request.post('/api/ebt/login', { headers: { Origin: 'https://evil.test' }, data: { email: 'fake', password: 'fake' } });
  expect(forged.status()).toBe(403);
  const invalid = await request.post('/api/ebt/login', { headers: { Origin: 'http://localhost:3001' }, data: null });
  expect([400, 415]).toContain(invalid.status());
});

test('hit details load automatically and untrusted comments render as text', async ({ page }) => {
  await setup(page, { notes: [note], signedIn: true });
  await page.route('**/api/ebt/notes', route => route.fulfill({ json: { results: [{ id: note.id, result: { status: 1, billId: 42 } }] } }));
  await page.route('**/api/ebt/journey?id=42', route => route.fulfill({ json: { journey: {
    total_km: 120, total_days: 30, img_url_europe: null, img_url_world: null,
    steps: [{ step_id: 0, location_name: 'Berlin', country_name: 'Germany', timestamp: '2026-09-01', user_name: 'FirstTracker', comment: '<img src=x onerror="window.xss=true">', hit_km: 0, hit_days: 0 },
      { step_id: 1, location_name: 'Bratislava', country_name: 'Slovakia', timestamp: '2026-10-01', user_name: 'TestTracker', comment: 'shop', hit_km: 120, hit_days: 30 }],
  } } }));
  await page.goto('/');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Last submission: 1 hit' })).toBeVisible();
  const journey = page.locator('.hit-journey');
  await expect(journey).toContainText('Berlin, Germany');
  await expect(journey).toContainText('FirstTracker');
  await expect(journey).toContainText('2026-09-01');
  await expect(journey).toContainText('120 km');
  await expect(journey).toContainText('30 days');
  await expect(journey.locator('img, script, a')).toHaveCount(0);
  expect(await page.evaluate(() => window.xss)).toBeUndefined();
});

test('failed sign-out does not falsely claim that the browser session was cleared', async ({ page }) => {
  await setup(page, { signedIn: true });
  await page.route('**/api/ebt/logout', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Could not sign out' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  await expect(page.getByText('Signed out of EuroBillTracker on this device.')).toHaveCount(0);
});

test('a delayed initial session check cannot overwrite a newer successful login', async ({ page }) => {
  await setup(page);
  let release;
  const held = new Promise(resolve => release = resolve);
  await page.route('**/api/ebt/session', async route => { await held; await route.fulfill({ json: { account: null } }); });
  await page.route('**/api/ebt/login', route => route.fulfill({ json: { account: { username: 'NewTracker', totalbills: 1, totalhits: 0, my_country: '', my_city: '', my_zip: '' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only');
  await page.getByRole('button', { name: 'Sign in to EuroBillTracker', exact: true }).click();
  await expect(page.locator('.account-card')).toContainText('NewTracker');
  const sessionResponse = page.waitForResponse(response => response.url().endsWith('/api/ebt/session'));
  release();
  await sessionResponse;
  await expect(page.locator('.account-card')).toContainText('NewTracker');
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('fixture-only')))).toBe(false);
});


for (const status of [null, false, '', []]) {
  test(`malformed status ${JSON.stringify(status)} preserves the note and retry guard across reloads`, async ({ page }) => {
    await setup(page, { notes: [note, { ...note, id: 'two', serial: 'X00000000011' }], signedIn: true });
    await page.route('**/api/ebt/notes', route => route.fulfill({ json: { results: [
      { id: note.id, result: { status } }, { id: 'two', result: { status: '0' } },
    ] } }));
    await page.goto('/');
    await page.getByRole('button', { name: /^Queue/ }).click();
    await page.getByRole('button', { name: 'Submit queue (2)' }).click();
    await expect(page.locator('.note-list article')).toHaveCount(2);
    await expect(page.locator('.submission-receipts')).toContainText('EBT did not confirm this note');
    await expect(page.getByRole('button', { name: 'I checked EBT; allow retry' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /^Queue/ }).click();
    await expect(page.locator('.note-list article')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Submit queue (1)' })).toBeDisabled();
  });
}

test('clearing the queue requires confirmation and persists only after acceptance', async ({ page }) => {
  await setup(page, { notes: [note] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('Clear all 1 queued note');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Local queue cleared.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ebt-web-queue'))).toBe('[]');
  await page.reload();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeDisabled();
});
