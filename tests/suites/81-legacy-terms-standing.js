'use strict';

/**
 * Nov 28, 2026 Terms update + legacy 30+30 client side + Account standing card.
 *  - Exact Section 1 second paragraph, Section 10, Last updated, PIXLY_TOS_VERSION.
 *  - "Decline and delete my account" in the consent modal (success and failure).
 *  - Day 30-60 Terms hold screen: Review Terms & Restore (success and failure), Or permanently delete, Log out.
 *  - Login does not auto-reactivate a Terms-disabled account; a self-deactivated one still does.
 *  - Admin Deactivated list: reason tags, deletion date/countdown, no client purge of Terms holds, cloud read failure.
 *  - lastLoginAt recorded to users/{u}/private/account (success, failure, privileged view skipped).
 *  - Account standing card: loading, good, action needed + Agree, disabled, error + retry.
 * Mock Firestore only; never touches production.
 */

const fs = require('fs');
const path = require('path');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const DAY = 24 * 60 * 60 * 1000;
const S1_P2 = 'If you created an account before November 28, 2026, you must affirmatively accept these Terms within 30 days of notice to continue using Pixlynote. If you do not accept within 30 days, your account will be disabled and hidden from public view. You may sign back in within 30 days after your account is disabled to accept these Terms and restore your account; if you do not, your account and its content will be permanently deleted after that 30-day disabled period. You may decline these Terms and permanently delete your account at any time without accepting.';
const S10 = 'Digital AssetPro LLC (doing business as Pixlynote) may update these Terms of Service from time to time. When we make material changes, we will update the "Last updated" date at the top of this page and notify registered users by email at least 30 days before the changes take effect. Your continued use of Pixlynote after the effective date constitutes your agreement to the updated Terms. If you do not agree to the updated Terms, you must stop using Pixlynote and may deactivate or delete your account from Account Center before the changes take effect.';
const NOTE = 'Accounts with no login for 3 years may become eligible for disablement. Logging in keeps your account active.';
const DECLINE_COVERS = ['el:#btn-tos-consent-decline', 'el:#btn-tos-consent-decline-confirm', 'el:#btn-tos-consent-decline-cancel'];
const HOLD_COVERS = ['el:#terms-hold-screen', 'el:#btn-terms-hold-restore', 'el:#btn-terms-hold-delete', 'el:#btn-terms-hold-logout'];
const STANDING_COVERS = ['el:#ac-standing-card', 'el:#btn-ac-standing-agree', 'el:#btn-ac-standing-retry'];

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const TEXT = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }, sel);
const mockDoc = (page, p) => page.evaluate((p) => JSON.parse(JSON.stringify((window.__pfs && window.__pfs.docs[p]) || null)), p);
const visible = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.classList.contains('hidden') && r.width > 0 && r.height > 0;
}, sel);

async function waitFor(page, fn, arg, ms) {
  try { await page.waitForFunction(fn, arg, { timeout: ms || 8000 }); return true; } catch (e) { return false; }
}
const modalOpen = (page) => page.evaluate(() => !!(window.pixlyTos && window.pixlyTos.isOpen()));
const holdOpen = (page) => page.evaluate(() => !!(window.pixlyTos && window.pixlyTos.isHoldOpen && window.pixlyTos.isHoldOpen()));

function login(page, account, opts) {
  return page.evaluate(({ a, opts }) => {
    performLogin(a.username, a.fullName, a.email, null, a.phone, a.accountType, null, opts || null);
  }, { a: account, opts: opts || null });
}

async function prep(page, account, seed) {
  await page.evaluate(() => {
    try { window.pixlyTos.hideHold(); } catch (e) {}
    try { window.pixlyTos.hide(); } catch (e) {}
    const t = document.getElementById('toast-text'); if (t) t.textContent = '';
  });
  await page.evaluate(installPixlyMockFirestore, seed);
  await page.evaluate((u) => {
    localStorage.removeItem('pixly_tos_consent_' + u);
    window._pixlyLastLoginWrite = {};
  }, account.username);
}

