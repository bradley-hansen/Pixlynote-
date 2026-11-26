'use strict';

/**
 * Privileged Access per-permission grants, owner switch-back, and the delegate avatar (t1041u, t1044u, t1045u).
 * - The owner picks what a delegate may do: Post posts, Post notes, Like, Comment, Send DMs, Edit profile,
 *   Delete posts, View Billing History and stats, Spend on Promote. All off = read only (old grants migrate as is).
 * - A delegate session hides/blocks every ungranted action; granted ones work and are stamped delegatedBy.
 * - Switching back to an account you own (its own sign-in is still held here) opens full access, with a
 *   read-only delegate view toggle. A delegate who is not the owner never gets full access.
 * Nothing is written to production Firestore (the harness blocks it).
 */

const ALL_GRANTS = ['post', 'note', 'like', 'comment', 'dm', 'editProfile', 'deletePost', 'billing', 'promote'];

async function fresh(ctx) {
  const { page, h, account } = ctx;
  await page.evaluate(() => { try { clearPrivilegedReadOnlySession(); } catch (e) {} try { closeAccountCenterModal(); } catch (e) {} try { closeAccountSwitcher(); } catch (e) {} });
  await h.loginAs(page, account);
}

async function enterDelegate(page, owner, viewer, grants) {
  await page.evaluate(({ owner, viewer, grants }) => {
    savePrivilegedAccountsList(viewer, [{ username: owner.username, status: 'accepted' }]);
    const acc = { username: owner.username, fullName: owner.fullName, email: '', phone: '', accountType: owner.accountType || 'personal' };
    performLogin(acc.username, acc.fullName, '', null, '', acc.accountType, acc, { privilegedReadOnly: true, viewer: viewer, grants: grants });
    try { switchMainTab('feed'); } catch (e) {}
    try { renderFeed(); } catch (e) {}
    try { renderProfile(); } catch (e) {}
  }, { owner, viewer, grants });
  await page.waitForTimeout(150);
}

function viewerFor(account) { return account.username === 'pixlynote' ? 'reg_business' : 'pixlynote'; }

