# EBT Web

A mobile-first, installable web app for fast EuroBillTracker note entry. It is designed for Safari on iPhone and deploys directly to Vercel.

## Included

- Camera photo capture with browser-side PaddleOCR (PP-OCRv6 tiny) in a background worker
- Serial and printer-code format checks before a note enters the queue
- Used-note and consecutive-note entry modes
- Saved location and reusable comments
- Local persistent queue and CSV copy/export
- PWA metadata and a small offline app shell

## Privacy and EBT submission

Notes, saved locations, and comments remain in the browser's local storage. This first version deliberately does **not** request or store EuroBillTracker credentials, and does not submit data to EBT until its official API contract is verified.

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
