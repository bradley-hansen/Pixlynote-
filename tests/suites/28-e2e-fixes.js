'use strict';

/**
 * Unit + UI E2E tests for the grokbot/fix-e2e-2026-11-22 fixes:
 * account switcher, desktop DMs, delete confirm, Sparkle AI prefill/pools, Sparkle on comments/replies,
 * feed "..." menu (Copy link / Not interested / Submit feedback), grouped notifications + Highlights/All,
 * filterDmThreads null guards, and the Pixai close/reopen race.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function fresh(page, h, account, vp) {
  const port = Number(new URL(page.url()).port);
  await page.setViewportSize(vp || { width: 390, height: 844 });
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
  return port;
}
async function reset(page, h, account, port) {
  await page.unroute('**/support/feedback').catch(() => {});
  await page.setViewportSize({ width: 390, height: 844 });
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
}
async function shown(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, sel);
}
async function seedFeed(page) {
  await page.evaluate((img) => {
    const me = state.currentUser.username;
    const now = Date.now();
    const mk = (id, author, tags, ts) => ({ id, author, authorName: author, authorAvatar: img, image: img, caption: 'Post ' + id, tags, likes: 0, comments: [], createdAtMs: ts });
    state.following = (state.following || []).concat([{ username: 'tag_spammer', fullName: 'Tag Spammer', isFollowing: true }, { username: 'calm_creator', fullName: 'Calm Creator', isFollowing: true }]);
    state.posts = state.posts.filter(p => ![8801, 8802, 8803, 8804, 8805].includes(Number(p.id)));
    state.posts.unshift(
      mk(8801, 'tag_spammer', ['#crypto'], now - 1000),
      mk(8802, 'tag_spammer', ['#crypto'], now - 2000),
      mk(8803, 'calm_creator', ['#coffee'], now - 3000),
      mk(8804, 'calm_creator', ['#crypto'], now - 4000),
      mk(8805, me, ['#mine'], now - 500)
    );
    try { localStorage.removeItem('pixly_not_interested_' + me.toLowerCase()); } catch (e) {}
    window._pixlyNotInterested = {};
    // The harness hides welcome toasts after login; bring the toast element back for Undo checks.
    ['toast', 'toast-text', 'toast-action'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    renderFeed();
  }, IMG);
}

module.exports = {
  name: 'E2E Fixes 2026-11-22',
  tests: [
    {
      name: 'Fix 1: Account switcher Log in / Create account while signed in show the right auth card on every account',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-switcher-login', 'el:#btn-switcher-signup', 'handler:openAuthFromSwitcher', 'handler:setAuthMode'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          a.equal(await page.evaluate(() => typeof window.setAuthMode), 'function', 'setAuthMode is exposed on window');
          const read = () => page.evaluate(() => {
            const vis = (id) => { const el = document.getElementById(id); return !!(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'); };
            return { splash: vis('splash-container'), card: vis('auth-card-container'), login: vis('auth-login-container'), signup: vis('auth-signup-container'), ret: vis('auth-return-session-wrap'), main: vis('main-view') };
          });
          await page.click('#btn-header-profile');
          await page.waitForTimeout(150);
          await page.click('#btn-switcher-signup');
          await page.waitForTimeout(200);
          let st = await read();
          a.ok(!st.splash && st.card && st.signup && !st.login, 'Create a new account opens Signup (got ' + JSON.stringify(st) + ')');
          a.ok(st.ret, 'Return to session link is visible');
          a.ok(!st.main, 'Main view is hidden while adding an account');
          await page.click('#btn-auth-return-session');
          await page.waitForTimeout(200);
          st = await read();
          const prefill = await page.inputValue('#login-username');
          a.ok(st.card && st.login && prefill === account.username, 'Return to session asks for the password of @' + account.username + ' (got ' + prefill + ')');

          // Fresh session: Log into another account
          await h.loadApp(page, { port });
          await h.loginAs(page, account);
          await page.click('#btn-header-profile');
          await page.waitForTimeout(150);
          await page.click('#btn-switcher-login');
          await page.waitForTimeout(200);
          st = await read();
          a.ok(!st.splash && st.card && st.login && !st.signup && st.ret, 'Log into another account opens Login with Return to session (got ' + JSON.stringify(st) + ')');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Fix 2/8: DMs thread row + Chat open the chat panel on desktop and mobile; filterDmThreads tolerates missing fields',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#dm-chat-panel', 'el:#dm-sidebar', 'handler:filterDmThreads', 'handler:handleDmMobileBack'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account, { width: 1280, height: 800 });
        try {
          await page.evaluate(() => {
            state.messages = [
              { id: 't1', user: 'amalfi_dreaming', name: 'Amalfi Dreaming', avatar: '', lastMsg: 'Ciao!', time: '1m', unread: 1, chat: [{ sender: 'them', text: 'Ciao!', time: '10:00 AM', timestamp: Date.now() - 60000 }] },
              { id: 't2', user: undefined, name: undefined, lastMsg: null, chat: [] }
            ];
            state.activeDmThreadIndex = 0;
          });
          await h.gotoMainTab(page, 'feed');
          await page.click('#btn-open-messages');
          await page.waitForTimeout(150);
          a.ok(await shown(page, '#dm-sidebar'), 'Desktop: thread list visible');
          a.ok(await shown(page, '#dm-chat-panel'), 'Desktop: chat panel visible next to the list');
          await page.locator('#dm-thread-list .dm-thread-item').first().click();
          await page.waitForTimeout(120);
          a.ok(await shown(page, '#dm-input-text'), 'Desktop: input visible after clicking a conversation row');
          await page.fill('#dm-input-text', 'Desktop hello');
          await page.click('#btn-dm-send');
          await page.waitForTimeout(120);
          const txt = await page.evaluate(() => document.getElementById('dm-messages-container').innerText);
          a.ok(txt.includes('Desktop hello'), 'Desktop: sent message shows in the thread');
          const err = await page.evaluate(() => { try { filterDmThreads('amalfi'); filterDmThreads('zzz'); filterDmThreads(''); return ''; } catch (e) { return String(e); } });
          a.equal(err, '', 'filterDmThreads does not throw on threads without name/user');
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(100);
          await page.evaluate(() => handleDmMobileBack());
          await page.waitForTimeout(80);
          a.ok(!(await shown(page, '#dm-chat-panel')), 'Mobile: Back hides the chat panel');
          await page.locator('#dm-thread-list .dm-thread-item').first().click();
          await page.waitForTimeout(120);
          a.ok(await shown(page, '#dm-input-text'), 'Mobile: row opens the thread input');
          a.ok(!(await shown(page, '#dm-sidebar')), 'Mobile: list hidden while a thread is open');
          // Malformed thread records must not break opening a chat from a profile.
          const openErr = await page.evaluate(() => { try { openDirectMessageWithUser('fresh_creator', 'Fresh Creator', ''); return ''; } catch (e) { return String(e); } });
          a.equal(openErr, '', 'openDirectMessageWithUser tolerates a thread without a user');
        } finally {
          await page.evaluate((u) => { try { state.messages = []; localStorage.removeItem('pixly_dms_' + u); } catch (e) {} }, account.username.toLowerCase()).catch(() => {});
          await reset(page, h, account, port);
        }
      }
    },
    {
      name: 'Fix 3: Delete Post asks first; Cancel, backdrop and Escape keep the post, Delete removes it',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#modal-delete-confirm', 'el:#btn-cancel-delete', 'el:#btn-confirm-delete', 'handler:requestDeletePostConfirm', 'handler:confirmDeletePostConfirm'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          const has = () => page.evaluate(() => state.posts.some(p => String(p.id) === '3001'));
          await page.evaluate(() => openPostDetailModal(3001));
          await page.waitForTimeout(150);
          await page.click('#btn-modal-delete-post');
          await page.waitForTimeout(100);
          a.ok(await h.isVisible(page, '#modal-delete-confirm'), 'Confirm modal opens');
          a.ok(await has(), 'Post not deleted before confirming');
          await page.click('#btn-cancel-delete');
          await page.waitForTimeout(80);
          a.ok(!(await h.isVisible(page, '#modal-delete-confirm')) && await has(), 'Cancel closes and keeps post');
          await page.click('#btn-modal-delete-post');
          await page.waitForTimeout(80);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(80);
          a.ok(!(await h.isVisible(page, '#modal-delete-confirm')) && await has(), 'Escape closes and keeps post');
          await page.click('#btn-modal-delete-post');
          await page.waitForTimeout(80);
          await page.mouse.click(5, 5);
          await page.waitForTimeout(80);
          a.ok(!(await h.isVisible(page, '#modal-delete-confirm')) && await has(), 'Backdrop click closes and keeps post');
          await page.click('#btn-modal-delete-post');
          await page.waitForTimeout(80);
          await page.click('#btn-confirm-delete');
          await page.waitForTimeout(200);
          a.ok(!(await has()), 'Delete removes the post');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Fix 4/9: Sparkle AI prefill never goes stale, keeps typed text, finds posts in every pool, and survives a quick reopen',
      accounts: ['personal'],
      covers: ['handler:findContentByKindId', 'handler:paintPixaiContentContext', 'handler:clearPixaiContentContext', 'handler:closePixaiModal'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          const pools = await page.evaluate((img) => {
            window._explorePaged.posts = [{ id: 'pg1', author: 'paged_user', caption: 'paged', image: img }];
            window._exploreUserDir = window._exploreUserDir || { users: new Map(), notes: new Map() };
            window._exploreUserDir.posts = [{ id: 'dir1', author: 'dir_user', caption: 'dir', image: img }];
            window._userProfilePosts = [{ id: 'up1', author: 'profile_user', caption: 'prof', image: img }];
            return ['pg1', 'dir1', 'up1'].map(id => (findContentByKindId('post', id) || {}).author || null);
          }, IMG);
          a.equal(pools.join(','), 'paged_user,dir_user,profile_user', 'findContentByKindId searches paged, directory and profile pools');
          const val = () => page.inputValue('#pixai-chat-input');
          await page.evaluate(() => openPixaiWithContent({ kind: 'post', id: 'pg1', author: 'paged_user', text: '' }));
          await page.waitForTimeout(120);
          a.ok((await val()).includes('@paged_user'), 'First prefill set');
          await page.evaluate(() => openPixaiWithContent({ kind: 'note', id: 'n1', author: 'note_author', text: 'Hello note' }));
          await page.waitForTimeout(120);
          a.ok((await val()).includes('note by @note_author') && !(await val()).includes('paged_user'), 'Untouched prefill is replaced when switching content while open');
          await page.fill('#pixai-chat-input', 'My own question');
          await page.evaluate(() => openPixaiWithContent({ kind: 'post', id: 'dir1', author: 'dir_user', text: 'dir' }));
          await page.waitForTimeout(120);
          a.equal(await val(), 'My own question', 'Typed text is never overwritten');
          await page.fill('#pixai-chat-input', '');
          await page.evaluate(() => openPixaiWithContent({ kind: 'post', id: 'up1', author: 'profile_user', text: '' }));
          await page.waitForTimeout(80);
          await page.evaluate(() => closePixaiModal());
          await page.waitForTimeout(380);
          a.equal(await val(), '', 'Closing clears an unsent auto-prefill');
          await page.evaluate(() => openPixaiWithContent({ kind: 'post', id: 'pg1', author: 'paged_user', text: '' }));
          await page.waitForTimeout(80);
          await page.evaluate(() => { closePixaiModal(); setTimeout(() => openPixaiWithContent({ kind: 'post', id: 'dir1', author: 'dir_user', text: 'dir' }), 60); });
          await page.waitForTimeout(500);
          const race = await page.evaluate(() => ({ vis: !document.getElementById('modal-pixai').classList.contains('hidden'), ctx: window._pixaiContentContext && window._pixaiContentContext.author }));
          a.ok(race.vis, 'Modal stays open after a quick close/reopen');
          a.equal(race.ctx, 'dir_user', 'Reopened context is not wiped by the stale close timer');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Fix 5: Sparkle AI on comments and replies in post modal, note modal and profile Replies tab, with reply context',
      accounts: ['personal', 'business'],
      covers: ['handler:openPixaiWithContentFromEl', 'handler:findCommentContentForPixai', 'handler:buildPixaiOutgoingMessage'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          await page.evaluate(() => {
            const p = state.posts.find(x => String(x.id) === '2123');
            p.comments = [{ id: 701, user: 'alice_test', text: 'Top comment', likedBy: [], replies: [{ id: 702, user: 'bob_test', text: 'Nested reply text', likedBy: [] }] }];
            const n = state.notes.find(x => String(x.id) === '9101');
            n.comments = [{ id: 801, user: 'carol_test', text: 'Note comment', likedBy: [], replies: [{ id: 802, user: 'dave_test', text: 'Note reply text', likedBy: [] }] }];
            openPostDetailModal(2123);
          });
          await page.waitForTimeout(200);
          const postBtns = await page.evaluate(() => ({
            comment: document.querySelectorAll('#modal-post-detail .btn-pixai-content[data-kind="comment"]').length,
            reply: document.querySelectorAll('#modal-post-detail .btn-pixai-content[data-kind="reply"]').length
          }));
          a.ok(postBtns.comment >= 1 && postBtns.reply >= 1, 'Post modal: Sparkle on comment and reply ' + JSON.stringify(postBtns));
          await page.click('#modal-post-detail .btn-pixai-content[data-kind="reply"]');
          await page.waitForTimeout(200);
          const banner = await page.evaluate(() => document.getElementById('pixai-content-context').textContent);
          a.ok(/reply by @bob_test on @explore_alice's post/.test(banner) && banner.includes('Nested reply text'), 'Reply context banner: ' + banner);
          const out = await page.evaluate(() => buildPixaiOutgoingMessage('Summarize'));
          a.ok(out.includes('reply by @bob_test') && out.includes('post by @explore_alice'), 'Outgoing message carries reply + parent context');
          await page.evaluate(() => { closePixaiModal(); if (typeof closePostDetailModal === 'function') closePostDetailModal(); });
          await page.waitForTimeout(380);
          await page.evaluate(() => openNoteDetailModal(9101));
          await page.waitForTimeout(200);
          const noteBtns = await page.evaluate(() => ({
            comment: document.querySelectorAll('#modal-note-detail .btn-pixai-content[data-kind="comment"]').length,
            reply: document.querySelectorAll('#modal-note-detail .btn-pixai-content[data-kind="reply"]').length
          }));
          a.ok(noteBtns.comment >= 1 && noteBtns.reply >= 1, 'Note modal: Sparkle on comment and reply ' + JSON.stringify(noteBtns));
          await page.click('#modal-note-detail .btn-pixai-content[data-kind="comment"]');
          await page.waitForTimeout(200);
          const nb = await page.evaluate(() => document.getElementById('pixai-content-context').textContent);
          a.ok(/comment by @carol_test on @explore_alice's note/.test(nb), 'Note comment banner: ' + nb);
          await page.evaluate(() => { closePixaiModal(); if (typeof closeNoteDetailModal === 'function') closeNoteDetailModal(); });
          await page.waitForTimeout(380);
          const me = account.username;
          const repliesBtn = await page.evaluate((me) => {
            const p = state.posts.find(x => String(x.id) === '2123');
            p.comments[0].replies.push({ id: 703, user: me, text: 'My profile reply', likedBy: [] });
            const el = document.createElement('div');
            el.id = 'tmp-replies-list';
            document.body.appendChild(el);
            renderReplies(me, 'tmp-replies-list');
            const b = el.querySelector('.btn-pixai-content');
            return b ? { kind: b.dataset.kind, id: b.dataset.id } : null;
          }, me);
          a.ok(repliesBtn && (repliesBtn.kind === 'reply' || repliesBtn.kind === 'comment'), 'Profile Replies tab card has a Sparkle button ' + JSON.stringify(repliesBtn));
          await page.evaluate(() => document.querySelector('#tmp-replies-list .btn-pixai-content').click());
          await page.waitForTimeout(200);
          const pb = await page.evaluate(() => document.getElementById('pixai-content-context').textContent);
          a.ok(pb.includes('@' + me), 'Profile reply Sparkle opens Pixai about my reply: ' + pb);
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Fix 6a: Feed ... menu Copy link really copies the post URL; own posts hide Not interested; Escape/outside click close it',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#post-options-menu', 'el:#btn-post-menu-copy', 'handler:openPostOptionsMenu', 'handler:copyPostLink'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          await seedFeed(page);
          await h.gotoMainTab(page, 'feed');
          await page.evaluate(() => {
            window.__copied = [];
            try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } }); } catch (e) {}
          });
          await page.click('.btn-post-options[data-post-id="8801"]');
          await page.waitForTimeout(100);
          a.ok(await h.isVisible(page, '#post-options-menu'), 'Menu opens');
          a.ok(await h.isVisible(page, '#btn-post-menu-not-interested'), 'Not interested shown on someone else\'s post');
          await page.click('#btn-post-menu-copy');
          await page.waitForTimeout(150);
          const copied = await page.evaluate(() => window.__copied.slice());
          a.ok(copied.length === 1 && /\?post=8801$/.test(copied[0]), 'Clipboard got the post link: ' + JSON.stringify(copied));
          a.ok(!(await h.isVisible(page, '#post-options-menu')), 'Menu closes after Copy link');
          const toast = await page.evaluate(() => document.getElementById('toast-text').textContent);
          a.ok(/copied/i.test(toast), 'Copied toast: ' + toast);
          await page.click('.btn-post-options[data-post-id="8805"]');
          await page.waitForTimeout(100);
          a.ok(!(await h.isVisible(page, '#btn-post-menu-not-interested')), 'Not interested hidden on your own post');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(60);
          a.ok(!(await h.isVisible(page, '#post-options-menu')), 'Escape closes the menu');
          await page.click('.btn-post-options[data-post-id="8801"]');
          await page.waitForTimeout(60);
          await page.mouse.click(5, 400);
          await page.waitForTimeout(60);
          a.ok(!(await h.isVisible(page, '#post-options-menu')), 'Outside click closes the menu');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Fix 6b: Not interested hides the post, down-ranks the author and tags for this account only, and Undo restores it',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-post-menu-not-interested', 'el:#toast-action', 'handler:markPostNotInterested', 'handler:undoNotInterested', 'handler:notInterestedPenalty'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          await seedFeed(page);
          await h.gotoMainTab(page, 'feed');
          const order = () => page.evaluate(() => [...document.querySelectorAll('#posts-stream .btn-post-options')].map(b => b.dataset.postId).filter(id => ['8801', '8802', '8803', '8804', '8805'].includes(id)));
          const before = await order();
          a.ok(before.indexOf('8802') < before.indexOf('8803'), 'Before: newer tag_spammer post ranks above calm_creator ' + before.join(','));
          await page.click('.btn-post-options[data-post-id="8801"]');
          await page.waitForTimeout(80);
          await page.click('#btn-post-menu-not-interested');
          await page.waitForTimeout(150);
          const after = await order();
          a.ok(!after.includes('8801'), 'Hidden post is gone from the feed');
          a.ok(after.indexOf('8802') > after.indexOf('8803'), 'Same-author post is down-ranked below unrelated post ' + after.join(','));
          const stored = await page.evaluate((u) => JSON.parse(localStorage.getItem('pixly_not_interested_' + u) || 'null'), account.username.toLowerCase());
          a.ok(stored && stored.postIds.includes('8801') && stored.authors.tag_spammer === 1 && stored.tags.crypto === 1, 'Stored per account: ' + JSON.stringify(stored));
          const pen = await page.evaluate(() => ({ sameAuthor: notInterestedPenalty({ author: 'tag_spammer', tags: [] }), sharedTag: notInterestedPenalty({ author: 'x', tags: ['#crypto'] }), unrelated: notInterestedPenalty({ author: 'x', tags: ['#tea'] }) }));
          a.ok(pen.sameAuthor > 0 && pen.sharedTag > 0 && pen.unrelated === 0, 'Penalty: ' + JSON.stringify(pen));
          const ex = await page.evaluate((img) => {
            window._exploreUserDir = null;
            window._exploreCloudPosts = new Map([['8801', { id: 8801, author: 'tag_spammer', image: img, tags: ['#crypto'] }], ['9990', { id: 9990, author: 'calm2', image: img, tags: [] }]]);
            return getRealExplorePosts().map(p => String(p.id));
          }, IMG);
          a.ok(!ex.includes('8801') && ex.includes('9990'), 'Explore also hides it: ' + ex.join(','));
          a.ok(await h.isVisible(page, '#toast-action'), 'Undo button shown in toast');
          await page.click('#toast-action');
          await page.waitForTimeout(150);
          const undone = await order();
          a.ok(undone.includes('8801') && undone.indexOf('8802') < undone.indexOf('8803'), 'Undo restores post and ranking ' + undone.join(','));
          await page.evaluate(() => markPostNotInterested(8802));
          const other = account.key === 'personal' ? 'business' : 'personal';
          await h.loginAs(page, h.ACCOUNTS[other]);
          const otherHidden = await page.evaluate(() => isPostNotInterested({ id: 8802 }));
          a.ok(!otherHidden, 'Not interested is per account (other account still sees it)');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto',
      accounts: ['personal', 'pixlynote'],
      covers: ['el:#btn-post-menu-help', 'el:#btn-post-menu-feedback', 'el:#modal-submit-feedback', 'el:#form-submit-feedback', 'el:#feedback-category', 'el:#feedback-message', 'el:#btn-feedback-send', 'el:#btn-feedback-cancel', 'el:#btn-feedback-close', 'el:#feedback-mailto-link', 'handler:submitPostFeedback'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          await seedFeed(page);
          await h.gotoMainTab(page, 'feed');
          const openFb = async () => {
            await page.click('.btn-post-options[data-post-id="8803"]');
            await page.waitForTimeout(80);
            await page.click('#btn-post-menu-help');
            await page.waitForTimeout(60);
            a.ok(await h.isVisible(page, '#btn-post-menu-feedback'), 'Help expands Submit feedback');
            await page.click('#btn-post-menu-feedback');
            await page.waitForTimeout(100);
          };
          await openFb();
          a.ok(await h.isVisible(page, '#modal-submit-feedback'), 'Feedback modal opens');
          const ctxText = await page.evaluate(() => document.getElementById('feedback-context').textContent);
          a.ok(ctxText.includes('@calm_creator'), 'Context names the post author: ' + ctxText);
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(80);
          const err = await page.evaluate(() => document.getElementById('feedback-status').textContent);
          a.ok(/describe/i.test(err), 'Empty message is rejected: ' + err);
          await page.click('#btn-feedback-cancel');
          await page.waitForTimeout(60);
          a.ok(!(await h.isVisible(page, '#modal-submit-feedback')), 'Cancel closes');
          let captured = null;
          await page.route('**/support/feedback', async (route) => {
            captured = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
          });
          await openFb();
          await page.selectOption('#feedback-category', 'content');
          await page.fill('#feedback-message', 'This post looks like spam');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          a.ok(captured && captured.to === 'support@pixlynote.com' && captured.category === 'content' && captured.postId === '8803' && captured.username === account.username.toLowerCase(), 'Worker payload: ' + JSON.stringify(captured));
          a.ok(!(await h.isVisible(page, '#modal-submit-feedback')), 'Modal closes after a successful send');
          await page.unroute('**/support/feedback');
          await page.route('**/support/feedback', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' }));
          await page.evaluate(() => { window.__mailto = []; window.__pixlyOpenMailto = (href) => window.__mailto.push(href); });
          await openFb();
          await page.fill('#feedback-message', 'Feature idea: dark mode');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          const mt = await page.evaluate(() => window.__mailto.slice());
          a.ok(mt.length === 1 && mt[0].startsWith('mailto:support@pixlynote.com?subject=') && decodeURIComponent(mt[0]).includes('Feature idea: dark mode'), 'mailto fallback: ' + (mt[0] || '').slice(0, 80));
          a.ok(await h.isVisible(page, '#feedback-mailto-link'), 'Manual email link shown as a backup');
          await page.click('#btn-feedback-close');
          await page.waitForTimeout(60);
          a.ok(!(await h.isVisible(page, '#modal-submit-feedback')), 'Close (x) closes');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Fix 7a: grouped like text formatting and priority tiers (unit)',
      accounts: ['personal'],
      covers: ['handler:formatGroupedLikeText', 'handler:notifPriorityTier', 'handler:buildNotificationDisplayGroups'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const users = Array.from({ length: 17 }, (_, i) => 'user' + (i + 1));
          return {
            one: formatGroupedLikeText(['a'], 'photo'),
            two: formatGroupedLikeText(['a', 'b'], 'photo'),
            three: formatGroupedLikeText(['a', 'b', 'c'], 'photo'),
            four: formatGroupedLikeText(['a', 'b', 'c', 'd'], 'photo'),
            many: formatGroupedLikeText(users, 'photo'),
            note: formatGroupedLikeText(['a', 'b'], 'note'),
            tiers: ['privileged_access_invite', 'mention', 'comment_post', 'follow', 'like_post', 'share_post'].map(t => notifPriorityTier({ type: t }))
          };
        });
        a.equal(r.one, '@a liked your photo', '1 liker');
        a.equal(r.two, '@a and @b liked your photo', '2 likers');
        a.equal(r.three, '@a, @b and @c liked your photo', '3 likers');
        a.equal(r.four, '@a, @b, @c and 1 other liked your photo', '4 likers');
        a.equal(r.many, '@user1, @user2, @user3 and 14 others liked your photo', '17 likers');
        a.equal(r.note, '@a and @b liked your note', 'Note likes say note');
        a.equal(r.tiers.join(','), '0,1,1,2,3,3', 'Tiers');
        const g = await page.evaluate(() => {
          const now = Date.now();
          const list = [
            { id: 1, type: 'like_post', fromUser: 'a', postId: 5, timestamp: now - 10 },
            { id: 2, type: 'like_post', fromUser: 'b', postId: 5, timestamp: now - 20 },
            { id: 3, type: 'like_post', fromUser: 'a', postId: 5, timestamp: now - 30 },
            { id: 4, type: 'like_post', fromUser: 'c', postId: 6, timestamp: now - 40 },
            { id: 5, type: 'like_note', fromUser: 'd', noteId: 5, timestamp: now - 50 },
            { id: 6, type: 'follow', fromUser: 'e', timestamp: now - 60 }
          ];
          const all = buildNotificationDisplayGroups(list, 'all');
          const hi = buildNotificationDisplayGroups(list, 'highlights');
          return { allLen: all.length, firstUsers: all[0].users.join(','), firstMembers: all[0].members.length, hiFirst: list[hi[0].rep].type };
        });
        a.equal(g.allLen, 4, 'Likes on post 5 merge; post 6 and note 5 stay separate');
        a.equal(g.firstUsers, 'a,b', 'Group users are unique, newest first');
        a.equal(g.firstMembers, 3, 'Group keeps all 3 raw notifications');
        a.equal(g.hiFirst, 'follow', 'Highlights puts the connection above likes');
      }
    },
    {
      name: 'Fix 7b: grouped like row with stacked avatars, click marks the group read, Highlights/All toggle persists per account',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-notif-tab-highlights', 'el:#btn-notif-tab-all', 'handler:setNotificationMode', 'el:#notifications-list'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          await page.evaluate((img) => {
            const now = Date.now();
            const likes = Array.from({ length: 17 }, (_, i) => ({ id: 100 + i, type: 'like_post', fromUser: 'liker' + (i + 1), text: 'liked your photo.', postId: 3001, postImage: img, timestamp: now - (i + 1) * 1000, read: false }));
            state.notifications = likes.concat([
              { id: 200, type: 'mention', fromUser: 'mention_user', text: 'mentioned you in a comment: "hi"', postId: 3001, timestamp: now - 600000, read: false },
              { id: 201, type: 'follow', fromUser: 'follow_user', text: 'connected with you.', timestamp: now - 900000, read: false }
            ]);
            state.notifMode = null;
            try { localStorage.removeItem('pixly_notif_mode_' + state.currentUser.username.toLowerCase()); } catch (e) {}
            renderNotifications(true);
            toggleNotificationsDropdown(true);
          }, IMG);
          await page.waitForTimeout(150);
          const rows = () => page.evaluate(() => [...document.querySelectorAll('#notifications-list .notif-item')].map(el => ({ text: el.innerText.replace(/\s+/g, ' ').trim(), group: el.classList.contains('notif-group'), avatars: el.querySelectorAll('.notif-avatar-stack img').length })));
          let r = await rows();
          a.equal(r.length, 3, 'Highlights: 17 likes collapse into 1 row (+ mention + follow)');
          a.ok(/mentioned/.test(r[0].text) && /connected/.test(r[1].text), 'Highlights order: mention, connection, then likes');
          a.ok(r[2].group && /@liker1, @liker2, @liker3 and 14 others liked your photo/.test(r[2].text), 'Grouped text: ' + r[2].text);
          a.equal(r[2].avatars, 3, 'Stacked avatars show 3 likers');
          await page.click('#btn-notif-tab-all');
          await page.waitForTimeout(100);
          r = await rows();
          a.ok(r[0].group && /mentioned/.test(r[1].text), 'All: newest first (likes group first)');
          const stored = await page.evaluate((u) => localStorage.getItem('pixly_notif_mode_' + u), account.username.toLowerCase());
          a.equal(stored, 'all', 'Mode saved per account');
          await page.click('#notifications-list .notif-group');
          await page.waitForTimeout(150);
          const unreadLikes = await page.evaluate(() => state.notifications.filter(n => n.type === 'like_post' && !n.read).length);
          a.equal(unreadLikes, 0, 'Clicking the group marks all 17 likes read');
          const others = await page.evaluate(() => state.notifications.filter(n => n.type !== 'like_post' && !n.read).length);
          a.equal(others, 2, 'Other notifications stay unread');
        } finally { await reset(page, h, account, port); }
      }
    }
  ]
};
