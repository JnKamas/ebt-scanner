# EBT Web

A mobile-first, installable web app for fast EuroBillTracker note entry. It is designed for Safari on iPhone and deploys directly to Vercel.

## Included

- Live camera capture with browser-side PaddleOCR (PP-OCRv6 tiny) in a background worker
- Serial and printer-code format checks before a note enters the queue
- A focused used-note entry flow
- Saved location and reusable comments
- Local persistent queue, CSV copy/export, and official EBT batch submission
- EBT sign-in using the official HTTPS API; password is never written to browser storage
- PWA metadata and a small offline app shell

## Privacy and EBT submission

Notes, saved locations, and comments remain in the browser's local storage until you submit them. Sign-in is proxied by server-side Next.js routes to the official EBT HTTPS API: the password is forwarded only for login and is never stored. The returned EBT session ID is held in a secure, HTTP-only cookie and is used only to check the account and submit note batches.

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
