# Contributing to EBT Scanner

Bug reports, documentation improvements and focused pull requests are welcome. For security concerns, follow [SECURITY.md](SECURITY.md) instead of posting details in a public issue.

## Local setup

Use Node.js 22 and the committed npm lockfile:

```sh
npm ci
npm run dev -- --port 3001
```

Open http://localhost:3001. In PowerShell, use `npm.cmd` if the `npm` script shim is blocked. No environment variables or real EBT account are needed to develop or run automated tests.

## Product behavior to preserve

- Prioritize a reliable laptop webcam workflow. Keep the layout responsive for later real-device testing.
- Request camera permission only after an explicit Scan control is clicked; input and label clicks must remain ordinary editing actions.
- Scan the printer code, then the serial number. Prepare OCR first, use the on-screen guide crop, and enforce the 15-second scan deadline, 70% OCR confidence and format/checksum checks.
- Preserve manual entry and individual rescans. Show captured OCR results for review.
- Keep drafts, location, comments and queued notes in browser storage. Never save passwords or session IDs there or expose them in client responses.
- Use the supported EBT HTTPS API through the app's server routes. Do not add credential scraping or alternative login flows.
- Do not register the service worker in development or cache authenticated API/RSC responses.

See [AGENTS.md](AGENTS.md) for detailed project instructions and [REVIEW.md](REVIEW.md) for known limits and existing regression coverage.

## Validate a change

```sh
npm test
npx tsc --noEmit
```

For application behavior, scanner, storage, API or build changes, also run:

```sh
# Stop development servers before building.
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests start their own servers on ports 3001 and 3002. They use fixture API responses and a fake webcam; do not replace fixtures with real passwords or live note submissions. Documentation-only changes do not require repeating the complete browser suite.

Edit `scripts/service-worker.js` rather than generated `public/sw.js`. Use `npm run build` so the matching offline shell is generated. Keep dependency updates and `package-lock.json` together.

## Pull requests and assets

Explain the concrete problem, resulting behavior and validation performed. Add regression coverage for behavior changes; keep pull requests focused. Follow the existing TypeScript and React style and prefer existing shared helpers for validation, OCR matching, accounts, storage and batching.

For vendored models, runtimes or images, record the original source, version, SHA-256 and upstream license. Update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `public/ocr/PROVENANCE.json` when relevant. Keep upstream notices intact and identify any modifications. Never commit `.env` files, credentials, browser storage exports or personal banknote data.

Contributions to the original project code are provided under the [MIT license](LICENSE). Third-party assets retain their upstream licenses. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
