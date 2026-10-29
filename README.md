# EBT Web

A mobile-first, installable web app for fast EuroBillTracker note entry. It is designed for Safari on iPhone and deploys directly to Vercel.

## Included

- Live camera capture with browser-side PaddleOCR (PP-OCRv6 tiny) in a background worker
- Serial and printer-code format checks before a note enters the queue
- A focused used-note entry flow
- Saved location and reusable comments
- Local persistent queue, CSV copy/export, and official EBT batch submission
- EBT sign-in using the official HTTPS API; password is never written to browser storage
- Previous EBT cities, postcodes, and comments suggested inside the existing fields on focus; type to filter or click a suggestion, without additional dropdown controls
- Submission receipts with individual errors, duplicate entry details, and editable queued notes
- Hit journeys with entry locations, dates, trackers, distances, elapsed days, and available EBT maps
- Personal join date and shared note/hit maps alongside refreshed account totals
- PWA metadata and a small offline app shell

## Privacy and EBT submission

Notes, saved locations, and comments remain in the browser's local storage until you submit them. Sign-in is proxied by server-side Next.js routes to the official EBT HTTPS API: the password is forwarded only for login and is never stored. The returned EBT session ID is held in a secure, HTTP-only cookie and is used for authenticated EBT requests, including suggestions, profile details, note journeys, and submissions.

While signed in, the app also reads your previous locations/comments and your profile from EBT. These responses and the last submission receipt stay in page memory, with no server-side persistence. Sign-out clears the receipt. A rejected or unconfirmed submission stays in the local queue; successful notes are removed. Receipts include links to EBT note pages, and hits can load their journey on demand. Profile and journey maps depend on availability and EBT sharing settings. The API does not supply a complete note-history or latest-hit feed.

**Use my location** requests browser location permission only when clicked, then sends rounded coordinates directly to [Photon](https://github.com/komoot/photon) to suggest a city, English country name, and postcode from OpenStreetMap. Coordinates are not sent through the app server or saved by the app. Check the suggested address, especially with approximate laptop positioning. Missing postcodes stay blank for manual entry, and lookup failures retain the current fields. Photon’s public service permits reasonable project usage, has no availability guarantee, and may throttle heavy traffic; lookups happen only on explicit clicks, with at most one extra city lookup when an address lacks its city.

## Verification

Run `node --test tests/ebt-api.test.cjs` for API contract/error handling checks and `.\node_modules\.bin\tsc.cmd --noEmit` for TypeScript. Use `npm.cmd run build` for the production build (the existing OCR configuration requires webpack), after stopping the development server.

With the production server on port 3001 and Playwright installed, run `node tests/ebt-browser.cjs`. Alternatively set `EBT_PLAYWRIGHT_MODULE` to an existing Playwright module path. The browser checks use fixture responses for every EBT request and never submit real notes or credentials.

Run `node --test tests/location.test.cjs` and `node tests/location-browser.cjs` for location parsing and browser workflow checks. Browser location tests use a simulated position and fixture geocoding responses.

## Run locally

```bash
npm install
npm run dev
```

On this Windows machine, PowerShell blocks the `npm` script shim. Use `npm.cmd run dev` if that happens.

## Deploy on Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project**, import `JnKamas/ebt-web`, and deploy.
3. Open the deployed URL in iPhone Safari. Tap **Share → Add to Home Screen**.

Vercel automatically recognizes the Next.js project; no environment variables are required.

## Camera preferences and batches

In Settings, click **Scan for cameras** and grant camera permission. The app briefly opens the camera, lists all video inputs exposed by the browser while access is active, then releases it. Both dropdowns show the complete returned camera list, including front and rear cameras. Choose a camera independently for the printer code and serial number. **Scan preview** opens a 15-second focus test without OCR or changing note values. Preferences stay in this browser. If a saved camera is disconnected, scanning falls back to the default camera. Some browsers expose fewer cameras than the phone has physical lenses; the app reports when only one is available.

Enable **Use this printer code for multiple notes** beside the printer-code input in Entry for a batch with the same printer code. Both manual and automatic queue additions retain that code. With automatic queueing enabled, subsequent scans go directly to the next serial number. Changing denomination clears the retained printer code; rescan or edit it when starting a different batch.

Banknote scanning is enabled only after a denomination is selected. Each queued note shows its denomination, serial number, printer code, country, and city.
