# Testing

Labrador10 has tested real banknotes, laptop camera focus and iPhone Safari.

Automated tests cover scanning, note entry, saved drafts, sign-in and submission
handling. They use made-up account data and simulated EBT responses. You can see the
results in [GitHub Actions](https://github.com/JnKamas/ebt-scanner/actions).

Release **1.3.0** also covers cross-tab queue edits and sign-in changes,
delayed saves, concurrent submissions and server session-key validation.
Header version and privacy links are checked on every tab at 320px width.

Malformed insertion statuses retain notes and retry guards across reloads.
Queue-clear cancellation and confirmation are covered. Version 1.2.3 passed
57 unit tests, 48 browser tests, the TypeScript check and a production build.

Version 1.3.0 adds checks for paired code-box crops, the unified banknote list,
inline editing and cancellation, location flags, direct-to-queue scanning,
shared printer crops and recovery after local record-save failures.
