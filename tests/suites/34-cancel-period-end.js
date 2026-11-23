'use strict';

/**
 * Cancel Membership schedules cancel_at_period_end. Plus stays until the
 * paid period ends. The live worker still DELETEs immediately, so the
 * client must not call that route; if period-end isn't supported, fall
 * back to the Stripe portal.
 */

const fs = require('fs');
const path = require('path');

const PERIOD_END = Math.floor(Date.parse('2026-12-23T17:00:00-05:00') / 1000); // Dec 23, 2026 ET
const SESSION_ID = 'cs_test_PERIODEND1234567890';
const SUB_ID = 'sub_test_periodend1';
const SHOT = '/workspace/pixlynote/cancel-period-end/shots/confirm-period-end.png';

function indexSource() {
  return fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
}

async function grantPlus(page, extras) {
  await page.evaluate((opts) => {
    const cur = state.currentUser;
    cur.isVerified = true;
    cur.isPlus = true;
    cur.isBusinessPlus = false;
    cur.subscriptionStatus = 'active';
    cur.stripeSessionId = opts.sessionId;
    cur.stripeSubscriptionId = opts.subscriptionId;
    cur.stripeCurrentPeriodEnd = opts.periodEnd || 0;
    cur.stripeCancelAtPeriodEnd = !!opts.scheduled;
  }, extras);
}

async function mockPeriodEndCancel(page, body, status) {
  await page.unroute('**/cancel-subscription-at-period-end*').catch(() => {});
  await page.route('**/cancel-subscription-at-period-end*', async (route) => {
    window; // keep
    await route.fulfill({
      status: status || 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
      headers: { 'Cache-Control': 'no-store' }
    });
  });
}

async function openSub(page) {
  await page.evaluate(() => { if (typeof openSubscriptionModal === 'function') openSubscriptionModal(); });
  await page.waitForTimeout(150);
}

function hidden(selEval) {
  return `(() => { const el = ${selEval}; if (!el) return true; return el.classList.contains('hidden') || getComputedStyle(el).display === 'none'; })()`;
}

