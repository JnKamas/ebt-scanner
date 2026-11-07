# Review notes

This is an internal development review, not an independent security audit.
Tests use fake EBT responses and camera input, never real credentials or submissions.

## What has been checked

The review on 6 November 2026 covered scanning, entry and queue editing, sign-in,
server routes, browser storage and offline use. It passed 47 unit/API tests,
29 browser tests, TypeScript and a production build. The dependency audit reported
no known vulnerabilities at that time.

Fixes covered saved drafts being overwritten, uncertain submissions being retried,
OCR accepting false matches, scan timeouts, inconsistent validation and offline
assets. Server checks reject cross-site changes and oversized requests, block
credential forwarding through redirects and keep account responses out of caches.
Passwords are not saved; session cookies are Secure, HttpOnly and SameSite=Lax.

On 7 November, the privacy-page update passed 48 unit/API tests, TypeScript and
the build. All 31 browser checks passed, but the Windows runner hung during
cleanup and had to be stopped. Added checks cover opening privacy information
without losing form input and keeping the About page out of the offline scanner cache.

Before publication, Gitleaks v8.30.1 found no secrets in the 70 existing commits
or in separate scans of the current app, scripts and tests. Bundled OCR assets
have recorded sources, licenses and SHA-256 hashes in
[PROVENANCE.json](public/ocr/PROVENANCE.json). These checks can miss problems.

## Still needs checking

- Real banknotes, laptop focus and iPhone Safari need hands-on testing.
- Live EBT availability and account behavior are outside the fixture tests.
- A Vercel login throttle is active on previews: 10 POST requests per IP per
  10 minutes, counted per region. Shared connections share the limit; attackers
  using multiple IPs or regions can exceed it. The rule is recorded in
  [login-rate-limit.json](security/login-rate-limit.json) and must be enabled for
  production when the security update is released. Local tests do not use it.
  A credential-free preview check returned 400 for ten invalid requests and 429
  for the eleventh, after passing Vercel's preview access gate.
- Hosting account access, log retention and private vulnerability reporting still
  need separate verification.
- Use one entry tab at a time: simultaneous local-storage edits are not reconciled.
- Offline use needs a previous online visit; OCR also needs downloaded models.
- Development 1.2.0 uses fresh script nonces. The isolated Paddle OCR worker has
  an eval exception required by its runtime; page scripts do not. Inline styles
  remain allowed for the scanner overlay. Offline HTML retains its original CSP
  and matching nonce. This policy needs browser and real-worker checks on changes.
- New remember-me cookies last 30 days. Existing longer-lived cookies retain
  their original expiry until sign-out and a new login.
- Logout verifies that EBT rejects the old token. If confirmation fails, users
  can retry or explicitly clear only the local cookie; upstream revocation is
  not claimed for local-only sign-out.

Security browser checks cover blocked script injection, throttling messages,
both logout outcomes, and real local OCR inference under the new policy.

## Verify locally

After the [local setup](README.md#run-locally), run:

```sh
npm test
npx tsc --noEmit
# Stop development servers before building.
npm run build
npx playwright install chromium
npm run test:browser
npm audit
```

Use `npm.cmd` in PowerShell if needed. Browser tests start servers on ports
3001 and 3002 and use fake account and note data. For private reports, see
[Security](SECURITY.md).
