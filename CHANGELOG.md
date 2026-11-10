# Changelog

Older entries describe those versions, including features since changed or removed.

## [Unreleased]

Next version: **1.3.2**.

- Prepared 1.3.2 development after the 1.3.1 release.

## [1.3.1] - 2026-11-10

- Prepared 1.3.1 development after the 1.3.0 release.
- Show the serial code and crop for the configured result duration before queuing and starting the next banknote; retain Redo scan and Continue now for both codes.
- Updated browser regression coverage and release documentation for 1.3.1.
- Aligned existing settings and scanner checks with the shared result duration and serial preview.

## [1.3.0] - 2026-11-10

- Added paired OCR code-box crops saved locally per banknote, with queued and submitted notes together in one list.
- Sent complete valid scans directly to Queue for review and inline editing; optional next-note scanning skips serials already queued.
- Added in-place Save and Cancel, location flags and single-line code values with aligned crops.
- Preserved banknote records after submission, atomic record saves, retry after storage failures and shared printer crops when deleting a note.
- Cropped older preview images when opened and kept photo images out of submission requests.
- Clarified that Settings camera tests do not run recognition.
- Restricted tests to pre-main-merge checks and required successful checks on the exact release commit before publishing.
- Updated regression coverage, including confirmed submission payloads and asynchronous record persistence, and release, testing and security notes for 1.3.0.

## [1.2.3] - 2026-11-10

- Prepared 1.2.3 development after the 1.2.2 release.
- Rejected malformed EBT insertion statuses without removing unconfirmed notes or clearing retry guards.
- Required confirmation before clearing a non-empty local queue.
- Updated release, testing and security notes for 1.2.3.

## [1.2.2] - 2026-11-08

- Prepared 1.2.2 development after the 1.2.1 release.
- Displayed the app version alongside About & privacy in its original header position.
- Simplified Settings and clarified that its preferences are local to the browser and device, separate from the EBT profile.
- Updated release, testing and security notes for 1.2.2.

## [1.2.1] - 2026-11-08

- Updated release, testing and security notes, including the README testing description.
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
