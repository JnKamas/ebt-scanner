const { defineConfig } = require('@playwright/test');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
    { command: `${npm} run start -- --port 3001`, url: 'http://localhost:3001', reuseExistingServer: false },
    { command: `${npm} run dev -- --port 3002`, url: 'http://localhost:3002', reuseExistingServer: false, timeout: 60000 },
  ],
});
