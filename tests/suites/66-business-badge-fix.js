'use strict';

/**
 * Business badge fix (Nov 27): Business Plus activation toast and save honesty, the $0 "Business Plus (free)" History row,
 * and the admin Business Verification pending count that shows before the admin token is typed.
 * Every case has a success AND a failure side. Local stubs only: no Firestore, no Stripe, no production Worker.
 */
const fx = require('../helpers/showcase-promote-fixtures');

const SID = 'cs_test_badgefix1234567890abcdef';

async function start(ctx) {
  const { page, h, account } = ctx;
  const port = Number(new URL(page.url()).port);
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
  await h.hideToasts(page).catch(() => {});
}

// Replace window.fetch inside the page: record every call and answer the Worker routes this suite cares about.
const INSTALL_FETCH = `
  window.__bf = { calls: [], sync: 'ok', count: 'ok', countValue: 1, list: [], listStatus: 200 };
  const orig = window.fetch.bind(window);
  const J = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async function (url, opts) {
    const u = String(url || '');
    if (u.includes('/sync-subscription')) {
      window.__bf.calls.push({ route: 'sync', body: JSON.parse((opts && opts.body) || '{}') });
      const m = window.__bf.sync;
      if (m === 'network') throw new TypeError('network down');
      if (m === 'write_failed') return J({ ok: false, error: 'write_failed' }, 502);
      if (m === 'not_membership') return J({ ok: false, error: 'not_a_membership_purchase' }, 422);
      if (m === 'flag_false') return J({ ok: true, applied: true, fields: { isBusinessPlus: false } }, 200);
      if (m === 'no_fields') return J({ ok: true }, 200);
      return J({ ok: true, applied: true, billing: true, fields: { username: 'x', isBusinessPlus: true } }, 200);
    }
    if (u.includes('/business-verification/pending-count')) {
      window.__bf.calls.push({ route: 'count', auth: !!(opts && opts.headers && (opts.headers.Authorization || opts.headers.authorization)) });
      const m = window.__bf.count;
      if (m === 'network') throw new TypeError('network down');
      if (m === 'http500') return J({ ok: false, error: 'count_failed' }, 502);
      if (m === 'storage') return J({ ok: false, error: 'storage_not_configured' }, 503);
      if (m === 'malformed') return J({ ok: true }, 200);
      if (m === 'negative') return J({ ok: true, pending: -3 }, 200);
      return J({ ok: true, pending: window.__bf.countValue }, 200);
    }
    if (u.includes('/business-verification/admin/list')) {
      window.__bf.calls.push({ route: 'list', auth: String((opts && opts.headers && opts.headers.Authorization) || '') });
      if (window.__bf.listStatus !== 200) return J({ error: 'unauthorized' }, window.__bf.listStatus);
      return J({ ok: true, applications: window.__bf.list }, 200);
    }
    if (u.includes('/business-verification/admin/decision')) {
      window.__bf.calls.push({ route: 'decision', body: JSON.parse((opts && opts.body) || '{}') });
      return J({ ok: true, status: 'approved' }, 200);
    }
    return orig(url, opts);
  };
`;

async function installStubs(page) {
  await page.evaluate(INSTALL_FETCH);
}

function toastNow(page) {
  return page.evaluate(() => {
    const t = document.getElementById('toast');
    const x = document.getElementById('toast-text');
    return { text: x ? x.textContent : '', visible: !!(t && t.classList.contains('opacity-100') && !t.classList.contains('opacity-0')) };
  });
}

