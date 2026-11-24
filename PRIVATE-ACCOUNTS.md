# Public / Private accounts (branch grokbot/private-accounts)

## What it does
- **Switch:** Account Center > Your Account > Privacy and safety. The first row is **Private account**. It is one switch, so an account is either Public or Private, never both. It is off (Public) for every existing account.
- **Data:** `users/{u}.isPrivate` (boolean). A missing field means Public. Turning the switch on or off also stamps `authorPrivate` on that user's `posts/*` docs, and new posts carry the field.
- **Locked profile:** a viewer who is not the owner and not an approved connection sees the header (avatar, name, bio, counts) and a "This account is private" panel with a **Request to connect** button. Photos, notes, replies, highlights, stories and the Connections/Connected lists stay hidden. The same rule hides the content in Feed, Explore, Saved, Likes, the post and note modals, share deep links and the story bar.
- **Requests:** the request is stored at `users/{owner}/connectRequests/{requester}`, and the owner gets a `connect_request` notification. The Connect button reads Request, then Requested, and tapping again cancels. A request never creates a connection.
- **Approve:** from Privacy and safety > Connect requests, or with the Approve button on the notification. Approving adds the owner to the requester's `following` list, adds the edge `users/{owner}/followers/{requester}`, deletes the request, and sends a `connect_approved` notification. **Decline** only deletes the request.
- **Revoke:** use the existing Remove Connection. It marks the requester's entry inactive, and the profile locks again.
- **Private to Public:** everyone can view the account, Connect works directly again, and stale requests are cleaned up when the requester connects. **Public to Private:** existing connections keep access.
- **Profile History > Show > Profile status:** every switch change is listed newest first, for example Public → Private with the date and time. It uses the same owner-only `profileHistory/{u}` doc and keeps the last 20. A toggle that fails or is offline records nothing.

## Security reality (read before Go)
This is enforced **in the app only**. The live Firestore rules are `allow read, write: if true`, and every visitor uses an anonymous Firebase session. Anyone with the public Firebase config can therefore read any account's posts and `users/{u}` doc, including notes and stories, directly from Firestore. The rules in `firestore.rules.private-accounts` would enforce this on the server, but they depend on:
1. Per-user Firebase Auth (`grokbot/firebase-auth-2026-11-16`), plus a `username` custom claim on each user.
2. A backfill of `authorPrivate:false` on every existing post.
3. Client queries that match the rules (rules are not filters).
4. Moving notes, stories, highlights, the following list and contact fields out of the public `users/{u}` doc.

Each of these needs Bradley's Go, and so does deploying the rules.

**Update (branch `grokbot/db-lockdown`):** server-side enforcement is now built: per-user Auth, `firestore.rules` (supersedes `firestore.rules.private-accounts`), matching queries, private fields moved out of `users/{u}`, and a tested backfill. See `DB-LOCKDOWN.md` for the rollout. Notes, stories, highlights and `following` still live on the public users doc (phase 2).

## Not changed
DMs to a private account still work. Comments a private user left on public posts stay visible. @pixlynote has no bypass in the app UI (the locked rules give @pixlynote server access for admin tools; see DB-LOCKDOWN.md). Admin tools are untouched.
