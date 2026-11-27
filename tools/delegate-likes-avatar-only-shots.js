'use strict';

// Preview screenshots: Liked Photos delegate-like strip (owner avatar, Showcase
// tag, heart, delegate avatar) and the opened photo's "Liked for @x · by @handle"
// message.
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const OUT = '/workspace/pixlynote/delegate-likes-shots/avatar-only';

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
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8463) });
  try {
    const page = await h.newPage(session, { width: 390, height: 844 });
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.personal);

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
      const post = (typeof getPostById === 'function') ? getPostById('2144') : (state.posts || []).find((p) => String(p.id) === '2144');
      const author = post && post.author;
      if (author) {
        window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
        window._remoteUserProfilesCache[author] = Object.assign({}, window._remoteUserProfilesCache[author] || {}, { username: author, isShowcase: true });
      }
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
    await page.screenshot({ path: path.join(OUT, '1-liked-photos-delegate-avatar-only.png') });

    const tile = await page.$('.liked-grid-item[data-post-id="2144"], .liked-grid-item');
    if (tile) {
      await tile.screenshot({ path: path.join(OUT, '1b-liked-photos-tile-strip-closeup.png') });
    }

    await page.evaluate(() => { if (typeof openPostDetailModal === 'function') openPostDetailModal('2144'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const el = document.getElementById('modal-like-delegates');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, '2-opened-photo-liked-for-by.png') });

    console.log('Wrote shots to ' + OUT);
  } finally {
    await session.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