module.exports = {
  INSTALL_FETCH,
  name: 'Business badge fix',
  tests: [
    {
      name: 'Business Plus toast: pending or rejected application says active without promising the green check; approved says Green badge enabled. Same rule for @pixlynote',
      accounts: ['business', 'pixlynote'],
      covers: ['handler:applyBusinessPlusVerification', 'handler:isBusinessPlusShown'],
      async run(ctx) {
        const { page, a, account } = ctx;
        await start(ctx);
        await installStubs(page);
        const r = await page.evaluate(async (sid) => {
          const out = {};
          async function step(label, status, legacy) {
            state.currentUser.accountType = 'business';
            state.currentUser.isBusinessPlus = false;
            state.currentUser.isPlus = false; state.currentUser.isVerified = false;
            delete state.currentUser.verificationType; delete state.currentUser.verificationStatus;
            state.currentUser.businessVerificationStatus = status;
            state.currentUser.businessVerificationLegacyExempt = legacy === true;
            window.__bf.calls.length = 0;
            const ok = await applyBusinessPlusVerification(state.currentUser.username, sid);
            const t = document.getElementById('toast-text');
            const badge = document.getElementById('profile-verified-badge');
            const key = getAccountStorageKey('pixlynote_user', normalizeUsername(state.currentUser.username));
            let stored = {};
            try { stored = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
            out[label] = {
              ok, toast: t ? t.textContent : '',
              isBusinessPlus: state.currentUser.isBusinessPlus === true,
              shown: isBusinessPlusShown(state.currentUser),
              badgeHidden: !badge || badge.classList.contains('hidden'),
              badgeGreen: !!(badge && badge.classList.contains('text-emerald-500')),
              storedFlag: stored.isBusinessPlus === true,
              storedSession: stored.stripeBusinessSessionId || '',
              sync: window.__bf.calls.filter((c) => c.route === 'sync').map((c) => c.body)
            };
          }
          await step('pending', 'pending');
          await step('rejected', 'rejected');
          await step('more_info', 'more_info');
          await step('approved', 'approved');
          out.pending_text = window.BIZ_PLUS_TOAST_PENDING;
          out.badge_text = window.BIZ_PLUS_TOAST_BADGE;
          return out;
        }, SID);
        a.equal(r.pending_text, 'Business Plus is active. The green check appears after your application is approved.', 'pending toast copy is exact');
        for (const k of ['pending', 'rejected', 'more_info']) {
          a.ok(r[k].ok && r[k].isBusinessPlus, k + ': Business Plus is saved and on: ' + JSON.stringify(r[k]));
          a.equal(r[k].toast, r.pending_text, k + ': toast does not promise the badge');
          a.ok(!/Green badge enabled/.test(r[k].toast), k + ': toast never says Green badge enabled');
          a.equal(r[k].shown, false, k + ': isBusinessPlusShown is false');
          a.ok(!r[k].badgeGreen, k + ': no GREEN check next to the name');
          a.ok(r[k].storedFlag && r[k].storedSession === SID, k + ': isBusinessPlus is persisted locally with the session id');
          a.ok(r[k].sync.length === 1 && r[k].sync[0].action === 'activate' && r[k].sync[0].session_id === SID, k + ': the Worker was asked to activate once');
        }
        a.ok(r.approved.ok && r.approved.shown === true, 'approved: the badge rule says shown: ' + JSON.stringify(r.approved));
        a.equal(r.approved.toast, 'Business Plus activated! Green badge enabled \u2713', 'approved: toast says Green badge enabled');
        a.ok(!r.approved.badgeHidden && r.approved.badgeGreen, 'approved: the green check is on screen');
        a.ok(account.username.length > 0, 'ran for @' + account.username + ' with no exception');
      }
    },
    {
      name: 'Business Plus save failure (network, Worker 502, 422, flag not saved, no fields) changes nothing, shows the honest error, never a success toast, and keeps the session queued',
      accounts: ['business'],
      covers: ['handler:applyBusinessPlusVerification', 'handler:applyPendingStripeSession'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx);
        await installStubs(page);
        const r = await page.evaluate(async (sid) => {
          const out = {};
          for (const mode of ['network', 'write_failed', 'not_membership', 'flag_false', 'no_fields']) {
            state.currentUser.accountType = 'business';
            state.currentUser.isBusinessPlus = false;
            delete state.currentUser.stripeBusinessSessionId;
            state.currentUser.businessVerificationStatus = 'approved';
            const key = getAccountStorageKey('pixlynote_user', normalizeUsername(state.currentUser.username));
            try { localStorage.removeItem(key); } catch (e) {}
            localStorage.setItem('pixly_pending_stripe_session', sid);
            localStorage.setItem('pixly_pending_stripe_kind', 'business');
            window.__bf.sync = mode;
            const t = document.getElementById('toast');
            t.classList.remove('opacity-100'); t.classList.add('opacity-0');
            const ok = await applyBusinessPlusVerification(state.currentUser.username, sid);
            let stored = {};
            try { stored = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
            const badge = document.getElementById('profile-verified-badge');
            out[mode] = {
              badgeGreen: !!(badge && badge.classList.contains('text-emerald-500')),
              ok, toast: document.getElementById('toast-text').textContent,
              isBusinessPlus: state.currentUser.isBusinessPlus === true,
              session: state.currentUser.stripeBusinessSessionId || '',
              storedFlag: stored.isBusinessPlus === true,
              badgeHidden: !badge || badge.classList.contains('hidden'),
              pending: localStorage.getItem('pixly_pending_stripe_session') || '',
              err: window._lastBusinessPlusSaveError || ''
            };
          }
          // the sign-in retry path: applyPendingStripeSession must also report failure and keep the queue
          window.__bf.sync = 'write_failed';
          localStorage.setItem('pixly_pending_stripe_session', sid);
          localStorage.setItem('pixly_pending_stripe_kind', 'business');
          const origFetch = window.fetch;
          window.fetch = async function (url, opts) {
            if (String(url).includes('/verify-stripe-session')) {
              return new Response(JSON.stringify({ verified: false, plan: 'business', payment_status: 'no_payment_required', status: 'complete', client_reference_id: state.currentUser.username, session_id: sid }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return origFetch(url, opts);
          };
          out.retry = { ok: await applyPendingStripeSession(state.currentUser.username), pending: localStorage.getItem('pixly_pending_stripe_session') || '', isBusinessPlus: state.currentUser.isBusinessPlus === true };
          window.__bf.sync = 'ok';
          out.retryLater = { ok: await applyPendingStripeSession(state.currentUser.username), pending: localStorage.getItem('pixly_pending_stripe_session') || '', isBusinessPlus: state.currentUser.isBusinessPlus === true };
          window.fetch = origFetch;
          out.failText = window.BIZ_PLUS_TOAST_SAVE_FAILED;
          return out;
        }, SID);
        a.ok(/Nothing was changed/.test(r.failText), 'failure copy says nothing was changed');
        for (const mode of ['network', 'write_failed', 'not_membership', 'flag_false', 'no_fields']) {
          const x = r[mode];
          a.equal(x.ok, false, mode + ': apply reports failure');
          a.equal(x.toast, r.failText, mode + ': honest error toast: ' + x.toast);
          a.ok(!/activated|Green badge enabled|is active/i.test(x.toast), mode + ': no success wording');
          a.equal(x.isBusinessPlus, false, mode + ': Business Plus is not turned on in the UI');
          a.equal(x.session, '', mode + ': no session id stored');
          a.equal(x.storedFlag, false, mode + ': nothing persisted locally');
          a.ok(!x.badgeGreen, mode + ': no green badge');
          a.equal(x.pending, SID, mode + ': the paid session stays queued for a retry');
          a.ok(!!x.err, mode + ': the reason is recorded');
        }
        a.equal(r.retry.ok, false, 'sign-in retry reports failure when the save fails');
        a.equal(r.retry.pending, SID, 'sign-in retry keeps the queue');
        a.equal(r.retry.isBusinessPlus, false, 'sign-in retry leaves Business Plus off');
        a.equal(r.retryLater.ok, true, 'a later retry succeeds once the save works');
        a.equal(r.retryLater.isBusinessPlus, true, 'a later retry turns Business Plus on');
        a.equal(r.retryLater.pending, '', 'the queue is cleared after a successful save');
      }
    },
    {
      name: 'Purchase History shows a $0 "Business Plus (free)" row with the Free status; a failed history load shows the error and no row',
      accounts: ['business'],
      covers: ['handler:loadBillingHistory', 'handler:normalizeBillingRecord', 'el:#billing-history-list'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await start(ctx);
        const free = [{ id: SID, data: { kind: 'subscription', item: 'Business Plus (free)', amountCents: 0, currency: 'usd', status: 'free', note: 'Free: no payment required', createdAt: Date.now(), livemode: false, sessionId: SID, source: 'sync_free' } }];
        await fx.openBillingHistory(page, h, free);
        const ok = await page.evaluate(() => Array.from(document.querySelectorAll('#billing-history-list .billing-row')).map((el) => ({
          id: el.getAttribute('data-billing-id'), kind: el.getAttribute('data-kind'), st: el.getAttribute('data-status'),
          item: el.querySelector('.billing-item').textContent, amount: el.querySelector('.billing-amount').textContent,
          status: el.querySelector('.billing-status').textContent, note: (el.querySelector('.billing-note') || {}).textContent || '',
          date: el.querySelector('.billing-date').textContent
        })));
        a.equal(ok.length, 1, 'one history row: ' + JSON.stringify(ok));
        a.equal(ok[0].item, 'Business Plus (free)', 'row item is Business Plus (free)');
        a.equal(ok[0].amount, '$0.00', 'row amount is $0.00');
        a.equal(ok[0].status, 'Free', 'row status label is Free');
        a.equal(ok[0].st, 'free', 'row status is free');
        a.equal(ok[0].kind, 'subscription', 'row kind is subscription');
        a.ok(/Test mode/.test(ok[0].date), 'sandbox rows say Test mode');
        const empty = await page.evaluate(async () => {
          window.__pixlyBillingFixture = async () => [];
          await loadBillingHistory(true);
          return { rows: document.querySelectorAll('#billing-history-list .billing-row').length, msg: document.getElementById('billing-history-status').textContent };
        });
        a.equal(empty.rows, 0, 'no purchases means no row');
        a.ok(/No purchases yet/.test(empty.msg), 'empty history says No purchases yet: ' + empty.msg);
        const failed = await page.evaluate(async () => {
          window.__pixlyBillingFixture = async () => { throw new Error('denied'); };
          await loadBillingHistory(true);
          return { rows: document.querySelectorAll('#billing-history-list .billing-row').length, msg: document.getElementById('billing-history-status').textContent };
        });
        a.equal(failed.rows, 0, 'a failed load shows no rows');
        a.ok(/Couldn't load your history/.test(failed.msg), 'a failed load says so (not "No purchases"): ' + failed.msg);
      }
    },
    {
      name: 'Admin menu shows the pending Business application count (1) as soon as it opens, before any token; a failed fetch shows a dash and an error, never a fake 0',
      accounts: ['pixlynote'],
      covers: ['handler:openProfileMenu', 'el:#business-verification-admin-count', 'handler:refreshBusinessVerificationPendingCount'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await start(ctx);
        await installStubs(page);
        async function openAndRead(label) {
          await page.evaluate(() => { window.__bf.calls.length = 0; });
          await page.evaluate(() => { const t = document.getElementById('business-verification-admin-token'); if (t) t.value = ''; window._adminTokenSession = ''; });
          await h.openOwnerMenu(page);
          await page.waitForTimeout(450);
          const r = await page.evaluate(() => {
            const c = document.getElementById('business-verification-admin-count');
            const e = document.getElementById('business-verification-count-error');
            const list = document.getElementById('drawer-business-verification-list');
            return {
              count: c.textContent, state: c.getAttribute('data-count-state'), title: c.getAttribute('title'),
              err: e.textContent, errHidden: e.classList.contains('hidden'),
              token: document.getElementById('business-verification-admin-token').value,
              listText: list.innerText, calls: window.__bf.calls.slice()
            };
          });
          await page.evaluate(() => { if (typeof closeProfileMenu === 'function') closeProfileMenu(); });
          await page.waitForTimeout(350);
          return r;
        }
        const one = await openAndRead('one');
        a.equal(one.count, '1', 'count shows 1 before any token: ' + JSON.stringify(one));
        a.equal(one.state, 'ok', 'count state is ok');
        a.ok(one.errHidden, 'no error when the count loads');
        a.equal(one.token, '', 'no token was typed');
        a.ok(one.calls.some((c) => c.route === 'count' && c.auth === false), 'the count route was called without an Authorization header');
        a.ok(!one.calls.some((c) => c.route === 'list' || c.route === 'decision'), 'the application list and decisions were not requested without a token');
        a.ok(/Enter the admin token/.test(one.listText), 'the list still asks for the token and shows no application details: ' + one.listText);
        await page.evaluate(() => { window.__bf.countValue = 0; });
        const zero = await openAndRead('zero');
        a.equal(zero.count, '0', 'a real zero shows 0');
        a.equal(zero.state, 'ok', 'a real zero is an ok state');
        a.ok(zero.errHidden, 'a real zero has no error');
        for (const mode of ['network', 'http500', 'storage', 'malformed', 'negative']) {
          await page.evaluate((m) => { window.__bf.count = m; window.__bf.countValue = 5; }, mode);
          const bad = await openAndRead(mode);
          a.equal(bad.count, '\u2013', mode + ': failed count shows a dash, not a number: ' + JSON.stringify(bad));
          a.equal(bad.state, 'error', mode + ': count state is error');
          a.ok(!bad.errHidden && /Couldn't load the pending count/.test(bad.err), mode + ': an honest error is shown: ' + bad.err);
          a.ok(bad.count !== '0', mode + ': never a fake 0');
        }
        // recovery: refresh button retries the count even with no token
        await page.evaluate(() => { window.__bf.count = 'ok'; window.__bf.countValue = 2; });
        await h.openOwnerMenu(page);
        await page.waitForTimeout(300);
        await page.evaluate(() => { window.__bf.calls.length = 0; document.getElementById('btn-refresh-business-verifications').click(); });
        await page.waitForTimeout(400);
        const rec = await page.evaluate(() => ({ count: document.getElementById('business-verification-admin-count').textContent, errHidden: document.getElementById('business-verification-count-error').classList.contains('hidden'), calls: window.__bf.calls.slice() }));
        a.equal(rec.count, '2', 'refresh without a token retries the count and recovers: ' + JSON.stringify(rec));
        a.ok(rec.errHidden, 'the error clears after a good retry');
        a.ok(!rec.calls.some((c) => c.route === 'list'), 'refresh without a token still does not request the list');
      }
    },
    {
      name: 'With the admin token the list loads and the count equals the Pending Review applications; Approve needs the token; a wrong token keeps the count and shows the token error',
      accounts: ['pixlynote'],
      covers: ['handler:refreshBusinessVerificationAdmin', 'handler:decideBusinessVerification', 'el:#btn-load-business-verifications'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await start(ctx);
        await installStubs(page);
        await page.evaluate(() => {
          window.__bf.countValue = 2;
          window.__bf.list = [
            { username: 'shop_one', status: 'pending', dbaName: 'Shop One' },
            { username: 'shop_two', status: 'pending', dbaName: 'Shop Two' },
            { username: 'shop_old', status: 'approved', dbaName: 'Old Shop' },
            { username: 'shop_info', status: 'more_info', dbaName: 'Info Shop' },
            { username: 'shop_no', status: 'rejected', dbaName: 'No Shop' }
          ];
        });
        await h.openOwnerMenu(page);
        await page.waitForTimeout(400);
        const noTok = await page.evaluate(async () => {
          window.__bf.calls.length = 0; window._adminTokenSession = '';
          document.getElementById('business-verification-admin-token').value = '';
          await decideBusinessVerification('shop_one', 'approve', '');
          return { toast: document.getElementById('toast-text').textContent, decisions: window.__bf.calls.filter((c) => c.route === 'decision').length, count: document.getElementById('business-verification-admin-count').textContent };
        });
        a.equal(noTok.decisions, 0, 'Approve without a token sends nothing');
        a.ok(/Enter the admin token first/.test(noTok.toast), 'Approve without a token says why: ' + noTok.toast);
        a.equal(noTok.count, '2', 'the count from before the token is still there');
        const wrong = await page.evaluate(async () => {
          window.__bf.listStatus = 401;
          document.getElementById('business-verification-admin-token').value = 'wrong-token';
          await refreshBusinessVerificationAdmin(true);
          return { count: document.getElementById('business-verification-admin-count').textContent, err: document.getElementById('business-verification-admin-token-error').textContent, list: document.getElementById('drawer-business-verification-list').innerText };
        });
        a.equal(wrong.count, '2', 'a wrong token does not change the count');
        a.ok(/Wrong admin token/.test(wrong.err), 'a wrong token shows the token error');
        a.ok(!/shop_one|Shop One/.test(wrong.list), 'a wrong token shows no application details');
        const good = await page.evaluate(async () => {
          window.__bf.listStatus = 200;
          document.getElementById('business-verification-admin-token').value = 'good-token';
          await refreshBusinessVerificationAdmin(true);
          const list = document.getElementById('drawer-business-verification-list');
          return { count: document.getElementById('business-verification-admin-count').textContent, state: document.getElementById('business-verification-admin-count').getAttribute('data-count-state'), text: list.innerText, buttons: list.querySelectorAll('button').length };
        });
        a.equal(good.count, '2', 'count equals the Pending Review applications (2 of 5): ' + JSON.stringify(good));
        a.equal(good.state, 'ok', 'count state ok after the list loads');
        a.ok(/Shop One/.test(good.text) && /Shop Two/.test(good.text), 'with the token the details load');
        a.equal(good.buttons, 15, 'every application has Approve, More Info Needed and Reject');
        const decided = await page.evaluate(async () => {
          window.__bf.calls.length = 0;
          window.__bf.list = window.__bf.list.map((x) => x.username === 'shop_one' ? Object.assign({}, x, { status: 'approved' }) : x);
          await decideBusinessVerification('shop_one', 'approve', '');
          await new Promise((r) => setTimeout(r, 200));
          const c = window.__bf.calls;
          return { decisions: c.filter((x) => x.route === 'decision').map((x) => x.body), auth: c.filter((x) => x.route === 'list').length, count: document.getElementById('business-verification-admin-count').textContent };
        });
        a.ok(decided.decisions.length === 1 && decided.decisions[0].decision === 'approve' && decided.decisions[0].username === 'shop_one', 'Approve with the token sends one approve decision');
        a.equal(decided.count, '1', 'after one is approved the count drops to 1');
      }
    },
    {
      name: 'A regular account opening its menu never asks for the pending count',
      accounts: ['personal', 'business'],
      covers: ['handler:openProfileMenu'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await start(ctx);
        await installStubs(page);
        await h.openOwnerMenu(page);
        await page.waitForTimeout(400);
        const calls = await page.evaluate(() => window.__bf.calls.slice());
        a.ok(!calls.some((c) => c.route === 'count' || c.route === 'list'), 'no admin routes called for a regular account: ' + JSON.stringify(calls));
      }
    }
  ]
};
