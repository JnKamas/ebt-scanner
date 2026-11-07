# EBT Scanner

An independent, installable web app for fast EuroBillTracker note entry, with local drafts and browser-side OCR. Current testing prioritizes a laptop webcam; the responsive layout also supports mobile use. Deploy it to Vercel or run it locally.

## Included

- Live camera capture with browser-side PaddleOCR (PP-OCRv6 tiny) in a background worker
- Serial and printer-code format checks before a note enters the queue
- A focused used-note entry flow
- Saved location and reusable comments
- Local persistent queue with a bottom submission action and official EBT batch submission
- EBT sign-in using the official HTTPS API; password is never written to browser storage
- Previous EBT cities, postcodes, and comments suggested inside the existing fields on focus; type to filter or click a suggestion, without additional dropdown controls
- Submission receipts with individual errors, duplicate entry details, and editable queued notes
- Hit journeys with entry locations, dates, trackers, distances, elapsed days, and available EBT maps
- Personal join date and shared note/hit maps alongside refreshed account totals
- PWA metadata and a small offline app shell

## Privacy and EBT submission

Notes, saved locations, and comments remain in the browser's local storage until you submit them. Sign-in is proxied by server-side Next.js routes to the official EBT HTTPS API: the password is forwarded only for login and is never stored. The returned EBT session ID is held in a secure, HTTP-only cookie and is used for authenticated EBT requests, including suggestions, profile details, note journeys, and submissions. Sign-in uses a session-only cookie by default. The unchecked **Remember me for up to 6 months** option permits a persistent cookie lasting six calendar months. This does not extend the upstream EBT session: EBT may require sign-in sooner. Passwords are never saved to keep you signed in.

While signed in, the app also reads your previous locations/comments and your profile from EBT. These responses and the last submission receipt stay in page memory, with no server-side persistence. Sign-out clears the receipt. A rejected or unconfirmed submission stays in the local queue; successful notes are removed. Submission results show the hit count without note links; hit journeys and available maps load automatically. Profile and journey maps depend on availability and EBT sharing settings. The API does not supply a complete note-history or latest-hit feed.

