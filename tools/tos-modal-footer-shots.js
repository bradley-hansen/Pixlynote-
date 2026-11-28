'use strict';
// Before/after screenshots for the Terms consent modal footer fit (412x600 and 915x300).
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const { installPixlyMockFirestore } = require(REPO + '/tests/helpers/mock-firestore');
const OUT = process.env.SHOT_OUT || '/workspace/pixlynote/tos-modal-footer-shots/after';
const SIZES = [{ w: 412, h: 600 }, { w: 915, h: 300 }];
const TOOLBAR = 70;

async function hideToast(page) {
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
}

async function openModal(page, acc) {
  await page.evaluate(installPixlyMockFirestore, { ['users/' + acc.username]: { username: acc.username, accountType: 'personal' } });
  await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), acc.username);
  await page.evaluate((a) => performLogin(a.username, a.fullName, a.email, null, a.phone, a.accountType), acc);
  await page.waitForFunction(() => window.pixlyTos && window.pixlyTos.isOpen(), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await hideToast(page);
}

async function addFakeToolbar(page, barPx) {
  await page.evaluate((barPx) => {
    window.__pixlyTosVisibleBox = { height: window.innerHeight - barPx, top: 0 };
    if (window.pixlyTos && window.pixlyTos.syncViewport) window.pixlyTos.syncViewport();
    let bar = document.getElementById('fake-browser-toolbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fake-browser-toolbar';
      document.body.appendChild(bar);
    }
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:' + barPx + 'px;z-index:2147483647;background:#111;display:flex;align-items:center;justify-content:space-around;color:#888;font:600 11px/1 sans-serif;pointer-events:none;';
    bar.innerHTML = '<span>⌂</span><span>✦</span><span style="font-size:18px">＋</span><span>▣</span>';
  }, barPx);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8624) });
  try {
    for (const sz of SIZES) {
      const tag = sz.w + 'x' + sz.h;
      const page = await h.newPage(session, { width: sz.w, height: sz.h });
      await h.loadApp(page, session);
      const acc = h.ACCOUNTS.personal;
      await h.loginAs(page, acc);
      await openModal(page, acc);
      await page.screenshot({ path: path.join(OUT, 'modal-' + tag + '.png') });
      await page.evaluate(() => {
        const p = document.getElementById('tos-consent-panel');
        p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(80);
      await page.check('#tos-consent-checkbox');
      await page.waitForTimeout(120);
      await hideToast(page);
      await page.screenshot({ path: path.join(OUT, 'modal-checked-' + tag + '.png') });
      await addFakeToolbar(page, TOOLBAR);
      await page.waitForTimeout(80);
      await hideToast(page);
      await page.screenshot({ path: path.join(OUT, 'modal-toolbar70-' + tag + '.png') });
      await page.evaluate(() => {
        try { delete window.__pixlyTosVisibleBox; } catch (e) {}
        const bar = document.getElementById('fake-browser-toolbar');
        if (bar) bar.remove();
        if (window.pixlyTos && window.pixlyTos.syncViewport) window.pixlyTos.syncViewport();
      });
      await page.evaluate(() => {
        window.__pixlyTosVisibleBox = { height: window.innerHeight - 56, top: 56 };
        if (window.pixlyTos && window.pixlyTos.syncViewport) window.pixlyTos.syncViewport();
        let bar = document.getElementById('fake-address-bar');
        if (!bar) {
          bar = document.createElement('div');
          bar.id = 'fake-address-bar';
          document.body.appendChild(bar);
        }
        bar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:56px;z-index:2147483647;background:#202124;color:#e8eaed;display:flex;align-items:center;padding:0 12px;font:13px/1 sans-serif;pointer-events:none;box-sizing:border-box;';
        bar.textContent = 'pixlynote.com';
      });
      await page.waitForTimeout(80);
      await hideToast(page);
      await page.screenshot({ path: path.join(OUT, 'modal-addressbar-' + tag + '.png') });
      await page.context().close();
    }
  } finally {
    await session.close();
  }
  console.log('after shots written to ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
