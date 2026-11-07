# Security

## Report a problem

Use GitHub's [private vulnerability report](https://github.com/JnKamas/ebt-scanner/security/advisories/new)
if available. Otherwise, open an issue titled **Request for private security contact**
without sharing the vulnerability itself.

Include the affected version, browser, impact and steps to reproduce using fake
data. Remove secrets and personal details from screenshots and logs. Do not test
against other people's accounts or submit real notes to demonstrate a bug.
If a credential leaked, revoke or change it; deleting a commit is not enough.

## What to know

- The app server forwards login credentials to EBT over HTTPS without saving them.
  A Secure, HttpOnly, SameSite=Lax cookie holds the session. New remember-me
  cookies in the upcoming security update are optional and limited to 30 days.
- Drafts and queued notes live in browser local storage. Anyone with access to
  that browser profile may be able to read them.
- Authenticated responses must not be cached. Keep the API's request checks and
  size limits when changing server code.

Fixes target the current `main` branch. This volunteer project cannot promise
response times. Tests are not an independent security audit; see
[Review notes](REVIEW.md) for limits and hosting checks.
