# Pixlynote data-export worker (local only)

This folder is a local copy of the Pixlynote API Worker plus the Download your data route. It has **not** been deployed.

## New routes

- `POST /data-export` — verify a Firebase ID token and/or a short-lived export grant, assemble that account's data, and email a ZIP **only** to the email on file. The body must not be used for identity (`username` / `email` / `to` are ignored). Optional `deviceDrafts` may be included as extra files for drafts that exist only on the device.
- `POST /data-export/code` — `{ email }` is a lookup key only. If that address is the email on file for one account, a confirmation code is emailed there. Unknown addresses return `{ ok: true, sent: false }` with no account leak.
- `POST /data-export/verify` — `{ email, code }` returns a one-time `grant` (no username).
- `GET /health` includes `data_export: true`.

Rate limit: one successful export per account per 24 hours. ZIP attachments stay under 7 MB; large inline images are omitted and the archive can shrink to compact JSON if needed. `EMAIL_MODE=test` never calls Resend.

## Deploy (needs Bradley's Go)

Do not deploy or push until he says Go. Deployment must include both `worker.js` and `data-export-lib.mjs`. Site `index.html` must ship in the same release so the button has a matching backend.
