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
- Hosting operators must check HTTPS, private vulnerability reporting and rate
  limits. The app has no durable distributed login rate limiter.
- Use one entry tab at a time: simultaneous local-storage edits are not reconciled.
- Offline use needs a previous online visit; OCR also needs downloaded models.
- The content security policy restricts embedding and objects, but does not use
  a nonce-based script policy.

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