**Use my location** requests browser location permission only when clicked, then sends rounded coordinates directly to [Photon](https://github.com/komoot/photon) to suggest a city, English country name, and postcode from OpenStreetMap. Coordinates are not sent through the app server or saved by the app. Check the suggested address, especially with approximate laptop positioning. Suggested postcodes have whitespace removed. Missing postcodes stay blank for manual entry, successful lookups silently fill the fields, and lookup failures retain the current fields. Photon’s public service permits reasonable project usage, has no availability guarantee, and may throttle heavy traffic; lookups happen only on explicit clicks, with at most one extra city lookup when an address lacks its city.

## Verification

Run `npm.cmd test` for unit/API/security regressions and `.\node_modules\.bin\tsc.cmd --noEmit` for TypeScript. After stopping development servers, run `npm.cmd run build`; this builds with webpack and generates the versioned offline service worker. Direct `next build` does not generate the offline worker.

Install the browser once with `.\node_modules\.bin\playwright.cmd install chromium`, then run `npm.cmd run test:browser`. The suite starts its own production server on port 3001 and development server on port 3002. All EBT responses are fixtures, and no real notes or credentials are submitted. Tests include the original EBT and location browser workflows.

Run `npm.cmd audit` to check known dependency vulnerabilities. See [REVIEW.md](REVIEW.md) for the review findings, fixes, regression coverage, security checks and remaining limits. GitHub Actions runs these checks for pushes and pull requests.

## Run locally

```bash
npm ci
npm run dev -- --port 3001
```

Use Node.js 22. Open http://localhost:3001. No environment variables or EBT account are needed for development or automated tests. If PowerShell blocks the `npm` script shim, use `npm.cmd` instead. Sign-in is optional and is only needed for account features and submitting notes.

## Deploy on Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project**, import `JnKamas/ebt-web`, and deploy.
3. Open the deployed URL in iPhone Safari. Tap **Share → Add to Home Screen**.

Vercel automatically recognizes the Next.js project; no environment variables are required.

### Production and development

Use one Vercel project, `ebt-web`, with separate Git branches:

| Version | Branch | Address |
| --- | --- | --- |
| Production | `main` | https://ebt.eurocoins.cc |
| Development / testing | `develop` | Vercel Preview branch URL (see the deployment dashboard) |
| Local development | `develop` or a feature branch | http://localhost:3001 |

Push changes to `develop` to create a Preview deployment. Test in a laptop browser and merge `develop` into `main` only after approval for a production release. Feature branches can have their own Preview deployments. Vercel Preview runs a production build, so it can be tested under hosted conditions; local development uses the Next.js development server.

Preview URLs retain the project's Vercel authentication protection. Drafts, settings, and queued notes are stored separately for each origin, so production data does not automatically appear in the preview. Both versions currently use the real EBT API: signing in and submitting notes from Preview performs real EBT actions. Use the fixture-based tests for simulated submissions.

## Navigation, camera preferences and batches

The bottom navigation contains **Entry**, **Queue**, **Profile**, and **Settings**. Use Profile for EBT sign-in, sign-out, statistics, and maps. Both printer-code and serial scans use a fixed **70% minimum OCR confidence**; old saved thresholds are ignored and confidence sliders are no longer shown.

In Settings, click **Scan for cameras** and grant camera permission. The app briefly opens the camera, lists all video inputs exposed by the browser while access is active, then releases it. Both dropdowns show the complete returned camera list, including front and rear cameras. Choose a camera independently for the printer code and serial number. **Scan preview** opens a 15-second focus test without OCR or changing note values. Preferences stay in this browser. If a saved camera is disconnected, scanning falls back to the default camera. Some browsers expose fewer cameras than the phone has physical lenses; the app reports when only one is available.

Enable **Use this printer code for multiple notes** beside the printer-code input in Entry for a batch with the same printer code. Both manual and automatic queue additions retain that code. With automatic queueing enabled, subsequent scans go directly to the next serial number. Changing denomination clears the retained printer code; rescan or edit it when starting a different batch.

Starting or switching a scan keeps one scanner panel open with a loading cover until the selected camera has a usable frame. The live preview then gets its full 15-second scan window. Startup failures time out separately, and Close camera remains available while access is pending.

Banknote scanning is enabled only after a denomination is selected. Each queued note shows its denomination, serial number, printer code, country, and city.

Banknote flags beside serial and printer codes describe the note rather than the location where it was found. First-series serial flags identify the commissioning central bank country; Europa serial flags identify the printing works country. Printer-code flags identify the printing country using the corresponding series. Unknown codes show no flag. The serial mappings follow the [ECB design tables](https://www.ecb.europa.eu/euro/banknotes/current/design/html/index.en.html); first-series printing works follow the [Bundesbank reference](https://www.bundesbank.de/dynamic/action/en/tasks/cash-management/frequently-asked-questions/frequently-asked-questions-euro-banknotes/642706/frequently-asked-questions-about-the-euro-banknotes?contentId=640556&firstLetter=W). Local SVG flags come from [flag-icons](https://github.com/lipis/flag-icons), with its MIT license in public/flags/LICENSE.txt.

## License and community

Original EBT Scanner code is licensed under [MIT](LICENSE). Bundled OCR models, runtime files, flags and npm dependencies retain their upstream licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). `private: true` in package.json prevents accidental npm publication and does not restrict making this GitHub repository public.

Read [CONTRIBUTING.md](CONTRIBUTING.md) to contribute, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for participation expectations, and [SECURITY.md](SECURITY.md) to report vulnerabilities privately. EBT Scanner is an independent client and is not the official EuroBillTracker application.

Tests and dependency audits do not establish production security. Before broad public use, verify private vulnerability reporting, production rate limiting and real-camera/device behavior described in [REVIEW.md](REVIEW.md).
