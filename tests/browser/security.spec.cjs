const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');

test('production CSP blocks injected scripts and event handlers while the app remains usable', async ({ page }) => {
  await setup(page);
  // Inject into the parsed HTML response. DevTools page.evaluate has special
  // execution privileges and is not a faithful simulation of reflected HTML.
  await page.route('http://localhost:3001/', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<body>', '<body><script>window.injectedScriptRan = true</script><button id="injected-test-control" onclick="window.injectedHandlerRan = true">Injected test control</button>');
    await route.fulfill({ response, body: html });
  });
  const response = await page.goto('/');
  const policy = response.headers()['content-security-policy'];
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-eval'");
  const firstNonce = policy.match(/'nonce-([^']+)'/)[1];
  expect(await page.locator('script[nonce]').first().evaluate(node => node.nonce)).toBe(firstNonce);
  await page.locator('#injected-test-control').click();
  expect(await page.evaluate(() => Boolean(window.injectedScriptRan || window.injectedHandlerRan))).toBe(false);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  const reloaded = await page.reload();
  expect(reloaded.headers()['content-security-policy']).not.toContain(`'nonce-${firstNonce}'`);
});

test('a throttled login gets a useful message even when the firewall returns plain text', async ({ page }) => {
  await setup(page);
  await page.route('**/api/ebt/login', route => route.fulfill({ status: 429, contentType: 'text/plain', body: 'Too many requests' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture');
  await page.getByRole('button', { name: 'Sign in to EuroBillTracker', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Too many sign-in attempts' })).toBeVisible();
});

test('unconfirmed logout offers retry and explicit local-only sign-out', async ({ page }) => {
  await setup(page, { signedIn: true });
  const choices = [];
  await page.route('**/api/ebt/logout', route => {
    const { localOnly } = route.request().postDataJSON();
    choices.push(localOnly);
    return route.fulfill({ status: localOnly ? 200 : 502, json: { ok: localOnly, upstreamInvalidated: false } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.account-card')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out on this device only', exact: true }).click();
  await expect(page.locator('.account-card')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'EBT session invalidation was not confirmed' })).toBeVisible();
  expect(choices).toEqual([false, true]);
});

test('confirmed logout reports EBT invalidation', async ({ page }) => {
  await setup(page, { signedIn: true });
  await page.route('**/api/ebt/logout', route => route.fulfill({ json: { ok: true, upstreamInvalidated: true } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'EBT confirmed' })).toBeVisible();
});

test('the real local OCR worker prepares and processes a camera crop under production CSP', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/api/ebt/session', route => route.fulfill({ json: { account: null } }));
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => { window.cameraRequests++; return getUserMedia(constraints); };
    window.realOcrPredictions = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          if (data?.kind === 'worker-transport-response' && data.status === 'success' && Array.isArray(data.payload)) window.realOcrPredictions++;
        });
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('.ocr-progress-error')).toHaveCount(0);
  await expect(page.locator('.ocr-progress')).toHaveCount(0, { timeout: 90000 });
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Choose €20', exact: true }).click();
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.realOcrPredictions), { timeout: 30000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  const closeCamera = page.getByRole('button', { name: 'Close camera', exact: true });
  if (await closeCamera.count()) await closeCamera.click();
});
