# Showcase + Promote + Billing History: what needs deploying (NOT done by this branch)

Nothing here has been deployed. Every step below needs Bradley's explicit Go.

## 1. Firestore rules (`firestore.rules`)
- users/{u}: owners cannot add `isShowcase: true` / `accountType: 'showcase'` (create, update, placeholder sign-up); they may keep or drop it.
- posts/{id}: owners cannot create or change Promote fields (`isPromoted, promotedUntil, targetImpressions, promotedImpressionsCount,
  ctaLabel, ctaUrl, promotedAt, promotionTier, promotionAmount, promotionDurationHours, promoteSessionId, promotionEndedAt`).
- New `promotions/{id}`: public read, admin/Worker write (promoted notes).
- New `users/{u}/billing/{id}`: owner-only read (not Privileged Access delegates), admin/Worker write.
- Showcase accounts never like or connect (t1022u): they cannot add themselves to `posts/{id}.likedBy`, change anyone's
  `storyLikes`, grow their own `likedPostIds / likedNoteIds / likedStoryIds`, create or update a `followers/{showcase}`
  edge (not even a private owner approving one), or send `connectRequests`. Removing an old like or edge still works.
  Comment likes live inside each post's `comments` array, which any signed-in user may rewrite (existing finding), so
  for comment likes the block is in the app only.
Deploy: `firebase deploy --only firestore:rules --project pixlynote`

## 2. Worker (misty-frog-0c99)
Build: `python3 tools/promote/patch_worker.py ../worker/worker.phase2.js ../worker/worker.promote.js`
Deploy `worker.promote.js` (same bindings as phase2, same Guard Durable Object; adds SQLite tables `promos`, `billing_map`).
New secret: `STRIPE_WEBHOOK_SECRET` (from the Stripe test-mode webhook endpoint). `STRIPE_SECRET_KEY` must be a test key
(`sk_test_`/`rk_test_`) unless `PROMOTE_ALLOW_LIVE=on` is set. Optional var `PROMOTE_SITE_BASE` (default https://pixlynote.com).
The Worker needs `FIREBASE_SA_JSON` (already used by phase2) to write promotion and billing records.

## 3. Stripe (test mode / sandbox)
Create a webhook endpoint: `https://misty-frog-0c99.brad-g-hansen.workers.dev/stripe/webhook` with events
`checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, invoice.payment_failed, charge.refunded`.
Subscription Payment Links must keep `client_reference_id=<username>` (already used by Plus) so purchases map to the account.

## 4. Showcase accounts
Create the 10 accounts and set `isShowcase: true` with an admin tool (not run, not seeded by this branch).
Showcase accounts stay in the database but are excluded from the @pixlynote User Base Metrics totals
(Total / Personal / Business / Plus); a separate gray "Showcase" tile shows how many exist. A signed-in
Showcase account never adds post views, note views, or promoted impressions. Client-only change (index.html).

## Promote tiers and refunds (t1022u)
- Tiers: $5 = 24 hours / at least 250 views; $25 = 3 days / 1,500; $100 = 7 days / 7,000; $500 = 30 days / 50,000.
  In between: linear, whole hours under 2 days and whole days from 2 days up, views in steps of 50 (same code in the
  Worker and the app; tests compare them). Placement: Explore from $25, CTA button from $100. Admin tier/exempt
  settings: see "Admin Promote Settings" below.
- NOTHING is refunded. No code calls the Stripe refunds API. The only make-good is the free extension (a promotion
  keeps running at no extra cost until its guaranteed views are reached).
  - Item deleted / made private before payment completed: the purchase is recorded in History as Paid with a
    "Not started: ..." note; nothing is promoted and nothing is refunded.
  - Two paid checkouts for the same item: the second is added on top (time and guaranteed views stack).
  - `charge.refunded` is only recorded (display) if a refund is made by hand in the Stripe Dashboard.

## Admin Promote Settings (t1044u, branch grokbot/admin-promote-settings) - NOT deployed
@pixlynote owner menu > Promote Settings: Purchases (read-only), Tiers, Free list.
- Firestore data (written by @pixlynote in the app, nothing is seeded):
  - `promoteSettings/tiers` = `{tiers: [{price, hours, views} x4], updatedAt, updatedBy}`. Public read. Missing or invalid =
    the defaults ($5/24h/250, $25/72h/1,500, $100/168h/7,000, $500/720h/50,000). No doc needs creating to ship.
  - `promoteSettings/exempt` = `{usernames: [...], updatedAt, updatedBy}`. Admin-only. Missing = nobody is exempt.
- Rules: `promoteSettings/tiers` (public read, validated admin write), `promoteSettings/exempt` (admin only),
  `/{path=**}/billing/{id}` admin read (collection-group list of purchases); `promoteSettings` removed from the admin
  catch-all. Deploy: `firebase deploy --only firestore:rules --project pixlynote`.
- Worker: rebuild with `python3 tools/promote/patch_worker.py ../worker/worker.phase2.js ../worker/worker.promote.js`
  (includes the d5d5e67 webhook-secret guard). Same bindings and secrets as now; no new secret.
  - Checkout price/duration/views come from `promoteSettings/tiers` (read with the service account); a Firestore error = 502, no checkout.
  - The plan sold is stored per Stripe session, so a tier change while someone is paying never changes what they bought.
  - Exempt accounts: no Stripe; the promotion starts at once (`promotionAmount: 0`, `promoteSessionId: free_<hex>`) and History gets a $0 "Free" record.
- Order: worker first (the old app keeps working: `expect` is optional), then rules, then the site (main).
  The new app on the old worker also works (exempt accounts would just go to Stripe).
