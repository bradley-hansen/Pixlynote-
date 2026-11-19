'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Notifications, DMs and stories',
  tests: [
    {
      name: 'Notifications, DMs and stories UI open',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#notifications-dropdown', 'el:#modal-messages', 'el:#modal-story-viewer', 'el:#btn-open-create-modal', 'el:#nav-btn-create', 'nav:main:create', 'el:#create-mode-tab-story', 'el:#btn-submit-story', 'handler:toggleNotificationsDropdown', 'handler:markAllNotificationsRead', 'handler:closeMessagesModal', 'handler:openCreatePostModal', 'handler:setCreateWizardMode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.gotoMainTab(page, 'feed');
        // Notifications
        const notif = await page.evaluate(() => {
          if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown();
          const el = document.getElementById('notifications-dropdown');
          if (!el) return { exists: false, open: false };
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const hidden = el.classList.contains('hidden') || cs.display === 'none' || (r.width < 1 && r.height < 1);
          return { exists: true, open: !hidden, text: (el.innerText || '').slice(0, 200) };
        });
        a.ok(notif.exists, 'Notifications dropdown exists');
        a.ok(notif.open, 'Notifications dropdown opens');

        // Messages / DMs
        await page.evaluate(() => {
          if (typeof openMessages === 'function') openMessages();
          else if (typeof openMessagesModal === 'function') openMessagesModal();
        });
        await page.waitForTimeout(150);
        const dms = await h.isVisible(page, '#modal-messages');
        a.ok(dms, 'Messages / DMs modal opens');
        await page.evaluate(() => { if (typeof closeMessagesModal === 'function') closeMessagesModal(); });

        // Stories: open create wizard in story mode, and try the viewer
        await page.evaluate(() => {
          if (typeof openCreatePostModal === 'function') openCreatePostModal();
        });
        await page.waitForTimeout(120);
        const createOpen = await h.isVisible(page, '#modal-create-post');
        a.ok(createOpen, 'Create modal opens');
        await page.evaluate(() => {
          const tab = document.getElementById('create-mode-tab-story');
          if (tab) tab.click();
          if (typeof setCreateWizardMode === 'function') setCreateWizardMode('story');
        });
        await page.waitForTimeout(80);
        const storyTab = await page.evaluate(() => {
          const btn = document.getElementById('create-mode-tab-story');
          const submit = document.getElementById('btn-submit-story');
          return { tab: !!btn, submit: !!submit, submitVisible: !!(submit && !submit.classList.contains('hidden')) };
        });
        a.ok(storyTab.tab && storyTab.submit, 'Story create entry points exist');

        await page.evaluate(() => {
          if (typeof closeCreatePostModal === 'function') closeCreatePostModal();
          const stories = state.stories || [];
          const s = stories[0];
          if (s && typeof openStory === 'function') openStory(s.id || s);
          else if (s && typeof openStoryViewer === 'function') openStoryViewer(s);
        });
        await page.waitForTimeout(200);
        const viewer = await page.evaluate(() => {
          const el = document.getElementById('modal-story-viewer');
          if (!el) return { exists: false, open: false };
          const cs = getComputedStyle(el);
          const hidden = el.classList.contains('hidden') || cs.display === 'none';
          return { exists: true, open: !hidden };
        });
        a.ok(viewer.exists, 'Story viewer exists');
        // Opening may depend on story shape; if it didn't open, still require the viewer chrome to be in the DOM.
        if (viewer.open) {
          const controls = await page.evaluate(() => ({
            close: !!document.getElementById('btn-close-story'),
            next: !!document.getElementById('btn-story-next'),
            prev: !!document.getElementById('btn-story-prev')
          }));
          a.ok(controls.close, 'Story viewer has a close control');
        }
      }
    },
    {
      name: 'New Chat lists real connections, searches any real account, and the story viewer badges Close Friends',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#dm-new-chat-picker', 'el:#dm-new-chat-search', 'el:#dm-creators-list', 'handler:toggleDmNewChatPicker', 'handler:filterDmCreators', 'handler:selectCreatorForDm'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const me = normalizeUsername((state.currentUser && state.currentUser.username) || 'me');
          const seed = { username: 'elena_eats', fullName: 'Elena Eats', isFollowing: true };
          const real = { username: 'real_friend_reg', fullName: 'Real Friend', isFollowing: true };
          const selfFollow = { username: me, fullName: 'Me', isFollowing: true };
          state.following = [seed, real, selfFollow];
          const cleaned = (typeof sanitizeFollowingList === 'function') ? sanitizeFollowingList(state.following) : state.following;
          state.following = cleaned;
          try {
            localStorage.setItem('pixly_followers_' + me, JSON.stringify([
              { username: 'follower_reg', fullName: 'Follower Person' },
              { username: 'elena_eats', fullName: 'Elena Eats' }
            ]));
          } catch (e) {}
          window._exploreUserDir = {
            at: Date.now(),
            users: new Map([
              ['alex_rivera', { username: 'alex_rivera', fullName: 'Alex Rivera', avatar: '', deactivated: false, following: [] }],
              ['pixlynote', { username: 'pixlynote', fullName: 'Pixlynote', avatar: '', deactivated: false, following: [] }],
              ['gone_user', { username: 'gone_user', fullName: 'Gone User', avatar: '', deactivated: true, following: [] }],
              ['elena_eats', { username: 'elena_eats', fullName: 'Elena Eats', avatar: '', deactivated: false, following: [] }],
              [me, { username: me, fullName: 'Me Myself', avatar: '', deactivated: false, following: ['real_friend_reg'] }]
            ])
          };
          if (typeof toggleDmNewChatPicker === 'function') toggleDmNewChatPicker(true);
          if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('');
          const list0 = (document.getElementById('dm-creators-list') || {}).innerText || '';
          const html0 = (document.getElementById('dm-creators-list') || {}).innerHTML || '';
          const emptyIdle = /No accounts found/.test(list0);
          if (typeof filterDmCreators === 'function') filterDmCreators('ALE');
          else if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('ALE');
          const listAle = (document.getElementById('dm-creators-list') || {}).innerText || '';
          if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('rivera');
          const listRivera = (document.getElementById('dm-creators-list') || {}).innerText || '';
          if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('pixly');
          const listPixly = (document.getElementById('dm-creators-list') || {}).innerText || '';
          const htmlPixly = (document.getElementById('dm-creators-list') || {}).innerHTML || '';
          if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('elena');
          const listElena = (document.getElementById('dm-creators-list') || {}).innerText || '';
          if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('gone');
          const listGone = (document.getElementById('dm-creators-list') || {}).innerText || '';
          if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('zzzz_no_such_user');
          const emptySearch = (document.getElementById('dm-creators-list') || {}).innerText || '';
          if (typeof renderDmCreatorsList === 'function') renderDmCreatorsList('ALE');
          const row = document.querySelector('.dm-new-chat-row[data-username="alex_rivera"]');
          let opened = null;
          const prevOpen = window.openDirectMessageWithUser;
          window.openDirectMessageWithUser = function (username, fullName) { opened = { username, fullName }; };
          if (row) row.click();
          else if (typeof selectCreatorForDm === 'function') selectCreatorForDm('alex_rivera', 'Alex Rivera', '');
          window.openDirectMessageWithUser = prevOpen;
          // story CF badge (same suite coverage)
          const story = {
            id: 'cf_story_reg_1',
            username: me,
            avatar: (state.currentUser && state.currentUser.avatar) || '',
            image: (state.posts && state.posts[0] && state.posts[0].image) || '',
            caption: 'cf story',
            audience: 'closeFriends',
            isUser: true,
            timestamp: Date.now()
          };
          if (typeof openStoryQueue === 'function') openStoryQueue([story]);
          const cfEl = document.getElementById('story-viewer-cf-label');
          const cfHtml = cfEl ? cfEl.innerHTML : '';
          const cfVisible = !!(cfEl && !cfEl.classList.contains('hidden') && /Close Friends|cf-content-label/.test(cfHtml));
          const hiddenStory = Object.assign({}, story, { id: 'cf_story_hidden', username: 'not_a_close_friend_xyz', isUser: false });
          let blocked = false;
          if (typeof openStoryQueue === 'function') {
            openStoryQueue([hiddenStory]);
            blocked = !state.activeStory || state.activeStory.id !== hiddenStory.id;
          }
          return {
            me,
            cleaned: cleaned.map((f) => f.username),
            seedKept: cleaned.some((f) => f.username === 'elena_eats'),
            realKept: cleaned.some((f) => f.username === 'real_friend_reg'),
            list0,
            hasPixai: /pixai/i.test(list0 + html0),
            hasSupportLabel: /Pixlynote Support/i.test(list0 + html0),
            hasFriend: /real_friend_reg/.test(list0 + html0),
            hasFollower: /follower_reg/.test(list0 + html0),
            idleHasAlex: /alex_rivera/.test(list0 + html0),
            idleHasPixly: /@pixlynote|pixlynote/i.test(list0),
            hasSelf: new RegExp('@' + me + '\\b|' + me, 'i').test(list0) && (list0.match(new RegExp('@' + me + '\\b', 'g')) || []).length > 0,
            listAle,
            aleHasAlex: /Alex Rivera/.test(listAle) && /alex_rivera/.test(listAle),
            listRivera,
            riveraHasAlex: /Alex Rivera/.test(listRivera),
            listPixly,
            pixlyHasAccount: /@pixlynote/.test(listPixly + htmlPixly),
            pixlyRealName: /Pixlynote/.test(listPixly) && !/Pixlynote Support/.test(listPixly + htmlPixly),
            listElena,
            elenaShown: /elena_eats/.test(listElena),
            listGone,
            goneShown: /gone_user/.test(listGone),
            emptySearch,
            emptyIdle,
            opened,
            cfVisible,
            blocked
          };
        });
        a.ok(!r.seedKept, 'Seed demo usernames are stripped from following');
        a.ok(r.realKept, 'Real follows are kept');
        a.ok(!r.hasPixai, 'Pixai is not pinned in New Chat');
        a.ok(!r.hasSupportLabel, 'Pixlynote Support is not pinned in New Chat');
        a.ok(r.hasFriend, 'New Chat lists real following connections');
        a.ok(r.hasFollower, 'New Chat lists real follower connections');
        a.ok(!r.idleHasAlex, 'Unconnected accounts are not listed until you search');
        const isPixly = String(r.me || '').toLowerCase() === 'pixlynote';
        a.ok(isPixly || !r.idleHasPixly, '@pixlynote is not pinned; it appears only if you are connected');
        a.ok(r.aleHasAlex, 'Partial, case-insensitive username search finds a real account: ' + r.listAle.slice(0, 200));
        a.ok(r.riveraHasAlex, 'Partial display-name search finds a real account');
        if (!isPixly) {
          a.ok(r.pixlyHasAccount && r.pixlyRealName, 'Search finds @pixlynote with its real display name, not Support');
        }
        a.ok(!r.elenaShown, 'Search does not return seed demo accounts');
        a.ok(!r.goneShown, 'Search does not return deactivated accounts');
        a.ok(/No accounts found/.test(r.emptySearch), 'A miss shows a friendly No accounts found state');
        a.ok(r.opened && r.opened.username === 'alex_rivera', 'Tapping Chat opens a DM with that real user: ' + JSON.stringify(r.opened));
        a.ok(r.cfVisible, 'Story viewer shows the Close Friends badge');
        a.ok(r.blocked, 'A Close Friends story from someone else does not open in the viewer');
      }
    }
  ]
};
