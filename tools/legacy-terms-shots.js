'use strict';
// Screenshots: Account standing card (phone), updated ToS sections, consent modal (+ decline), Terms hold screen, admin Deactivated list.
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const { installPixlyMockFirestore } = require(REPO + '/tests/helpers/mock-firestore');
const OUT = process.env.SHOT_OUT || '/workspace/pixlynote/legacy-terms-shots';
const DAY = 86400000;

const hideToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
const showToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = ''; });
const shot = (page, name, opts) => page.screenshot(Object.assign({ path: path.join(OUT, name) }, opts || {}));

async function fresh(session, w, hgt) {
  const page = await h.newPage(session, { width: w, height: hgt });
  await h.loadApp(page, session);
  await h.loginAs(page, h.ACCOUNTS.personal);
  return page;
}
function login(page, acc) { return page.evaluate((a) => performLogin(a.username, a.fullName, a.email, null, a.phone, a.accountType), acc); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8625) });
  const acc = h.ACCOUNTS.personal, u = acc.username;
  try {
    // 1. Account standing: good / action needed / error at 390x844.
    for (const kind of ['good', 'action', 'error']) {
      const page = await fresh(session, 390, 844);
      const seed = { ['users/' + u]: { username: u, accountType: 'personal' } };
      if (kind !== 'action') seed['users/' + u].tosAcceptedAt = Date.now() - 20 * 60000;
      seed['users/' + u + '/private/account'] = { lastLoginAt: Date.now() - 3 * 60000 };
      await page.evaluate(installPixlyMockFirestore, seed);
      await page.evaluate((u) => localStorage.setItem('pixly_tos_consent_' + u, JSON.stringify({ tosAcceptedAt: 1, tosVersion: 'x' })), u);
      if (kind === 'error') await page.evaluate(() => { const o = window.firebase.getDoc; window.firebase.getDoc = async (r) => { if (/private/.test(r.path)) { const e = new Error('offline'); e.code = 'unavailable'; throw e; } return o(r); }; });
      await page.evaluate(() => { window.recordLastLoginAt = () => Promise.resolve(true); });
      await login(page, acc);
      await page.waitForTimeout(300);
      await page.evaluate(() => { openAccountCenterModal(); setAccountCenterView('accountInfo'); });
      await page.waitForFunction((k) => document.getElementById('ac-standing-card').getAttribute('data-state') === k, kind, { timeout: 8000 });
      await hideToast(page);
      await page.waitForTimeout(150);
      await shot(page, 'standing-' + kind + '-390x844.png');
      await page.context().close();
    }

    // 2. Updated ToS sections in Terms & Policies (390x844).
    {
      const page = await fresh(session, 390, 844);
      await page.evaluate(() => { openTermsPoliciesModal('tos'); });
      await page.waitForTimeout(300);
      await page.evaluate(() => { const hs = document.querySelectorAll('#policy-section-tos h4'); hs[0].scrollIntoView({ block: 'start' }); });
      await page.waitForTimeout(200);
      await hideToast(page);
      await shot(page, 'tos-section-1-390x844.png');
      await page.evaluate(() => { const hs = document.querySelectorAll('#policy-section-tos h4'); hs[hs.length - 1].scrollIntoView({ block: 'start' }); });
      await page.waitForTimeout(200);
      await shot(page, 'tos-section-10-390x844.png');
      await page.context().close();
    }

    // 3. Consent modal: top, end + checked, decline confirm (390x844) and landscape 915x300.
    for (const sz of [{ w: 390, h: 844 }, { w: 915, h: 300 }]) {
      const tag = sz.w + 'x' + sz.h;
      const page = await fresh(session, sz.w, sz.h);
      await page.evaluate(installPixlyMockFirestore, { ['users/' + u]: { username: u, accountType: 'personal' } });
      await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), u);
      await login(page, acc);
      await page.waitForFunction(() => window.pixlyTos.isOpen(), null, { timeout: 8000 });
      await page.waitForTimeout(200);
      await hideToast(page);
      await shot(page, 'consent-modal-' + tag + '.png');
      await page.evaluate(() => { const p = document.getElementById('tos-consent-panel'); p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll')); });
      await page.waitForTimeout(100);
      await page.check('#tos-consent-checkbox');
      await page.waitForTimeout(100);
      await shot(page, 'consent-modal-end-' + tag + '.png');
      await page.click('#btn-tos-consent-decline');
      await page.waitForTimeout(150);
      await shot(page, 'consent-decline-confirm-' + tag + '.png');
      await page.context().close();
    }

    // 4. Terms hold screen (Day 30-60) and the modal over it (390x844).
    {
      const page = await fresh(session, 390, 844);
      const now = Date.now();
      await page.evaluate(installPixlyMockFirestore, { ['users/' + u]: { username: u, accountType: 'personal', deactivated: true, deactivationReason: 'terms', deactivatedAt: now - 10 * DAY, termsDisabledAt: now - 10 * DAY, scheduledDeletionAt: now + 20 * DAY + 60000, isPlus: true, subscriptionStatus: 'cancel_at_period_end', stripeCancelAtPeriodEnd: true } });
      await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), u);
      await login(page, acc);
      await page.waitForFunction(() => window.pixlyTos.isHoldOpen(), null, { timeout: 8000 });
      await page.waitForTimeout(300);
      await shot(page, 'hold-screen-390x844.png');
      await hideToast(page);
      await page.click('#btn-terms-hold-restore');
      await page.waitForFunction(() => window.pixlyTos.isOpen(), null, { timeout: 8000 });
      await page.waitForTimeout(200);
      await shot(page, 'hold-review-terms-modal-390x844.png');
      // Failed Agree keeps it disabled with an error.
      await page.evaluate(() => { window.__pfs.failWrites = true; const p = document.getElementById('tos-consent-panel'); p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll')); });
      await page.waitForTimeout(100);
      await page.check('#tos-consent-checkbox');
      await page.click('#btn-tos-consent-agree');
      await page.waitForSelector('#tos-consent-error:not(.hidden)');
      await shot(page, 'hold-agree-failed-390x844.png');
      await page.context().close();
    }

    // 5. Admin Deactivated list with reason tags (390x844).
    {
      const page = await h.newPage(session, { width: 390, height: 844 });
      await h.loadApp(page, session);
      await h.loginAs(page, h.ACCOUNTS.pixlynote);
      await h.installAppStubs(page);
      const now = Date.now();
      await page.evaluate(installPixlyMockFirestore, {
        'users/maria_legacy': { username: 'maria_legacy', accountType: 'personal', deactivated: true, deactivationReason: 'terms', deactivatedAt: now - 5 * DAY, scheduledDeletionAt: now + 25 * DAY - 60000 },
        'users/sam_self': { username: 'sam_self', accountType: 'business', deactivated: true, deactivatedAt: now - 2 * DAY, scheduledDeletionAt: now + 28 * DAY - 60000 },
        'users/old_terms': { username: 'old_terms', accountType: 'personal', deactivated: true, deactivationReason: 'terms', deactivatedAt: now - 31 * DAY, scheduledDeletionAt: now - 1000 }
      });
      await h.openOwnerMenu(page);
      await page.evaluate(async () => { await refreshPendingDeactivations(true); });
      await page.waitForTimeout(300);
      await page.evaluate(() => { const c = document.getElementById('drawer-pixlynote-deactivations'); if (c) c.scrollIntoView({ block: 'center' }); });
      await page.waitForTimeout(300);
      await hideToast(page);
      await shot(page, 'admin-deactivated-list-390x844.png');
      const card = page.locator('#drawer-pixlynote-deactivations');
      if (await card.count()) await card.screenshot({ path: path.join(OUT, 'admin-deactivated-card.png') });
      await page.context().close();
    }
  } finally {
    await session.close();
  }
  console.log('shots in ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
