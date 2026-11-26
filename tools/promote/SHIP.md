# Showcase + Promote + Billing History: what needs deploying (NOT done by this branch)

Nothing here has been deployed. Every step below needs Bradley's explicit Go.

## 1. Firestore rules (`firestore.rules`)
- users/{u}: owners cannot add `isShowcase: true` / `accountType: 'showcase'` (create, update, placeholder sign-up); they may keep or drop it.
- posts/{id}: owners cannot create or change Promote fields (`isPromoted, promotedUntil, targetImpressions, promotedImpressionsCount,
  ctaLabel, ctaUrl, promotedAt, promotionTier, promotionAmount, promotionDurationHours, promoteSessionId, promotionEndedAt`).
- New `promotions/{id}`: public read, admin/Worker write (promoted notes).
- New `users/{u}/billing/{id}`: owner-only read (not Privileged Access delegates), admin/Worker write.
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
