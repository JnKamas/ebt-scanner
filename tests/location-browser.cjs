const { chromium } = require(process.env.EBT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: 48.2082, longitude: 16.3738, accuracy: 50 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.geoCalls = 0;
      window.geoError = 0;
      const getPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (success, error, options) => {
        window.geoCalls++;
        if (window.geoError) return error({ code: window.geoError });
        return getPosition(success, error, options);
      };
    });
    await page.route('**/api/ebt/session', (route) => route.fulfill({ json: { account: null } }));
    let mode = 'normal';
    let release;
    await page.route('https://photon.komoot.io/reverse?**', async (route) => {
      if (mode === 'network-error') return route.abort();
      if (mode === 'slow') await new Promise((resolve) => { release = resolve; });
      const props = mode === 'bratislava'
        ? new URL(route.request().url()).searchParams.has('layer')
          ? { name: 'Bratislava', osm_key: 'place', osm_value: 'city', countrycode: 'SK', postcode: '815 18', county: 'District I' }
          : { countrycode: 'SK', postcode: '811 06', county: 'District I' }
        : { city: 'Vienna', countrycode: 'AT', postcode: mode === 'no-postcode' ? undefined : '1010' };
      return route.fulfill({ json: { features: [{ properties: props }] } });
    });
    await page.goto('http://localhost:3001');
    assert.equal(await page.evaluate(() => window.geoCalls), 0);
    const button = page.getByRole('button', { name: 'Use my location', exact: true });
    const country = page.getByRole('textbox', { name: 'Country', exact: true });
    const city = page.getByRole('textbox', { name: 'City', exact: true });
    const postcode = page.getByRole('textbox', { name: 'Postal code', exact: true });
    await postcode.fill('OLD');
    await button.click();
    await page.getByText(/Location filled: Vienna, Austria/).waitFor();
    assert.equal(await country.inputValue(), 'Austria');
    assert.equal(await city.inputValue(), 'Vienna');
    assert.equal(await postcode.inputValue(), '1010');
    assert.equal(await page.evaluate(() => localStorage.getItem('ebt-web-location')), null);
    mode = 'no-postcode';
    await button.click();
    await page.getByText(/No postcode was found/).waitFor();
    assert.equal(await postcode.inputValue(), '');
    mode = 'bratislava';
    await button.click();
    await page.getByText(/Location filled: Bratislava, Slovakia/).waitFor();
    assert.equal(await postcode.inputValue(), '811 06');
    for (const [code, message] of [[1, /Location access was blocked/], [2, /could not determine your position/], [3, /Finding your position timed out/]]) {
      await page.evaluate((value) => { window.geoError = value; }, code);
      await button.click();
      await page.getByText(message).waitFor();
      assert.equal(await city.inputValue(), 'Bratislava');
    }
    await page.evaluate(() => { window.geoError = 0; });
    mode = 'network-error';
    await button.click();
    await page.getByText(/Could not look up your city and postcode/).waitFor();
    assert.equal(await postcode.inputValue(), '811 06');
    mode = 'slow';
    const lookupStarted = page.waitForRequest('https://photon.komoot.io/reverse?**');
    await button.click();
    await lookupStarted;
    await city.fill('My manual edit');
    release();
    await page.getByText(/Your location fields changed during the lookup/).waitFor();
    assert.equal(await city.inputValue(), 'My manual edit');
    console.log('Location browser checks passed: click-only geolocation, address fill, missing postcode, city fallback, permission errors, lookup failure, and preserving edits.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
