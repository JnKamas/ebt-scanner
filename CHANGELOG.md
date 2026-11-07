# Changelog

Older entries describe those versions, including features since changed or removed.

## [Unreleased]

Next version: **1.2.0**. Security improvements are being tested on develop.

- Added support@eurocoins.cc as the public contact and private security-reporting address.

- Trimmed the testing notes to the completed manual checks and automated-test summary.

- Removed the Testing notes link and the alternative-entry sentence from About & privacy.

- Checked the public docs against the code and hosting settings; clarified preview versus production, session-cookie behavior and the security contact route.

- Removed offline app caching; EBT Scanner requires an internet connection.
- Updated the testing notes to reflect completed hands-on banknote, laptop and iPhone Safari tests.
- About & privacy now links to the deployed version's source, so previews do not show outdated main-branch code.

- Renamed the GitHub repository to JnKamas/ebt-scanner and updated source links.
- Simplified repository link labels in About & privacy to GITHUB.

- Added a Vercel preview login limit of 10 requests per IP per 10 minutes.
- Restrict page scripts with fresh nonces and limit external connections.
- Keep SDK/OpenCV loading in an isolated local OCR worker, preserving a strict page policy.
- Reduced optional remember-me from six months to 30 days.
- Verify EBT session invalidation on logout; offer retry or explicit local-only sign-out when confirmation fails.

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
