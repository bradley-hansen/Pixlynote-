'use strict';

/**
 * Billing History (t1007u): Account Center > Your Account > History lists the user's own Stripe purchases
 * (Promote campaigns and subscriptions) with date, item, amount and status. Records are read-only in the app;
 * the Worker's Stripe webhook writes them. Fixtures only: no Firestore, no Stripe.
 */
const fs = require('fs');
const path = require('path');
const fx = require('../helpers/showcase-promote-fixtures');

async function start(ctx) {
  const { page, h, account } = ctx;
  const port = Number(new URL(page.url()).port);
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
  await h.hideToasts(page).catch(() => {});
}

module.exports = {
  name: 'Billing History',
  tests: [
    {
      name: 'History under Your Account lists purchases newest first with date, item, amount and status',
      accounts: ['personal', 'business'],
      covers: ['el:#btn-ac-tab-billing-history', 'el:#ac-view-billing-history', 'el:#billing-history-list', 'el:#billing-history-status', 'el:#btn-billing-history-refresh',
        'handler:loadBillingHistory', 'handler:normalizeBillingRecord'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await start(ctx);
        const recs = fx.billingFixture().slice().reverse(); // out of order on purpose
        await fx.openBillingHistory(page, h, recs);
        const r = await page.evaluate(() => {
          const view = document.getElementById('ac-view-billing-history');
          const rows = Array.from(document.querySelectorAll('#billing-history-list .billing-row')).map((el) => ({
            id: el.getAttribute('data-billing-id'), kind: el.getAttribute('data-kind'),
            item: el.querySelector('.billing-item').textContent, date: el.querySelector('.billing-date').textContent,
            amount: el.querySelector('.billing-amount').textContent, status: el.querySelector('.billing-status').textContent
          }));
          return { open: !!view && !view.classList.contains('hidden'), title: (document.getElementById('ac-header-title') || {}).textContent, rows,
            btnText: (document.getElementById('btn-ac-tab-billing-history') || {}).textContent || '' };
        });
        a.ok(/History/.test(r.btnText), 'Your Account has a History entry');
        a.ok(r.open && r.title === 'History', 'History opens in the Account Center');
        a.ok(r.rows.length === 5, 'All 5 purchases are listed');
        a.ok(r.rows[0].id === 'cs_test_promo_100' && r.rows[4].id === 'cs_test_sub_1', 'Newest first');
        a.ok(/Promote post \(7 days, at least 7,000 views\)/.test(r.rows[0].item) && r.rows[0].kind === 'promote', 'Promote campaign row shows the campaign');
        a.ok(r.rows[0].amount === '$100.00' && r.rows[1].amount === '$4.99', 'Amounts are formatted in dollars');
        a.ok(/^[A-Z][a-z]{2} \d{1,2}, \d{4}/.test(r.rows[0].date) && /Test mode/.test(r.rows[0].date), 'Date is shown and sandbox records say Test mode');
        a.ok(r.rows[0].status === 'Paid' && r.rows[2].status === 'Paid' && r.rows[3].status === 'Failed', 'Status is shown per purchase');
        const note = await page.evaluate(() => (document.querySelector('#billing-history-list .billing-row[data-billing-id="cs_test_promo_5"] .billing-note') || {}).textContent || '');
        a.ok(/Not started/.test(note), 'A paid promotion that could not start shows why (no refund)');
        const manual = await page.evaluate(async () => {
          window.__pixlyBillingFixture = async () => [{ id: 'in_test_m', data: { kind: 'subscription', item: 'Pixlynote subscription', amountCents: 499, status: 'refunded', createdAt: Date.now() } }];
          await loadBillingHistory(true);
          const st = document.querySelector('#billing-history-list .billing-status');
          return st && st.textContent;
        });
        a.ok(manual === 'Refunded', 'A refund Stripe reports (made by hand in Stripe) is shown, display only');
        await page.evaluate(async (recs) => { window.__pixlyBillingFixture = async () => recs; await loadBillingHistory(true); }, recs);
        a.ok(r.rows.some((x) => x.kind === 'subscription' && /subscription/i.test(x.item)), 'Subscriptions are listed');
        await page.evaluate(() => { window.__pixlyBillingCalls = 0; const f = window.__pixlyBillingFixture; window.__pixlyBillingFixture = async (u) => { window.__pixlyBillingCalls++; return f(u); }; });
        await page.click('#btn-billing-history-refresh');
        await page.waitForTimeout(150);
        a.ok(await page.evaluate(() => window.__pixlyBillingCalls === 1), 'Refresh reloads the list');
        await page.click('#btn-ac-back');
        a.ok(await page.evaluate(() => !document.getElementById('ac-view-your-account').classList.contains('hidden')), 'Back returns to Your Account');
      }
    },
    {
      name: 'History empty, error and read-only states; item text is escaped; the app never writes billing records',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, h, a } = ctx;
        await start(ctx);
        await fx.openBillingHistory(page, h, []);
        const empty = await page.evaluate(() => (document.getElementById('billing-history-status') || {}).textContent || '');
        a.ok(/No purchases yet/.test(empty), 'Empty state explains what will show');
        const err = await page.evaluate(async () => { window.__pixlyBillingFixture = async () => { throw new Error('denied'); }; await loadBillingHistory(true); return document.getElementById('billing-history-status').textContent; });
        a.ok(/Couldn't load/.test(err), 'A read error shows a retry message, not a blank page');
        const xss = await page.evaluate(async () => {
          window.__pixlyBillingFixture = async () => [{ id: 'cs_test_x1', data: { kind: 'promote', item: '<img src=x onerror="window.__pwn=1">', amountCents: 500, status: 'weird', createdAt: Date.now() } }];
          await loadBillingHistory(true);
          const row = document.querySelector('#billing-history-list .billing-row');
          return { img: !!document.querySelector('#billing-history-list img'), pwn: !!window.__pwn, status: row && row.querySelector('.billing-status').textContent };
        });
        a.ok(!xss.img && !xss.pwn, 'Item text is escaped');
        a.ok(xss.status === 'Pending', 'Unknown status shows as Pending');
        const ro = await page.evaluate(async () => {
          const prev = window.isPrivilegedReadOnly;
          window.isPrivilegedReadOnly = () => true;
          let called = false; window.__pixlyBillingFixture = async () => { called = true; return []; };
          try { await loadBillingHistory(true); } finally { window.isPrivilegedReadOnly = prev; }
          return { msg: document.getElementById('billing-history-status').textContent, called };
        });
        a.ok(/Only the account owner/.test(ro.msg) && !ro.called, 'Privileged Access (read-only) sessions cannot see billing history');
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
        a.ok(!/(setDoc|updateDoc|addDoc|deleteDoc)\([^;]*['"]billing['"]/.test(src), 'The app has no code path that writes billing records');
        a.ok(!/\/v1\/refunds|refund_pending|promoteRefund/.test(src), 'The app has no refund code');
        const patch = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'promote', 'patch_worker.py'), 'utf8');
        a.ok(!/"refunds"|\/v1\/refunds|promoteRefund/.test(patch), 'The Worker patch never issues refunds');
        const rules = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
        a.ok(/match \/billing\/\{recordId\} \{\s*allow read: if ownsUser\(username\) \|\| isAdmin\(\);\s*allow write: if isAdmin\(\);/.test(rules), 'Rules: owner-only read, Worker/admin-only write');
      }
    }
  ]
};
