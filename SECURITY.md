# Security

## Report a problem

Email [support@eurocoins.cc](mailto:support@eurocoins.cc) to report a security
problem privately. Do not post vulnerability details in public issues.

Include the affected version, browser, impact and steps to reproduce using fake
data. Remove secrets and personal details from screenshots and logs. Do not test
against other people's accounts or submit real notes to demonstrate a bug.
If a credential leaked, revoke or change it; deleting a commit is not enough.

## What to know

- The app server forwards login credentials to EBT over HTTPS without saving them.
  A Secure, HttpOnly, SameSite=Lax cookie holds the session. New remember-me
  cookies are optional and limited to 30 days. Older cookies keep their original
  expiry until sign-out and a new login.
- Drafts and queued notes live in browser local storage. Anyone with access to
  that browser profile may be able to read them.
- Authenticated responses are not cached. The app requires internet access.
- Pending 1.2.1 binds submissions to the displayed sign-in using HMAC-SHA256
  with a private server key. Fingerprints stay in tab memory; the key is never
  sent to the browser. Missing keys block sign-in and submission. Rotating the
  key requires open tabs to reload; it does not revoke EBT sessions.

Production fixes are released through `main`. This volunteer project cannot promise
response times. Tests are not an independent security audit; see
[Testing](REVIEW.md) for the checks performed.
