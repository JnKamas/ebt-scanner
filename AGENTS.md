# Project instructions

## Workflow

- Prioritize an ordinary laptop webcam and keep iPhone Safari working. The
  maintainer has tested both, including real banknotes and laptop focus.
  Local development normally uses http://localhost:3001.
- Work on `develop` or a feature branch targeting it. Commit and push completed
  work to `JnKamas/ebt-scanner` unless asked to keep it local. Merge into `main` only
  after the user approves a production release at https://ebt.eurocoins.cc.
- This is an independent Next.js PWA inspired by EBT.art's fast entry workflow.
- Public source is for transparency. Do not add contribution guides, recruitment
  language or pull-request/feature-request templates unless the user asks.
- Keep public docs short and factual. Preserve confirmed testing; do not add
  generic launch checklists or describe completed tests as pending.
- Track every change in GitHub commits and a short `CHANGELOG.md` entry, including
  docs and maintenance. Keep package and lockfile versions equal. Use patch bumps
  for fixes, minor bumps for features and major bumps for breaking changes.
- Before an approved main merge, move pending changelog entries to a dated section
  matching the package version and leave an Unreleased heading for future work.
  Update release-status wording in README, REVIEW and SECURITY at the same time.
  CI publishes the matching GitHub Release after checks pass. Never reuse or move
  a released version tag. Bump to the next version on develop after each release.

## Scanner

- Scan the printer code first, prompt the user to turn the note over, then scan
  the serial. Keep manual entry and separate rescan buttons for both fields.
- Only an explicit Scan control opens the camera. Rows, labels and inputs are
  ordinary editable fields and must never request camera access.
- Show a large live preview. Prepare OCR before starting the full 15-second scan
  window. Stop immediately on a valid code; otherwise close after 15 seconds
  with an actionable retry message.
- Validate the six-character EBT printer format and the relevant first-series
  or Europa serial checksum. Require at least 70% OCR confidence.
- Freeze successful captures, draw OCR text boxes and show the validated value.
  OCR is assistance: preserve validation and let the user review captured values.
- Use the official browser PaddleOCR SDK with PP-OCRv6 tiny models. Crop the
  on-screen guide area before inference; do not use whole-frame Tesseract.
  Show recognition preparation while first-use models download.

## Data and development

- Drafts, locations, comments and the queue stay in browser local storage.
  Use the verified official EBT HTTPS API for account actions; never persist
  passwords or put credentials in local storage. Verify support before adding
  another authentication flow.
- Use `npm.cmd` in PowerShell if the npm shim is blocked.
- Type-check with `.\node_modules\.bin\tsc.cmd --noEmit`.
- Stop development servers before a production build to avoid stale assets.
  Build with `npm.cmd run build`.
- The app requires internet access and does not support offline mode. Do not
  register a service worker or add offline page caching. `public/sw.js` only
  retires old installations; it must not handle fetches or cache assets.
- Run `npm.cmd test` and the TypeScript check for code changes; also build and
  run `npm.cmd run test:browser` for app behavior, API, storage or build changes.
  Browser tests use fake EBT responses and a fake camera on ports 3001 and 3002.
  Documentation-only changes need a link/diff check.
- Keep dependency updates with the lockfile. Record bundled asset sources,
  hashes and licenses
  in `THIRD_PARTY_NOTICES.md` and `public/ocr/PROVENANCE.json`.
- Never commit secrets, browser exports or personal banknote data.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
