# App regression and vulnerability review

Reviewed 2026-11-06. The review covered the scanner, entry/edit/queue flows, authentication, API routes, local persistence, service worker, and dependency lockfile. All EBT operations in automated tests use fixtures; no real credentials or notes are submitted.

Validation completed: **47 unit/API/security/asset-integrity tests**, **29 browser tests**, TypeScript and the production build passed. Final npm audit: **0 known vulnerabilities** (dependency versions unchanged by subsequent application changes).

Open-source release files now include the MIT [LICENSE](LICENSE), [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md), [Code of Conduct](CODE_OF_CONDUCT.md), and [third-party notices](THIRD_PARTY_NOTICES.md). The active OCR models and runtime have recorded upstream sources and SHA-256 hashes; model weights also match the official model cards. An asset-integrity test prevents unrecorded replacements. Unused legacy runtime copies were removed. Repository visibility and GitHub private-reporting settings require separate verification in GitHub.

## Shared implementation for public release

Account types and the public response whitelist are shared between login, session checks and the UI. Login and cookie deletion share the same cookie security settings. Manual entry, OCR and server insertion share code-format rules. The scanner has one matching/box-joining implementation, and the displayed confidence requirement uses its actual threshold. Queue selection, the batch limit and location comparisons are shared by submission and the displayed count. Pending-submission persistence uses one storage helper. Unit/API tests use one TypeScript loader.

Additional regressions verify joined OCR text, spatial/confidence rejection, complete serial matching, queue order and location grouping, account response filtering, cookie deletion protections and pending-marker persistence. Public-launch limits, including production rate limiting and real-device acceptance, remain listed below.

## Review findings and regression coverage

| Finding | Fix | Regression coverage |
| --- | --- | --- |
| Startup effects could erase a saved queue in development | Restore and validate browser data before enabling writes; protect preferences with the same startup guard | `storage.test.cjs`; development Strict Mode browser test |
| Lost insertion responses were described as definite failures | Report an unknown outcome; persist the in-flight batch IDs before sending; block retry until the user checks EBT | `mutations.test.cjs`; reload and post-insertion storage-failure browser tests |
| OCR could invent codes from numeric strings or truncate longer text | Require an entire six-character candidate and at least one observed letter; apply I/1/l correction only in positions fixed by the code structure | `printer-code-ocr.test.cjs`; live scanner browser tests |
| Drafts and location edits disappeared on reload | Persist a whitelist of draft fields, including comments, alongside the queue | `storage.test.cjs`; draft reload browser test |
| Entry, editing and server validation differed | Share checksum, printer format, required-field and length/control-character checks; keep postcode optional | `note-validation.test.cjs`; mutation and queue editor tests |
| Missing frames or playback failures escaped the scan deadline | Bound startup separately; reveal the selected camera only after a usable frame and then start the full 15-second live window | Missing-frame, failed-playback, failed-encoding, warmup and loading/cancellation browser tests |
| Offline shell lacked its production assets | Generate a versioned service worker after each build and precache the document and matching build assets; never cache API/RSC responses | `service-worker.test.cjs`; first-visit offline reload/manual-entry browser test |
| JSON null or wrong-shaped bodies threw exceptions | Stream and bound request bodies, then require an object before accessing fields | `mutations.test.cjs` |

Additional browser checks cover OS install guidance, early flags, invalid-field highlighting, no camera access from input/label clicks, minimum OCR confidence, frozen OCR boxes, printer-to-serial progression, automatic hit journeys, rejection editing, location lookup and account workflows.

## Vulnerabilities addressed

- **Dependency advisories:** npm reported critical advisories against the installed Next.js release. Updated the package minimum and lockfile to **16.4.5**. The final `npm audit --json` reported **zero known vulnerabilities**, including development dependencies. The upstream advisories list patched releases starting at 16.4.1: [SVG/image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), and [`use cache` typed-array handling](https://github.com/advisories/GHSA-673q-mjm6-r5xr). Dependency exposure does not establish that every advisory was exploitable through this app's enabled features.
- **Cross-origin mutations/login CSRF:** login, logout and insertion reject foreign origins, cross-site fetch metadata and non-JSON content types. This follows [OWASP's guidance on disallowing simple content types for JSON APIs](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- **Unbounded API bodies:** login is limited to 4 KiB and insertion to 64 KiB, checked against actual streamed bytes as well as any declared length.
- **Credential forwarding on redirect:** the fixed HTTPS EBT transport rejects redirects instead of replaying credentials to a redirect destination.
- **False sign-out and stale authentication responses:** failed logout retains the signed-in state with an explicit retry message; old session responses cannot override newer login/logout operations.
- **Persistent login choice:** authentication now defaults to a session-only cookie. The unchecked remember-me control explicitly opts into up to six calendar months, using month-end/leap-year-safe expiry calculations and retaining the existing cookie security attributes. Upstream EBT session expiry may require sign-in sooner. Tests cover default/false/true/malformed choices and both browser form submissions. No analytics collection has been added.
- **Embedding and MIME handling:** responses include a frame-ancestor policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a referrer policy, and restrictions on object/base elements.
- **Private cache/storage handling:** authenticated API responses remain `no-store`; service-worker tests verify API requests bypass caches. Only whitelisted note/draft fields are persisted. Passwords and session IDs are excluded from saved notes and JSON login responses; the session cookie stays Secure, HttpOnly and SameSite=Lax.
- **Text injection:** hit comments are rendered as React text. A browser test includes an image/onerror payload and verifies it creates neither an element nor script execution. Map URLs remain limited to official EBT HTTPS hosts.

## Running the checks

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
npx playwright install chromium
npm run test:browser
npm audit
```

Use `npm.cmd`/local `.cmd` binaries in PowerShell if script execution is restricted. Stop any development server before building. Browser tests start and stop their own production server on port 3001 and development server on port 3002. Generated `public/sw.js` is a build artifact; edit `scripts/service-worker.js` and build through `npm run build`. CI runs the same checks.

## Limits and remaining operational work

The About & privacy page documents the maintainer (Labrador10), credential forwarding, cookie lifetime and flags, local processing/storage, hosting and optional external requests, with links to the backend source. Before making the repository public, Gitleaks v8.30.1 scanned all 70 existing commits with no leaks reported, and separate scans of the current app, scripts and tests reported no leaks. These checks do not prove the absence of all secrets or constitute an independent audit. A browser check verifies that opening the explanation before sign-in retains unfinished form input without requesting the camera. The service worker caches document pages by path so visiting About cannot replace the offline scanner shell.

- These are automated regressions and a source/dependency review, not a guarantee that every possible vulnerability or device failure is covered.
- Scanner tests use a fake webcam and the real SDK interface with a fixture worker. Physical banknote accuracy, laptop camera focus and real iPhone Safari behavior still require device testing.
- Mutations use fixture responses. Official EBT availability, response loss and credential validity were not exercised with a live account.
- The audit does not verify Vercel WAF/rate-limit settings or resistance to distributed abuse. The repository has bounded bodies and upstream timeouts, but no durable distributed login rate limiter.
- Browser local storage remains shared across tabs; simultaneous independent edits in multiple tabs are not reconciled. Use one entry tab per device until conflict handling is added.
- The CSP added here limits embedding/base/object behavior; it is not a nonce-based script policy.
- Offline manual entry is covered after the first successful online service-worker installation. Offline OCR also requires its model/runtime assets to have been downloaded previously.
