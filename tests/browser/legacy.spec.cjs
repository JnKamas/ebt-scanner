const { test } = require('@playwright/test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
for (const file of ['tests/ebt-browser.cjs', 'tests/location-browser.cjs']) {
  test(`existing browser workflow: ${file}`, async () => {
    await run(process.execPath, [file], {
      env: { ...process.env, EBT_PLAYWRIGHT_MODULE: require.resolve('@playwright/test') },
      timeout: 60000,
    });
  });
}
