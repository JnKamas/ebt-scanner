const { test, expect } = require('@playwright/test');
const { setup, note } = require('./fixtures.cjs');

test('a city edit in a second tab preserves a newly queued note through reloads', async ({ page, context }) => {
  await setup(page);
  await page.goto('/');
  const second = await context.newPage();
  await setup(second);
  await second.goto('/');
  await page.getByRole('button', { name: 'Choose €20', exact: true }).click();
  await page.getByLabel('Country', { exact: true }).fill(note.country);
  await page.getByLabel('City', { exact: true }).fill(note.city);
  await page.locator('#printer-code').fill(note.printerCode);
  await page.locator('#serial-number').fill(note.serial);
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  await second.getByLabel('City', { exact: true }).fill('Wien');
  await second.getByRole('button', { name: /^Queue/ }).click();
  await expect(second.locator('.note-list article')).toHaveCount(1);
  await second.reload();
  await expect(second.getByLabel('City', { exact: true })).toHaveValue('Wien');
  await second.getByRole('button', { name: /^Queue/ }).click();
  await expect(second.locator('.note-list article')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
});

test('a stale sign-in is rejected without losing the queue or marking its outcome uncertain', async ({ page }) => {
  await setup(page, { notes: [note], signedIn: true });
  await page.route('**/api/ebt/notes', route => route.fulfill({ status: 409, json: { code: 'session_changed', error: 'Your sign-in changed in another tab. Reload, review the signed-in account, and submit again.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.getByRole('status')).toContainText('sign-in changed');
  await expect(page.locator('.note-list article')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'I checked EBT; allow retry' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.locator('.account-card')).toHaveCount(0);
});

test('signing out in a second tab clears the first tab displayed account', async ({ page, context }) => {
  await setup(page, { notes: [note], signedIn: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.locator('.account-card')).toContainText('TestTracker');
  const second = await context.newPage();
  await setup(second, { notes: [note], signedIn: true });
  await second.goto('/');
  await second.getByRole('button', { name: 'Profile', exact: true }).click();
  await second.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.account-card')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Sign-in changed in another tab');
});

test('a shared submission lock prevents two tabs from sending the queue concurrently', async ({ page, context }) => {
  await setup(page, { notes: [note], signedIn: true });
  await page.goto('/');
  const second = await context.newPage();
  await setup(second, { notes: [note], signedIn: true });
  await second.goto('/');
  for (const tab of [page, second]) await tab.getByRole('button', { name: /^Queue/ }).click();
  await second.evaluate(() => {
    window.releaseSubmission = null;
    void navigator.locks.request('ebt-web-submission', () => new Promise(resolve => { window.releaseSubmission = resolve; }));
  });
  await expect.poll(() => second.evaluate(() => Boolean(window.releaseSubmission))).toBe(true);
  let sent = 0;
  await page.route('**/api/ebt/notes', route => { sent++; return route.abort(); });
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.getByRole('status')).toContainText('Another tab is submitting');
  expect(sent).toBe(0);
  await second.evaluate(() => window.releaseSubmission());
});

test('the real submission route rejects a changed cookie before contacting EBT', async ({ request }) => {
  const response = await request.post('/api/ebt/notes', {
    headers: { Origin: 'http://localhost:3001', Cookie: 'ebt-web-session=dummy-bob', 'X-EBT-Session': 'stale-alice' },
    data: { notes: [note] },
  });
  expect(response.status()).toBe(409);
  expect((await response.json()).code).toBe('session_changed');
});
