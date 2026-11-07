# Contributing

Bug reports, clearer docs and focused pull requests are welcome. Include what
you expected, what happened and how to reproduce it. Use fake note and account
data in examples. Report vulnerabilities through [Security](SECURITY.md).

## Getting started

Follow the [README setup](README.md#run-locally). Work on `develop` or a feature
branch and target `develop` in pull requests. Test the Vercel preview before
asking for a production release; `main` deploys the live site.

Keep changes small. Explain what changed and how you checked it. Preserve manual
entry, local drafts and the printer-first scan flow. Camera access must follow
an explicit Scan click. Detailed scanner rules are in [AGENTS.md](AGENTS.md).

## Checks

```sh
npm test
npx tsc --noEmit
# Stop development servers before building.
npm run build
npx playwright install chromium
npm run test:browser
npm audit
```

Use `npm.cmd` in PowerShell if needed. Browser tests use fake EBT responses and
a fake camera, with servers on ports 3001 and 3002. Never use real credentials
or submit real notes in tests. Documentation edits only need a link/diff check.

Edit `scripts/service-worker.js`, not generated `public/sw.js`. Build with
`npm run build` to generate the offline worker. Keep the lockfile with dependency
updates. Record sources, hashes and licenses for bundled assets in
[Third-party notices](THIRD_PARTY_NOTICES.md) and `public/ocr/PROVENANCE.json`.

Never commit secrets, browser exports or personal banknote data. Contributions
use the [MIT license](LICENSE); please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
