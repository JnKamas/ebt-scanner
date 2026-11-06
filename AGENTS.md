# EBT Web project instructions

## Current priority

- Tune and test the product in a **laptop browser first**. Do not optimise the workflow around iPhone until the laptop scanner is reliable and approved.
- The current local development address is normally `http://localhost:3001` because port 3000 may be occupied.
- Keep the scanner easy to test with an ordinary laptop webcam. Camera permission must be requested only after a user clicks a scan control.

## Required scanning workflow

1. The user scans the **printer code first**.
2. The app keeps reading the live camera feed for exactly 15 seconds while displaying a large, visible live preview so the user can focus the banknote.
3. Only accept a code after it passes Euro banknote validation: the printer code must match EBT's six-character short-code structure and a serial number must pass the relevant first-series or Europa-series checksum.
4. Once a valid code is found, stop the camera scan immediately, freeze the captured frame, draw bounding boxes around OCR text, and show the validated code.
5. If no valid code is found after 15 seconds, close the scan and give an actionable retry message.
6. Prompt the user to turn the note over and scan the **serial number**.
7. Repeat the continuous live scan and stop automatically when the serial number is found.
8. Keep individual rescan controls for both fields and retain manual entry as a fallback.
9. Printer-code and serial rows are ordinary editable fields. Only an explicit **Scan** button may request/open the camera; never attach camera opening to row, label, or input clicks.

## Product and privacy rules

- This is a Vercel-deployed Next.js PWA intended to reproduce the fast entry workflow of EBT.art.
- Note drafts, saved locations, comments, and the local queue stay in browser local storage.
- Do not request, store, or transmit EuroBillTracker credentials until an official, supported API/authentication flow has been verified.
- Treat OCR as assistance only: show captured values and preserve format checks before adding a note.
- Use the official browser-side PaddleOCR SDK with the PP-OCRv6 tiny detection/recognition models. Do not return to whole-frame Tesseract OCR; crop the on-screen guide area before each inference.
- The first use downloads the OCR model into the browser. The app must show that it is preparing recognition before the 15-second scan window begins.

## Development and verification

- Use `npm.cmd` in PowerShell if the normal `npm` script shim is blocked.
- Run the TypeScript check with `.\\node_modules\\.bin\\tsc.cmd --noEmit`.
- Run a production build with `.\\node_modules\\.bin\\next.cmd build` only after stopping the development server; running both together can leave stale development assets.
- Never register the offline service worker in local development. Next.js development CSS and JS assets must never be cached by the app service worker.
- Keep laptop layout readable while preserving a responsive mobile layout for later iPhone work.
- Commit and push completed changes to `JnKamas/ebt-web` unless the user asks to keep a change local.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
