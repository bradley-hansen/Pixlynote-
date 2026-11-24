'use strict';

/**
 * Heart-panel shortcut for pending connect requests on a private account.
 * One notification for one or many requests; tapping it opens the existing
 * Connect requests list. Incoming requests are mocked in-page; no Firestore writes.
 */

const fs = require('fs');
const path = require('path');
const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const SHOT = path.join(__dirname, '../../shots/connect-request-heart.png');

function reqDocs(n) {
  const now = Date.now();
  const all = [
    { username: 'maya_hikes', fullName: 'Maya Hikes', requestedAt: now },
    { username: 'jordan_lens', fullName: 'Jordan Lens', requestedAt: now - 60000 },
    { username: 'elena_eats', fullName: 'Elena Eats', requestedAt: now - 120000 }
  ];
  return all.slice(0, n);
}
const THREE = reqDocs(3);
const ONE = reqDocs(1);

async function withPrivateRequests(page, account, docs, fn) {
  await page.evaluate((payload) => {
    window.__crnSnap = {
      notifications: (state.notifications || []).slice(),
      isPrivate: !!(state.currentUser && state.currentUser.isPrivate),
      incoming: window._incomingConnectRequests,
      hash: window._lastRenderedNotifHash,
      notifMode: state.notifMode
    };
    state.currentUser.isPrivate = true;
    state.notifications = [];
    state.notifMode = 'highlights';
    window._acctPrivacy = window._acctPrivacy || {};
    window._acctPrivacy[payload.me] = true;
    try { localStorage.removeItem('pixly_conn_req_notif_seen_' + payload.me); } catch (e) {}
    window._incomingConnectRequests = { owner: '', list: [] };
    applyIncomingConnectRequests(payload.me, payload.docs);
  }, { me: account.username, docs: docs });
  try {
    await fn();
  } finally {
    await page.evaluate((me) => {
      const s = window.__crnSnap;
      if (s) {
        state.notifications = s.notifications;
        if (state.currentUser) state.currentUser.isPrivate = s.isPrivate;
        window._incomingConnectRequests = s.incoming || { owner: '', list: [] };
        window._lastRenderedNotifHash = s.hash;
        state.notifMode = s.notifMode;
      }
      if (window._acctPrivacy) delete window._acctPrivacy[me];
      try { localStorage.removeItem('pixly_conn_req_notif_seen_' + me); } catch (e) {}
      try { if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(false); } catch (e) {}
      try { if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal(); } catch (e) {}
      try { if (typeof renderNotifications === 'function') renderNotifications(true); } catch (e) {}
      window.__crnSnap = null;
    }, account.username);
  }
}

async function openHeart(page, h) {
  await page.evaluate(() => {
    if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(true);
    else if (typeof renderNotifications === 'function') renderNotifications(true);
  });
  await page.waitForSelector('#notifications-dropdown', { state: 'visible', timeout: 8000 });
}

function panelInfo(page) {
  return page.evaluate(() => {
    const dd = document.getElementById('notifications-dropdown');
    const list = document.getElementById('notifications-list');
    const rows = Array.from(list ? list.querySelectorAll('.notif-connect-requests') : []);
    const badge = document.getElementById('notif-badge');
    const empty = !!(list && /No Activity Yet/i.test(list.textContent || ''));
    const texts = rows.map((r) => (r.querySelector('.notif-connect-requests-text') || r).innerText.replace(/\s+/g, ' ').trim());
    const crView = document.getElementById('ac-view-connect-requests');
    const ac = document.getElementById('modal-account-center');
    return {
      panelOpen: !!(dd && !dd.classList.contains('hidden') && getComputedStyle(dd).display !== 'none'),
      rowCount: rows.length,
      texts,
      listText: (list && list.innerText) || '',
      empty,
      badgeOn: !!(badge && !badge.classList.contains('hidden') && getComputedStyle(badge).display !== 'none'),
      acOpen: !!(ac && !ac.classList.contains('hidden') && getComputedStyle(ac).display !== 'none'),
      crVisible: !!(crView && !crView.classList.contains('hidden')),
      crTitle: (document.getElementById('ac-header-title') || {}).textContent || '',
      listApprove: document.querySelectorAll('#ac-connect-requests-list .btn-approve-connect-request').length,
      listDecline: document.querySelectorAll('#ac-connect-requests-list .btn-decline-connect-request').length,
      listUsers: Array.from(document.querySelectorAll('#ac-connect-requests-list [data-request-user]')).map((el) => el.getAttribute('data-request-user')),
      display: (typeof notificationsForDisplay === 'function') ? notificationsForDisplay(state.notifications).map((n) => ({ type: n.type, text: n.text, read: n.read, users: n.users || [] })) : []
    };
  });
}

