# Database lockdown (branch `grokbot/db-lockdown`)

**Status:** built and tested locally only. Nothing has been deployed: no rules, no Worker, no backfill, no Firestore writes, no push to `main`. Every rollout step below needs Bradley's Go.

## What changes
- **Identity:** each account gets its own Firebase Auth user (`users/{u}.uid`). Passwords are checked by Firebase Auth, and the public `passwordHash` is removed at cleanup. The Auth login email is a placeholder, `username.<12 hex>@users.pixlynote.app`, so no real email goes into Auth. This also works when two accounts share an email.
- **Rules (`firestore.rules`):** you can only write your own data. A private account's posts can be read only by the owner, approved connections and @pixlynote. `uidIndex/{uid}` lets the rules know your username, and `users/{u}.delegateUids` keeps Privileged Access password-free. `firestore.rules.private-accounts` is superseded.
- **Private fields:** email, phone, DMs, login activity, sessions, Stripe ids, the verification email and the Account Center lists move to `users/{u}/private/account`. That doc is readable by the owner, Privileged Access delegates and admin. The app merges it back into your own doc, so the screens don't change.
- **"Already taken" checks and Worker email lookups:** these use `contactIndex/{sha256(normalized email or phone)}` = `{usernames}`. No email or phone is stored there.
- **Contact buttons:** `publicEmail`/`publicPhone` are written only when Show email or Show phone is on.
- **Explore paging:** if the rules deny the open query, it retries once with `where('authorPrivate','==',false)`. That query needs the composite index in `firestore.indexes.json`.
- **Posts loading:** the app tries the old whole-collection listener first. If the rules deny it, it switches to the allowed queries: public posts, your own posts, and each followed private account you're approved for.
- **Password:** a password change does a re-auth and then updates Firebase Auth. Privileged Access can't change the owner's password. For a reset, the Worker's `POST /auth/reset-password` sets the Auth password after the email code is verified. It needs a free Google service-account key, and without one it returns 503 and changes nothing.
- **Rename and delete:** rename moves the private doc, contact index and uid index, and posts can only move to a name you own. Delete removes the posts, private doc, Account Center and uid index before the users doc.
- **Removed:** the `users/{authUid}` mirror writes, which copied DMs into a public doc.

### Files
- `index.html`: the data guard (`definePixlyDataGuard`) plus the signup, login, switch, password, reset, rename, delete, Privileged Access, scoped posts, contact buttons and taken-check changes.
- `firestore.rules`, `firebase.json` (emulator config only).
- `tools/db-lockdown/`:
  - `backfill.js` is a dry run unless you pass `--apply`, and it never prints PII or hashes.
  - `patch_worker.py` builds `worker.db-lockdown.js` from the live Worker source, which is outside this repo.
  - `screenshot.js`.
- Tests:
  - `tests/rules/` (30) and `tests/backfill/` (2) run in the emulators.
  - `tests/worker/` (6) uses the emulators and skips if the Worker file is missing.
  - `tests/suites/50-db-lockdown.js` (10) covers the app.
  - `npm test` runs them all.

## Rollout (in order; each step needs Bradley's Go)
1. **Deploy the Worker update** (`worker.db-lockdown.js`). It is backward compatible: it reads the index first and falls back to the public fields, and reset returns 503 until step 2.
2. **Service-account key (free).**
   1. Firebase console > Project settings > Service accounts > Generate key.
   2. Bradley pastes it through masked input as the Worker secret `FIREBASE_SA_JSON`.
   3. Keep a mode-600 copy on the box for step 4. It is never printed.
3. **Ship the client** (merge to `main`). Under the open rules nothing changes for existing users, and new sign-ups get their own Auth user.
4. **Backfill** with `node tools/db-lockdown/backfill.js <step> --sa <key> --dir <backup dir>`.
   1. Run `backup`, then `plan`. The plan should list the 8 real accounts.
   2. **Canary:** import and migrate one test account only (e.g. grokbot_tester2), then log in to it on the site. This proves the SHA-256 import (`--rounds=1`, base64 raw digest) on real Auth; the emulator can't check imported hashes.
   3. Run `import-auth --apply`, then `migrate --apply`, then `verify`. `verify` must show 8/8 OK.
5. **Log in once with each real account**, including @pixlynote. Check posts, Plus, likes, saves, connections, contact info, DMs, admin tools and Privileged Access.
6. **Deploy `firestore.rules` and `firestore.indexes.json`** (one composite index for Explore's public-only paging: `authorPrivate` + `createdAt` desc, free). Deploy the index first and wait until it is built. To roll back, redeploy the open rules (one command, no data change).
7. **`cleanup --apply`.** It strips the public email, phone, DMs and password hash, only for accounts that passed `verify`. Add `--delete-junk` to archive and then delete the stray anonymous-uid users doc and the `__dms` docs.
8. **Later:** drop the Worker's legacy public-field fallback.

## Risks and how each fails safe
- **The Auth hash import doesn't match.** The canary fails before anyone else is touched. Undo the canary: delete its Auth user and its `uid`/`authEmail`. The legacy hash login still works, because hashes stay until step 7.
- **An account is missed by the backfill.** `verify` lists it, and the rules are not deployed until it shows 8/8. If the rules are live anyway, a legacy account can still read, but its writes are denied with the usual "couldn't save" toasts. Data is never blanked.
- **The rules deny something the app needs.** The posts feed falls back to the allowed queries, and other writes fail like they do offline. Rollback is to redeploy the open rules.
- **A stale or mismatched Auth session on a device.** At cold start the app logs out with "For your security, please log in again." It never writes as the wrong account.
- **Auth is down or offline.** Login and signup say they couldn't reach Pixlynote, and nothing is created. Signup writes no doc unless the Auth user was created.
- **Password reset before the key is added.** The Worker returns 503 and the app says reset is temporarily unavailable. The password is not changed.
- **Cost.** Adds a small number of extra reads: your private doc and contact-index lookups. Auth email/password is free, the Worker stays on the free plan, and the emulators run locally.

## Bradley's decisions (implemented)
1. **DMs to private accounts from non-connections: allowed.** DMs are only ever written to the sender's own private doc, plus a `notifications` entry on the recipient, which is a social field. Covered by a rules test.
2. **A private user's activity on public posts and notes stays visible.** This covers comments on public posts and likes and replies, which live on the user's public doc. Covered by a rules test.
3. **@pixlynote is a normal user for private accounts.** There is no admin bypass to read private posts or private connections lists. In `firestore.rules`, `adminSeesPrivate()` returns false, and the admin catch-all excludes `posts` and `users`. Every other admin tool keeps working: deleting posts and accounts by id, verification requests, uid index, Account Centers and support data. Covered by rules tests.
4. **When a private account goes public, its pending connect requests are auto-approved.** Each request is approved the same way the Approve button does it: the requester's Connected list, the followers edge, request deletion and a `connect_approved` notification. Then one summary toast appears. Any approval that fails stays pending and is retried the next time the requests list loads while the account is public. Covered by app tests in suites 45 and 50.

## Known gaps (phase 2)
- Owners can still set their own `isPlus`/`isVerified`. These should move to Worker-verified writes.
- Notes, stories, highlights and `following` stay on the public users doc. Private accounts hide them in the app only.
- Signed-in users can still rewrite other accounts' social fields (notifications, following, story comments), as well as comments on posts they can see.
- `closeFriends` is publicly readable.
- The contact index confirms email→username to someone who already knows the email. This is the same as today's "already taken" message.
