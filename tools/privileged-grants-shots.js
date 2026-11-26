'use strict';

// Preview screenshots for Privileged Access grants, owner switch-back and the delegate avatar.
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const OUT = '/workspace/pixlynote/privileged-grants-shots';

function hideToast() {
  const t = document.getElementById('toast');
  if (t) { t.style.display = 'none'; t.classList.add('opacity-0', 'pointer-events-none'); t.classList.remove('opacity-100'); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8438) });
  try {
    const page = await h.newPage(session, { width: 390, height: 844 });
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.personal);

    // 1. Grant picker (owner @reg_personal inviting @pixlynote, Like + Comment picked; one older read-only grant listed).
    await page.evaluate(() => {
      const prev = window._exploreUserDir || {};
      const users = (prev.users && typeof prev.users.set === 'function') ? prev.users : new Map();
      users.set('pixlynote', { username: 'pixlynote', fullName: 'Pixlynote', avatar: '', accountType: 'business', likedPostIds: [], likedNoteIds: [], deletedNoteIds: [], deletedPostIds: [], following: [], deactivated: false });
      window._exploreUserDir = Object.assign({}, prev, { users });
      localStorage.setItem('pixly_priv_granted_reg_personal', JSON.stringify([{ username: 'reg_business', status: 'accepted', grantedAt: 1, grants: ['post', 'note', 'like'] }]));
    });
    await h.openOwnerMenu(page);
    await page.evaluate(() => {
      if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
      if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    });
    await page.waitForTimeout(200);
    if (await page.$('#btn-ac-open-your-account')) { await page.click('#btn-ac-open-your-account'); await page.waitForTimeout(80); }
    await page.click('#btn-ac-tab-privileged-access');
    await page.waitForTimeout(200);
    await page.fill('#ac-priv-username-input', 'pixlynote');
    await page.evaluate(() => selectPrivilegedInviteUser('pixlynote'));
    await page.check('#ac-priv-grant-options input[data-grant="like"]');
    await page.check('#ac-priv-grant-options input[data-grant="comment"]');
    await page.evaluate(() => { const el = document.getElementById('ac-priv-grant-picker'); if (el) el.scrollIntoView({ block: 'start' }); });
    await page.evaluate(hideToast);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, '1-grant-picker.png') });
    await page.click('.ac-priv-granted-row[data-username="reg_business"] .ac-priv-edit-grants-btn');
    await page.evaluate(() => { const el = document.querySelector('.ac-priv-granted-row[data-username="reg_business"]'); if (el) el.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, '1b-edit-grants-later.png') });
    await page.evaluate(() => { localStorage.removeItem('pixly_priv_granted_reg_personal'); closeAccountCenterModal(); });

    // 2. Owner switch toggle: owner back on @reg_personal with full access; switcher offers the read-only delegate view.
    await page.evaluate(async () => {
      registerSessionAccount({ username: 'pixlynote', fullName: 'Pixlynote', accountType: 'business' });
      savePrivilegedAccountsList('pixlynote', [{ username: 'reg_personal', status: 'accepted' }]);
      window.__pixlyPrivTargetDoc = (u) => ({ username: u, privilegedAccessGranted: [{ username: 'pixlynote', status: 'accepted', grants: [] }] });
      window.pixlyOwnerSessions.remember('reg_personal');
      performLogin('pixlynote', 'Pixlynote', '', null, '', 'business');
      await requestAccountSwitchWithAuth({ username: 'reg_personal', fullName: 'Reg Personal', accountType: 'personal' });
      await new Promise((r) => setTimeout(r, 200));
      openAccountSwitcher();
    });
    await page.evaluate(() => { const t = document.getElementById('toast'); if (t) { t.style.visibility = 'hidden'; } });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '2-owner-switch-toggle.png') });
    await page.click('#btn-switcher-delegate-view');
    await page.evaluate(() => { switchMainTab('feed'); renderFeed(); window.scrollTo(0, 0); });
    await page.evaluate(hideToast);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '2b-delegate-view-switch-to-full-access.png') });
    await page.evaluate(() => { clearPrivilegedReadOnlySession(); delete window.__pixlyPrivTargetDoc; const t = document.getElementById('toast'); if (t) t.style.visibility = ''; });

    // 3. Delegate session with only some grants: @pixlynote in @reg_personal with Like + Comment.
    await h.loginAs(page, h.ACCOUNTS.personal);
    await page.evaluate(() => {
      savePrivilegedAccountsList('pixlynote', [{ username: 'reg_personal', status: 'accepted' }]);
      performLogin('reg_personal', 'Reg Personal', '', null, '', 'personal', { username: 'reg_personal', fullName: 'Reg Personal', accountType: 'personal' }, { privilegedReadOnly: true, viewer: 'pixlynote', grants: ['like', 'comment'] });
      switchMainTab('feed'); renderFeed(); window.scrollTo(0, 0);
    });
    await page.evaluate(hideToast);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '3-delegate-some-grants.png') });

    // 4. A post made by the delegate shows "by @pixlynote" with its avatar (post, like and comment).
    await page.evaluate(() => {
      clearPrivilegedReadOnlySession();
      performLogin('reg_personal', 'Reg Personal', '', null, '', 'personal', { username: 'reg_personal', fullName: 'Reg Personal', accountType: 'personal' }, { privilegedReadOnly: true, viewer: 'pixlynote', grants: ['post', 'like', 'comment'] });
      const me = 'reg_personal';
      const post = { id: Date.now(), author: me, authorName: 'Reg Personal', image: (state.posts[0] && state.posts[0].image) || '', caption: 'Posted for @reg_personal by the Pixlynote account', likes: 0, likedBy: [me], likeDelegates: { [me]: 'pixlynote' }, delegatedBy: 'pixlynote', timestamp: 'JUST NOW',
        comments: [{ id: 1, user: me, text: 'Thanks everyone!', likedBy: [], replies: [], delegatedBy: 'pixlynote' }] };
      state.posts.unshift(post);
      try { state.likedPostIds.add(post.id); } catch (e) {}
      switchMainTab('feed'); renderFeed();
      const card = document.querySelector('.post-card[data-post-id="' + post.id + '"]') || document.querySelector('article');
      if (card) card.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -60);
    });
    await page.evaluate(hideToast);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, '4-post-delegate-avatar.png') });
    console.log('wrote', fs.readdirSync(OUT).join(', '));
  } finally {
    await session.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
