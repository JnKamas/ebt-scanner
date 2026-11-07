# Project instructions

## Workflow

- Test with an ordinary laptop webcam first; keep the layout responsive for later
  iPhone work. Local development normally uses http://localhost:3001.
- Work on `develop` or a feature branch targeting it. Commit and push completed
  work to `JnKamas/ebt-web` unless asked to keep it local. Merge into `main` only
  after the user approves a production release at https://ebt.eurocoins.cc.
- This is an independent Next.js PWA inspired by EBT.art's fast entry workflow.

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
  Use `npm.cmd run build` to include offline-worker generation; direct
  `.\node_modules\.bin\next.cmd build` does not generate it.
- Never register the service worker in local development or cache development
  CSS/JS. Keep authenticated API and RSC responses out of offline caches.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and asset provenance rules.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
