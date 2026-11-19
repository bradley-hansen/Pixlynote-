# Pixlynote

Pixlynote is a self-contained, single-file social photo and notes app (`index.html`). It runs in a modern browser with no build step. Live site: [https://bradley-hansen.github.io/Pixlynote-/](https://bradley-hansen.github.io/Pixlynote-/).

The app stores session and draft state in `localStorage` and syncs accounts, posts, notes, stories, and notifications through Google Cloud Firestore. Email, SMS, Pixai, and Stripe session checks go through the Pixlynote Worker.

## Features

- **Feed, Explore, and Stories** — Photo posts, vibe notes, and 24-hour stories, with likes, saves, comments, replies, and share.
- **Close Friends** — Limit a post, note, or story to Close Friends. A star badge marks that audience on the feed, post detail, and story viewer. Other people only see that content if they are on the author's Close Friends list.
- **Profile** — Personal and business accounts, Edit Profile, Posts / Notes / Replies / Saved / Likes tabs, and a visitor view that matches the owner's public profile.
- **Direct messages** — New Chat lists Pixai (AI assistant), Pixlynote Support, and real connections. Search finds real accounts by username or name. Seed demo creators are not used as a real account's following list.
- **Notifications** — Likes, comments, story activity, Privileged Access invites, business association invites, and Government / Organization verification decisions.
- **Account Center** — Password, sessions, privacy lists, Close Friends, Privileged Access, business association, Verification & badges, and 30-day deactivation then deletion.
- **Subscriptions** — Pixlynote Plus (blue check) and Business Plus ($29.99, green check for business accounts), billed through Stripe. Recheck and cancel clear the matching badge. Plus members can apply for Government or Organization verification (Civic Slate Gray / Deep Navy, or Organization green #10B981). The official check is a badge on the Personal (Plus, $9.99) or Business (Business Plus, $29.99) plan. It hides if the matching plan lapses or you switch account types; the approval stays on file and the badge returns automatically when the matching plan is active again. Reapply is only needed after a rejection or revocation.
- **Business association** — A business can invite a personal account or another business. An account can be associated with only one business at a time; leave the current business before accepting a new invite. The inviting business's avatar appears next to the associated account's name.

## Tests

The standing regression suite lives in `tests/`. See [tests/README.md](tests/README.md) for how it works and how to add coverage.

From the repo root:

```bash
npm install
npm test
```

`npm test` runs `node tests/run.js`. It serves this `index.html` locally, stubs Firebase and Worker calls, and never writes to production Firestore. The coverage check fails if an interactive control in `index.html` has no test.

## Project structure

- `index.html` — The complete app (HTML, CSS, and JavaScript)
- `tests/` — Regression suite (`npm test`)
- `package.json` — Test scripts and local dev dependencies