module.exports = {
  name: 'Privileged Access grants, owner switch-back, delegate avatar',
  tests: [
    {
      name: 'Grant picker: nine actions, all off by default; the invite saves the picked grants; Edit changes them later',
      accounts: 'all',
      covers: [
        'el:#ac-priv-grant-picker',
        'el:#ac-priv-grant-options',
        'handler:renderPrivilegedGrantOptions',
        'handler:privilegedGrantChecksHtml',
        'handler:readPrivilegedGrantChecks',
        'handler:updatePrivilegedGrants',
        'handler:normalizePrivilegedGrants',
        'handler:privilegedGrantLabel'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await fresh(ctx);
        const other = account.username === 'reg_personal' ? 'reg_business' : 'reg_personal';
        await page.evaluate((other) => {
          const prev = window._exploreUserDir || {};
          const users = (prev.users && typeof prev.users.set === 'function') ? prev.users : new Map();
          users.set(other, Object.assign({ username: other, fullName: 'Other ' + other, avatar: '', accountType: 'personal', likedPostIds: [], likedNoteIds: [], deletedNoteIds: [], deletedPostIds: [], following: [], deactivated: false }, users.get(other) || {}));
          window._exploreUserDir = Object.assign({}, prev, { users });
          // A grant made before per-permission grants existed (no grants list): must show as read only.
          localStorage.setItem('pixly_priv_granted_' + state.currentUser.username.toLowerCase(), JSON.stringify([{ username: 'legacy_delegate', status: 'accepted', grantedAt: 1 }]));
        }, other);
        await h.openOwnerMenu(page);
        await page.evaluate(() => {
          if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
          if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
          else if (typeof openAccountCenter === 'function') openAccountCenter();
        });
        await page.waitForTimeout(200);
        if (await page.$('#btn-ac-open-your-account')) { await page.click('#btn-ac-open-your-account'); await page.waitForTimeout(80); }
        await page.click('#btn-ac-tab-privileged-access');
        await page.waitForTimeout(250);
        const picker = await page.evaluate(() => {
          const cbs = Array.from(document.querySelectorAll('#ac-priv-grant-options input.ac-priv-grant-cb'));
          return { keys: cbs.map((c) => c.getAttribute('data-grant')), checked: cbs.filter((c) => c.checked).length,
            labels: Array.from(document.querySelectorAll('#ac-priv-grant-options label')).map((l) => l.textContent.trim()),
            visible: !!document.getElementById('ac-priv-grant-picker') && document.getElementById('ac-priv-grant-picker').offsetParent !== null,
            legacy: (document.querySelector('.ac-priv-granted-row[data-username="legacy_delegate"] .ac-priv-grant-summary') || {}).textContent || '' };
        });
        a.equal(picker.keys.join(','), 'post,note,like,comment,dm,editProfile,deletePost,billing,promote', 'nine grant options in order');
        a.ok(picker.labels.includes('Post posts') && picker.labels.includes('Spend on Promote') && picker.labels.includes('View Billing History and stats'), 'grant labels');
        a.equal(picker.checked, 0, 'all grants start off (read only)');
        a.ok(picker.visible, 'grant picker is visible to the owner');
        a.equal(picker.legacy.trim(), 'Read only', 'an older grant with no grants list migrates as read only');

        // Pick Like + Comment, invite.
        await page.fill('#ac-priv-username-input', other);
        await page.evaluate((other) => selectPrivilegedInviteUser(other), other);
        await page.check('#ac-priv-grant-options input[data-grant="like"]');
        await page.check('#ac-priv-grant-options input[data-grant="comment"]');
        await page.click('#btn-ac-grant-privileged');
        await page.waitForTimeout(250);
        const saved = await page.evaluate((other) => {
          const list = getPrivilegedGrantedList(state.currentUser.username);
          const e = list.find((g) => g.username === other) || {};
          return { grants: e.grants, status: e.status,
            reset: Array.from(document.querySelectorAll('#ac-priv-grant-options input:checked')).length,
            summary: (document.querySelector('.ac-priv-granted-row[data-username="' + other + '"] .ac-priv-grant-summary') || {}).textContent || '' };
        }, other);
        a.equal(JSON.stringify(saved.grants), JSON.stringify(['like', 'comment']), 'invite stores the picked grants');
        a.equal(saved.status, 'pending', 'invite still needs to be accepted');
        a.equal(saved.reset, 0, 'picker resets to all off after the invite');
        a.ok(/Like, Comment/.test(saved.summary), 'granted row shows what they can do');

        // Edit later: turn on Post posts, turn off Comment.
        await page.click('.ac-priv-granted-row[data-username="' + other + '"] .ac-priv-edit-grants-btn');
        await page.check('.ac-priv-granted-row[data-username="' + other + '"] input.ac-priv-edit-grant-cb[data-grant="post"]');
        await page.uncheck('.ac-priv-granted-row[data-username="' + other + '"] input.ac-priv-edit-grant-cb[data-grant="comment"]');
        await page.click('.ac-priv-granted-row[data-username="' + other + '"] .ac-priv-save-grants-btn');
        await page.waitForTimeout(200);
        const edited = await page.evaluate((other) => (getPrivilegedGrantedList(state.currentUser.username).find((g) => g.username === other) || {}).grants, other);
        a.equal(JSON.stringify(edited), JSON.stringify(['post', 'like']), 'owner edits grants later');
        const bad = await page.evaluate(() => normalizePrivilegedGrants(['like', 'admin', 'like', 'promote', 7]));
        a.equal(JSON.stringify(bad), JSON.stringify(['like', 'promote']), 'unknown grants are dropped');
        await page.evaluate(() => { try { localStorage.removeItem('pixly_priv_granted_' + state.currentUser.username.toLowerCase()); } catch (e) {} try { closeAccountCenterModal(); } catch (e) {} });
        await fresh(ctx);
      }
    },

    {
      name: 'Delegate session with only some grants: granted actions work, everything else stays hidden and blocked',
      accounts: 'all',
      covers: ['handler:privilegedHasGrant', 'handler:privilegedHasAnyGrant', 'handler:privilegedDelegateStamp', 'el:#privileged-readonly-banner-text'],
      async run(ctx) {
        const { page, a, account } = ctx;
        await fresh(ctx);
        const viewer = viewerFor(account);
        await enterDelegate(page, account, viewer, ['like', 'comment']);
        const r = await page.evaluate(() => {
          const shown = (sel) => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none'; };
          const cls = document.body.classList;
          const id = 'pg-like-probe';
          if (!state.posts.some((p) => String(p.id) === id)) state.posts.push({ id, author: 'someone_else', image: (state.posts[0] && state.posts[0].image) || '', caption: 'probe', likes: 0, likedBy: [], comments: [] });
          const before = state.likedPostIds && state.likedPostIds.has(id);
          togglePostLike(id);
          const after = state.likedPostIds && state.likedPostIds.has(id);
          const p = state.posts.find((x) => String(x.id) === id);
          const probe = p ? Object.assign({}, p) : null;
          state.posts = state.posts.filter((x) => String(x.id) !== id);
          if (state.likedPostIds) state.likedPostIds.delete(id);
          return {
            ro: isPrivilegedReadOnly(), like: privilegedHasGrant('like'), comment: privilegedHasGrant('comment'),
            post: privilegedHasGrant('post'), dm: privilegedHasGrant('dm'), any: privilegedHasAnyGrant(),
            clsLike: cls.contains('priv-grant-like'), clsPost: cls.contains('priv-grant-post'),
            blockedPost: privilegedActionBlocked('post'), blockedDm: privilegedActionBlocked('dm'), blockedEdit: privilegedActionBlocked('editProfile'),
            blockedPromote: privilegedActionBlocked('promote'), blockedBilling: privilegedActionBlocked('billing'), blockedDelete: privilegedActionBlocked('deletePost'),
            allowedLike: !privilegedActionBlocked('like'), allowedComment: !privilegedActionBlocked('comment'), blockedNoGrantArg: privilegedActionBlocked(),
            likeWorked: before !== after, likeBy: probe && probe.likeDelegates ? probe.likeDelegates[state.currentUser.username.toLowerCase()] : '',
            createHidden: !shown('#nav-btn-create'), editHidden: !shown('#btn-edit-profile'),
            likeBtnShown: !document.querySelector('.btn-like-post') || shown('.btn-like-post'),
            commentFormShown: !document.querySelector('.feed-comment-form') || shown('.feed-comment-form'),
            messagesHidden: !document.getElementById('btn-open-messages') || !shown('#btn-open-messages'),
            stamp: privilegedDelegateStamp().delegatedBy,
            banner: (document.getElementById('privileged-readonly-banner-text') || {}).textContent || ''
          };
        });
        a.ok(r.ro && r.like && r.comment && r.any, 'delegate session with Like and Comment');
        a.ok(!r.post && !r.dm, 'ungranted actions are off');
        a.ok(r.clsLike && !r.clsPost, 'body grant classes follow the grants');
        a.ok(r.blockedPost && r.blockedDm && r.blockedEdit && r.blockedPromote && r.blockedBilling && r.blockedDelete && r.blockedNoGrantArg, 'ungranted actions fail safely');
        a.ok(r.allowedLike && r.allowedComment, 'granted actions are allowed');
        a.ok(r.likeWorked, 'a granted like goes through');
        a.equal(r.likeBy, viewer, 'the like records the delegate');
        a.ok(r.createHidden, 'create stays hidden');
        a.ok(r.editHidden, 'edit profile stays hidden');
        a.ok(r.messagesHidden, 'messages stay hidden');
        a.ok(r.likeBtnShown && r.commentFormShown, 'like and comment controls are shown');
        a.equal(r.stamp, viewer, 'stamp names the delegate');
        a.ok(/You can: Like, Comment/.test(r.banner), 'banner lists what the delegate can do: ' + r.banner);

        // No grants at all = the old read-only behavior.
        await enterDelegate(page, account, viewer, []);
        const ro = await page.evaluate(() => ({ any: privilegedHasAnyGrant(), like: privilegedActionBlocked('like'), banner: document.getElementById('privileged-readonly-banner-text').textContent,
          cls: ['post', 'note', 'like', 'comment', 'dm', 'editProfile', 'deletePost', 'billing', 'promote'].some((k) => document.body.classList.contains('priv-grant-' + k)) }));
        a.ok(!ro.any && ro.like && !ro.cls, 'no grants = read only');
        a.ok(/read only/.test(ro.banner), 'read-only banner text');
        await fresh(ctx);
      }
    },

    {
      name: 'Delegate avatar: posts, notes, comments, likes and DMs a delegate makes show "by @delegate" with their avatar',
      accounts: 'all',
      covers: ['handler:privilegedDelegateBadgeHtml', 'handler:privilegedLikeDelegatesHtml', 'handler:privilegedDelegateAvatar', 'el:#modal-post-delegate', 'el:#modal-like-delegates', 'el:#note-modal-delegate'],
      async run(ctx) {
        const { page, a, account } = ctx;
        await fresh(ctx);
        const viewer = viewerFor(account);
        await enterDelegate(page, account, viewer, ALL_GRANTS);
        const r = await page.evaluate((viewer) => {
          const me = state.currentUser.username;
          // Post (create flow stamps the new post).
          const stamp = privilegedDelegateStamp();
          const post = Object.assign({ id: Date.now() + 7, author: me, authorName: me, image: (state.posts[0] && state.posts[0].image) || '', caption: 'made by delegate', likes: 0, likedBy: [], comments: [], timestamp: 'JUST NOW' }, stamp);
          post.comments.push(Object.assign({ id: 1, user: me, text: 'delegate comment', likedBy: [], replies: [] }, stamp));
          post.likedBy = [me]; post.likeDelegates = { [me]: viewer };
          state.posts.unshift(post);
          switchMainTab('feed'); renderFeed();
          const card = document.querySelector('.post-card[data-post-id="' + post.id + '"]');
          const badges = card ? Array.from(card.querySelectorAll('.pixly-delegate-badge')).map((b) => b.textContent.trim()) : [];
          const img = card ? card.querySelector('.pixly-delegate-badge img') : null;
          openPostDetailModal(post.id);
          const modalBadge = (document.getElementById('modal-post-delegate') || {}).textContent || '';
          const modalLikes = (document.getElementById('modal-like-delegates') || {}).textContent || '';
          const modalComment = Array.from(document.querySelectorAll('#modal-comments-list .pixly-delegate-badge')).length;
          try { closePostDetailModal(); } catch (e) {}
          // Note.
          const note = Object.assign({ id: Date.now() + 9, author: me, authorName: me, text: 'delegate note', time: 'Just now', likes: 0, replies: 0, audience: 'public' }, stamp);
          state.notes = [note].concat(state.notes || []);
          openNoteDetailModal(note.id);
          const noteBadge = (document.getElementById('note-modal-delegate') || {}).textContent || '';
          try { closeNoteDetailModal(); } catch (e) {}
          const owner = privilegedDelegateBadgeHtml('');
          return { badges, hasImg: !!(img && img.getAttribute('src')), modalBadge, modalLikes, modalComment, noteBadge, owner,
            dmBadge: privilegedDelegateBadgeHtml({ delegatedBy: viewer }), postStamp: post.delegatedBy };
        }, viewer);
        a.equal(r.postStamp, viewer, 'new post is stamped with the delegate');
        a.ok(r.badges.filter((t) => t === 'by @' + viewer).length >= 2, 'feed card shows the badge on the post, the like and the comment: ' + JSON.stringify(r.badges));
        a.ok(r.hasImg, 'badge carries the delegate avatar');
        a.ok(/by @/.test(r.modalBadge) && r.modalBadge.includes(viewer), 'post detail shows "by @delegate"');
        a.ok(r.modalLikes.includes('Liked for @') && r.modalLikes.includes(viewer), 'like shows who did it');
        a.ok(r.modalComment >= 1, 'comment in post detail shows the badge');
        a.ok(r.noteBadge.includes('by @' + viewer), 'note detail shows the badge');
        a.equal(r.owner, '', 'nothing is shown for the owner\'s own items');
        a.ok(r.dmBadge.includes('by @' + viewer), 'DM badge html');
        await fresh(ctx);
      }
    },

    {
      name: 'Delegate writes are stamped: post, note, comment and DM made with grants carry delegatedBy',
      accounts: ['personal', 'business'],
      covers: [],
      async run(ctx) {
        const { page, a, account } = ctx;
        await fresh(ctx);
        const viewer = viewerFor(account);
        await enterDelegate(page, account, viewer, ['post', 'note', 'comment', 'dm']);
        const r = await page.evaluate(() => {
          // Note via the composer form.
          const inp = document.getElementById('note-input-text');
          if (inp) inp.value = 'note from delegate';
          const form = document.getElementById('note-compose-form');
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          const note = (state.notes || []).find((n) => n.text === 'note from delegate');
          // Comment via the feed form, on a post seeded here so earlier suites cannot change which card is first.
          const pid = 990000000 + Math.floor(Math.random() * 1000);
          state.posts.unshift({ id: pid, author: 'someone_else', authorName: 'Someone', image: (state.posts[0] && state.posts[0].image) || '', caption: 'comment probe', likes: 0, likedBy: [], comments: [], timestamp: 'JUST NOW' });
          switchMainTab('feed'); renderFeed();
          const cform = document.querySelector('.feed-comment-form[data-post-id="' + pid + '"]');
          let comment = null;
          let diag = { hadForm: !!cform, forms: document.querySelectorAll('.feed-comment-form').length };
          if (cform) {
            cform.querySelector('.feed-comment-input').value = 'comment from delegate';
            const btn = cform.querySelector('button[type="submit"]');
            if (cform.requestSubmit) cform.requestSubmit(btn || undefined); else cform.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            const p = state.posts.find((x) => x.id === pid);
            comment = p && (p.comments || []).find((c) => c.text === 'comment from delegate');
            diag.comments = p ? (p.comments || []).length : -1;
            state.posts = state.posts.filter((x) => x.id !== pid);
          }
          // DM.
          state.messages = state.messages && state.messages.length ? state.messages : [{ user: 'dm_friend', name: 'DM Friend', chat: [] }];
          state.activeDmThreadIndex = 0;
          let dmInp = document.getElementById('dm-input-text');
          if (!dmInp) { dmInp = document.createElement('input'); dmInp.id = 'dm-input-text'; document.body.appendChild(dmInp); }
          dmInp.value = 'dm from delegate';
          handleSendDirectMessage({ preventDefault() {} });
          const thread = state.messages.find((t) => (t.chat || []).some((m) => m.text === 'dm from delegate'));
          const dm = thread && thread.chat.find((m) => m.text === 'dm from delegate');
          return { note: note && note.delegatedBy, comment: comment && comment.delegatedBy, hadForm: !!cform, diag, dm: dm && dm.delegatedBy,
            likeBlocked: privilegedActionBlocked('like') };
        });
        a.equal(r.note, viewer, 'note stamped');
        a.ok(r.hadForm, 'feed comment form is shown with the Comment grant: ' + JSON.stringify(r.diag));
        a.equal(r.comment, viewer, 'comment stamped: ' + JSON.stringify(r.diag));
        a.equal(r.dm, viewer, 'DM stamped');
        a.ok(r.likeBlocked, 'Like stays blocked when not granted');
        // Delegate with Edit profile still cannot change the username.
        await enterDelegate(page, account, viewer, ['editProfile']);
        const ok = await page.evaluate(() => privilegedHasGrant('editProfile') && !privilegedActionBlocked('editProfile') && privilegedActionBlocked('post'));
        a.ok(ok, 'Edit profile grant allows profile edits only');
        await fresh(ctx);
      }
    },

    {
      name: 'Billing History and stats and Spend on Promote follow their grants in a delegate session',
      accounts: ['personal', 'business'],
      covers: [],
      async run(ctx) {
        const { page, a, account } = ctx;
        await fresh(ctx);
        const viewer = viewerFor(account);
        await page.evaluate(() => { window.__pixlyBillingFixture = async () => [{ id: 'cs_test_pg', data: { kind: 'promote', item: 'Promote post', amountCents: 2500, status: 'paid', createdAt: Date.now(), delegatedBy: 'pixlynote' } }]; });
        await enterDelegate(page, account, viewer, []);
        const none = await page.evaluate(async () => (await loadBillingHistory(true)).length);
        a.equal(none, 0, 'read-only delegate cannot see Billing History');
        await enterDelegate(page, account, viewer, ['billing', 'promote']);
        const yes = await page.evaluate(async () => {
          const recs = await loadBillingHistory(true);
          return { n: recs.length, by: recs[0] && recs[0].delegatedBy, badge: !!document.querySelector('#billing-history-list .billing-delegate .pixly-delegate-badge'),
            promote: !privilegedActionBlocked('promote'), stats: !privilegedActionBlocked('billing'), promoteClass: document.body.classList.contains('priv-grant-promote') };
        });
        a.equal(yes.n, 1, 'billing grant shows Billing History');
        a.equal(yes.by, 'pixlynote', 'receipt keeps who bought it');
        a.ok(yes.badge, 'receipt bought by a delegate shows the badge');
        a.ok(yes.promote && yes.stats && yes.promoteClass, 'Spend on Promote and stats allowed by their grants');
        await page.evaluate(() => { delete window.__pixlyBillingFixture; });
        await fresh(ctx);
      }
    },

    {
      name: 'Owner switch-back: switching back to an account you own opens full access, with a read-only delegate view toggle',
      accounts: ['personal', 'business', 'empty'],
      covers: [
        'el:#account-switcher-delegate-view',
        'el:#btn-switcher-delegate-view',
        'el:#btn-priv-banner-full-access',
        'handler:openOwnerDelegateView',
        'handler:switchPrivilegedToFullAccess',
        'handler:ownerDelegateViewer',
        'handler:paintOwnerDelegateViewToggle',
        'handler:privilegedGrantsFromOwnerDoc',
        'handler:openSwitchPasswordFor'
      ],
      async run(ctx) {
        const { page, a, account } = ctx;
        await fresh(ctx); // signed in as the owner -> its own sign-in is kept
        const owner = account.username;
        const del = owner === 'reg_business' ? 'reg_empty' : 'reg_business';
        const r1 = await page.evaluate(async ({ owner, del }) => {
          const kept = window.pixlyOwnerSessions.list().includes(owner);
          registerSessionAccount({ username: del, fullName: 'Delegate', accountType: 'business' });
          savePrivilegedAccountsList(del, [{ username: owner, status: 'accepted' }]);
          window.__pixlyPrivTargetDoc = (u) => ({ username: u, privilegedAccessGranted: [{ username: del, status: 'accepted', grants: ['like'] }] });
          // Switch to the delegate account (normal login), then back to the owner through the switcher.
          performLogin(del, 'Delegate', '', null, '', 'business');
          await requestAccountSwitchWithAuth({ username: owner, fullName: owner, accountType: 'personal' });
          await new Promise((res) => setTimeout(res, 150));
          return { kept, user: state.currentUser.username, ro: isPrivilegedReadOnly() };
        }, { owner, del });
        a.ok(r1.kept, 'owner sign-in is kept after a real owner login');
        a.equal(String(r1.user).toLowerCase(), owner, 'switched back to the owner');
        a.ok(!r1.ro, 'owner gets full access, not the read-only delegate view');

        // Toggle to the read-only delegate view and back.
        const r2 = await page.evaluate(async () => {
          openAccountSwitcher();
          const wrap = document.getElementById('account-switcher-delegate-view');
          const shown = wrap && !wrap.classList.contains('hidden');
          const label = document.getElementById('btn-switcher-delegate-view').textContent;
          document.getElementById('btn-switcher-delegate-view').click();
          const ro = isPrivilegedReadOnly(), preview = state.privilegedOwnerPreview;
          const fullBtn = document.getElementById('btn-priv-banner-full-access');
          const fullShown = fullBtn && !fullBtn.classList.contains('hidden') && getComputedStyle(document.getElementById('privileged-readonly-banner')).display !== 'none';
          const likeBlocked = privilegedActionBlocked('like');
          fullBtn.click();
          await new Promise((res) => setTimeout(res, 100));
          return { shown, label, ro, preview, fullShown, likeBlocked, back: !isPrivilegedReadOnly() };
        });
        a.ok(r2.shown, 'switcher offers the delegate view to the owner');
        a.ok(/read only/.test(r2.label), 'toggle label: ' + r2.label);
        a.ok(r2.ro && r2.preview, 'toggle opens the read-only delegate view');
        a.ok(r2.likeBlocked, 'the preview is strictly read only (no grants)');
        a.ok(r2.fullShown, 'banner offers "Switch to full access"');
        a.ok(r2.back, 'back to full access');

        // A delegate who is NOT the owner (no kept owner sign-in) still gets the delegate view with its grants.
        const r3 = await page.evaluate(async ({ owner, del }) => {
          window.pixlyOwnerSessions.forget(owner);
          performLogin(del, 'Delegate', '', null, '', 'business');
          await requestAccountSwitchWithAuth({ username: owner, fullName: owner, accountType: 'personal' });
          await new Promise((res) => setTimeout(res, 150));
          const out = { user: state.currentUser.username, ro: isPrivilegedReadOnly(), grants: (state.privilegedGrants || []).slice(), viewer: state.privilegedViewer };
          // "Switch to full access" without the owner sign-in asks for the owner's password; it never just opens.
          await switchPrivilegedToFullAccess();
          const modal = document.getElementById('modal-switch-password');
          out.pwAsked = !!modal && getComputedStyle(modal).display !== 'none';
          out.stillRo = isPrivilegedReadOnly();
          closeSwitchPasswordModal();
          return out;
        }, { owner, del });
        a.equal(String(r3.user).toLowerCase(), owner, 'delegate opens the owner account');
        a.ok(r3.ro, 'non-owner delegate is in the delegate view');
        a.equal(JSON.stringify(r3.grants), JSON.stringify(['like']), 'grants come from the owner\'s doc');
        a.equal(r3.viewer, del, 'viewer is the delegate');
        a.ok(r3.pwAsked && r3.stillRo, 'full access needs the owner password when no owner sign-in is held');

        // Signing out clears every kept owner sign-in.
        const cleared = await page.evaluate(async ({ owner }) => {
          window.pixlyOwnerSessions.remember(owner);
          await new Promise((res) => setTimeout(res, 20));
          performLogout();
          await new Promise((res) => setTimeout(res, 50));
          return window.pixlyOwnerSessions.list().length;
        }, { owner });
        a.equal(cleared, 0, 'sign out clears kept owner sign-ins');
        await page.evaluate(() => { delete window.__pixlyPrivTargetDoc; });
        await fresh(ctx);
      }
    }
  ]
};
