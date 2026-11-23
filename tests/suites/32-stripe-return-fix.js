'use strict';

/**
 * Stripe after-payment return: verify with the worker, don't require the
 * 2-hour checkout marker, match the session to the signed-in user, and
 * never grant a fake, unpaid, or mismatched session.
 */

const fs = require('fs');
const path = require('path');

const PAID_SID = 'cs_test_PAIDSESSION01';
const FAKE_SID = 'cs_test_FAKEFAKEFAKE';
const BIZ_SID = 'cs_test_BIZSESSION001';
const TOAST_FAIL = "We couldn't confirm your payment yet. Contact support@pixlynote.com.";

function paidPlus(username, extras) {
  return Object.assign({
    verified: true,
    plus_active: true,
    payment_status: 'paid',
    status: 'complete',
    mode: 'subscription',
    client_reference_id: username,
    customer_email: null,
    customer_id: null,
    plan: 'plus',
    price_ids: ['price_1UbNIvFSVMbdmupTwHKWqLKj']
  }, extras || {});
}

function paidBusiness(username, extras) {
  return Object.assign({
    verified: false,
    plus_active: false,
    payment_status: 'paid',
    status: 'complete',
    mode: 'subscription',
    client_reference_id: username,
    customer_email: null,
    customer_id: null,
    plan: 'business',
    price_ids: ['price_biz_placeholder'],
    error: 'not_a_plus_purchase'
  }, extras || {});
}

function unpaidBody() {
  return { verified: false, plus_active: false, payment_status: 'unpaid', status: 'open', error: 'not_found', client_reference_id: null };
}

async function mockVerify(page, bodies) {
  await page.unroute('**/verify-stripe-session*').catch(() => {});
  await page.route('**/verify-stripe-session*', async (route) => {
    const raw = route.request().url();
    let sid = '';
    try { sid = new URL(raw).searchParams.get('session_id') || ''; } catch (e) {}
    const body = (typeof bodies === 'function') ? bodies(sid) : (bodies[sid] || unpaidBody());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });
}

async function clearStoredPlus(page) {
  await page.evaluate(() => {
    if (state && state.currentUser) {
      state.currentUser.isPlus = false;
      state.currentUser.isVerified = false;
      state.currentUser.isBusinessPlus = false;
      state.currentUser.subscriptionStatus = 'inactive';
      delete state.currentUser.stripeSessionId;
      delete state.currentUser.stripeSubscriptionId;
      delete state.currentUser.stripeCustomerId;
      delete state.currentUser.stripeCurrentPeriodEnd;
    }
    try {
      const u = state && state.currentUser && state.currentUser.username;
      if (u && typeof getAccountStorageKey === 'function') {
        const key = getAccountStorageKey('pixlynote_user', u);
        const raw = localStorage.getItem(key);
        if (raw) {
          const rec = JSON.parse(raw);
          rec.isPlus = false;
          rec.isVerified = false;
          rec.isBusinessPlus = false;
          rec.subscriptionStatus = 'inactive';
          delete rec.stripeSessionId;
          delete rec.stripeSubscriptionId;
          delete rec.stripeCustomerId;
          delete rec.stripeCurrentPeriodEnd;
          localStorage.setItem(key, JSON.stringify(rec));
          try { sessionStorage.setItem(key, JSON.stringify(rec)); } catch (e2) {}
        }
      }
    } catch (e) {}
    if (typeof persistState === 'function') persistState();
  });
}

async function gotoReturn(page, qs) {
  const port = Number(new URL(page.url()).port);
  const url = 'http://127.0.0.1:' + port + '/index.html?' + qs + '&cb=' + Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);
  return url;
}

async function readState(page) {
  return page.evaluate(() => ({
    href: location.href,
    search: location.search,
    isLoggedIn: !!(window.state && state.isLoggedIn),
    username: (state.currentUser && state.currentUser.username) || '',
    isPlus: !!(state.currentUser && state.currentUser.isPlus),
    isVerified: !!(state.currentUser && state.currentUser.isVerified),
    isBusinessPlus: !!(state.currentUser && state.currentUser.isBusinessPlus),
    stripeSessionId: (state.currentUser && state.currentUser.stripeSessionId) || '',
    stripeBusinessSessionId: (state.currentUser && state.currentUser.stripeBusinessSessionId) || '',
    pending: (function () { try { return localStorage.getItem('pixly_pending_stripe_session'); } catch (e) { return 'err'; } })(),
    pendingKind: (function () { try { return localStorage.getItem('pixly_pending_stripe_kind'); } catch (e) { return 'err'; } })(),
    initiated: (function () { try { return localStorage.getItem('pixly_stripe_checkout_initiated'); } catch (e) { return 'err'; } })(),
    toast: (document.getElementById('toast-text') || {}).textContent || ''
  }));
}

