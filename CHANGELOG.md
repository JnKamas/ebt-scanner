# Changelog

Older entries describe those versions, including features since changed or removed.

## [Unreleased]

Next version: **1.3.7**.

- Require at least 90% OCR confidence for printer codes and serial numbers.
- Show a “Scanning timed out” dialog with retry advice when the 15-second scan window expires.
- Correct hit-journey map arrows to match EBT's note page and read journey entries from the API's `step` field.
- Remove profile maps and the map-sharing notice; keep hit-note journey maps.
- Show the matching bundled flag beside the editable country in the entry location.
- Show the player's EBT account country flag beside their username in both profile cards.

## [1.3.6] - 2026-11-17

- Recover printer-code OCR readings with O in digit positions as 0 and S as 5, retaining format validation and the 70% confidence requirement.

## [1.3.5] - 2026-11-17

- Reduce scan delays by avoiding unnecessary enlargement of camera crops, transferring pixels directly to OCR and checking new frames sooner. Confidence and checksum checks are unchanged.
- Remove internal version-preparation and routine release-documentation entries from the public changelog and GitHub Release notes; record the release-note and development-version rules in project instructions.

## [1.3.4] - 2026-11-15

- Expand fast unit coverage for both serial checksums, printer formats and OCR corrections, confidence and fragment boundaries, field limits and server-side submission validation.
- Apply city, postcode and comment suggestions on completed taps even when the browser omits a click; retain keyboard selection.
- Give each address lookup its own timeout and explain timeouts, connection failures and rate limiting without raw abort errors.
- Reuse recently loaded EBT suggestions within the current account's entry fields.

## [1.3.2] - 2026-11-10

- Match displayed printer and serial code sizes to their photographed OCR boxes in scan results and banknote cards.
- Move Submit queue and submission notices above the banknote list.
- Remove confirmed submitted notes and their unshared code crops from this browser, including submitted history from earlier versions; rejected and uncertain notes remain queued.
- Make banknote cards more compact while preserving matching crop and code sizes.
- Keep a single timestamp in each banknote heading and show location and comment side by side.
- Fit displayed codes closely to their scanned character size while preserving natural letter and digit proportions.
- Add an isolated visual demo on develop previews with fake notes, submissions, rejections and hit journeys; production has no demo controls or accessible demo page.

## [1.3.1] - 2026-11-10

- Show the serial code and crop for the configured result duration before queuing and starting the next banknote; retain Redo scan and Continue now for both codes.
- Aligned existing settings and scanner checks with the shared result duration and serial preview.

## [1.3.0] - 2026-11-10

- Added paired OCR code-box crops saved locally per banknote, with queued and submitted notes together in one list.
- Sent complete valid scans directly to Queue for review and inline editing; optional next-note scanning skips serials already queued.
- Added in-place Save and Cancel, location flags and single-line code values with aligned crops.
- Preserved banknote records after submission, atomic record saves, retry after storage failures and shared printer crops when deleting a note.
- Cropped older preview images when opened and kept photo images out of submission requests.
- Clarified that Settings camera tests do not run recognition.
- Restricted tests to pre-main-merge checks and required successful checks on the exact release commit before publishing.
- Updated regression coverage for confirmed submission payloads and asynchronous record persistence.

## [1.2.3] - 2026-11-10

- Rejected malformed EBT insertion statuses without removing unconfirmed notes or clearing retry guards.
- Required confirmation before clearing a non-empty local queue.

## [1.2.2] - 2026-11-08

- Displayed the app version alongside About & privacy in its original header position.
- Simplified Settings and clarified that its preferences are local to the browser and device, separate from the EBT profile.

## [1.2.1] - 2026-11-08

- Prevented stale tabs from overwriting saved queues, synchronized queue and pending submission changes, and blocked concurrent submissions between tabs.
- Bound note submissions to the sign-in shown in the tab, rejecting changed sessions before contacting EBT.
- Protected session fingerprints with a private HMAC-SHA256 key; account actions fail closed if the server key is missing or malformed.
- Fixed the browser test to wait for a queued-note edit to reach storage after acquiring the cross-tab lock.
- Updated GitHub workflow actions to native Node.js 24 releases pinned to exact commits, removing the deprecated action-runtime warning.

## [1.2.0] - 2026-11-07

- Limited login attempts to 10 per IP per 10 minutes in each Vercel region, on production and previews.
- Restricted page scripts and kept local PaddleOCR processing in an isolated worker.
- Reduced optional remember-me cookies to 30 days. Default sign-in still uses a session cookie.
- Added EBT session checks on logout, with retry and explicit local-only sign-out when EBT cannot confirm it.
- Added support@eurocoins.cc as the public contact and private security-reporting address.
- Renamed the repository to JnKamas/ebt-scanner and simplified the public documentation.
- Updated About & privacy, including links to the source for the version being viewed.
- Removed offline app caching. Internet access is required; saved drafts and queued notes are preserved.

## [1.1.0] - 2026-11-07

- Added a separate development preview so changes can be tested before release.
- Added About & privacy with author credit, password/session details and backend links.
- Made the source public for transparency and shortened the documentation.
- Fixed offline caching so visiting About cannot replace the saved scanner page.
- Added version checks, changelog tracking and automatic GitHub Releases after approved main merges.
- Set the production baseline to 1.0.0 and the upcoming development version to 1.1.0.

## [1.0.0] - 2026-11-06

The existing production app, recorded as the starting point for versioned releases.
Relabeled from v0.1.0 without changing the deployed code; the original package metadata remains in that historical commit.

- Printer-first scanning with local PaddleOCR, code validation and manual entry.
- Local drafts and queue, saved locations, camera preferences and offline entry.
- EBT sign-in, batch submission, receipts, profile statistics and hit journeys.
- Session-only sign-in by default, with optional remember-me for up to six months.

[Full commit history](https://github.com/JnKamas/ebt-scanner/commits/develop/) ·
[GitHub Releases](https://github.com/JnKamas/ebt-scanner/releases)
