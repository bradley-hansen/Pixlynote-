'use strict';

/**
 * After a hard reload, an already-paid Plus member must still see Plus
 * (Active / Manage Membership). Recheck must not lapse a live paid
 * subscription, and localStorage must keep the grant across boot.
 */

const LIVE_PERIOD_END = 1798052839; // 2026-12-23 14:07:19 America/New_York
const SESSION_ID = 'cs_test_b0Lp34DNJF8DL10pYaUaT4Sns3NBfllEjhj9Qlh5Avc2BC4oxAyihjkKv5';

function liveVerifyPayload(username) {
  return {
    verified: true,
    plus_active: true,
    payment_status: 'paid',
    status: 'complete',
    mode: 'subscription',
    customer_email: 'bradley-g-hansen-4vhhbf@mail.grokbot.com',
    client_reference_id: username,
    livemode: false,
    subscription_status: 'active',
    subscription: {
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: LIVE_PERIOD_END,
      canceled_at: null,
      ended_at: null,
      id: 'sub_1Uf2aEFSVMbdmupTsyMYyK4V'
    },
    subscription_id: 'sub_1Uf2aEFSVMbdmupTsyMYyK4V',
    customer_id: 'cus_VgPO0BWQydac4H',
    cancel_at_period_end: false,
    current_period_end: LIVE_PERIOD_END,
    price_ids: ['price_1UbNIvFSVMbdmupTwHKWqLKj'],
    plan: 'plus'
  };
}

