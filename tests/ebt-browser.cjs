// Run against npm start on port 3001. Requires Playwright (or EBT_PLAYWRIGHT_MODULE).
// All EBT responses are fixtures: this never logs in or submits a real note.
const { chromium } = require(process.env.EBT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let signedIn = true;
    let failComments = true;
    const calls = [];
    const account = { username: 'TestTracker', my_city: 'Wien', my_country: 'Austria', my_zip: '1010', totalbills: 100, totalhits: 3 };
    const fixtureNotes = ['X00000000002', 'X00000000011', 'X00000000020'].map((serial, index) => ({ id: String(index), serial, printerCode: 'R001A1', denomination: '5', country: 'Austria', city: 'Wien', postalCode: '1010', comment: '', createdAt: '2026-10-29T10:00:00Z' }));
    await context.addInitScript((notes) => { localStorage.setItem('ebt-web-queue', JSON.stringify(notes)); }, fixtureNotes);
    await page.route('**/api/ebt/**', async (route) => {
      const url = new URL(route.request().url());
      calls.push(url.href);
      const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.endsWith('/session')) return respond({ account: signedIn ? account : null });
      if (url.pathname.endsWith('/logout')) { signedIn = false; return respond({ ok: true }); }
      if (url.pathname.endsWith('/profile')) return respond({ profile: { user_name: 'TestTracker', join_date: '2005-01-01', total_notes: 100, total_hits: 3, img_url_notes_europe: 'https://www.eurobilltracker.com/test-map.png', img_url_notes_world: null, img_url_hits_europe: null } });
      if (url.pathname.endsWith('/journey')) return respond({ journey: { total_km: 120, total_days: 30, img_url_europe: null, img_url_world: null, steps: [{ step_id: 0, location_name: 'Berlin', country_name: 'Germany', timestamp: '2026-09-29', user_name: 'FirstTracker', comment: 'shop', hit_km: 0, hit_days: 0 }, { step_id: 1, location_name: 'Wien', country_name: 'Austria', timestamp: '2026-10-29', user_name: 'TestTracker', comment: '', hit_km: 120, hit_days: 30 }] } });
      if (url.pathname.endsWith('/notes')) {
        const { notes } = route.request().postDataJSON();
        return respond({ results: notes.map((note, index) => ({ id: note.id, result: { status: [1, 0, 20][index], billId: index < 2 ? 42 + index : undefined } })) });
      }
      if (url.searchParams.get('kind') === 'cities') return respond({ data: [{ city: 'Wien', country: 'Austria', top_zipcode: '1010', nrlocations: 2 }, { city: 'Bratislava', country: 'Slovakia', top_zipcode: '81101', nrlocations: 1 }] });
      if (url.searchParams.get('kind') === 'zipcodes') return respond({ data: ['1010', '1020'] });
      if (url.searchParams.get('kind') === 'comments') {
        if (failComments) return respond({ error: 'Temporary EBT failure' }, 502);
        return respond({ data: url.searchParams.get('city') === 'Wien' ? [{ comment: 'ATM at the station', amount: 20 }] : [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    await page.goto('http://localhost:3001');
    assert.equal(await page.locator('.bottom-nav button').count(), 4);
    for (const label of ['Entry', /^Queue/, 'Profile', 'Settings']) assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: label, exact: true }).count(), 1);
    assert.equal(await page.locator('.entry-panel select').count(), 0);
    assert.equal(await page.locator('.field-suggestions ul').count(), 0);
    await page.getByRole('textbox', { name: 'City', exact: true }).click();
    await page.getByRole('button', { name: /Wien.*Austria.*1010/ }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Postal code', exact: true }).inputValue(), '1010');
    // Simulate browsers that blur the input without focusing a clicked button.
    // A pointer interaction must keep its suggestion alive until activation.
    await page.evaluate(() => {
      document.addEventListener('pointerdown', (event) => {
        if (!event.defaultPrevented && event.target.closest('.field-suggestions button')) document.activeElement?.blur();
      });
    });
    await page.getByRole('textbox', { name: 'City', exact: true }).click();
    const alternate = page.getByRole('button', { name: /Bratislava.*Slovakia.*81101/ });
    const bounds = await alternate.boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.waitForFunction(() => document.getElementById('entry-city').value === 'Bratislava', undefined, { timeout: 3000 });
    assert.equal(await page.getByRole('textbox', { name: 'Country', exact: true }).inputValue(), 'Slovakia');
    assert.equal(await page.getByRole('textbox', { name: 'Postal code', exact: true }).inputValue(), '81101');
    // Reopen the same input without moving focus away, then switch back.
    await page.getByRole('textbox', { name: 'City', exact: true }).click();
    const returnLocation = await page.getByRole('button', { name: /Wien.*Austria.*1010/ }).boundingBox();
    await page.touchscreen.tap(returnLocation.x + returnLocation.width / 2, returnLocation.y + returnLocation.height / 2);
    assert.equal(await page.getByRole('textbox', { name: 'City', exact: true }).inputValue(), 'Wien');
    await page.getByRole('textbox', { name: 'Postal code', exact: true }).click();
    await page.getByRole('button', { name: '1020', exact: true }).click();
    await page.getByRole('textbox', { name: /Comment/ }).click();
    await page.getByText('Temporary EBT failure').waitFor();
    failComments = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'ATM at the station 20 notes', exact: true }).click();
    assert.equal(await page.locator('textarea').inputValue(), 'ATM at the station');
    assert(calls.some((url) => url.includes('kind=comments') && url.includes('zip=1020')));
    const changedLocation = page.waitForResponse((response) => response.url().includes('kind=comments') && response.url().includes('city=Graz'));
    await page.getByRole('textbox', { name: 'City', exact: true }).fill('Graz');
    await changedLocation;
    await page.getByRole('textbox', { name: /Comment/ }).click();
    assert.equal(await page.locator('.comment .field-suggestions button').count(), 0);
    await page.getByRole('textbox', { name: 'City', exact: true }).fill('Wie');
    await page.getByRole('textbox', { name: 'City', exact: true }).press('Escape');
    assert.equal(await page.locator('.field-suggestions ul').count(), 0);
    await page.getByRole('textbox', { name: 'City', exact: true }).fill('Wien');
    await page.getByRole('textbox', { name: 'City', exact: true }).press('Tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('textbox', { name: 'Postal code', exact: true }).inputValue(), '1010');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('textbox', { name: /Comment/ }).click();
    await page.getByRole('button', { name: 'ATM at the station 20 notes', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1366, height: 900 });

    await page.getByRole('button', { name: /Queue/ }).click();
    assert.equal(await page.getByRole('button', { name: /CSV/ }).count(), 0);
    assert.equal(await page.locator('.note-list').getByRole('img', { name: 'Commissioned by: Germany', exact: true }).count(), 3);
    assert.equal(await page.locator('.note-list').getByRole('img', { name: 'Printed in: Germany', exact: true }).count(), 3);
    await page.waitForFunction(() => [...document.querySelectorAll('.note-list .banknote-flag')].every((flag) => flag.complete && flag.naturalWidth > 0));
    assert(await page.evaluate(() => Boolean(document.querySelector('.note-list').compareDocumentPosition(document.querySelector('.queue-submit')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    await page.getByRole('button', { name: 'Submit queue (3)' }).click();
    await page.getByText('Hit! This note has been found before.').waitFor();
    await page.getByText('Check the country (use its English name). Check the printer code.').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.note-list article').length === 3);
    assert.equal(await page.locator('.note-list article').count(), 3);
    await page.getByRole('heading', { name: 'Last submission: 1 hit', exact: true }).waitFor();
    assert.equal(await page.locator('.submission-receipts a').count(), 0);
    assert.equal(await page.locator('.submission-receipts article').count(), 2);
    await page.getByText('Berlin, Germany', { exact: true }).waitFor();
    assert.match(await page.locator('.hit-journey').innerText(), /120 km/);
    await page.getByRole('button', { name: 'Edit X00000000020' }).click();
    await page.getByRole('textbox', { name: 'Country (English name)' }).fill('Germany');
    await page.getByRole('button', { name: 'Save changes' }).click();
    assert.equal(await page.locator('.banknote-inline-edit').count(), 0);
    assert.match(await page.locator('.note-list').innerText(), /Germany/);
    // Cross-tab saves wait for the shared storage lock after the UI updates.
    await page.waitForFunction(() => {
      const notes = JSON.parse(localStorage.getItem('ebt-web-queue') || '[]');
      return notes.length === 1 && notes[0].country === 'Germany';
    });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ebt-web-queue')));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].country, 'Germany');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Both scans require at least 70% OCR confidence. Format and serial checksum checks still apply.').waitFor();
    assert.equal(await page.locator('input[type=range]').count(), 0);
    assert.equal(await page.locator('.stats-card').count(), 0);
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Profile', exact: true }).getAttribute('aria-current'), 'page');
    await page.getByText('Tracking since 2005-01-01').waitFor();
    assert.equal(await page.getByText('My notes in Europe', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Refresh my stats' }).click();
    await page.getByText('Tracking since 2005-01-01').waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.locator('.stats-card').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.stats-card').count(), 0);
    await page.getByRole('button', { name: 'Sign in to EuroBillTracker', exact: true }).waitFor();
    await page.getByRole('button', { name: /Queue/ }).click();
    await page.getByText('Sign in from Profile to submit this queue to EuroBillTracker.').waitFor();
    assert.equal(await page.locator('.submission-receipts').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: locations, comment retry/context, partial submission, hit journey, rejection editing, profile, mobile width, logout.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
