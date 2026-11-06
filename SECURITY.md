# Security policy

Security fixes target the current `main` branch. Older commits and deployments may not receive backported fixes. Keep your deployment and dependencies current.

## Report a vulnerability privately

When enabled, use the repository's **Security → Report a vulnerability** feature:

https://github.com/JnKamas/ebt-web/security/advisories/new

Availability depends on the repository's GitHub settings. If private reporting is unavailable, open an issue titled **Request for private security contact** with no vulnerability details. Ask the maintainer to arrange a private reporting channel before sharing the report. Do not put exploit details, passwords, session cookies, private URLs, personal locations or banknote serials in public issues or pull requests.

Include the affected commit/version, browser and operating system, a description of the impact, and minimal reproduction steps using synthetic data. Redact logs, screenshots and request bodies. Prefer a local reproduction with the fixture API; do not test against other users' accounts or submit real banknotes to demonstrate a flaw.

If a credential was exposed, revoke or rotate it through its provider. Removing it from the latest commit does not remove Git history or copies already made by others.

## Security boundaries and limits

- Passwords are forwarded over HTTPS by server-side routes to the official EBT API. The application does not persist them. The EBT session is held in a Secure, HttpOnly, SameSite cookie.
- Browser local storage contains drafts and the note queue. It is accessible to scripts running on the same origin and to anyone with access to the browser profile; it is not encrypted secret storage.
- Authenticated API responses must remain `no-store` and outside service-worker caches. Preserve mutation origin/content-type checks, body-size limits and shared validation.
- Dependency audits and automated tests are useful checks, not guarantees that a deployment is free of vulnerabilities.

See [REVIEW.md](REVIEW.md) for tested behavior and remaining operational limits. Public deployment operators must verify their HTTPS, private reporting and rate-limit configuration; source-code tests do not verify those hosting settings. No response-time or support-service commitment is made by this volunteer project.
