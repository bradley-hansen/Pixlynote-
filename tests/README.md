# Pixlynote regression suite

This suite is a standing part of every Pixlynote change. It exercises the user-facing app in `index.html` so a later update cannot silently drop a feature (for example, the @pixlynote-only User Base Metrics and Pending Deactivations cards in the owner menu).

## Rule

**Every change adds or updates tests for it, and the full suite must pass before shipping.**

- If you add or change a button, link, input, toggle, tab, menu item, modal, or navigation path, add or update a test in `tests/suites/` (or extend `tests/lib/interactions.js` if it is a standard control).
- If you add a new surface, teach `tests/lib/interactions.js` how to open it so the automatic coverage net can reach the new controls.
- Do not ship, merge, or fast-forward `main` while `npm test` is failing.
- The coverage test fails if `index.html` contains an interactive element that has no test.

## Run command

From the repo root:

```bash
npm install
npm test
```

`npm test` is `node tests/run.js`. It serves `index.html` locally, stubs Firebase and Worker calls, and stubs `permanentlyDeleteAccount`. It never writes to production Firestore.

List tests without running them:

```bash
npm run test:list
```

Run a subset by name:

```bash
node tests/run.js --grep="Owner menu"
```

Optional: `CHROME_PATH`, `REGRESSION_PORT`, `PLAYWRIGHT_CHROME`.

Chrome is taken from `CHROME_PATH` or `/usr/bin/google-chrome`. The suite uses free tooling only (Node's test runner script, Playwright Core, system Chrome).

## How to add a test

1. Create or edit a file in `tests/suites/`. Files are auto-loaded in name order.
2. Export `{ name, tests }`. Each test is `{ name, accounts, covers, run }`.
   - `accounts`: `'signed-out'`, `'personal'`, `'business'`, `'empty'`, `'pixlynote'`, or `'all'`.
   - `covers`: inventory keys (see below) that this test is responsible for.
   - `run(ctx)`: use `ctx.page` (Playwright), `ctx.h` (harness), `ctx.a` (assertions), `ctx.account`.
3. Run `npm test` and make sure the suite passes.

Example:

```js
module.exports = {
  name: 'Owner menu',
  tests: [
    {
      name: 'Owner menu: four items stay in order',
      accounts: ['personal', 'business', 'empty', 'pixlynote'],
      covers: ['el:#btn-profile-row-menu', 'el:#drawer-username'],
      async run({ page, h, a, account }) {
        await h.openOwnerMenu(page);
        a.ok(await h.isVisible(page, '#modal-profile-drawer'), 'menu opens');
      }
    }
  ]
};
```

## Layout

| Path | Role |
| --- | --- |
| `tests/run.js` | Runner (`npm test`) |
| `tests/helpers/harness.js` | Local server, Playwright, mocks, account fixtures, login helpers |
| `tests/lib/inventory.js` | Parses `index.html` for every interactive control |
| `tests/lib/interactions.js` | How to open a surface and exercise a control |
| `tests/lib/assert.js` | Tiny assertions |
| `tests/suites/` | Named behavioral tests — add new files here |
| `tests/vendor/tailwind-3.4.17.js` | Local Tailwind so layout tests do not hit the CDN |
| `tests/results/` | Last-run report (gitignored) |

## Coverage keys

`tests/lib/inventory.js` assigns a stable key to every control it finds:

- `el:#id` — element with an id
- `handler:fnName` — `onclick` / template handler
- `listener:#id:event` — `addEventListener` binding
- `form:#id:submit` — form
- `href:url` — outbound link
- `nav:path` — first-class navigation path

The runner also generates a named **Interaction: …** test for each key. Behavioral suites in `tests/suites/` still carry the product assertions (sign-up, login, Edit Profile, owner menu, tabs, likes/saves, and so on).

## Safety

- Production Firebase is blocked. Worker/email/SMS/Stripe session calls are mocked.
- `permanentlyDeleteAccount` is stubbed.
- A dedicated test fails if a Firestore write is attempted.
- Fixtures use synthetic accounts (`reg_personal`, `reg_business`, `reg_empty`, and a local `@pixlynote`). They do not change real user documents.

## Account fixtures

| Key | Username | What it represents |
| --- | --- | --- |
| `personal` | `reg_personal` | Personal account with content |
| `business` | `reg_business` | Business account with content |
| `empty` | `reg_empty` | New / empty account |
| `pixlynote` | `pixlynote` | Official account (admin cards) |
| `signed-out` | — | Auth, sign-up, and login |
