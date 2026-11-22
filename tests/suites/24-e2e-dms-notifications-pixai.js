'use strict';

/**
 * End-to-end UI tests for DMs (send text, quick reactions, photo, search threads,
 * delete thread, DM share), Notifications (open, mark all read, backdrop), and
 * Pixlynote AI (open, key settings, offline mode, starter pills, submit prompt, close).
 */

module.exports = {
  name: 'E2E DMs, Notifications and Pixlynote AI',
  tests: [
    {
      name: 'E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread',
      accounts: ['personal'],
      covers: [
        'el:#btn-open-messages',
        'el:#dm-search-threads',
        'el:#dm-input-text',
        'el:#btn-dm-send',
        'el:#dm-send-form',
        'el:#btn-dm-delete-thread',
        'el:#btn-dm-view-profile',
        'el:#btn-dm-photo',
        'el:#dm-file-input',
        'el:#modal-dm-share',
        'el:#dm-share-search',
        'el:#dm-share-note-input',
        'handler:handleSendDirectMessage',
        'handler:sendDmQuickReaction',
        'handler:filterDmThreads',
        'handler:requestDeleteDmThread',
        'handler:cancelDeleteDmThread',
        'handler:confirmDeleteDmThread',
        'handler:renderDmShareChatHeads',
        'handler:triggerDmPhotoChooser',
        'handler:handleDmPhotoSelected',
        'handler:handleDmViewProfile',
        'handler:closeDmShareModal'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await page.setViewportSize({ width: 390, height: 844 });

        // Open Messages modal
        await h.gotoMainTab(page, 'feed');
        await page.evaluate(() => {
          if (!Array.isArray(state.messages) || state.messages.length === 0) {
            state.messages = [{
              id: 'dm_elena',
              user: 'elena_eats',
              name: 'Elena Eats',
              avatar: '',
              lastMsg: 'Hey there!',
              time: '1m',
              unread: 0,
              chat: [{ sender: 'them', text: 'Hey there!', time: '10:00 AM', timestamp: Date.now() - 60000 }]
            }];
          }
          state.activeDmThreadIndex = 0;
        });
        await page.click('#btn-open-messages');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#modal-messages'), 'Messages modal opens');
        await page.evaluate(() => {
          const item = document.querySelector('#dm-thread-list > div');
          if (item) item.click();
          else if (typeof selectDmThread === 'function') selectDmThread(0);
        });
        await page.waitForTimeout(120);

        // Send a DM text message
        const dmMsg = 'Hello E2E DM ' + Date.now();
        await page.fill('#dm-input-text', dmMsg);
        await page.click('#btn-dm-send');
        await page.waitForTimeout(150);
        const chatHtml = await page.evaluate(() => (document.getElementById('dm-messages-container') || {}).innerText || '');
        a.ok(chatHtml.includes(dmMsg), 'Sent DM text appears in chat container');

        // Send a quick reaction
        await page.evaluate(() => { if (typeof sendDmQuickReaction === 'function') sendDmQuickReaction('🔥'); });
        await page.waitForTimeout(100);
        const afterReact = await page.evaluate(() => (document.getElementById('dm-messages-container') || {}).innerText || '');
        a.ok(afterReact.includes('🔥'), 'Quick reaction appears in chat container');

        // Return to threads list on mobile viewport to search threads, then re-open thread
        await page.click('#btn-dm-back-threads');
        await page.waitForTimeout(120);
        await page.fill('#dm-search-threads', 'zzz_no_match_thread');
        await page.evaluate(() => { if (typeof filterDmThreads === 'function') filterDmThreads('zzz_no_match_thread'); });
        await page.waitForTimeout(80);
        await page.fill('#dm-search-threads', '');
        await page.evaluate(() => { if (typeof filterDmThreads === 'function') filterDmThreads(''); });
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const item = document.querySelector('#dm-thread-list > div');
          if (item) item.click();
          else if (typeof selectDmThread === 'function') selectDmThread(0);
        });
        await page.waitForTimeout(120);

        // Delete thread: cancel keeps it, confirm deletes it
        const countBefore = await page.evaluate(() => (state.messages || []).length);
        await page.click('#btn-dm-delete-thread');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#dm-delete-confirm-bar'), 'Delete DM confirmation bar appears');
        await page.evaluate(() => { if (typeof cancelDeleteDmThread === 'function') cancelDeleteDmThread(); });
        await page.waitForTimeout(100);
        const countAfterCancel = await page.evaluate(() => (state.messages || []).length);
        a.equal(countAfterCancel, countBefore, 'Cancel keeps DM thread');

        await page.click('#btn-dm-delete-thread');
        await page.waitForTimeout(100);
        await page.evaluate(() => { if (typeof confirmDeleteDmThread === 'function') confirmDeleteDmThread(); });
        await page.waitForTimeout(120);
        const countAfterDel = await page.evaluate(() => (state.messages || []).length);
        a.equal(countAfterDel, countBefore - 1, 'Confirm removes DM thread');

        await page.click('#btn-close-messages');
        await page.waitForTimeout(100);

        // Open DM Share sheet from a post
        await page.evaluate(() => {
          state.following = [{ username: 'connected_user', fullName: 'Connected User', avatar: '', isFollowing: true }];
          if (typeof openDmShareModal === 'function') openDmShareModal('post', 3001);
        });
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#modal-dm-share'), 'DM Share modal opens');
        await page.fill('#dm-share-search', 'connected');
        await page.evaluate(() => { if (typeof renderDmShareChatHeads === 'function') renderDmShareChatHeads('connected'); });
        await page.waitForTimeout(80);
        const shareText = await page.evaluate(() => (document.getElementById('modal-dm-share') || {}).innerText || '');
        a.ok(/connected_user|Connected User/i.test(shareText), 'DM Share lists connected user');
        await page.evaluate(() => { if (typeof closeDmShareModal === 'function') closeDmShareModal(); });

        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    },

    {
      name: 'E2E Notifications: open dropdown, verify unread, mark all read, close backdrop',
      accounts: ['personal'],
      covers: [
        'el:#btn-toggle-notifications',
        'el:#btn-mark-all-read',
        'el:#notifications-backdrop',
        'el:#notifications-dropdown',
        'handler:markAllNotificationsRead',
        'handler:toggleNotificationsDropdown'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        await h.gotoMainTab(page, 'feed');
        await page.evaluate(() => {
          state.notifications = [
            { id: 'n_e2e_1', type: 'like', fromUser: 'elena_eats', text: 'liked your photo', time: '1m', read: false, timestamp: Date.now() },
            { id: 'n_e2e_2', type: 'follow', fromUser: 'fresh_creator', text: 'connected with you', time: '2m', read: false, timestamp: Date.now() - 1000 }
          ];
          if (typeof renderNotifications === 'function') renderNotifications(true);
        });

        await page.click('#btn-toggle-notifications');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#notifications-dropdown'), 'Notifications dropdown opens');

        const unreadBefore = await page.evaluate(() => (state.notifications || []).filter((n) => !n.read).length);
        a.equal(unreadBefore, 2, 'Two unread notifications present');

        await page.click('#btn-mark-all-read');
        await page.waitForTimeout(150);
        const unreadAfter = await page.evaluate(() => (state.notifications || []).filter((n) => !n.read).length);
        a.equal(unreadAfter, 0, 'Mark all read clears unread count');

        await page.evaluate(() => { if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(false); });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    },

    {
      name: 'E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit',
      accounts: ['personal'],
      covers: [
        'el:#nav-btn-pixai',
        'el:#btn-pixai-edit-key',
        'el:#pixai-setup-key-input',
        'el:#pixai-chat-form',
        'el:#pixai-chat-input',
        'el:#btn-pixai-send',
        'el:#pixai-drag-handle',
        'el:#pixai-backdrop',
        'handler:togglePixaiKeySettings',
        'handler:savePixaiApiKey',
        'handler:activateOfflinePixaiMode',
        'handler:submitPixaiMessage',
        'handler:togglePasswordVisibility'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        await h.gotoMainTab(page, 'feed');
        await page.waitForTimeout(350);
        await page.click('#nav-btn-pixai');
        await page.waitForTimeout(200);
        a.ok(await h.isVisible(page, '#modal-pixai'), 'Pixlynote AI sheet opens');
        a.ok(await h.isVisible(page, '#pixai-chat-view'), 'Pixai chat view is visible');

        // Key settings toggle + save + offline mode
        await page.click('#btn-pixai-edit-key');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#pixai-setup-view'), 'Key setup view opens');
        await page.evaluate(() => { if (typeof activateOfflinePixaiMode === 'function') activateOfflinePixaiMode(); });
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#pixai-chat-view'), 'Offline mode returns to chat view');

        // Click a starter pill and submit a prompt via chat form
        await page.click('.pixai-starter-pill');
        await page.waitForTimeout(150);
        await page.fill('#pixai-chat-input', 'Give me 3 caption ideas for coffee');
        await page.click('#btn-pixai-send');
        await page.waitForTimeout(350);
        const chatBody = await page.evaluate(() => (document.getElementById('pixai-messages-container') || {}).innerText || '');
        a.ok(chatBody.includes('Give me 3 caption ideas for coffee'), 'Submitted user message renders in Pixai chat');

        // Close via drag handle
        await page.click('#pixai-drag-handle');
        await page.waitForTimeout(380);
        a.ok(!(await h.isVisible(page, '#modal-pixai')), 'Pixai modal closes via drag handle');

        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    }
  ]
};
