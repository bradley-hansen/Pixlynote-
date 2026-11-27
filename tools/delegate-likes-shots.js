'use strict';

// Preview screenshots for delegate likes: newest-first Likes tab, grid badge, and
// the delegate's Privileged Access grants list.
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const OUT = '/workspace/pixlynote/delegate-likes-shots';


function hideToast() {
  const t = document.getElementById('toast');
  if (t) { t.style.display = 'none'; t.classList.add('opacity-0', 'pointer-events-none'); t.classList.remove('opacity-100'); }
}

function revealLikesSection() {
  const target = document.getElementById('profile-tab-bar') || document.getElementById('likes-subtab-photos');
  if (!target) return;
  let p = target.parentElement;
  let sp = document.scrollingElement;
  while (p) {
    const s = getComputedStyle(p);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') && p.scrollHeight > p.clientHeight + 10) { sp = p; break; }
    p = p.parentElement;
  }
  const top = target.getBoundingClientRect().top - sp.getBoundingClientRect().top + sp.scrollTop - 6;
  sp.scrollTop = Math.max(0, top);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8453) });
  try {
    const page = await h.newPage(session, { width: 390, height: 844 });
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.personal);

    // 1. Liked Photos: older owner like, then a newer delegate like with the badge, newest first.
    await page.evaluate(() => {
      state.likedPostIds = new Set();
      state.likedOrder = [];
      state.likedPostAt = {};
      state.likedNoteIds = new Set();
      state.likedNoteOrder = [];
      state.likedNoteAt = {};
      togglePostLike('2123');
    });
    await page.evaluate(() => {
      savePrivilegedAccountsList('pixlynote', [{ username: 'reg_personal', status: 'accepted' }]);
      performLogin('reg_personal', 'Reg Personal', '', null, '', 'personal', { username: 'reg_personal', fullName: 'Reg Personal', accountType: 'personal' }, { privilegedReadOnly: true, viewer: 'pixlynote', grants: ['like'] });
      togglePostLike('2144');
    });
    await h.gotoMainTab(page, 'profile');
    await page.evaluate(() => {
      const btn = document.getElementById('tab-btn-likes');
      if (btn) btn.click();
      const photos = document.getElementById('likes-subtab-photos');
      if (photos) photos.click();
      if (typeof renderLikes === 'function') renderLikes();
      const st = document.createElement('style');
      st.id = 'shot-no-toast';
      st.textContent = '#toast{display:none !important}';
      document.head.appendChild(st);
    });
    await page.evaluate(revealLikesSection);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, '1-liked-photos-newest-first-delegate-badge.png') });

    // 2. Liked Notes: two notes, newest first.
    await page.evaluate(() => {
      toggleLikeNote('9101');
      toggleLikeNote('9102');
      const notes = document.getElementById('likes-subtab-notes');
      if (notes) notes.click();
      if (typeof renderLikes === 'function') renderLikes();
    });
    await page.evaluate(revealLikesSection);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '2-liked-notes-newest-first.png') });

    // 3. Delegate's own Privileged Access screen lists "You can: Like".
    await page.evaluate(() => {
      try { clearPrivilegedReadOnlySession(); } catch (e) {}
      performLogin('pixlynote', 'Pixlynote', '', null, '', 'business', { username: 'pixlynote', fullName: 'Pixlynote', accountType: 'business' });
      savePrivilegedAccountsList('pixlynote', [{ username: 'reg_personal', status: 'accepted', acceptedAt: Date.now() }]);
      window.__pixlyPrivTargetDoc = (u) => {
        if (String(u).toLowerCase() === 'reg_personal') {
          return { username: 'reg_personal', privilegedAccessGranted: [{ username: 'pixlynote', status: 'accepted', grants: ['like'] }] };
        }
        return null;
      };
    });
    await h.openOwnerMenu(page);
    await page.evaluate(() => {
      if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
      if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
      else if (typeof openAccountCenter === 'function') openAccountCenter();
    });
    await page.waitForTimeout(200);
    if (await page.$('#btn-ac-open-your-account')) {
      await page.click('#btn-ac-open-your-account');
      await page.waitForTimeout(80);
    }
    await page.click('#btn-ac-tab-privileged-access');
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const el = document.getElementById('ac-privileged-received-list');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await page.evaluate(hideToast);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, '3-delegate-privileged-access-you-can-like.png') });

    console.log('Wrote shots to ' + OUT);
  } finally {
    await session.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