async function cleanup(page, h, account) {
  await page.evaluate((u) => {
    try { window.pixlyTos.hideHold(); } catch (e) {}
    try { window.pixlyTos.hide(); } catch (e) {}
    try { if (typeof cancelAccountDeactivation === 'function') cancelAccountDeactivation(u); } catch (e) {}
    localStorage.setItem('pixly_tos_consent_' + u, JSON.stringify({ tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' }));
    document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
  }, account.username);
  await page.evaluate(uninstallPixlyMockFirestore);
  await page.setViewportSize({ width: 390, height: 844 });
  if (h && h.loginAs) { try { await h.loginAs(page, account); await h.installAppStubs(page); } catch (e) {} }
}

async function scrollAndCheck(page) {
  await page.evaluate(() => { const p = document.getElementById('tos-consent-panel'); p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(60);
  await page.check('#tos-consent-checkbox');
}

function holdSeed(u, extra) {
  const now = Date.now();
  return Object.assign({
    username: u, accountType: 'personal',
    deactivated: true, deactivationReason: 'terms',
    deactivatedAt: now - 10 * DAY, termsDisabledAt: now - 10 * DAY,
    tosNoticeAt: now - 40 * DAY,
    scheduledDeletionAt: now + 20 * DAY + 60000
  }, extra || {});
}
async function seedLocalHold(page, u, rec) {
  await page.evaluate(({ u, rec }) => {
    const map = JSON.parse(localStorage.getItem('pixly_deactivated_accounts') || '{}');
    map[u] = Object.assign({ username: u }, rec);
    localStorage.setItem('pixly_deactivated_accounts', JSON.stringify(map));
  }, { u, rec });
}

module.exports = {
  name: 'Legacy Terms 30+30 and Account standing',
  tests: [
    {
      name: 'Legacy terms: Unit: Section 1 second paragraph, Section 10, Last updated Nov 28 (2 places), and version 2026-11-28 are exact',
      accounts: ['personal'],
      covers: ['el:#policy-section-tos'],
      async run(ctx) {
        const { a } = ctx;
        const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
        const i = html.indexOf('id="policy-section-tos"');
        const sec = html.slice(i, html.indexOf('</section>', i));
        const paras = [];
        const re = /<p>([\s\S]*?)<\/p>/g; let m;
        while ((m = re.exec(sec))) paras.push(norm(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
        a.ok(paras.includes(S1_P2), 'Section 1 second paragraph is exact');
        a.ok(paras.includes(S10), 'Section 10 text is exact');
        const s1 = sec.slice(sec.indexOf('1. ACCEPTANCE OF TERMS'), sec.indexOf('2. ELIGIBILITY'));
        a.ok(norm(s1).includes(S1_P2), 'The new paragraph sits inside Section 1');
        a.ok(/<h4[^>]*>10\. CHANGES TO THESE TERMS<\/h4>/.test(sec), 'Section 10 heading is present');
        a.equal((html.match(/Last updated: November 28, 2026/g) || []).length, 2, 'Last updated November 28, 2026 appears twice');
        a.ok(!/Last updated: November 23, 2026/.test(html), 'No stale November 23 Last updated');
        a.ok(/window\.PIXLY_TOS_VERSION = '2026-11-28';/.test(html), 'PIXLY_TOS_VERSION is 2026-11-28');
      }
    },
    {
      name: 'Legacy terms: E2E: the consent modal shows the new paragraph, Section 10, and Last updated November 28, 2026; an account that already agreed (older version) is not prompted',
      accounts: ['personal'],
      covers: ['el:#tos-consent-modal', 'el:#tos-consent-panel'],
      async run(ctx) {
        const { page, a, account, h } = ctx;
        try {
          await prep(page, account, { ['users/' + account.username]: { username: account.username, accountType: 'personal' } });
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isOpen()), 'Modal opens for an account with no consent');
          const txt = norm(await TEXT(page, '#tos-consent-panel'));
          a.ok(txt.includes(S1_P2), 'Modal includes the Section 1 paragraph');
          a.ok(txt.includes('10. CHANGES TO THESE TERMS') && txt.includes(S10), 'Modal includes Section 10');
          a.ok(/November 28, 2026/.test(await TEXT(page, '#tos-consent-updated')), 'Modal header shows Last updated November 28, 2026');
          a.ok(!(await visible(page, '#tos-consent-hold-note')), 'No Terms-disabled note for a normal legacy account');
          await page.evaluate(() => window.pixlyTos.hide());
          // Already agreed under 2026-11-23: no re-prompt.
          await prep(page, account, { ['users/' + account.username]: { username: account.username, accountType: 'personal', tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' } });
          await login(page, account);
          await page.waitForTimeout(800);
          a.ok(!(await modalOpen(page)), 'An account that agreed to 2026-11-23 is not re-prompted');
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: Decline and delete: confirm step, Keep my account backs out, Yes saves the deactivation then logs out with an honest toast',
      accounts: ['personal'],
      covers: DECLINE_COVERS,
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          await prep(page, account, { ['users/' + u]: { username: u, accountType: 'personal' } });
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isOpen()), 'Modal opens');
          a.ok(await visible(page, '#btn-tos-consent-decline'), 'Decline and delete my account is visible');
          await page.click('#btn-tos-consent-decline');
          a.ok(await visible(page, '#tos-consent-decline-confirm'), 'Confirm step shows');
          a.ok(!(await visible(page, '#btn-tos-consent-agree')) && !(await visible(page, '#tos-consent-checkbox')), 'Agree and checkbox are hidden during the confirm step');
          await page.click('#btn-tos-consent-decline-cancel');
          a.ok(!(await visible(page, '#tos-consent-decline-confirm')) && await visible(page, '#btn-tos-consent-agree'), 'Keep my account returns to the normal footer');
          a.ok(!(await mockDoc(page, 'users/' + u)).deactivated, 'Nothing was written by backing out');
          await page.click('#btn-tos-consent-decline');
          const t0 = Date.now();
          await page.click('#btn-tos-consent-decline-confirm');
          a.ok(await waitFor(page, () => !window.pixlyTos.isOpen()), 'Modal closes after a successful save');
          const doc = await mockDoc(page, 'users/' + u);
          a.equal(doc.deactivated, true, 'users doc deactivated');
          a.equal(doc.deactivationReason, 'declined_terms', 'reason declined_terms');
          a.ok(doc.deletionRequestedAt >= t0, 'deletionRequestedAt recorded');
          a.ok(Math.abs(doc.scheduledDeletionAt - (t0 + 30 * DAY)) < 60000, 'Deletion scheduled ~30 days out');
          a.ok(!doc.tosAcceptedAt, 'No consent recorded');
          const after = await page.evaluate((u) => ({ loggedIn: !!state.isLoggedIn, rec: getDeactivationRecord(u), toast: (document.getElementById('toast-text') || {}).textContent || '' }), u);
          a.ok(!after.loggedIn, 'Logged out');
          a.ok(after.rec && after.rec.deactivated && after.rec.deactivationReason === 'declined_terms', 'Local deactivation record set (hidden from feeds)');
          a.ok(/scheduled for permanent deletion by/i.test(after.toast), 'Toast names the deletion date: ' + after.toast);
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: Decline and delete failure (permission denied, offline) shows an error, keeps the modal and confirm open, changes nothing, stays signed in',
      accounts: ['personal'],
      covers: DECLINE_COVERS,
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          for (const kind of ['permission', 'offline']) {
            await prep(page, account, { ['users/' + u]: { username: u, accountType: 'personal' } });
            await login(page, account);
            a.ok(await waitFor(page, () => window.pixlyTos.isOpen()), kind + ': modal opens');
            await page.evaluate((kind) => {
              window.firebase.setDoc = async () => { const e = new Error(kind === 'permission' ? 'Missing or insufficient permissions.' : 'Failed to get document because the client is offline.'); e.code = kind === 'permission' ? 'permission-denied' : 'unavailable'; throw e; };
            }, kind);
            await page.click('#btn-tos-consent-decline');
            await page.click('#btn-tos-consent-decline-confirm');
            await page.waitForSelector('#tos-consent-error:not(.hidden)', { timeout: 3000 });
            const err = await TEXT(page, '#tos-consent-error');
            a.ok(kind === 'permission' ? /permission denied/i.test(err) : /no connection/i.test(err), kind + ': specific error: ' + err);
            a.ok(/not changed/i.test(err), kind + ': error says the account was not changed');
            a.ok(await modalOpen(page), kind + ': modal stays open');
            a.ok(await visible(page, '#tos-consent-decline-confirm'), kind + ': confirm stays open to retry');
            a.ok(!(await page.evaluate(() => document.getElementById('btn-tos-consent-decline-confirm').disabled)), kind + ': retry is enabled');
            const st = await page.evaluate((u) => ({ loggedIn: !!state.isLoggedIn, rec: getDeactivationRecord(u), toast: (document.getElementById('toast-text') || {}).textContent || '' }), u);
            a.ok(st.loggedIn, kind + ': still signed in');
            a.ok(!st.rec, kind + ': no local deactivation');
            a.ok(!/scheduled for permanent deletion/i.test(st.toast), kind + ': no success toast');
            a.ok(!(await mockDoc(page, 'users/' + u)).deactivated, kind + ': doc not deactivated');
          }
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: a Terms-disabled account signing in sees the Account Deactivated hold screen with a Day 60 countdown, is NOT auto-reactivated, and Review Terms & Restore + Agree restores it',
      accounts: ['personal'],
      covers: HOLD_COVERS.concat(['el:#tos-consent-hold-note', 'el:#btn-tos-consent-agree']),
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          const seed = holdSeed(u);
          await prep(page, account, { ['users/' + u]: seed });
          await seedLocalHold(page, u, seed);
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isHoldOpen()), 'Hold screen shows');
          a.ok(!(await modalOpen(page)), 'Terms modal is not opened automatically');
          a.equal(await TEXT(page, '#terms-hold-title'), 'Account Deactivated', 'Title');
          a.ok(/disabled because the updated Terms of Service were not accepted/i.test(await TEXT(page, '#terms-hold-text')), 'Card says why');
          a.equal(await TEXT(page, '#btn-terms-hold-restore'), 'Review Terms & Restore', 'Primary button label');
          a.equal(await TEXT(page, '#btn-terms-hold-delete'), 'Or permanently delete account', 'Delete link label');
          const banner = await TEXT(page, '#terms-hold-banner');
          a.ok(/temporarily disabled/i.test(banner) && /hidden from public view/i.test(banner) && /permanently deleted in 21 days/i.test(banner), 'Banner shows the Day 60 countdown: ' + banner);
          a.ok(/Restricted/.test(await TEXT(page, '#toast-text')), 'Restricted toast');
          const st = await page.evaluate((u) => ({ rec: getDeactivationRecord(u), j: window._justReactivatedAccount }), u);
          a.ok(st.rec && st.rec.deactivated, 'Local record not cancelled by sign-in');
          a.ok((await mockDoc(page, 'users/' + u)).deactivated === true, 'Cloud doc still deactivated after sign-in');
          a.ok(!(await page.evaluate(() => window.__pfs.writes.some((w) => /^users\/[^/]+$/.test(w.path) && w.data && w.data.deactivated === false))), 'No reactivation write at sign-in');
          await page.click('#btn-terms-hold-restore');
          a.ok(await waitFor(page, () => window.pixlyTos.isOpen()), 'Terms modal opens over the hold screen');
          a.ok(await visible(page, '#tos-consent-hold-note'), 'Modal shows the disabled note');
          await scrollAndCheck(page);
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitFor(page, () => !window.pixlyTos.isOpen() && !window.pixlyTos.isHoldOpen()), 'Modal and hold screen close');
          const doc = await mockDoc(page, 'users/' + u);
          a.ok(doc.tosAcceptedAt > 0 && doc.tosVersion === '2026-11-28', 'Consent recorded');
          a.equal(doc.deactivated, false, 'Reactivated');
          a.equal(doc.deactivationReason, null, 'Reason cleared');
          a.equal(doc.scheduledDeletionAt, null, 'Deletion cleared');
          a.equal(doc.termsDisabledAt, null, 'termsDisabledAt cleared');
          const after = await page.evaluate((u) => ({ rec: getDeactivationRecord(u), toast: (document.getElementById('toast-text') || {}).textContent || '', inert: document.querySelectorAll('[inert]').length, loggedIn: !!state.isLoggedIn }), u);
          a.ok(!after.rec, 'Local deactivation cleared');
          a.ok(/restored/i.test(after.toast), 'Restored toast: ' + after.toast);
          a.equal(after.inert, 0, 'App is interactive again');
          a.ok(after.loggedIn, 'Still signed in');
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: Review Terms & Restore with a failed save shows the error and keeps the account disabled (hold screen, cloud doc, local record)',
      accounts: ['personal'],
      covers: HOLD_COVERS,
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          const seed = holdSeed(u);
          await prep(page, account, { ['users/' + u]: seed });
          await seedLocalHold(page, u, seed);
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isHoldOpen()), 'Hold screen shows');
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          await page.click('#btn-terms-hold-restore');
          a.ok(await waitFor(page, () => window.pixlyTos.isOpen()), 'Modal opens');
          await scrollAndCheck(page);
          await page.click('#btn-tos-consent-agree');
          await page.waitForSelector('#tos-consent-error:not(.hidden)', { timeout: 3000 });
          a.ok(/Couldn't save your agreement/i.test(await TEXT(page, '#tos-consent-error')), 'Error shown');
          a.ok(await modalOpen(page), 'Modal stays open');
          a.ok(await holdOpen(page), 'Hold screen still underneath');
          const doc = await mockDoc(page, 'users/' + u);
          a.ok(doc.deactivated === true && doc.deactivationReason === 'terms' && !doc.tosAcceptedAt, 'Cloud doc still disabled');
          const st = await page.evaluate((u) => ({ rec: getDeactivationRecord(u), toast: (document.getElementById('toast-text') || {}).textContent || '' }), u);
          a.ok(st.rec && st.rec.deactivated, 'Local record still disabled');
          a.ok(!/restored/i.test(st.toast), 'No restored toast');
          // Retry succeeds.
          await page.evaluate(() => { window.__pfs.failWrites = false; });
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitFor(page, () => !window.pixlyTos.isOpen() && !window.pixlyTos.isHoldOpen()), 'Retry restores');
          a.equal((await mockDoc(page, 'users/' + u)).deactivated, false, 'Reactivated on retry');
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: hold screen Or permanently delete keeps the Day 60 date and terms reason, records the request, logs out; Log out changes nothing',
      accounts: ['personal'],
      covers: HOLD_COVERS.concat(DECLINE_COVERS),
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          const seed = holdSeed(u);
          await prep(page, account, { ['users/' + u]: seed });
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isHoldOpen()), 'Hold screen shows');
          // Log out first: no writes to the users doc.
          const writesBefore = await page.evaluate(() => window.__pfs.writes.filter((w) => /^users\/[^/]+$/.test(w.path)).length);
          await page.click('#btn-terms-hold-logout');
          a.ok(await waitFor(page, () => !window.pixlyTos.isHoldOpen() && !state.isLoggedIn), 'Log out hides the hold screen and signs out');
          a.equal(await page.evaluate(() => window.__pfs.writes.filter((w) => /^users\/[^/]+$/.test(w.path)).length), writesBefore, 'Log out wrote nothing to the users doc');
          a.equal(await page.evaluate(() => document.querySelectorAll('[inert]').length), 0, 'Nothing left inert after Log out');
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isHoldOpen()), 'Hold screen shows again');
          await page.click('#btn-terms-hold-delete');
          a.ok(await waitFor(page, () => window.pixlyTos.isOpen()), 'Modal opens');
          a.ok(await visible(page, '#tos-consent-decline-confirm'), 'Straight to the delete confirm step');
          await page.click('#btn-tos-consent-decline-confirm');
          a.ok(await waitFor(page, () => !window.pixlyTos.isOpen() && !window.pixlyTos.isHoldOpen() && !state.isLoggedIn), 'Closes and logs out');
          const doc = await mockDoc(page, 'users/' + u);
          a.ok(doc.deactivated === true && doc.deactivationReason === 'terms', 'Still disabled with reason terms');
          a.equal(doc.scheduledDeletionAt, seed.scheduledDeletionAt, 'Day 60 date unchanged');
          a.ok(doc.deletionRequestedAt > 0, 'Deletion request recorded');
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: a held subscriber sees the "set to cancel, no refund, resubscribe if lapsed" note; restoring never un-cancels the subscription; a held non-subscriber sees no note',
      accounts: ['personal'],
      covers: HOLD_COVERS.concat(['el:#btn-tos-consent-agree']),
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          const sub = { isPlus: true, subscriptionStatus: 'cancel_at_period_end', stripeCancelAtPeriodEnd: true, plusCancelScheduledAt: Date.now() - 10 * DAY, termsSubscriptionCanceledAt: Date.now() - 10 * DAY, stripeCurrentPeriodEnd: Date.now() + 5 * DAY };
          await prep(page, account, { ['users/' + u]: holdSeed(u, sub) });
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isHoldOpen()), 'Hold screen shows');
          a.ok(await visible(page, '#terms-hold-sub-note'), 'Subscription note visible');
          const note = await TEXT(page, '#terms-hold-sub-note');
          a.ok(/will not renew/i.test(note) && /No refund/i.test(note) && /resubscribe/i.test(note), 'Note text: ' + note);
          await page.click('#btn-terms-hold-restore');
          await waitFor(page, () => window.pixlyTos.isOpen());
          await scrollAndCheck(page);
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitFor(page, () => !window.pixlyTos.isOpen() && !window.pixlyTos.isHoldOpen()), 'Restored');
          const doc = await mockDoc(page, 'users/' + u);
          a.equal(doc.deactivated, false, 'Account restored');
          a.equal(doc.subscriptionStatus, 'cancel_at_period_end', 'Subscription still set to cancel');
          a.equal(doc.stripeCancelAtPeriodEnd, true, 'stripeCancelAtPeriodEnd unchanged');
          const restoreWrite = await page.evaluate((u) => window.__pfs.writes.filter((w) => w.path === 'users/' + u && w.data && w.data.tosAcceptedAt), u);
          a.ok(restoreWrite.length === 1 && !Object.keys(restoreWrite[0].data).some((k) => /subscription|stripe|isPlus/i.test(k)), 'Restore write carries no subscription fields: ' + JSON.stringify(restoreWrite));
          // Non-subscriber: no note.
          await prep(page, account, { ['users/' + u]: holdSeed(u) });
          await login(page, account);
          a.ok(await waitFor(page, () => window.pixlyTos.isHoldOpen()), 'Hold screen shows (non-subscriber)');
          a.ok(!(await visible(page, '#terms-hold-sub-note')), 'No subscription note for a non-subscriber');
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: a self-deactivated account still auto-reactivates at sign-in (regression)',
      accounts: ['personal'],
      covers: ['handler:cancelAccountDeactivation'],
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          const now = Date.now();
          const rec = { username: u, deactivated: true, deactivatedAt: now - DAY, scheduledDeletionAt: now + 29 * DAY };
          await prep(page, account, { ['users/' + u]: Object.assign({ accountType: 'personal', tosAcceptedAt: 1764000000000 }, rec) });
          await seedLocalHold(page, u, rec);
          await login(page, account);
          a.ok(await waitFor(page, (u) => !getDeactivationRecord(u), u), 'Local record cleared at sign-in');
          a.ok(await waitFor(page, (u) => window.__pfs.docs['users/' + u].deactivated === false, u), 'Cloud doc reactivated');
          await page.waitForTimeout(500);
          a.ok(!(await holdOpen(page)), 'No hold screen for a self-deactivated account');
        } finally { await cleanup(page, h, account); }
      }
    },
    {
      name: 'Legacy terms: admin Deactivated list tags Terms-disabled accounts "Terms not accepted" with deletion date and countdown, beside self-deactivated ones, and never purges a Terms hold client-side',
      accounts: ['personal'],
      covers: ['el:#drawer-pending-deactivations-list', 'el:#pending-deactivations-count', 'el:#drawer-pixlynote-deactivations'],
      async run(ctx) {
        const { page, a, account, h } = ctx;
        try {
          const now = Date.now();
          await h.loginAs(page, h.ACCOUNTS.pixlynote);
          await h.installAppStubs(page);
          await page.evaluate(installPixlyMockFirestore, {
            'users/lt_terms': { username: 'lt_terms', accountType: 'personal', deactivated: true, deactivationReason: 'terms', deactivatedAt: now - 5 * DAY, scheduledDeletionAt: now + 25 * DAY - 60000 },
            'users/lt_self': { username: 'lt_self', accountType: 'business', deactivated: true, deactivatedAt: now - 2 * DAY, scheduledDeletionAt: now + 28 * DAY - 60000 },
            'users/lt_overdue': { username: 'lt_overdue', accountType: 'personal', deactivated: true, deactivationReason: 'terms', deactivatedAt: now - 31 * DAY, scheduledDeletionAt: now - 1000 },
            'users/lt_active': { username: 'lt_active', accountType: 'personal' }
          });
          await h.openOwnerMenu(page);
          await page.evaluate(() => { window.__pixlyDeleteCalls = []; });
          await page.evaluate(async () => { await refreshPendingDeactivations(true); });
          const got = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#drawer-pending-deactivations-list [data-pending-user]')).map((r) => ({
              u: r.getAttribute('data-pending-user'), reason: r.getAttribute('data-reason'),
              tag: (r.querySelector('.pending-deact-reason') || {}).textContent || '',
              countdown: (r.querySelector('.pending-deact-countdown') || {}).textContent || '',
              text: r.innerText.replace(/\s+/g, ' ')
            }));
            return { rows, count: document.getElementById('pending-deactivations-count').textContent, calls: (window.__pixlyDeleteCalls || []).map(String), err: !!document.getElementById('pending-deactivations-cloud-error') };
          });
          const by = Object.fromEntries(got.rows.map((r) => [r.u, r]));
          a.ok(by.lt_terms && by.lt_terms.tag === 'Terms not accepted', 'Terms account tagged: ' + JSON.stringify(by.lt_terms));
          a.ok(by.lt_terms && by.lt_terms.countdown === '25d left' && /Deletes \w+ \d+, \d{4}/.test(by.lt_terms.text), 'Terms account shows countdown and deletion date: ' + (by.lt_terms || {}).text);
          a.ok(by.lt_self && by.lt_self.tag === 'Self-deactivated' && by.lt_self.countdown === '28d left', 'Self-deactivated listed alongside: ' + JSON.stringify(by.lt_self));
          a.ok(by.lt_overdue && by.lt_overdue.countdown === 'Deletion due', 'Overdue Terms hold is listed as Deletion due');
          a.ok(!got.calls.some((c) => c.toLowerCase() === 'lt_overdue'), 'Overdue Terms hold is NOT purged client-side: ' + JSON.stringify(got.calls));
          a.ok(!by.lt_active, 'Active account not listed');
          a.equal(got.count, '3', 'Count is 3');
          a.ok(!got.err, 'No cloud error note on success');
          a.ok(await page.evaluate(() => typeof refreshDrawerUserMetrics === 'function' && !!document.getElementById('drawer-pixlynote-metrics')), 'Other admin tools are still present');
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore);
          await h.loginAs(page, account);
          await h.installAppStubs(page);
        }
      }
    },
    {
      name: 'Legacy terms: admin Deactivated list says the cloud read failed instead of showing "No pending deactivations"',
      accounts: ['personal'],
      covers: ['el:#drawer-pending-deactivations-list'],
      async run(ctx) {
        const { page, a, account, h } = ctx;
        try {
          await h.loginAs(page, h.ACCOUNTS.pixlynote);
          await h.installAppStubs(page);
          await page.evaluate(installPixlyMockFirestore, {});
          await page.evaluate(() => { window.firebase.getDocs = async () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }; });
          await h.openOwnerMenu(page);
          await page.evaluate(async () => { await refreshPendingDeactivations(true); });
          const list = await TEXT(page, '#drawer-pending-deactivations-list');
          a.ok(/Couldn't load deactivated accounts from the cloud/i.test(list), 'Cloud error shown: ' + list);
          a.ok(!/No pending deactivations/i.test(list), 'Does not claim there are none');
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore);
          await h.loginAs(page, account);
          await h.installAppStubs(page);
        }
      }
    },
    {
      name: 'Legacy terms: lastLoginAt is written to users/{u}/private/account on sign-in (not the public doc); a failed write records nothing; a privileged read-only view writes nothing',
      accounts: ['personal'],
      covers: ['handler:recordLastLoginAt'],
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          await prep(page, account, { ['users/' + u]: { username: u, accountType: 'personal', tosAcceptedAt: 1764000000000 } });
          const t0 = Date.now();
          await login(page, account);
          a.ok(await waitFor(page, (u) => !!(window.__pfs.docs['users/' + u + '/private/account'] || {}).lastLoginAt, u), 'lastLoginAt written');
          const priv = await mockDoc(page, 'users/' + u + '/private/account');
          a.ok(priv.lastLoginAt >= t0, 'lastLoginAt is the sign-in time');
          a.ok(!(await mockDoc(page, 'users/' + u)).lastLoginAt, 'Not on the public users doc');
          // Failure: both attempts fail -> nothing stored, flagged not ok.
          await prep(page, account, { ['users/' + u]: { username: u, accountType: 'personal', tosAcceptedAt: 1764000000000 } });
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          await login(page, account);
          a.ok(await waitFor(page, (u) => window._pixlyLastLoginWrite[u] && window._pixlyLastLoginWrite[u].ok === false, u, 9000), 'Failure is recorded as not ok');
          a.ok(!(await mockDoc(page, 'users/' + u + '/private/account')), 'Nothing stored on failure');
          // A pending retry from an older sign-in never writes after a newer sign-in.
          await page.evaluate(() => { window._pixlyLastLoginWrite = {}; window.__pfs.failWrites = true; });
          await page.evaluate((u) => { window.recordLastLoginAt(u); }, u);
          await page.evaluate(() => { window._pixlyLoginGen = (window._pixlyLoginGen || 0) + 1; window.__pfs.failWrites = false; });
          await page.waitForTimeout(4600);
          a.ok(!(await mockDoc(page, 'users/' + u + '/private/account')), 'Superseded retry wrote nothing');
          a.ok(/superseded/.test((await page.evaluate((u) => window._pixlyLastLoginWrite[u], u) || {}).error || ''), 'Retry reports superseded');
          // Privileged read-only: no write.
          await prep(page, account, { ['users/' + u]: { username: u, accountType: 'personal', tosAcceptedAt: 1764000000000 } });
          const did = await page.evaluate((u) => { window._pixlyLastLoginWrite = {}; return true; }, u);
          a.ok(did, 'reset');
          await page.evaluate((a) => { try { state.privilegedReadOnly = true; } catch (e) {} performLogin(a.username, a.fullName, a.email, null, a.phone, a.accountType, null, { privilegedReadOnly: true }); }, account);
          await page.waitForTimeout(600);
          a.ok(!(await mockDoc(page, 'users/' + u + '/private/account')), 'No lastLoginAt in a privileged read-only view');
          await page.evaluate(() => { try { state.privilegedReadOnly = false; } catch (e) {} });
        } finally {
          await page.evaluate(() => { try { state.privilegedReadOnly = false; } catch (e) {} });
          await cleanup(page, h, account);
        }
      }
    },
    {
      name: 'Account standing (390x844): loading, then "active and in good standing" with Last login, Terms accepted, and the 3-year note',
      accounts: ['personal'],
      covers: STANDING_COVERS,
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          await page.setViewportSize({ width: 390, height: 844 });
          const lastLogin = Date.UTC(2026, 10, 28, 15, 5);
          await prep(page, account, {
            ['users/' + u]: { username: u, accountType: 'personal', tosAcceptedAt: Date.UTC(2026, 10, 28, 16, 0), tosVersion: '2026-11-28' },
            ['users/' + u + '/private/account']: { lastLoginAt: lastLogin }
          });
          await page.evaluate((u) => localStorage.setItem('pixly_tos_consent_' + u, JSON.stringify({ tosAcceptedAt: 1, tosVersion: 'x' })), u);
          await page.evaluate(() => { window.recordLastLoginAt = () => Promise.resolve(true); });
          await login(page, account);
          // Hold reads to observe the loading state.
          await page.evaluate(() => {
            const orig = window.firebase.getDoc;
            window.__releaseReads = null;
            const gate = new Promise((res) => { window.__releaseReads = res; });
            window.firebase.getDoc = async (r) => { await gate; return orig(r); };
            window.__origGetDoc = orig;
          });
          await page.evaluate(() => { openAccountCenterModal(); setAccountCenterView('accountInfo'); });
          await page.waitForTimeout(150);
          a.equal(await page.evaluate(() => document.getElementById('ac-standing-card').getAttribute('data-state')), 'loading', 'Loading state while reads are pending');
          a.ok(!/good standing/i.test(await TEXT(page, '#ac-standing-card')), 'No good standing while loading');
          await page.evaluate(() => { window.__releaseReads(); window.firebase.getDoc = window.__origGetDoc; });
          a.ok(await waitFor(page, () => document.getElementById('ac-standing-card').getAttribute('data-state') === 'good'), 'Good state');
          a.equal(await TEXT(page, '#ac-standing-text'), 'Your account is active and in good standing', 'Exact text');
          const ll = await TEXT(page, '#ac-standing-last-login');
          a.ok(/Nov 28, 2026/.test(ll) && /\d{1,2}:\d{2}/.test(ll), 'Last login date/time: ' + ll);
          a.equal(await TEXT(page, '#ac-standing-terms'), 'November 28, 2026', 'Terms accepted date');
          a.equal(await TEXT(page, '#ac-standing-note'), NOTE, '3-year note verbatim');
          a.ok(!(await visible(page, '#btn-ac-standing-agree')) && !(await visible(page, '#btn-ac-standing-retry')), 'No Agree or Retry when in good standing');
          const box = await page.evaluate(() => { const r = document.getElementById('ac-standing-card').getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
          a.ok(box.l >= 0 && box.r <= box.w, 'Card fits a 390px phone');
        } finally {
          await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} });
          await cleanup(page, h, account);
        }
      }
    },
    {
      name: 'Account standing: Terms not yet accepted shows Action needed + Agree, which opens the Terms modal; agreeing turns the card to good standing',
      accounts: ['personal'],
      covers: STANDING_COVERS.concat(['el:#btn-tos-consent-agree']),
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          await prep(page, account, { ['users/' + u]: { username: u, accountType: 'personal' } });
          await page.evaluate(() => { window.recordLastLoginAt = () => Promise.resolve(true); });
          await login(page, account);
          await waitFor(page, () => window.pixlyTos.isOpen());
          await page.evaluate(() => window.pixlyTos.hide());
          await page.evaluate(() => { openAccountCenterModal(); setAccountCenterView('accountInfo'); });
          a.ok(await waitFor(page, () => document.getElementById('ac-standing-card').getAttribute('data-state') === 'action'), 'Action state');
          a.ok(/accept the Terms of Service/i.test(await TEXT(page, '#ac-standing-text')), 'Says Terms are needed');
          a.equal(await TEXT(page, '#ac-standing-terms'), 'Terms not yet accepted', 'Terms row');
          a.equal(await TEXT(page, '#ac-standing-last-login'), 'Not recorded yet', 'Honest last login when none saved');
          a.ok(!/good standing/i.test(await TEXT(page, '#ac-standing-card')), 'No good standing');
          a.ok(await visible(page, '#btn-ac-standing-agree'), 'Agree button visible');
          await page.click('#btn-ac-standing-agree');
          a.ok(await waitFor(page, () => window.pixlyTos.isOpen()), 'Terms modal opens');
          await scrollAndCheck(page);
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitFor(page, () => !window.pixlyTos.isOpen()), 'Modal closes');
          a.ok(await waitFor(page, () => document.getElementById('ac-standing-card').getAttribute('data-state') === 'good'), 'Card refreshes to good standing');
        } finally {
          await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} });
          await cleanup(page, h, account);
        }
      }
    },
    {
      name: 'Account standing: a failed read shows an error with Try again (never good standing); Try again recovers; a Terms-disabled account shows its real status',
      accounts: ['personal'],
      covers: STANDING_COVERS,
      async run(ctx) {
        const { page, a, account, h } = ctx;
        const u = account.username;
        try {
          await prep(page, account, {
            ['users/' + u]: { username: u, accountType: 'personal', tosAcceptedAt: 1764000000000 },
            ['users/' + u + '/private/account']: { lastLoginAt: Date.now() }
          });
          await page.evaluate((u) => localStorage.setItem('pixly_tos_consent_' + u, JSON.stringify({ tosAcceptedAt: 1, tosVersion: 'x' })), u);
          await page.evaluate(() => { window.recordLastLoginAt = () => Promise.resolve(true); });
          await login(page, account);
          await page.evaluate(() => {
            window.__origGetDoc = window.firebase.getDoc;
            window.firebase.getDoc = async (r) => { if (/private\/account$/.test(r.path)) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; } return window.__origGetDoc(r); };
          });
          await page.evaluate(() => { openAccountCenterModal(); setAccountCenterView('accountInfo'); });
          a.ok(await waitFor(page, () => document.getElementById('ac-standing-card').getAttribute('data-state') === 'error'), 'Error state');
          a.ok(/Couldn't load your account standing/i.test(await TEXT(page, '#ac-standing-text')), 'Error text');
          a.ok(!/good standing/i.test(await TEXT(page, '#ac-standing-card')), 'Never good standing on error');
          a.ok(await visible(page, '#btn-ac-standing-retry'), 'Try again visible');
          await page.evaluate(() => { window.firebase.getDoc = window.__origGetDoc; });
          await page.click('#btn-ac-standing-retry');
          a.ok(await waitFor(page, () => document.getElementById('ac-standing-card').getAttribute('data-state') === 'good'), 'Try again recovers to good');
          // Disabled: real status, never good standing.
          await page.evaluate((u) => { Object.assign(window.__pfs.docs['users/' + u], { tosAcceptedAt: null, deactivated: true, deactivationReason: 'terms', scheduledDeletionAt: Date.now() + 10 * 86400000 }); }, u);
          await page.evaluate(() => window.pixlyStanding.refresh());
          a.ok(await waitFor(page, () => document.getElementById('ac-standing-card').getAttribute('data-state') === 'disabled'), 'Disabled state');
          const txt = await TEXT(page, '#ac-standing-text');
          a.ok(/disabled and hidden because the updated Terms of Service were not accepted/i.test(txt) && /scheduled for permanent deletion on/i.test(txt), 'Real status: ' + txt);
        } finally {
          await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} });
          await cleanup(page, h, account);
        }
      }
    }
  ]
};