module.exports = {
  name: 'Connect request notification',
  tests: [
    {
      name: 'Connect request notif: unit helpers format one, many, and none and hide stored per-request rows',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['window.formatConnectRequestNotifText', 'window.buildConnectRequestNotification', 'window.notificationsForDisplay'],
      async run({ page, a }) {
        const r = await page.evaluate(() => {
          const one = [{ username: 'maya_hikes', requestedAt: 3 }];
          const many = [
            { username: 'maya_hikes', requestedAt: 3 },
            { username: 'jordan_lens', requestedAt: 2 },
            { username: 'elena_eats', requestedAt: 1 }
          ];
          const stored = [
            { type: 'connect_request', fromUser: 'maya_hikes', text: 'requested to connect with you.', read: false },
            { type: 'follow', fromUser: 'other_user', text: 'started following you.', read: false }
          ];
          return {
            noneText: formatConnectRequestNotifText([]),
            oneText: formatConnectRequestNotifText(one),
            manyText: formatConnectRequestNotifText(many),
            noneBuilt: buildConnectRequestNotification([]),
            oneBuilt: buildConnectRequestNotification(one),
            manyBuilt: buildConnectRequestNotification(many),
            display: notificationsForDisplay(stored).map((n) => ({ type: n.type, text: n.text }))
          };
        });
        a.equal(r.noneText, '', 'empty list has no text');
        a.equal(r.oneText, '@maya_hikes wants to connect', 'one request copy');
        a.equal(r.manyText, '3 connect requests', 'many request copy');
        a.equal(r.noneBuilt, null, 'no notification when the list is empty');
        a.equal(r.oneBuilt && r.oneBuilt.type, 'connect_requests', 'one built type');
        a.equal(r.oneBuilt && r.oneBuilt.fromUser, 'maya_hikes', 'one built fromUser');
        a.equal(r.manyBuilt && r.manyBuilt.text, '3 connect requests', 'many built text');
        a.equal((r.manyBuilt && r.manyBuilt.users || []).join(','), 'maya_hikes,jordan_lens,elena_eats', 'many built users');
        const types = (r.display || []).map((n) => n.type);
        a.ok(!types.includes('connect_request'), 'stored per-request rows are not displayed');
        a.ok(types.includes('follow'), 'other notifications still display');
      }
    },
    {
      name: 'Connect request notif: a private account with no pending requests does not see the shortcut',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#notifications-list', 'handler:renderNotifications'],
      async run({ page, h, a, account }) {
        await withPrivateRequests(page, account, [], async () => {
          await openHeart(page, h);
          const info = await panelInfo(page);
          a.ok(info.panelOpen, 'heart panel opens');
          a.equal(info.rowCount, 0, 'no connect-request row');
          a.ok(!info.display.some((n) => n.type === 'connect_requests'), 'display list has no shortcut');
        });
      }
    },
    {
      name: 'Connect request notif: one pending request shows "@name wants to connect" in the heart panel',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-toggle-notifications', 'el:#notifications-dropdown', 'el:#notifications-backdrop', 'handler:toggleNotificationsDropdown', 'handler:applyIncomingConnectRequests'],
      async run({ page, h, a, account }) {
        await withPrivateRequests(page, account, ONE, async () => {
          await openHeart(page, h);
          const info = await panelInfo(page);
          a.ok(info.panelOpen, 'heart panel opens');
          a.equal(info.rowCount, 1, 'exactly one connect-request notification');
          a.ok(info.texts.some((t) => /@maya_hikes wants to connect/.test(t)), 'single-request copy: ' + JSON.stringify(info.texts));
          a.ok(info.badgeOn, 'unread badge is on');
          a.ok(!info.empty, 'empty state is hidden');
        });
      }
    },
    {
      name: 'Connect request notif: several pending requests show one "N connect requests" row, not one per person',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#notifications-list', 'handler:renderNotifications', 'handler:applyIncomingConnectRequests'],
      async run({ page, h, a, account }) {
        await withPrivateRequests(page, account, THREE, async () => {
          await openHeart(page, h);
          const info = await panelInfo(page);
          a.equal(info.rowCount, 1, 'one grouped notification for three requests');
          a.ok(info.texts.some((t) => /^3 connect requests$/.test(t)), 'grouped copy: ' + JSON.stringify(info.texts));
          a.ok(!/@maya_hikes wants to connect/.test(info.listText), 'does not also show the single-request copy');
          a.equal(info.display.filter((n) => n.type === 'connect_requests').length, 1, 'display list has a single shortcut');
        });
      }
    },
    {
      name: 'Connect request notif: leftover stored connect_request items do not add extra heart rows',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['window.notificationsForDisplay'],
      async run({ page, h, a, account }) {
        await withPrivateRequests(page, account, ONE, async () => {
          await page.evaluate(() => {
            state.notifications = [
              { id: 1, type: 'connect_request', fromUser: 'maya_hikes', text: 'requested to connect with you.', timestamp: Date.now(), read: false },
              { id: 2, type: 'connect_request', fromUser: 'jordan_lens', text: 'requested to connect with you.', timestamp: Date.now() - 10, read: false }
            ];
            renderNotifications(true);
          });
          await openHeart(page, h);
          const info = await panelInfo(page);
          a.equal(info.rowCount, 1, 'still one shortcut row');
          a.ok(info.texts.some((t) => /@maya_hikes wants to connect/.test(t)), 'shows the live pending request, not leftover rows');
          a.ok(!/requested to connect with you/.test(info.listText), 'legacy per-request copy is hidden');
        });
      }
    },
    {
      name: 'Connect request notif: E2E: tapping the notification opens the existing Connect requests list',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['handler:openConnectRequestsFromNotification', 'handler:setAccountCenterView', 'handler:openAccountCenterModal', 'el:#ac-view-connect-requests', 'el:#ac-connect-requests-list', 'el:#btn-ac-tab-connect-requests'],
      async run({ page, h, a, account }) {
        await withPrivateRequests(page, account, THREE, async () => {
          await openHeart(page, h);
          const row = page.locator('#notifications-list .notif-connect-requests').first();
          await row.waitFor({ state: 'visible', timeout: 8000 });
          await row.click();
          await page.waitForFunction(() => {
            const cr = document.getElementById('ac-view-connect-requests');
            const ac = document.getElementById('modal-account-center');
            return !!(cr && !cr.classList.contains('hidden') && ac && !ac.classList.contains('hidden'));
          }, null, { timeout: 8000 });
          const info = await panelInfo(page);
          a.ok(!info.panelOpen, 'heart panel closes after the tap');
          a.ok(info.acOpen && info.crVisible, 'Account Center Connect requests view is open');
          a.equal(info.crTitle, 'Connect requests', 'header stays Connect requests');
          a.equal(info.listApprove, 3, 'list still has Approve for each request');
          a.equal(info.listDecline, 3, 'list still has Decline for each request');
          a.ok(info.listUsers.includes('maya_hikes') && info.listUsers.includes('jordan_lens') && info.listUsers.includes('elena_eats'), 'same request list: ' + JSON.stringify(info.listUsers));
        });
      }
    },
    {
      name: 'Connect request notif: the shortcut updates as requests are approved or declined, then goes away',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['handler:applyIncomingConnectRequests', 'handler:renderNotifications', 'window.markConnectRequestNotifSeen'],
      async run({ page, h, a, account }) {
        await withPrivateRequests(page, account, THREE, async () => {
          await openHeart(page, h);
          let info = await panelInfo(page);
          a.equal(info.texts[0], '3 connect requests', 'starts at 3');

          await page.evaluate((me) => {
            applyIncomingConnectRequests(me, [
              { username: 'maya_hikes', fullName: 'Maya Hikes', requestedAt: Date.now() }
            ]);
          }, account.username);
          info = await panelInfo(page);
          a.equal(info.rowCount, 1, 'still one row after two are cleared');
          a.ok(/@maya_hikes wants to connect/.test(info.texts[0] || ''), 'copy updates to the last requester: ' + JSON.stringify(info.texts));

          await page.evaluate((me) => { applyIncomingConnectRequests(me, []); }, account.username);
          info = await panelInfo(page);
          a.equal(info.rowCount, 0, 'row goes away when the last request is gone');
          a.ok(!info.display.some((n) => n.type === 'connect_requests'), 'display list drops the shortcut');
        });
      }
    },
    {
      name: 'Connect request notif: E2E: after a tap the shortcut stays until requests are gone, and Mark all read clears the badge',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['handler:markAllNotificationsRead', 'el:#btn-mark-all-read', 'el:#notif-badge'],
      async run({ page, h, a, account }) {
        await withPrivateRequests(page, account, ONE, async () => {
          await openHeart(page, h);
          let info = await panelInfo(page);
          a.ok(info.badgeOn, 'badge on before tap');
          await page.locator('#notifications-list .notif-connect-requests').first().click();
          await page.waitForTimeout(80);
          await page.evaluate(() => { if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal(); });
          await openHeart(page, h);
          info = await panelInfo(page);
          a.equal(info.rowCount, 1, 'shortcut remains while the request is still pending');
          a.ok(/@maya_hikes wants to connect/.test(info.texts[0] || ''), 'same copy after the tap');
          a.ok(!info.badgeOn, 'badge clears after the shortcut is opened');

          await page.evaluate((me) => {
            try { localStorage.removeItem('pixly_conn_req_notif_seen_' + me); } catch (e) {}
            renderNotifications(true);
          }, account.username);
          info = await panelInfo(page);
          a.ok(info.badgeOn, 'badge returns when a request is unseen again');
          await page.evaluate(() => { if (typeof markAllNotificationsRead === 'function') markAllNotificationsRead(); });
          info = await panelInfo(page);
          a.equal(info.rowCount, 1, 'Mark all read does not remove a still-pending shortcut');
          a.ok(!info.badgeOn, 'Mark all read clears the badge');
        });
      }
    },
    {
      name: 'Connect request notif: preview screenshot of the heart panel for @reg_personal with three pending requests',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        await h.gotoMainTab(page, 'home');
        await withPrivateRequests(page, account, THREE, async () => {
          if (typeof h.hideToasts === 'function') await h.hideToasts(page);
          await openHeart(page, h);
          const row = page.locator('#notifications-list .notif-connect-requests').first();
          await row.waitFor({ state: 'visible', timeout: 8000 });
          const info = await panelInfo(page);
          a.ok(info.panelOpen && info.rowCount === 1 && /3 connect requests/.test(info.texts[0] || ''), 'panel is ready for the screenshot: ' + JSON.stringify(info.texts));
          fs.mkdirSync(path.dirname(SHOT), { recursive: true });
          await page.screenshot({ path: SHOT, fullPage: false });
          a.ok(fs.existsSync(SHOT) && fs.statSync(SHOT).size > 1000, 'Heart-panel screenshot was saved');
        });
      }
    }
  ]
};
