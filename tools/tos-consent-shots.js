'use strict';
// Preview screenshots for the Terms of Service consent (sign-up panel before/after scroll, existing-account modal, save error).
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const { installPixlyMockFirestore } = require(REPO + '/tests/helpers/mock-firestore');
const OUT = '/workspace/pixlynote/tos-consent-shots';

const SIZES = [{ w: 390, h: 844 }, { w: 360, h: 740 }];

async function hideToast(page) {
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) { t.style.display = 'none'; } });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8521) });
  try {
    for (const sz of SIZES) {
      const tag = sz.w + 'x' + sz.h;
      // 1+2. Sign-up step 1: TOS panel before and after scrolling to the end.
      let page = await h.newPage(session, { width: sz.w, height: sz.h });
      await h.loadApp(page, session);
      await h.openSignupForm(page);
      await page.fill('#login-fullname', 'Jamie Rivera');
      await page.fill('#signup-username', 'jamie_rivera');
      await page.fill('#signup-password', 'TestPass123!');
      await page.evaluate(() => {
        const b = document.getElementById('signup-tos-block');
        b.scrollIntoView({ block: 'center' });
        document.getElementById('signup-tos-panel').scrollTop = 0;
      });
      await page.waitForTimeout(250);
      await hideToast(page);
      await page.screenshot({ path: `${OUT}/signup-tos-before-scroll-${tag}.png` });
      await page.evaluate(() => {
        const p = document.getElementById('signup-tos-panel');
        p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll'));
        document.getElementById('signup-tos-block').scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(150);
      await page.check('#signup-tos-checkbox');
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/signup-tos-after-scroll-${tag}.png` });
      await page.context().close();

      // 3+4. Existing account (never agreed): the blocking modal, then the save-error state.
      page = await h.newPage(session, { width: sz.w, height: sz.h });
      await h.loadApp(page, session);
      const acc = h.ACCOUNTS.personal;
      await h.loginAs(page, acc);
      await page.evaluate(installPixlyMockFirestore, { ['users/' + acc.username]: { username: acc.username, accountType: 'personal' } });
      await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), acc.username);
      await page.evaluate((a) => performLogin(a.username, a.fullName, a.email, null, a.phone, a.accountType), acc);
      await page.waitForFunction(() => window.pixlyTos && window.pixlyTos.isOpen(), null, { timeout: 5000 });
      await page.waitForTimeout(300);
      await hideToast(page);
      await page.screenshot({ path: `${OUT}/existing-account-modal-${tag}.png` });
      await page.evaluate(() => {
        window.firebase.setDoc = async () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };
        const p = document.getElementById('tos-consent-panel');
        p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll'));
      });
      await page.check('#tos-consent-checkbox');
      await page.click('#btn-tos-consent-agree');
      await page.waitForSelector('#tos-consent-error:not(.hidden)', { timeout: 3000 });
      await page.waitForTimeout(200);
      await hideToast(page);
      await page.screenshot({ path: `${OUT}/save-error-${tag}.png` });
      await page.context().close();
    }
  } finally {
    await session.close();
  }
  console.log('shots done');
})().catch((e) => { console.error(e); process.exit(1); });