module.exports = {
  name: 'Cancel at period end',
  tests: [
    {
      name: 'Cancel period end: Unit: downgrade rules, period-end formatter, and help copy',
      accounts: ['personal'],
      covers: ['handler:stripeSubscriptionShouldDowngrade', 'handler:formatStripePeriodEnd', 'handler:maybeDowngradeExpiredMembership'],
      async run(ctx) {
        const { page, a } = ctx;
        const src = indexSource();
        a.ok(/cancel-subscription-at-period-end/.test(src), 'Client posts the period-end cancel route, not a live DELETE');
        a.ok(/You'll keep/.test(src) && /not a refund/i.test(src), 'Confirm/help copy says access lasts and is not a refund');
        a.ok(/Plus ends on/.test(src) || /ends on/.test(src), 'Modal can show an ends-on date');
        a.ok(/Manage billing in Stripe/.test(src) && /billing\.stripe\.com\/p\/login\/test_/.test(src), 'Portal remains as a backup');

        const unit = await page.evaluate((end) => {
          const future = { subscription_status: 'active', cancel_at_period_end: true, current_period_end: end, subscription: { status: 'active', cancel_at_period_end: true, current_period_end: end } };
          const past = { subscription_status: 'active', cancel_at_period_end: true, current_period_end: 1000, subscription: { status: 'active', current_period_end: 1000 } };
          const canceled = { subscription_status: 'canceled', subscription: { status: 'canceled' } };
          const unpaid = { subscription_status: 'unpaid', subscription: { status: 'unpaid' } };
          const expired = { subscription_status: 'incomplete_expired', subscription: { status: 'incomplete_expired' } };
          const pastDue = { subscription_status: 'past_due', plus_active: true, current_period_end: end, subscription: { status: 'past_due', current_period_end: end } };
          const pastDueEnded = { subscription_status: 'past_due', current_period_end: 1000, subscription: { status: 'past_due', current_period_end: 1000 } };
          return {
            keepScheduled: stripeSubscriptionShouldDowngrade(future),
            dropPastEnd: stripeSubscriptionShouldDowngrade(past),
            dropCanceled: stripeSubscriptionShouldDowngrade(canceled),
            dropUnpaid: stripeSubscriptionShouldDowngrade(unpaid),
            dropExpired: stripeSubscriptionShouldDowngrade(expired),
            keepPastDue: stripeSubscriptionShouldDowngrade(pastDue),
            dropPastDueEnded: stripeSubscriptionShouldDowngrade(pastDueEnded),
            date: formatStripePeriodEnd(end),
            noData: stripeSubscriptionShouldDowngrade(null)
          };
        }, PERIOD_END);
        a.equal(unit.keepScheduled, false, 'Scheduled cancel before period end keeps Plus: ' + JSON.stringify(unit));
        a.equal(unit.dropPastEnd, true, 'Downgrades when current_period_end has passed');
        a.equal(unit.dropCanceled, true, 'Downgrades on canceled');
        a.equal(unit.dropUnpaid, true, 'Downgrades on unpaid');
        a.equal(unit.dropExpired, true, 'Downgrades on incomplete_expired');
        a.equal(unit.keepPastDue, false, 'past_due during the paid period keeps Plus (Stripe retry window)');
        a.equal(unit.dropPastDueEnded, true, 'past_due after current_period_end downgrades');
        a.ok(/December 23, 2026/.test(unit.date), 'Period end formats in ET: ' + unit.date);
        a.equal(unit.noData, false, 'Missing verify data never downgrades');

        await grantPlus(page, { sessionId: SESSION_ID, subscriptionId: SUB_ID, periodEnd: 1000, scheduled: true });
        const expired = await page.evaluate(() => {
          maybeDowngradeExpiredMembership(state.currentUser.username);
          return { plus: state.currentUser.isPlus, verified: state.currentUser.isVerified, status: state.currentUser.subscriptionStatus };
        });
        a.equal(expired.plus, false, 'Stored period end in the past removes Plus: ' + JSON.stringify(expired));
        a.equal(expired.status, 'canceled', 'Cancellation status is recorded');
      }
    },
    {
      name: 'Cancel period end: E2E: confirm dialog, period-end cancel keeps Plus, modal shows Plus ends on date',
      accounts: ['personal'],
      covers: ['el:#btn-stripe-cancel-membership', 'el:#modal-cancel-membership', 'el:#btn-confirm-cancel-membership', 'el:#btn-dismiss-cancel-membership', 'el:#btn-stripe-billing-portal', 'handler:openCancelMembershipConfirm', 'handler:confirmCancelMembership', 'handler:applyStripeCancelAtPeriodEnd'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await page.setViewportSize({ width: 390, height: 844 });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await grantPlus(page, { sessionId: SESSION_ID, subscriptionId: SUB_ID, periodEnd: PERIOD_END });
        const seen = { periodEnd: 0, deleted: 0, urls: [] };
        await page.route('**/cancel-subscription-at-period-end*', async (route) => {
          seen.periodEnd += 1;
          seen.urls.push(route.request().url());
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              canceled: false,
              cancel_at_period_end: true,
              status: 'active',
              current_period_end: PERIOD_END,
              subscription_id: SUB_ID
            })
          });
        });
        await page.route('**/cancel-subscription?*', async (route) => { seen.deleted += 1; await route.continue(); });
        await page.route('**/cancel-subscription', async (route) => {
          const u = route.request().url();
          if (/cancel-subscription-at-period-end/.test(u)) return route.fallback();
          seen.deleted += 1;
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, canceled: true, status: 'canceled' }) });
        });

        await openSub(page);
        const pre = await page.evaluate(() => {
          const vis = (id) => { const el = document.getElementById(id); if (!el) return false; return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'; };
          return {
            section: vis('sub-cancel-section'),
            cancelBtn: vis('btn-stripe-cancel-membership'),
            portal: vis('btn-stripe-billing-portal'),
            portalHref: (document.getElementById('btn-stripe-billing-portal') || {}).getAttribute('href') || '',
            endsHidden: !vis('sub-cancel-ends-on'),
            plus: !!(state.currentUser && state.currentUser.isPlus)
          };
        });
        a.ok(pre.section && pre.cancelBtn && pre.portal, 'Cancel button and portal backup are shown: ' + JSON.stringify(pre));
        a.ok(/billing\.stripe\.com\/p\/login\/test_/.test(pre.portalHref), 'Portal backup keeps the Stripe login href');
        a.equal(pre.plus, true, 'Still Plus before cancel');

        await page.click('#btn-stripe-cancel-membership');
        await page.waitForTimeout(200);
        const dialog = await page.evaluate(() => {
          const m = document.getElementById('modal-cancel-membership');
          const copy = (document.getElementById('cancel-membership-copy') || {}).textContent || '';
          const open = m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none';
          return { open, copy };
        });
        a.ok(dialog.open, 'Confirm dialog opens');
        a.ok(/December 23, 2026/.test(dialog.copy), 'Confirm copy includes the period end date: ' + dialog.copy);
        a.ok(/not refund/i.test(dialog.copy), 'Confirm copy says this is not a refund: ' + dialog.copy);

        try {
          fs.mkdirSync(path.dirname(SHOT), { recursive: true });
          await page.screenshot({ path: SHOT, fullPage: false });
        } catch (e) {}

        await page.click('#btn-dismiss-cancel-membership');
        await page.waitForTimeout(150);
        const dismissed = await page.evaluate(() => {
          const m = document.getElementById('modal-cancel-membership');
          return !m || m.classList.contains('hidden') || getComputedStyle(m).display === 'none';
        });
        a.ok(dismissed, 'Keep membership closes the confirm dialog');
        a.equal(seen.periodEnd, 0, 'Dismiss does not call the worker');

        await page.click('#btn-stripe-cancel-membership');
        await page.waitForTimeout(150);
        await page.click('#btn-confirm-cancel-membership');
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => {
          const vis = (id) => { const el = document.getElementById(id); if (!el) return false; return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'; };
          return {
            plus: !!(state.currentUser && state.currentUser.isPlus),
            verified: !!(state.currentUser && state.currentUser.isVerified),
            scheduled: !!(state.currentUser && state.currentUser.stripeCancelAtPeriodEnd),
            status: state.currentUser && state.currentUser.subscriptionStatus,
            endsOn: (document.getElementById('sub-cancel-ends-on') || {}).textContent || '',
            endsVis: vis('sub-cancel-ends-on'),
            cancelBtn: vis('btn-stripe-cancel-membership'),
            portal: vis('btn-stripe-billing-portal'),
            dialogOpen: vis('modal-cancel-membership')
          };
        });
        a.equal(seen.deleted, 0, 'Must not call the immediate-DELETE /cancel-subscription route: ' + JSON.stringify(seen));
        a.ok(seen.periodEnd >= 1, 'Posted /cancel-subscription-at-period-end');
        a.equal(after.plus, true, 'Plus stays active until the period ends: ' + JSON.stringify(after));
        a.equal(after.scheduled, true, 'Scheduled cancel is stored');
        a.ok(/Plus ends on December 23, 2026/.test(after.endsOn) && after.endsVis, 'Modal shows Plus ends on date: ' + after.endsOn);
        a.ok(!after.cancelBtn, 'Cancel button is hidden once already scheduled');
        a.ok(after.portal, 'Portal backup stays available');
        a.ok(!after.dialogOpen, 'Confirm dialog closed after success');
      }
    },
    {
      name: 'Cancel period end: E2E: no billing reference and unsupported worker fall back to the portal, never immediate DELETE',
      accounts: ['personal'],
      covers: ['el:#btn-stripe-billing-portal', 'handler:fallbackToStripeBillingPortal'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await page.setViewportSize({ width: 390, height: 844 });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        // No session / subscription id: honest copy, no pretend cancel button.
        await grantPlus(page, { sessionId: '', subscriptionId: '', periodEnd: PERIOD_END });
        await openSub(page);
        const noRef = await page.evaluate(() => {
          const vis = (id) => { const el = document.getElementById(id); if (!el) return false; return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'; };
          return {
            cancelBtn: vis('btn-stripe-cancel-membership'),
            portal: vis('btn-stripe-billing-portal'),
            copy: (document.getElementById('sub-cancel-copy') || {}).textContent || ''
          };
        });
        a.ok(!noRef.cancelBtn, 'Cancel Membership is hidden when there is no billing reference');
        a.ok(noRef.portal, 'Portal backup is shown');
        a.ok(/don't have a billing reference/i.test(noRef.copy) && /billing portal/i.test(noRef.copy), 'Honest copy when we cannot cancel in-app: ' + noRef.copy);

        // Worker lacks period-end route (default mock  / 404-shaped body): do not hit DELETE, Plus stays, portal opens.
        await grantPlus(page, { sessionId: SESSION_ID, subscriptionId: SUB_ID, periodEnd: PERIOD_END });
        const seen = { periodEnd: 0, deleted: 0 };
        await page.unroute('**/cancel-subscription-at-period-end*').catch(() => {});
        await page.route('**/cancel-subscription-at-period-end*', async (route) => {
          seen.periodEnd += 1;
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
        });
        await page.route('**/cancel-subscription', async (route) => {
          const u = route.request().url();
          if (/cancel-subscription-at-period-end/.test(u)) return route.fallback();
          seen.deleted += 1;
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, canceled: true, status: 'canceled' }) });
        });
        await page.evaluate(() => {
          window._pixlyOpened = '';
          window.open = (u) => { window._pixlyOpened = String(u || ''); return null; };
        });
        await openSub(page);
        await page.click('#btn-stripe-cancel-membership');
        await page.waitForTimeout(150);
        await page.click('#btn-confirm-cancel-membership');
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({
          plus: !!(state.currentUser && state.currentUser.isPlus),
          scheduled: !!(state.currentUser && state.currentUser.stripeCancelAtPeriodEnd),
          opened: window._pixlyOpened || '',
          status: state.currentUser && state.currentUser.subscriptionStatus
        }));
        a.ok(seen.periodEnd >= 1, 'Tried the period-end route');
        a.equal(seen.deleted, 0, 'Did not fall back to immediate DELETE on the live route: ' + JSON.stringify(seen));
        a.equal(after.plus, true, 'Plus was not revoked when the worker cannot period-end cancel: ' + JSON.stringify(after));
        a.equal(after.scheduled, false, 'Did not pretend the cancel was scheduled');
        a.ok(/billing\.stripe\.com\/p\/login\/test_/.test(after.opened), 'Fell back to the Stripe portal: ' + after.opened);
      }
    },
    {
      name: 'Cancel period end: E2E: portal visit bypasses the 6h recheck throttle on modal reopen',
      accounts: ['personal'],
      covers: ['handler:recheckStripeSubscription', 'handler:markStripePortalVisit', 'handler:openSubscriptionModal'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await page.setViewportSize({ width: 390, height: 844 });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await grantPlus(page, { sessionId: SESSION_ID, subscriptionId: SUB_ID, periodEnd: PERIOD_END });

        let verifies = 0;
        await page.unroute('**/verify-stripe-session*').catch(() => {});
        await page.route('**/verify-stripe-session*', async (route) => {
          verifies += 1;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              verified: true,
              plus_active: true,
              payment_status: 'paid',
              status: 'complete',
              subscription_status: 'active',
              cancel_at_period_end: true,
              current_period_end: PERIOD_END,
              subscription: { status: 'active', cancel_at_period_end: true, current_period_end: PERIOD_END }
            })
          });
        });

        const names = await page.evaluate((u) => {
          const key = 'pixly_stripe_recheck_plus_' + (typeof normalizeUsername === 'function' ? normalizeUsername(u) : String(u).toLowerCase());
          localStorage.setItem(key, String(Date.now()));
          return key;
        }, account.username);

        await openSub(page);
        await page.waitForTimeout(300);
        const afterThrottled = verifies;

        await page.evaluate(() => { if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal(); });
        await page.evaluate(() => { markStripePortalVisit(); });
        await openSub(page);
        await page.waitForTimeout(400);
        a.ok(verifies > afterThrottled, 'Portal visit + modal reopen bypasses the 6h throttle (verifies=' + verifies + ', after first open=' + afterThrottled + ', key=' + names + ')');
        const scheduled = await page.evaluate(() => !!(state.currentUser && state.currentUser.stripeCancelAtPeriodEnd));
        a.equal(scheduled, true, 'Recheck recorded cancel_at_period_end from the worker');
      }
    }
  ]
};