module.exports = {
  name: 'Stripe return handling',
  tests: [
    {
      name: 'Stripe return: Unit: stripe session helpers require a paid session owned by the signed-in user; opening the subscription modal sets the checkout marker',
      accounts: ['personal'],
      covers: ['handler:stripeSessionGrantsPlus', 'handler:stripeSessionIdentityMatches', 'handler:markStripeCheckoutInitiated', 'handler:openSubscriptionModal'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const unit = await page.evaluate((me) => {
          const paid = {
            verified: true, plus_active: true, payment_status: 'paid', status: 'complete',
            client_reference_id: me, customer_email: null
          };
          const unpaid = { verified: false, plus_active: false, payment_status: 'unpaid', status: 'open', client_reference_id: me };
          const noId = { verified: true, plus_active: true, payment_status: 'paid', status: 'complete', client_reference_id: '', customer_email: '', customer_id: '' };
          const other = Object.assign({}, paid, { client_reference_id: 'someone_else' });
          const emailOnly = { verified: true, plus_active: true, payment_status: 'paid', status: 'complete', client_reference_id: '', customer_email: (state.currentUser && state.currentUser.email) || '' };
          try {
            localStorage.removeItem('pixly_stripe_checkout_initiated');
            sessionStorage.removeItem('pixly_stripe_checkout_initiated');
          } catch (e) {}
          const before = localStorage.getItem('pixly_stripe_checkout_initiated');
          if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
          const after = localStorage.getItem('pixly_stripe_checkout_initiated');
          if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
          return {
            grantPaid: stripeSessionGrantsPlus(paid, me),
            grantUnpaid: stripeSessionGrantsPlus(unpaid, me),
            grantNoId: stripeSessionGrantsPlus(noId, me),
            grantOther: stripeSessionGrantsPlus(other, me),
            grantNoUser: stripeSessionGrantsPlus(paid, ''),
            grantEmail: stripeSessionGrantsPlus(emailOnly, me),
            identOther: stripeSessionIdentityMatches(other, me),
            identSelf: stripeSessionIdentityMatches(paid, me),
            planHintBiz: resolveStripeCheckoutPlan({ verified: false }, 'business'),
            planWorkerPlus: resolveStripeCheckoutPlan({ plan: 'plus', verified: false }, 'business'),
            beforeMarker: before,
            afterMarker: after
          };
        }, account.username);
        a.equal(unit.grantPaid, true, 'Paid Plus session owned by the user grants Plus');
        a.equal(unit.grantUnpaid, false, 'Unpaid session does not grant Plus');
        a.equal(unit.grantNoId, false, 'Paid session with no identity does not grant Plus');
        a.equal(unit.grantOther, false, 'Session owned by a different user does not grant Plus');
        a.equal(unit.grantNoUser, false, 'Grant requires a signed-in username');
        a.equal(unit.grantEmail, true, 'Customer email can match the signed-in user when client_reference_id is missing');
        a.equal(unit.identOther, false, 'Identity helper rejects a mismatched client_reference_id');
        a.equal(unit.identSelf, true, 'Identity helper accepts the matching username');
        a.equal(unit.planHintBiz, 'business', 'Plan hint is business when the worker does not name a plan');
        a.equal(unit.planWorkerPlus, 'plus', 'Worker plan wins over a business hint');
        a.ok(!unit.beforeMarker, 'Marker is cleared before opening the modal');
        a.ok(!!unit.afterMarker && Number(unit.afterMarker) > 0, 'Opening the subscription modal sets the checkout marker: ' + unit.afterMarker);
      }
    },
    {
      name: 'Stripe return: E2E: a new tab with no checkout marker and a paid Plus session grants Plus',
      accounts: ['personal'],
      covers: ['handler:handleStripeRedirectOnLoad', 'handler:fetchStripeSessionStatus'],
      async run(ctx) {
        const { page, a, account } = ctx;
        await mockVerify(page, { [PAID_SID]: paidPlus(account.username) });
        await page.addInitScript(() => {
          try {
            if (new URLSearchParams(location.search).get('session_id')) {
              localStorage.removeItem('pixly_stripe_checkout_initiated');
              sessionStorage.removeItem('pixly_stripe_checkout_initiated');
              localStorage.removeItem('pixly_stripe_checkout_kind');
              sessionStorage.removeItem('pixly_stripe_checkout_kind');
            }
          } catch (e) {}
        });
        await gotoReturn(page, 'subscribed=true&session_id=' + PAID_SID);
        const st = await readState(page);
        a.equal(st.isLoggedIn, true, 'Still signed in after return');
        a.equal(st.isPlus, true, 'Plus is granted without a checkout marker: ' + JSON.stringify(st));
        a.equal(st.isVerified, true, 'Verified badge is enabled');
        a.equal(st.stripeSessionId, PAID_SID, 'Session id is stored on the account');
        a.ok(!st.search, 'Query is stripped only after the verify decision: ' + st.href);
        a.ok(/Pixlynote Plus activated/i.test(st.toast), 'Success toast shown: ' + st.toast);
        await page.unroute('**/verify-stripe-session*').catch(() => {});
      }
    },
    {
      name: 'Stripe return: E2E: a fake or unpaid session grants nothing and shows the confirmation toast',
      accounts: ['personal'],
      covers: ['handler:handleStripeRedirectOnLoad'],
      async run(ctx) {
        const { page, a, account } = ctx;
        await clearStoredPlus(page);
        await mockVerify(page, { [FAKE_SID]: unpaidBody() });
        await gotoReturn(page, 'subscribed=true&session_id=' + FAKE_SID);
        const st = await readState(page);
        a.equal(st.isPlus, false, 'Fake session does not grant Plus: ' + JSON.stringify(st));
        a.equal(st.isVerified, false, 'Fake session does not set verified');
        a.ok(!st.pending, 'Fake session is not stored as pending');
        a.ok(!st.search, 'Query is stripped after the failed verify');
        a.ok(st.toast.indexOf(TOAST_FAIL) !== -1, 'Failure toast is shown: ' + st.toast);
        const shotDir = '/workspace/pixlynote/stripe-return-fix/shots';
        fs.mkdirSync(shotDir, { recursive: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(shotDir, 'toast.png') });
        await page.unroute('**/verify-stripe-session*').catch(() => {});
      }
    },
    {
      name: 'Stripe return: E2E: a paid session for a different user grants nothing',
      accounts: ['personal'],
      covers: ['handler:stripeSessionIdentityMatches'],
      async run(ctx) {
        const { page, a, account } = ctx;
        await clearStoredPlus(page);
        await mockVerify(page, { [PAID_SID]: paidPlus('other_account') });
        await gotoReturn(page, 'subscribed=true&session_id=' + PAID_SID);
        const st = await readState(page);
        a.ok(st.username === account.username, 'Still signed in as the original user: ' + st.username);
        a.equal(st.isPlus, false, 'Mismatched session does not grant Plus: ' + JSON.stringify(st));
        a.ok(!st.pending, 'Mismatched session is not left pending for this user');
        a.ok(st.toast.indexOf(TOAST_FAIL) !== -1, 'Failure toast is shown for a mismatched user: ' + st.toast);
        await page.unroute('**/verify-stripe-session*').catch(() => {});
      }
    },
    {
      name: 'Stripe return: E2E: a paid Business Plus session grants Business Plus, not personal Plus',
      accounts: ['business'],
      covers: ['handler:applyBusinessPlusVerification'],
      async run(ctx) {
        const { page, a, account } = ctx;
        a.ok(account.accountType === 'business', 'This case runs as a business account');
        await clearStoredPlus(page);
        await mockVerify(page, { [BIZ_SID]: paidBusiness(account.username) });
        await gotoReturn(page, 'subscribed=business&session_id=' + BIZ_SID);
        const st = await readState(page);
        a.equal(st.isBusinessPlus, true, 'Business Plus is granted: ' + JSON.stringify(st));
        a.equal(st.isPlus, false, 'Personal Plus is not granted from a Business Plus session');
        a.equal(st.stripeBusinessSessionId, BIZ_SID, 'Business session id is stored');
        a.ok(/Business Plus activated/i.test(st.toast), 'Business Plus success toast: ' + st.toast);
        await page.unroute('**/verify-stripe-session*').catch(() => {});
      }
    },
    {
      name: 'Stripe return: E2E: a paid session received while signed out is applied after login as the matching user',
      accounts: ['signed-out'],
      covers: ['handler:applyPendingStripeSession'],
      async run(ctx) {
        const { page, h, a } = ctx;
        const account = h.ACCOUNTS.personal;
        await mockVerify(page, { [PAID_SID]: paidPlus(account.username) });
        await gotoReturn(page, 'subscribed=true&session_id=' + PAID_SID);
        const before = await readState(page);
        a.equal(before.isLoggedIn, false, 'Return is handled while signed out: ' + JSON.stringify(before));
        a.equal(before.isPlus, false, 'Plus is not granted before sign-in');
        a.equal(before.pending, PAID_SID, 'Session is stored as pending: ' + JSON.stringify(before));
        a.equal(before.pendingKind, 'plus', 'Pending kind is plus');
        a.ok(!before.search, 'Query is cleared after pending is saved');

        await h.loginAs(page, account);
        await page.waitForTimeout(1500);
        const after = await readState(page);
        a.equal(after.isLoggedIn, true, 'User is signed in');
        a.equal(after.username, account.username, 'Signed in as the session owner');
        a.equal(after.isPlus, true, 'Pending Plus is applied after login: ' + JSON.stringify(after));
        a.equal(after.stripeSessionId, PAID_SID, 'Session id is stored after login');
        await page.unroute('**/verify-stripe-session*').catch(() => {});
      }
    }
  ]
};