module.exports = {
  name: 'Plus recheck and persist',
  tests: [
    {
      name: 'Plus persist: Unit: live paid session is not downgraded; ms stamps normalize; persist keeps Plus',
      accounts: ['personal'],
      covers: [
        'handler:stripeSubscriptionShouldDowngrade',
        'handler:normalizeStripePeriodEndSeconds',
        'handler:persistState',
        'handler:applyRemoteSubscriptionFields',
        'handler:publicSafeUserFields'
      ],
      async run(ctx) {
        const { page, a, account } = ctx;

        const unit = await page.evaluate((opts) => {
          const payload = opts.payload;
          const msEnd = opts.periodEnd * 1000;
          return {
            live: stripeSubscriptionShouldDowngrade(payload),
            plusActiveNoEnd: stripeSubscriptionShouldDowngrade({ plus_active: true, subscription_status: 'active' }),
            missingEndActive: stripeSubscriptionShouldDowngrade({ subscription_status: 'active' }),
            msStamp: normalizeStripePeriodEndSeconds(msEnd),
            secStamp: normalizeStripePeriodEndSeconds(opts.periodEnd),
            msWouldNotDrop: stripeSubscriptionShouldDowngrade({
              subscription_status: 'active',
              current_period_end: msEnd,
              plus_active: true
            }),
            date: formatStripePeriodEnd(normalizeStripePeriodEndSeconds(msEnd))
          };
        }, { payload: liveVerifyPayload(account.username), periodEnd: LIVE_PERIOD_END });

        a.equal(unit.live, false, 'Live paid Plus verify payload must not downgrade: ' + JSON.stringify(unit));
        a.equal(unit.plusActiveNoEnd, false, 'plus_active true with no period end must not downgrade');
        a.equal(unit.missingEndActive, false, 'Active status with no period end must not downgrade');
        a.equal(unit.msStamp, LIVE_PERIOD_END, 'Millisecond period-end is normalized to seconds: ' + unit.msStamp);
        a.equal(unit.secStamp, LIVE_PERIOD_END, 'Second period-end stays in seconds');
        a.equal(unit.msWouldNotDrop, false, 'A millisecond period-end must not be treated as 1970');
        a.ok(/December 23, 2026/.test(unit.date), 'Normalized ms stamp still formats as Dec 23, 2026 ET: ' + unit.date);

        const stored = await page.evaluate((opts) => {
          const cur = state.currentUser;
          cur.isVerified = true;
          cur.isPlus = true;
          cur.subscriptionStatus = 'active';
          cur.stripeSessionId = opts.sessionId;
          cur.stripeSubscriptionId = 'sub_1Uf2aEFSVMbdmupTsyMYyK4V';
          cur.stripeCustomerId = 'cus_VgPO0BWQydac4H';
          cur.stripeCurrentPeriodEnd = opts.periodEnd;
          persistState();
          const key = getAccountStorageKey('pixlynote_user', normalizeUsername(cur.username));
          const parsed = JSON.parse(localStorage.getItem(key) || 'null') || {};
          const pub = publicSafeUserFields(cur);
          const merged = Object.assign({}, pub, {
            isPlus: cur.isPlus,
            isVerified: cur.isVerified,
            subscriptionStatus: cur.subscriptionStatus,
            stripeSessionId: cur.stripeSessionId,
            stripeSubscriptionId: cur.stripeSubscriptionId,
            stripeCustomerId: cur.stripeCustomerId,
            stripeCurrentPeriodEnd: cur.stripeCurrentPeriodEnd
          });
          const bootFromPublicOnly = (parsedFrom) => {
            const hasActivePlus = (parsedFrom.isVerified === true && parsedFrom.isPlus === true && parsedFrom.subscriptionStatus === 'active');
            return { hasActivePlus, isPlus: hasActivePlus, isVerified: hasActivePlus };
          };
          return {
            parsedPlus: parsed.isPlus,
            parsedVerified: parsed.isVerified,
            parsedStatus: parsed.subscriptionStatus,
            parsedSession: parsed.stripeSessionId,
            publicHasPlus: pub.isPlus === true,
            bootFromPersist: bootFromPublicOnly(parsed),
            bootFromPublicOnly: bootFromPublicOnly(pub),
            bootFromMerged: bootFromPublicOnly(merged)
          };
        }, { sessionId: SESSION_ID, periodEnd: LIVE_PERIOD_END });

        a.equal(stored.parsedPlus, true, 'persistState writes isPlus: ' + JSON.stringify(stored));
        a.equal(stored.parsedVerified, true, 'persistState writes isVerified');
        a.equal(stored.parsedStatus, 'active', 'persistState writes subscriptionStatus');
        a.equal(stored.parsedSession, SESSION_ID, 'persistState writes stripeSessionId');
        a.equal(stored.bootFromPersist.hasActivePlus, true, 'Boot from persisted record keeps Plus');
        a.equal(stored.publicHasPlus, false, 'publicSafeUserFields still omits Plus (public account card)');
        a.equal(stored.bootFromPublicOnly.hasActivePlus, false, 'Writing only publicSafeUserFields over pixlynote_user would drop Plus on boot');
        a.equal(stored.bootFromMerged.hasActivePlus, true, 'Merging subscription fields back onto the public record keeps Plus on boot');

        const hydrated = await page.evaluate((opts) => {
          state.currentUser.isPlus = false;
          state.currentUser.isVerified = false;
          state.currentUser.subscriptionStatus = 'inactive';
          applyRemoteSubscriptionFields({
            isVerified: true,
            isPlus: true,
            subscriptionStatus: 'active',
            stripeSessionId: opts.sessionId,
            stripeSubscriptionId: 'sub_1Uf2aEFSVMbdmupTsyMYyK4V',
            stripeCustomerId: 'cus_VgPO0BWQydac4H',
            stripeCurrentPeriodEnd: opts.periodEnd
          });
          const key = getAccountStorageKey('pixlynote_user', normalizeUsername(state.currentUser.username));
          const parsed = JSON.parse(localStorage.getItem(key) || 'null') || {};
          return {
            statePlus: state.currentUser.isPlus,
            stateVerified: state.currentUser.isVerified,
            stateStatus: state.currentUser.subscriptionStatus,
            storedPlus: parsed.isPlus,
            storedStatus: parsed.subscriptionStatus
          };
        }, { sessionId: SESSION_ID, periodEnd: LIVE_PERIOD_END });

        a.equal(hydrated.statePlus, true, 'Firestore hydration restores Plus in state: ' + JSON.stringify(hydrated));
        a.equal(hydrated.storedPlus, true, 'Hydration also persists Plus to localStorage');
        a.equal(hydrated.storedStatus, 'active', 'Hydration persists subscriptionStatus active');
      }
    },
    {
      name: 'Plus persist: E2E: after grant + persist, hard reload still shows Manage Membership',
      accounts: ['personal'],
      covers: ['handler:persistState', 'el:#btn-stripe-cancel-membership', 'el:#sub-cancel-section', 'el:#pixly-stripe-buy-btn', 'el:#sub-active-pill', 'handler:openSubscriptionModal', 'handler:updateSubscriptionModalUI'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        await page.evaluate((opts) => {
          const cur = state.currentUser;
          cur.isVerified = true;
          cur.isPlus = true;
          cur.subscriptionStatus = 'active';
          cur.stripeSessionId = opts.sessionId;
          cur.stripeSubscriptionId = 'sub_1Uf2aEFSVMbdmupTsyMYyK4V';
          cur.stripeCurrentPeriodEnd = opts.periodEnd;
          cur.stripeCancelAtPeriodEnd = false;
          persistState();
          if (typeof persistCurrentUserSubscription === 'function') persistCurrentUserSubscription();
        }, { sessionId: SESSION_ID, periodEnd: LIVE_PERIOD_END });

        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        const after = await page.evaluate(() => {
          if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
          const vis = (id) => {
            const el = document.getElementById(id);
            if (!el) return false;
            return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
          };
          return {
            isPlus: !!(state.currentUser && state.currentUser.isPlus),
            isVerified: !!(state.currentUser && state.currentUser.isVerified),
            status: state.currentUser && state.currentUser.subscriptionStatus,
            plusUser: typeof isPlusUser === 'function' ? isPlusUser() : false,
            manage: vis('sub-cancel-section') && vis('btn-stripe-cancel-membership'),
            subscribe: vis('pixly-stripe-buy-btn'),
            activePill: vis('sub-active-pill')
          };
        });

        a.equal(after.isPlus, true, 'Hard reload keeps isPlus: ' + JSON.stringify(after));
        a.equal(after.plusUser, true, 'isPlusUser() is true after reload');
        a.equal(after.manage, true, 'Manage Membership / billing controls stay visible');
        a.equal(after.subscribe, false, 'Stripe Subscribe buy-button stays hidden for an active Plus member');
        a.equal(after.activePill, true, 'Active ✓ pill is shown after reload');
      }
    }
  ]
};
