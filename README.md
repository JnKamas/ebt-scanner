# EBT Scanner

Scan euro banknotes, check their codes and prepare EuroBillTracker entries.
Created and maintained by **Labrador10**. This is an independent app.

The source is public so you can inspect how the app works and handles your data.
The repository is shared for transparency; outside contributions are not being
requested.

**[Open EBT Scanner](https://ebt.eurocoins.cc)**

## Using it

1. Choose a denomination and scan the printer code.
2. Turn the note over and scan the serial number.
3. Check the details, add a location and put the note in your queue.
4. Sign in through Profile when you want to submit to EBT.

Each scan runs for up to 15 seconds and stops when it finds a valid code.
You can edit either field or enter everything manually. Settings lets you choose
cameras and try a preview. For batches, use **Use this printer code for multiple notes**.

The app also shows submission results, account totals and available hit journeys
and maps. You can install it from your browser; on iPhone, use Safari's
**Share > Add to Home Screen**. Current camera testing focuses on laptops.

## Your data

Camera images are processed on your device with PaddleOCR. Drafts, locations,
comments and the queue stay in this browser. Scanning does not require sign-in.

Signing in sends your email and password through the app's server on Vercel to
EBT over HTTPS. The app does not save your password. An HttpOnly cookie holds
your EBT session; **Remember me** optionally keeps it for up to six months.
Submitting sends the selected notes to EBT. **Use my location** sends rounded
coordinates to Photon for an address lookup.

The app's **About & privacy** page explains this in detail and links to the
backend source. No independent security audit has been published.

## Run locally

Use Node.js 22:

```sh
npm ci
npm run dev -- --port 3001
```

Open http://localhost:3001. No environment variables or EBT account are needed.
In PowerShell, use `npm.cmd` if `npm` is blocked.

## Development and deployment

Vercel project: `ebt-web`.

- `develop`: changes and preview testing.
- `main`: production at https://ebt.eurocoins.cc, released after approval.

Preview and production have separate browser storage. Both use the real EBT API,
so submitting from a preview still enters real notes.

See [Review notes](REVIEW.md) for verification steps and known limits, and
[Security](SECURITY.md) for private reports.

## License

Original code is [MIT licensed](LICENSE). Dependencies, OCR models and flags
keep their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).
