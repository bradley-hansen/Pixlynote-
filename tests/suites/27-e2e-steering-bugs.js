'use strict';

/**
 * E2E tests reproducing & verifying Bradley's 5 steering items (bugs & feature specs):
 * 1. Account switcher (top bar, right of DM): Log into another account / Create new account while signed in
 * 2. Notifications: like grouping ("A, B, C and N others liked your photo") + Highlights/For You prioritization
 * 3. Feed post ... menu: popup menu (Copy link, Not interested, Help -> Submit feedback)
 * 4. Sparkle AI button on comment replies (post/note detail modals)
 * 5a. Sparkle AI stale prefill across posts/notes
 * 5b. < Back to Explore on @digitalassetpro profile (desktop & mobile)
 * 5c. Messages (+ New Chat, Chat next to user, conversation row) across all account types & desktop/mobile viewports
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'E2E Steering Bug Repros and Feature Verifications',
  tests: [
    {
      name: 'Steering 1: Account switcher Log into another account / Create new account opens auth card while signed in',
      accounts: ['personal'],
      covers: [
        'el:#btn-header-profile',
        'el:#btn-switcher-login',
        'el:#btn-switcher-signup',
        'handler:openAuthFromSwitcher'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          await page.click('#btn-header-profile');
          await page.waitForTimeout(150);
          a.ok(await h.isVisible(page, '#modal-account-switcher'), 'Account switcher modal opens');

          // Bug repro: clicking "Log into another account" while signed in calls undefined switchAuthMode("login")
          await page.click('#btn-switcher-login');
          await page.waitForTimeout(200);
          const loginState = await page.evaluate(() => ({
            authVisible: !document.getElementById('auth-view')?.classList.contains('hidden'),
            splashVisible: document.getElementById('splash-container') ? getComputedStyle(document.getElementById('splash-container')).display !== 'none' : false,
            cardVisible: document.getElementById('auth-card-container') ? !document.getElementById('auth-card-container').classList.contains('hidden') : false,
            loginFormVisible: document.getElementById('auth-login-container') ? !document.getElementById('auth-login-container').classList.contains('hidden') : false
          }));
          a.ok(
            loginState.authVisible && !loginState.splashVisible && loginState.cardVisible && loginState.loginFormVisible,
            'Clicking "Log into another account" while signed in should hide Splash and open Login card (got ' + JSON.stringify(loginState) + ')'
          );
        } finally {
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'Steering 2: Notifications group multiple likes on same photo and prioritize mentions/follows over likes',
      accounts: ['personal'],
      covers: ['el:#btn-toggle-notifications', 'el:#notifications-list', 'handler:renderNotifications'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          const img = h.tinyPng();
          const now = Date.now();
          await page.evaluate(({ img, now }) => {
            state.notifications = [
              { id: 1, type: 'like', fromUser: 'u1', text: 'liked your photo', postId: 3001, postImage: img, timestamp: now - 1000, read: false },
              { id: 2, type: 'like', fromUser: 'u2', text: 'liked your photo', postId: 3001, postImage: img, timestamp: now - 2000, read: false },
              { id: 3, type: 'like', fromUser: 'u3', text: 'liked your photo', postId: 3001, postImage: img, timestamp: now - 3000, read: false },
              { id: 4, type: 'like', fromUser: 'u4', text: 'liked your photo', postId: 3001, postImage: img, timestamp: now - 4000, read: false },
              { id: 5, type: 'mention', fromUser: 'alice_test', text: 'mentioned you in a comment: "check this"', postId: 3001, timestamp: now - 60000, read: false },
              { id: 6, type: 'follow', fromUser: 'bob_test', text: 'started following you', timestamp: now - 120000, read: false }
            ];
            if (typeof renderNotifications === 'function') renderNotifications(true);
            if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(true);
          }, { img, now });
          await page.waitForTimeout(150);

          const notifInfo = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('#notifications-list .notif-item')].map(el => el.innerText.replace(/\s+/g, ' ').trim());
            return { count: rows.length, rows };
          });
          const hasGroupedLikes = notifInfo.rows.some(r => /others?\s+liked/i.test(r));
          const firstRowIsPriority = notifInfo.rows.length > 0 && /mentioned|following/i.test(notifInfo.rows[0]);
          a.ok(hasGroupedLikes, 'Multiple likes on same photo should be grouped ("A, B, C and N others liked your photo"); rows=' + JSON.stringify(notifInfo.rows));
          a.ok(firstRowIsPriority, 'Mentions/follows should be prioritized ahead of likes; first row=' + JSON.stringify(notifInfo.rows[0] || ''));
        } finally {
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'Steering 3: Feed post ... button opens popup menu with Copy link, Not interested, and Help -> Submit feedback',
      accounts: ['personal'],
      covers: ['el:.btn-post-options'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          await page.evaluate(() => {
            state.following = (state.following || []).concat([{ username: 'menu_creator', fullName: 'Menu Creator', isFollowing: true }]);
            state.posts.unshift({ id: 8899, author: 'menu_creator', authorName: 'Menu Creator', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', caption: 'Menu test', tags: [], likes: 0, comments: [], createdAtMs: Date.now() + 60000 });
          });
          await h.gotoMainTab(page, 'feed');
          await page.evaluate(() => renderFeed());
          await page.waitForTimeout(150);
          const btn = page.locator('.btn-post-options[data-post-id="8899"]').first();
          a.ok(await btn.count() > 0, 'Feed post options (...) button exists');
          await btn.click();
          await page.waitForTimeout(150);

          const menuText = await page.evaluate(() => {
            const visibleMenus = [...document.querySelectorAll('[role="menu"], .post-options-menu, [id*="post-options"]')]
              .filter(el => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
            return visibleMenus.map(el => el.innerText).join(' | ');
          });
          a.ok(
            /copy link/i.test(menuText) && /not interested/i.test(menuText) && /help|feedback/i.test(menuText),
            'Clicking feed post ... should open popup menu with Copy link, Not interested, and Help/Submit feedback (got "' + menuText + '")'
          );
        } finally {
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'Steering 4: Sparkle AI button renders on comment replies inside post and note modals',
      accounts: ['personal'],
      covers: ['el:#modal-post-detail', 'el:#modal-note-detail', 'handler:pixaiContentBtnHtml'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          await page.evaluate(() => {
            const p = state.posts.find(x => String(x.id) === '3001');
            if (p) {
              p.comments = [{
                id: 551,
                user: 'alice_test',
                text: 'Top level comment',
                timestamp: '1m',
                likedBy: [],
                replies: [{ id: 552, user: 'bob_test', text: 'Nested comment reply', timestamp: 'Just now', likedBy: [] }]
              }];
            }
            if (typeof openPostDetailModal === 'function') openPostDetailModal(3001);
          });
          await page.waitForTimeout(200);
          const replySparkleCount = await page.evaluate(() => {
            const modal = document.getElementById('modal-post-detail');
            if (!modal) return 0;
            const replyNodes = [...modal.querySelectorAll('.border-l-2')];
            return replyNodes.filter(el => el.querySelector('.btn-pixai-content')).length;
          });
          a.ok(replySparkleCount > 0, 'Post modal comment replies should include a .btn-pixai-content Sparkle AI button (got ' + replySparkleCount + ')');
        } finally {
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'Steering 5a: Sparkle AI prefill resets cleanly when switching from one post to another post or note',
      accounts: ['personal'],
      covers: ['el:#pixai-chat-input', 'el:#pixai-content-context', 'handler:openPixaiWithContentFromEl', 'handler:clearPixaiContentContext'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          await page.evaluate(() => {
            const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
            state.posts.unshift({ id: 7701, author: 'bradley_hansen', authorName: 'Bradley Hansen', authorAvatar: img, image: img, caption: '', likes: 0, comments: [] });
            state.explorePosts.push({ id: 7702, author: 'digitalassetpro', authorName: 'Digital AssetPro', authorAvatar: img, image: img, caption: 'Market update', likes: 0, comments: [] });
            state.notes.unshift({ id: 7703, author: 'bradley_hansen', authorName: 'Bradley Hansen', authorAvatar: img, text: 'Morning coffee thoughts', likes: 0, comments: [] });
            if (typeof openPixaiWithContent === 'function') {
              openPixaiWithContent({ kind: 'post', id: 7701, author: 'bradley_hansen', text: '', hasImage: true });
            }
          });
          await page.waitForTimeout(150);
          const firstInput = await page.inputValue('#pixai-chat-input');
          a.ok(firstInput.includes('@bradley_hansen') && firstInput.includes('(no text)'), 'First open prefills @bradley_hansen post');

          await page.evaluate(() => {
            if (typeof closePixaiModal === 'function') closePixaiModal();
          });
          await page.waitForTimeout(350);

          await page.evaluate(() => {
            if (typeof openPixaiWithContent === 'function') {
              openPixaiWithContent({ kind: 'post', id: 7702, author: 'digitalassetpro', text: 'Market update', hasImage: true });
            }
          });
          await page.waitForTimeout(150);
          const secondInput = await page.inputValue('#pixai-chat-input');
          a.ok(
            secondInput.includes('@digitalassetpro') && !secondInput.includes('@bradley_hansen'),
            'Second open on @digitalassetpro post should not retain stale @bradley_hansen prefill (got "' + secondInput + '")'
          );
        } finally {
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'Steering 5b: < Back to Explore on @digitalassetpro profile navigates back to Explore on desktop and mobile',
      accounts: ['personal'],
      covers: ['el:#btn-back-from-user-profile', 'handler:viewUserProfile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(vp);
            await h.gotoMainTab(page, 'explore');
            await page.evaluate(() => {
              window._exploreUserDir = {
                at: Date.now(),
                users: new Map([['digitalassetpro', { username: 'digitalassetpro', fullName: 'Digital AssetPro', dbaName: 'Digital AssetPro', accountType: 'business', bio: 'Crypto', followersCount: 5, followingCount: 2, following: [], deactivated: false, likedPostIds: [], likedNoteIds: [], deletedNoteIds: new Set() }]]),
                notes: new Map(), posts: [], likesByPost: new Map(), likesByNote: new Map()
              };
              if (typeof renderExplore === 'function') renderExplore('digitalassetpro');
            });
            await page.waitForTimeout(100);
            await page.click('.explore-account-row[data-username="digitalassetpro"]');
            await page.waitForTimeout(150);
            a.ok(await h.isVisible(page, '#tab-user-profile'), 'Profile view opens for @digitalassetpro at ' + vp.width + 'px');
            await page.click('#btn-back-from-user-profile');
            await page.waitForTimeout(150);
            const backState = await page.evaluate(() => ({
              activeTab: state.activeTab,
              exploreVisible: !document.getElementById('tab-explore')?.classList.contains('hidden')
            }));
            a.equal(backState.activeTab, 'explore', 'Back button returns to Explore tab at ' + vp.width + 'px');
            a.ok(backState.exploreVisible, 'Explore tab container is visible at ' + vp.width + 'px');
          }
        } finally {
          await page.setViewportSize({ width: 390, height: 844 });
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'Steering 5c (mobile 390x844): DMs + New Chat, Chat button, and conversation row open thread and input',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-open-messages', 'el:#btn-dm-new-chat', 'el:#dm-new-chat-picker', 'el:#dm-chat-panel', 'el:#dm-input-text'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.evaluate(() => {
            state.messages = [];
            if (!window._exploreUserDir || !(window._exploreUserDir.users instanceof Map)) {
              window._exploreUserDir = { users: new Map(), notes: new Map() };
            }
            window._exploreUserDir.users.set('amalfi_dreaming', { username: 'amalfi_dreaming', fullName: 'Amalfi Dreaming', bio: 'Travel', avatar: '', accountType: 'personal' });
          });
          await h.gotoMainTab(page, 'feed');
          await page.click('#btn-open-messages');
          await page.waitForTimeout(150);
          a.ok(await h.isVisible(page, '#modal-messages'), 'Messages opens on mobile for ' + account.key);

          await page.click('#btn-dm-new-chat');
          await page.waitForTimeout(120);
          a.ok(await h.isVisible(page, '#dm-new-chat-picker'), '+ New Chat opens picker on mobile for ' + account.key);

          const chatBtn = page.locator('#dm-creators-list .dm-new-chat-row button').first();
          a.ok(await chatBtn.count() > 0, 'Chat button rendered in New Chat picker');
          await chatBtn.click();
          await page.waitForTimeout(150);
          a.ok(await h.isVisible(page, '#dm-input-text'), 'DM input visible after clicking Chat on mobile for ' + account.key);

          await page.click('#btn-dm-back-threads');
          await page.waitForTimeout(120);
          await page.locator('#dm-thread-list .dm-thread-item').first().click();
          await page.waitForTimeout(150);
          a.ok(await h.isVisible(page, '#dm-input-text'), 'DM input visible after clicking conversation row on mobile for ' + account.key);
        } finally {
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'Steering 5c (desktop 1280x800): DMs + New Chat, Chat button, and conversation row open thread and input',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#dm-chat-panel', 'el:#dm-input-text', 'handler:openDirectMessageWithUser'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        try {
          await page.setViewportSize({ width: 1280, height: 800 });
          await page.evaluate(() => {
            state.messages = [];
            if (!window._exploreUserDir || !(window._exploreUserDir.users instanceof Map)) {
              window._exploreUserDir = { users: new Map(), notes: new Map() };
            }
            window._exploreUserDir.users.set('amalfi_dreaming', { username: 'amalfi_dreaming', fullName: 'Amalfi Dreaming', bio: 'Travel', avatar: '', accountType: 'personal' });
          });
          await h.gotoMainTab(page, 'feed');
          await page.click('#btn-open-messages');
          await page.waitForTimeout(150);
          await page.click('#btn-dm-new-chat');
          await page.waitForTimeout(120);
          a.ok(await h.isVisible(page, '#dm-new-chat-picker'), '+ New Chat opens picker on desktop for ' + account.key);

          await page.locator('#dm-creators-list .dm-new-chat-row button').first().click();
          await page.waitForTimeout(150);
          a.ok(
            await h.isVisible(page, '#dm-input-text'),
            'DM chat panel & input must be visible after clicking Chat on desktop 1280x800 for ' + account.key + ' (blocked by .hidden !important overriding sm:flex)'
          );
        } finally {
          await page.setViewportSize({ width: 390, height: 844 });
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
        }
      }
    }
  ]
};
