# Phase 2 security — ship steps and rollback

Branch: `grokbot/phase2-security` (off main `e4f1a1d`).
Each step goes live only on Bradley's Go. Do not deploy, push, or run `migrate.js --apply` until then.

## What this ships

1. Owners cannot set `isPlus`, `isVerified`, `isBusinessPlus`, or `subscriptionStatus`. The Worker (`POST /sync-subscription`) or an admin (`@pixlynote`) writes those after Stripe is verified.
2. Notes, stories, highlights and the following list live at `users/{u}/content/profile`. Public accounts are readable by anyone signed in (and the existing signed-out +1 view path is unchanged). Private accounts: only the owner, a Privileged Access delegate, or an approved connection. A private user's activity on public posts stays visible.
3. Cross-user writes on someone else's user doc are limited to the app's real needs (append a notification, story comments/likes when allowed, Privileged Access grant accept, business associate fields). Following and someone else's `privilegedAccounts` list cannot be rewritten by others.
4. The full close-friends list is owner-only. A viewer reads only `closeFriends/{owner}/members/{me}`.

Admin tools stay. `@pixlynote` can still set Plus / verification and use the admin screens.

## Order (do not skip or swap)

Deploying rules before the Worker would leave legitimate Plus activations unable to write flags. Deploying rules before the content + close-friends migration would hide close-friends stories from members (no member edges yet) and would not fully hide private notes that still sit on the public user doc.

1. **Worker** — generate with `python3 tools/phase2/patch_worker.py /path/to/worker.db-lockdown.js /path/to/worker.phase2.js` and deploy that script to misty-frog. Confirm `GET /health` includes `sync_subscription: true`.
2. **Client** — ship this branch's `index.html` (GitHub Pages / whatever hosts the app today).
3. **Migration `--apply`** (still no `--strip`) — `node tools/phase2/migrate.js --sa <key> --apply`
   Copies content fields onto `users/{u}/content/profile` and writes close-friends member edges. Public leftover copies stay until a later strip so a rolled-back client can still read them.
4. **Rules** — `firebase deploy --only firestore:rules` from this branch (after a backup of the live rules file).
5. **Later, a separate Go** — `node tools/phase2/migrate.js --sa <key> --apply --strip` to drop leftover notes/stories/highlights/following from the public user doc. Until this runs, those leftover copies can still be read on the public doc.

## Rollback

- **Worker:** redeploy the previous misty-frog script (`worker.db-lockdown.js`). Plus flags already written stay; new activations would need the old client path (client writes) or a re-deploy of this Worker.
- **Client:** restore the previous `index.html` (main `e4f1a1d`). The new client is backward compatible with leftover public content copies.
- **Migration:** copies only; it does not delete source fields unless `--strip` was used. To undo a copy, leave the new docs in place (harmless) or delete `users/{u}/content/profile` and `closeFriends/{owner}/members/*` after confirming the public copies remain.
- **Rules:** redeploy the locked lockdown rules kept at `/workspace/pixlynote/db-lockdown-backups/live-firestore.rules` (or the copy taken just before this deploy). Do not roll all the way back to the old open rules.
- **`--strip`:** only if it was applied — restore content fields onto the public user doc from `users/{u}/content/profile` (or from the pre-strip backup).

## Leftovers (not in this phase)

- `verificationStatus` self-approval is unchanged.
- Replies stay on the public user doc.
- Story comments/likes stay on the public user doc (writes are tightened). Comment threads on a private account's public-doc leftover can still leak until a later move.
- The Worker still has a fallback that can read legacy public email/phone.
- Until `--strip`, leftover notes/stories/highlights/following on the public user doc can still be read.
