# Changelog

Older entries describe those versions, including features since changed or removed.

## [Unreleased]

Next version: **1.3.0**.

- Added paired banknote photo cards showing both codes, location, comment and submission status, plus searchable local history that remains after submission.
- Saved only the recognized code-box crops; older preview images are cropped and replaced when opened.
- Saved, reviewed and deleted each banknote as one record with paired code crops; removed the separate photo history and preserved shared printer crops when deleting a banknote.
- Added atomic banknote saves, visible storage errors and a banknote-level retry.
- Preserved paired crops when submission retries an earlier failed banknote-record save.
- Sent complete valid scans directly to Queue for review and editing, removed Keep reviewing, and kept automatic next-note scanning as a separate preference.
- Prevented automatic next-note scanning from queuing the same serial repeatedly while the previous note remains in view.
- Fixed queue-card code wrapping caused by inherited 45-pixel widths, aligned the paired crops and simplified their typography.
- Restricted automated tests to pre-main-merge checks; ordinary develop pushes no longer run tests. Release publication verifies a successful pre-merge check for the exact commit.
- Removed Enlarge banknote crops and the separate Saved banknotes section; Queue now shows queued and submitted banknotes once in a single list with per-banknote actions.
- Removed Download banknote and replaced the separate queue editor with editable fields, Save and Cancel inside the selected banknote card.
- Added a country flag beside each banknote location, based on its location country.
- Clarified that Settings camera tests do not run recognition; actual scans start in Entry.

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
