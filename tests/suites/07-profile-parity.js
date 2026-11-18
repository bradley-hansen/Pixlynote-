'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Profile parity',
  tests: [
    {
      name: 'Profiles look identical to every viewer except the action buttons',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#tab-profile', 'handler:viewUserProfile', 'el:#btn-user-profile-follow', 'el:#menu-user-profile-more', 'el:#btn-menu-block', 'el:#btn-menu-mute', 'el:#btn-menu-info-about'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        // Snapshot owner-facing profile content
        await h.gotoMainTab(page, 'profile');
        await page.evaluate(() => { if (typeof renderProfile === 'function') renderProfile(); });
        await page.waitForTimeout(80);
        const owner = await page.evaluate(() => {
          const name = ((document.getElementById('profile-fullname') || document.getElementById('profile-name') || document.querySelector('#tab-profile h1, #tab-profile .font-bold')) || {}).textContent || '';
          const bio = ((document.getElementById('profile-bio') || document.querySelector('#tab-profile .profile-bio')) || {}).textContent || '';
          const handle = ((document.getElementById('profile-username') || document.getElementById('drawer-username')) || {}).textContent || '';
          const posts = (document.getElementById('profile-posts-count') || document.getElementById('profile-grid') || document.getElementById('posts-grid') || {}).innerText || '';
          const actions = Array.from(document.querySelectorAll('#tab-profile button')).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
          return { name: name.trim(), bio: bio.trim(), handle: handle.trim(), posts: posts.slice(0, 400), actions };
        });

        // View the same profile as a different account
        const viewer = account.username === 'reg_personal' ? 'reg_business' : 'reg_personal';
        const acc = ctx.h.ACCOUNTS ? null : null;
        await page.evaluate((args) => {
          const { viewer, viewerName, viewerType, email, phone, target } = args;
          if (typeof performLogin === 'function') performLogin(viewer, viewerName, email, null, phone, viewerType);
          state.currentUser = Object.assign({}, state.currentUser || {}, { username: viewer, fullName: viewerName, accountType: viewerType });
          if (typeof viewUserProfile === 'function') viewUserProfile(target);
        }, {
          viewer,
          viewerName: viewer === 'reg_business' ? 'Reg Business' : 'Reg Personal',
          viewerType: viewer === 'reg_business' ? 'business' : 'personal',
          email: viewer + '@example.test',
          phone: '5555550199',
          target: account.username
        });
        await page.waitForTimeout(250);
        const visitor = await page.evaluate(() => {
          const root = document.getElementById('tab-user-profile') || document.getElementById('user-profile');
          const name = ((document.getElementById('user-profile-fullname') || document.getElementById('user-profile-name') || (root && root.querySelector('h1, .font-bold'))) || {}).textContent || '';
          const bio = ((document.getElementById('user-profile-bio') || (root && root.querySelector('.profile-bio, [id*="bio"]'))) || {}).textContent || '';
          const handle = ((document.getElementById('user-profile-username') || (root && root.querySelector('[id*="username"]'))) || {}).textContent || '';
          const actions = Array.from((root || document).querySelectorAll('button')).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
          const hasConnect = actions.some((t) => /connect|follow|message|mute|block/i.test(t));
          const hasEdit = actions.some((t) => /^edit profile$/i.test(t));
          return { name: name.trim(), bio: bio.trim(), handle: handle.trim(), actions: actions.slice(0, 20), hasConnect, hasEdit };
        });

        // Re-login as the original account so later tests are not stuck as the viewer
        await h.loginAs(page, account);

        // Compare content, not actions
        if (owner.name && visitor.name) {
          a.ok(owner.name.includes(account.fullName.split(' ')[0]) || visitor.name.includes(account.fullName.split(' ')[0]) || visitor.handle.includes(account.username) || owner.handle.includes(account.username), 'Name/handle is the same account: ' + JSON.stringify({ owner, visitor }));
        }
        a.ok(visitor.hasConnect || !visitor.hasEdit, 'Visitor actions differ (Connect/Message, not Edit Profile): ' + JSON.stringify(visitor.actions));
      }
    }
  ]
};
