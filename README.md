# EBT Scanner

Scan euro banknotes, check their codes and prepare EuroBillTracker entries.
Created and maintained by **Labrador10**. This is an independent app.

The source is public so you can inspect how the app works and handles your data.
The repository is shared for transparency; outside contributions are not being
requested.

**[Open EBT Scanner](https://ebt.eurocoins.cc)**

Contact: [support@eurocoins.cc](mailto:support@eurocoins.cc)

## Using it

1. Add a location, choose a denomination and scan the printer code.
2. Turn the note over and scan the serial number.
3. Each captured code stays visible for the duration set in Settings. After the serial result, the banknote goes to Queue for review or editing.
   Manual entries use Add note to queue.
4. Sign in through Profile when you want to submit to EBT.

Each scan runs for up to 15 seconds and stops when it finds a valid code.
You can edit either field or enter everything manually. Settings lets you choose
cameras and test focus without recognition. For batches, use **Use this printer code for multiple notes**.

The app also shows submission results, account totals and available hit journeys
and maps. You can install it from your browser; on iPhone, use Safari's
**Share > Add to Home Screen**. Real banknotes, laptop focus and iPhone Safari
have been tested by the maintainer. The app requires an internet connection.

## Your data

Version **1.3.2** is the release on `main`; `develop` contains upcoming changes.
These details describe the code on this branch.

Camera images are processed on your device with PaddleOCR. Drafts, locations,
comments and the queue stay in this browser. Only the recognized code-box crops are saved as photos,
together with banknote cards containing location and comment until submission.
Successfully submitted banknotes and their crops are removed from this browser. Rejected or unconfirmed notes remain queued. Edit queued banknotes directly on their cards, or delete a banknote.
Scanning does not require sign-in.

Signing in sends your email and password through the app's server on Vercel to
EBT over HTTPS. The app does not save your password. An HttpOnly cookie holds
your EBT session; **Remember me** optionally keeps it for up to 30 days.
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

Open http://localhost:3001. Scanning and local drafts need no EBT account.
For sign-in and submission, set a private `EBT_SESSION_BINDING_SECRET` in
`.env.local` as described in [.env.example](.env.example). Vercel preview and
production each need a separate sensitive key shared across their server instances.
In PowerShell, use `npm.cmd` if `npm` is blocked.

## Development and deployment

Vercel project: `ebt-web` (the internal hosting name).

- `develop`: changes and preview testing.
- `main`: production at https://ebt.eurocoins.cc, released after approval.

Preview and production have separate browser storage. Both use the real EBT API,
so submitting from a preview still enters real notes.

Develop previews offer **Open visual demo** for fake notes, submissions and hit
journeys. The demo uses temporary, separate data and never contacts EBT.
The demo page and its controls are unavailable in production.

See [Testing](REVIEW.md) for completed checks, and
[Security](SECURITY.md) for private reports.

## Versions and changes

Read the [changelog](CHANGELOG.md) or [GitHub Releases](https://github.com/JnKamas/ebt-scanner/releases)
to see what changed. Every change is committed to GitHub and noted in the changelog.
Versions use `major.minor.patch`: breaking changes, features, then fixes.

Development tracks the next version. Before an approved production release, date
its changelog section and keep `package.json` and the lockfile in sync. Run App checks on the final release commit before merging to `main`, using
a pull request targeting main or a manual workflow run. Ordinary develop pushes
do not run tests. Fast-forward main to that checked commit; CI verifies the
pre-merge result before creating the version tag and GitHub Release.
Release notes identify the source version; Vercel deployment status is tracked separately.

## License

Original code is [MIT licensed](LICENSE). Dependencies, OCR models and flags
keep their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).
