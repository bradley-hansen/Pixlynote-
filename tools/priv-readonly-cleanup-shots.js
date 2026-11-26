'use strict';

const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const OUT = '/workspace/pixlynote/priv-readonly-cleanup-shots';

function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.style.display = 'none';
    toast.classList.add('opacity-0', 'pointer-events-none');
    toast.classList.remove('opacity-100');
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8432) });
  try {
    const page = await h.newPage(session, { width: 390, height: 844 });
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.personal);
    await h.seedContent(page, h.ACCOUNTS.personal);
    await page.evaluate(() => {
      if (typeof switchMainTab === 'function') switchMainTab('feed');
      if (typeof renderFeed === 'function') renderFeed();
      if (typeof updateNoteComposerFab === 'function') updateNoteComposerFab();
    });
    await page.waitForTimeout(200);
    const firstActions = await page.$('.btn-focus-comment, .btn-share-post');
    if (firstActions) {
      await firstActions.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, '1-normal-feed-actions.png') });

    const endBtn = await page.$('.btn-feed-create-first');
    if (endBtn) {
      await endBtn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: path.join(OUT, '2-normal-feed-new-post.png') });

    // Privileged read-only view of @reg_personal as @reg_business
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.business);
    await page.evaluate(() => {
      const owner = { username: 'reg_personal', fullName: 'Reg Personal', email: 'reg.personal@example.test', phone: '5555550101', accountType: 'personal' };
      performLogin(owner.username, owner.fullName, owner.email, null, owner.phone, owner.accountType, owner, { privilegedReadOnly: true, viewer: 'reg_business' });
      if (typeof applyPrivilegedReadOnlyUi === 'function') applyPrivilegedReadOnlyUi();
      if (typeof switchMainTab === 'function') switchMainTab('feed');
      if (typeof renderFeed === 'function') renderFeed();
      if (typeof updateNoteComposerFab === 'function') updateNoteComposerFab();
    });
    await h.seedContent(page, h.ACCOUNTS.personal);
    await page.evaluate(() => {
      if (typeof applyPrivilegedReadOnlyUi === 'function') applyPrivilegedReadOnlyUi();
      if (typeof renderFeed === 'function') renderFeed();
      if (typeof updateNoteComposerFab === 'function') updateNoteComposerFab();
    });
    await page.waitForFunction(() => {
      const bar = document.getElementById('privileged-readonly-banner');
      return !!(bar && !bar.classList.contains('hidden') && getComputedStyle(bar).display !== 'none');
    }, null, { timeout: 4000 });
    await page.evaluate(hideToast);
    await page.evaluate(() => {
      const target = document.querySelector('article');
      if (target) {
        const likes = Array.from(target.querySelectorAll('div, span, p')).find((n) => /^\s*[\d,.]+\s+likes/i.test((n.textContent || '').trim()) && (n.textContent || '').trim().length < 40);
        (likes || target).scrollIntoView({ block: 'center' });
      }
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '3-privileged-feed-hidden.png') });

    await page.evaluate(() => {
      const btn = document.querySelector('.btn-open-discover-creators');
      const card = btn && (btn.closest('.rounded-2xl') || btn);
      if (card) card.scrollIntoView({ block: 'center' });
    });
    await page.evaluate(hideToast);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '4-privileged-feed-end.png') });

    // Invite card: pending then accepted, with a raw numeric time field
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.business);
    await page.evaluate(() => {
      window._incomingConnectRequests = { owner: '', list: [] };
      if (typeof setNotificationMode === 'function') setNotificationMode('all');
      state.notifications = [{
        type: 'privileged_access_invite',
        fromUser: 'reg_personal',
        fromFullName: 'Reg Personal',
        fromAvatar: '',
        fromAccountType: 'personal',
        text: 'invited you to have Privileged Access to @reg_personal',
        status: 'pending',
        read: false,
        time: Date.now()
      }];
      if (typeof renderNotifications === 'function') renderNotifications(true);
      if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(true);
      else {
        const dd = document.getElementById('notifications-dropdown');
        if (dd) { dd.classList.remove('hidden'); dd.style.display = 'block'; }
      }
    });
    await page.waitForSelector('.notif-priv-accept', { timeout: 4000 });
    await page.evaluate(hideToast);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, '5-invite-pending.png') });

    await page.evaluate(async () => {
      await respondToPrivilegedAccessInvite(0, true);
      if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(true);
      else {
        const dd = document.getElementById('notifications-dropdown');
        if (dd) { dd.classList.remove('hidden'); dd.style.display = 'block'; }
      }
    });
    await page.waitForSelector('.notif-priv-resolved', { timeout: 4000 });
    await page.evaluate(hideToast);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, '6-invite-accepted.png') });

    const check = await page.evaluate(() => {
      const fab = document.getElementById('btn-note-fab');
      const list = (document.getElementById('notifications-list') && document.getElementById('notifications-list').innerText) || '';
      return {
        pendingGone: !document.querySelector('.notif-priv-accept'),
        acceptedLabel: (document.querySelector('.notif-priv-resolved') || {}).textContent || '',
        listHasRaw: /\b\d{12,}\b/.test(list),
        listText: list.replace(/\s+/g, ' ').trim()
      };
    });
    console.log(JSON.stringify({ out: OUT, files: fs.readdirSync(OUT), check }, null, 2));
  } finally {
    await session.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
