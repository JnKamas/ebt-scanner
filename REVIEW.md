# Testing

Labrador10 has tested real banknotes, laptop camera focus and iPhone Safari.

Automated tests cover scanning, note entry, saved drafts, sign-in and submission
handling. They use made-up account data and simulated EBT responses. You can see the
results in [GitHub Actions](https://github.com/JnKamas/ebt-scanner/actions).

## Security changes in the 1.2.0 preview

Login attempts are limited to 10 per IP per 10 minutes in each Vercel region, on previews. The
limit was checked: the eleventh request received HTTP 429. Page scripts are
restricted, remember-me is limited to 30 days for new logins, and logout checks
that EBT rejects the old session. Production is still on 1.1.0; these changes
are awaiting release. The saved [firewall rule](security/login-rate-limit.json)
matches the active preview setting.

The app requires internet access. Drafts and queued notes stay in this browser.
Use one entry tab at a time so edits do not overwrite each other.

To run the checks yourself, use `npm test`, `npx tsc --noEmit`, `npm run build`,
`npm run test:browser` and `npm audit`. Stop development servers before building;
browser tests use ports 3001 and 3002. Install Chromium once with
`npx playwright install chromium`. In PowerShell, use `npm.cmd` if needed.

Report security problems through [Security](SECURITY.md).
