const { defineConfig } = require('@playwright/test');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Each test run gets an ephemeral key shared by its two local servers.
const testEnv = { EBT_SESSION_BINDING_SECRET: require('node:crypto').randomBytes(32).toString('hex') };
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3001', serviceWorkers: 'block',
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: `${npm} run start -- --port 3001`, env: testEnv, url: 'http://localhost:3001', reuseExistingServer: false },
    { command: `${npm} run dev -- --port 3002`, env: testEnv, url: 'http://localhost:3002', reuseExistingServer: false, timeout: 60000 },
  ],
});
