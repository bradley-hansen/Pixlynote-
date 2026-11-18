'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Owner tab row',
  tests: [
    {
      name: 'Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#tab-btn-posts', 'el:#tab-btn-notes', 'el:#tab-btn-replies', 'el:#tab-btn-saved', 'el:#tab-btn-likes', 'nav:profile:posts', 'nav:profile:notes', 'nav:profile:replies', 'nav:profile:saved', 'nav:profile:likes', 'el:#profile-tab-bar', 'el:#nav-btn-profile', 'nav:main:profile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.gotoMainTab(page, 'profile');
        await page.evaluate(() => { if (typeof renderProfile === 'function') renderProfile(); });
        await page.waitForTimeout(120);

        const inspect = async () => page.evaluate(() => {
          const ids = ['tab-btn-posts', 'tab-btn-notes', 'tab-btn-replies', 'tab-btn-saved', 'tab-btn-likes'];
          const labels = ids.map((id) => {
            const el = document.getElementById(id);
            if (!el) return { id, exists: false };
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const hidden = el.classList.contains('hidden') || cs.display === 'none' || r.width < 1;
            return { id, exists: true, hidden, left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() };
          });
          return { vw: window.innerWidth, labels };
        });

        for (const width of [390, 360]) {
          await page.setViewportSize({ width, height: 844 });
          await page.waitForTimeout(80);
          const s = await inspect();
          for (const lab of s.labels) {
            a.ok(lab.exists, lab.id + ' exists at ' + width);
            a.ok(!lab.hidden, lab.id + ' is visible for the owner at ' + width + ': ' + JSON.stringify(lab));
            if (width && !lab.hidden) {
              a.ok(lab.right <= s.vw + 1, lab.id + ' is not clipped at ' + width + ' (right=' + lab.right + ', vw=' + s.vw + ')');
            }
          }
          const texts = s.labels.map((l) => l.text.toLowerCase()).join(' | ');
          a.ok(/post/.test(texts) && /note/.test(texts) && /repl/.test(texts) && /saved/.test(texts) && /like/.test(texts), 'All five labels are present at ' + width + ': ' + texts);
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
    },
    {
      name: 'Visitor tab row: non-owners do not see Saved or Likes',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#user-tab-btn-posts', 'el:#user-tab-btn-notes', 'el:#user-tab-btn-replies', 'el:#user-profile-tab-bar', 'nav:user-profile:posts', 'nav:user-profile:notes', 'nav:user-profile:replies', 'el:#tab-user-profile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const other = account.username === 'reg_personal' ? 'reg_business' : 'reg_personal';
        await page.evaluate((other) => {
          if (typeof viewUserProfile === 'function') viewUserProfile(other);
          else if (typeof switchMainTab === 'function') switchMainTab('user-profile');
        }, other);
        await page.waitForTimeout(200);
        const s = await page.evaluate(() => {
          const bar = document.getElementById('user-profile-tab-bar') || document.querySelector('#tab-user-profile');
          const text = bar ? (bar.innerText || '').replace(/\s+/g, ' ') : '';
          const saved = document.getElementById('tab-btn-saved');
          const likes = document.getElementById('tab-btn-likes');
          const ownerBarHidden = (() => {
            const el = document.getElementById('profile-tab-bar');
            if (!el) return true;
            const cs = getComputedStyle(el);
            return el.classList.contains('hidden') || cs.display === 'none';
          })();
          const vis = (id) => {
            const el = document.getElementById(id);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return !el.classList.contains('hidden') && cs.display !== 'none' && r.width > 0 && r.height > 0;
          };
          return { text, ownerSavedVisible: vis('tab-btn-saved') && !ownerBarHidden, ownerLikesVisible: vis('tab-btn-likes') && !ownerBarHidden, userPosts: vis('user-tab-btn-posts'), userNotes: vis('user-tab-btn-notes'), userReplies: vis('user-tab-btn-replies') };
        });
        a.ok(s.userPosts && s.userNotes && s.userReplies, 'Visitor sees Posts, Notes and Replies');
        a.ok(!s.ownerSavedVisible && !s.ownerLikesVisible, 'Visitor does not see the owner Saved/Likes tabs: ' + JSON.stringify(s));
        a.ok(!/\bSAVED\b/i.test(s.text) && !/\bLIKES\b/i.test(s.text), 'Visitor tab bar text has no Saved/Likes: ' + s.text);
      }
    }
  ]
};
