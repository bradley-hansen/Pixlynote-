'use strict';

/**
 * Privileged Access: searchable userbase picklist for invites, and a
 * read-only session when switching in without a password.
 * Nothing is written to production Firestore.
 */

function seedInviteDirectory(users) {
  return {
    users: users || [
      { username: 'reg_personal', fullName: 'Reg Personal', avatar: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', accountType: 'personal' },
      { username: 'reg_business', fullName: 'Reg Business', avatar: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', accountType: 'business' },
      { username: 'reg_empty', fullName: 'Reg Empty', avatar: '', accountType: 'personal' }
    ]
  };
}

async function applyInviteDirectory(page, extra) {
  const seeded = seedInviteDirectory();
  await page.evaluate((payload) => {
    const prev = window._exploreUserDir || {};
    const users = (prev.users && typeof prev.users.set === 'function') ? prev.users : new Map();
    (payload.users || []).forEach((u) => {
      const existing = users.get(u.username) || {};
      users.set(u.username, Object.assign({
        likedPostIds: [],
        likedNoteIds: [],
        deletedNoteIds: [],
        deletedPostIds: [],
        following: [],
        deactivated: false
      }, existing, u));
    });
    // Merge into the existing directory. Do not replace notes or bump `at`,
    // so later Explore tests on this same page still have their seeded records.
    window._exploreUserDir = Object.assign({}, prev, { users: users });
  }, { users: seeded.users.concat(extra || []) });
}

async function openPrivilegedAccessView(page, h) {
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
    if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    else if (typeof openAccountCenter === 'function') openAccountCenter();
  });
  await page.waitForTimeout(200);
  const your = await page.$('#btn-ac-open-your-account');
  if (your) {
    await page.click('#btn-ac-open-your-account');
    await page.waitForTimeout(80);
  }
  await page.click('#btn-ac-tab-privileged-access');
  await page.waitForTimeout(150);
}

async function enterPrivilegedView(page, owner, viewer) {
  await page.evaluate(({ owner, viewer }) => {
    const acc = {
      username: owner.username,
      fullName: owner.fullName,
      email: owner.email || '',
      phone: owner.phone || '',
      accountType: owner.accountType || 'personal'
    };
    if (typeof savePrivilegedAccountsList === 'function') {
      savePrivilegedAccountsList(viewer.username, [{ username: owner.username, status: 'accepted' }]);
    } else {
      try {
        localStorage.setItem('pixly_priv_accounts_' + String(viewer.username).toLowerCase(), JSON.stringify([{ username: owner.username, status: 'accepted' }]));
      } catch (e) {}
    }
    performLogin(acc.username, acc.fullName, acc.email, null, acc.phone, acc.accountType, acc, { privilegedReadOnly: true, viewer: viewer.username });
    if (typeof applyPrivilegedReadOnlyUi === 'function') applyPrivilegedReadOnlyUi();
    try { if (typeof switchMainTab === 'function') switchMainTab('feed'); } catch (e) {}
    try { if (typeof renderFeed === 'function') renderFeed(); } catch (e) {}
    try { if (typeof renderProfile === 'function') renderProfile(); } catch (e) {}
  }, { owner, viewer });
  await page.waitForTimeout(150);
}

module.exports = {
  name: 'Privileged Access picklist and read-only',
  tests: [
    {
      name: 'Privileged Access invite uses a searchable userbase picklist and only a real picked user can be invited',
      accounts: ['personal'],
      covers: [
        'el:#ac-priv-username-input',
        'el:#ac-priv-user-list',
        'el:#ac-priv-selected-chip',
        'el:#ac-priv-invite-picker',
        'el:#btn-ac-grant-privileged',
        'el:#btn-ac-tab-privileged-access',
        'listener:#ac-priv-username-input:input',
        'listener:#ac-priv-username-input:focus',
        'listener:#ac-priv-username-input:keydown',
        'handler:filterPrivilegedInviteUsers',
        'handler:selectPrivilegedInviteUser',
        'handler:clearPrivilegedInviteUser',
        'handler:searchPrivilegedInviteCandidates',
        'handler:lookupPrivilegedInviteUser',
        'handler:paintPrivilegedInviteList',
        'handler:grantPrivilegedAccessToUser'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await applyInviteDirectory(page);
        await openPrivilegedAccessView(page, h);
        a.ok(await h.isVisible(page, '#ac-view-privileged-access'), 'Privileged Access view opens');

        const grantDisabled = await page.evaluate(() => {
          const btn = document.getElementById('btn-ac-grant-privileged');
          return !!(btn && btn.disabled);
        });
        a.ok(grantDisabled, 'Invite starts disabled until a person is picked');

        const copy = await page.evaluate(() => (document.querySelector('#ac-view-privileged-access') || {}).innerText || '');
        a.ok(/read-only/i.test(copy), 'Grant copy says access is read-only');

        await page.fill('#ac-priv-username-input', 'notarealuserxyz');
        await page.waitForTimeout(120);
        const typoState = await page.evaluate(() => {
          const list = document.getElementById('ac-priv-user-list');
          const text = (list && list.innerText) || '';
          const btn = document.getElementById('btn-ac-grant-privileged');
          return {
            shown: !!(list && !list.classList.contains('hidden')),
            empty: /No accounts found/i.test(text),
            disabled: !!(btn && btn.disabled)
          };
        });
        a.ok(typoState.shown && typoState.empty, 'A typo shows that no matching account was found');
        a.ok(typoState.disabled, 'Invite stays disabled when the typed name is not a real user');

        await page.evaluate(() => { if (typeof grantPrivilegedAccessToUser === 'function') grantPrivilegedAccessToUser('notarealuserxyz'); });
        await page.waitForTimeout(80);
        const typoGrant = await page.evaluate(() => ((document.getElementById('ac-privileged-granted-list') || {}).innerText || ''));
        a.ok(!/@notarealuserxyz/i.test(typoGrant), 'Typing a name that is not in the userbase cannot send an invite');

        await page.fill('#ac-priv-username-input', 'reg_bus');
        await page.waitForTimeout(160);
        const pick = await page.evaluate(() => {
          const list = document.getElementById('ac-priv-user-list');
          const row = list && list.querySelector('.ac-priv-user-row[data-username="reg_business"]');
          const img = row && row.querySelector('img');
          const text = (row && row.innerText) || '';
          return {
            open: !!(list && !list.classList.contains('hidden')),
            hasRow: !!row,
            hasName: text.includes('Reg Business'),
            hasHandle: text.includes('@reg_business'),
            hasAvatar: !!(img && img.getAttribute('src'))
          };
        });
        a.ok(pick.open && pick.hasRow, 'As you type, matching people appear in a picklist');
        a.ok(pick.hasName && pick.hasHandle, 'Picklist rows show display name and @username');
        a.ok(pick.hasAvatar, 'Picklist rows show an avatar');

        await page.click('#ac-priv-user-list .ac-priv-user-row[data-username="reg_business"]');
        await page.waitForTimeout(80);
        const selected = await page.evaluate(() => {
          const chip = document.getElementById('ac-priv-selected-chip');
          const text = (chip && chip.innerText) || '';
          const btn = document.getElementById('btn-ac-grant-privileged');
          const list = document.getElementById('ac-priv-user-list');
          return {
            chip: !!(chip && !chip.classList.contains('hidden') && text.includes('Reg Business') && text.includes('@reg_business')),
            enabled: !!(btn && !btn.disabled),
            listClosed: !list || list.classList.contains('hidden'),
            picked: !!(window._privInviteSelected && window._privInviteSelected.username === 'reg_business')
          };
        });
        a.ok(selected.chip && selected.picked, 'Picking a person shows a chip with their name and @username');
        a.ok(selected.enabled, 'Invite enables after a real user is picked');
        a.ok(selected.listClosed, 'Picklist closes after a person is chosen');

        await page.click('#btn-ac-grant-privileged');
        await page.waitForTimeout(180);
        const grantedText = await page.evaluate(() => (document.getElementById('ac-privileged-granted-list') || {}).innerText || '');
        a.ok(grantedText.includes('@reg_business'), 'Invite to the picked account appears in the Granted list');
        await h.seedContent(page, account);
      }
    },

    {
      name: 'Privileged Access switch is read-only: actions are hidden and fail safely; a normal login keeps full access',
      accounts: ['business'],
      covers: [
        'el:#privileged-readonly-banner',
        'el:#nav-btn-create',
        'el:#btn-edit-profile',
        'handler:isPrivilegedReadOnly',
        'handler:privilegedActionBlocked',
        'handler:setPrivilegedReadOnlySession',
        'handler:clearPrivilegedReadOnlySession',
        'handler:restorePrivilegedReadOnlySession',
        'handler:applyPrivilegedReadOnlyUi',
        'handler:requestAccountSwitchWithAuth',
        'handler:hasAcceptedPrivilegedAccess',
        'handler:openCreatePostModal',
        'handler:handleCreatePostAction',
        'handler:togglePostLike',
        'handler:toggleSavePost',
        'handler:applyLocalFollowToggle',
        'handler:handleSendDirectMessage',
        'handler:saveUserProfile',
        'handler:submitNoteModalComment',
        'handler:sendConnectRequest',
        'handler:sendDmQuickReaction',
        'handler:confirmCancelMembership',
        'handler:openCancelMembershipConfirm',
        'handler:cancelStripeSubscriptionForAccount',
        'handler:markStripeCheckoutInitiated',
        'handler:markStripePortalVisit',
        'handler:wireStripeBuyButton',
        'handler:persistCurrentUserSubscription',
        'handler:saveEditedContent',
        'handler:confirmDeactivateAccount',
        'handler:openDeactivateConfirmModal',
        'el:#btn-stripe-cancel-membership',
        'el:#btn-stripe-billing-portal',
        'el:#pixly-stripe-buy-btn',
        'el:#form-ac-change-password',
        'el:.btn-feed-create-first',
        'el:.btn-focus-comment',
        'el:.btn-dm-share-post',
        'el:.btn-share-post',
        'el:#btn-open-messages',
        'handler:openMessagesModal',
        'handler:openDmShareModal',
        'el:#btn-note-fab',
        'handler:updateNoteComposerFab',
        'handler:isNoteFabContextVisible',
        'handler:setNoteComposerExpanded'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        // Own account still has full write access.
        const ownAccess = await page.evaluate(() => {
          const create = document.getElementById('nav-btn-create');
          const display = create ? getComputedStyle(create).display : 'none';
          const id = 'priv-ro-like-probe';
          if (!state.posts) state.posts = [];
          if (!state.posts.some((p) => p && String(p.id) === id)) {
            state.posts.push({
              id: id,
              author: (state.currentUser && state.currentUser.username) || 'reg_business',
              authorName: (state.currentUser && state.currentUser.fullName) || 'Reg Business',
              image: (state.posts[0] && state.posts[0].image) || '',
              caption: 'probe',
              likes: 0,
              likedBy: [],
              comments: []
            });
          }
          if (!state.likedPostIds) state.likedPostIds = new Set();
          const before = state.likedPostIds.has(id) || state.likedPostIds.has(String(id));
          if (typeof togglePostLike === 'function') togglePostLike(id);
          const after = !!(state.likedPostIds && (state.likedPostIds.has(id) || state.likedPostIds.has(String(id))));
          return {
            createShown: display !== 'none',
            likeWorked: before !== after,
            notReadonly: typeof isPrivilegedReadOnly === 'function' ? !isPrivilegedReadOnly() : true
          };
        });
        a.ok(ownAccess.notReadonly && ownAccess.createShown, 'A normal login still shows create and is not read-only');
        a.ok(ownAccess.likeWorked, 'A normal login can still like a post');

        await page.evaluate(() => {
          if (typeof switchMainTab === 'function') switchMainTab('feed');
          if (typeof renderFeed === 'function') renderFeed();
          if (typeof updateNoteComposerFab === 'function') updateNoteComposerFab();
        });
        const ownChrome = await page.evaluate(() => {
          function shown(sel) {
            return Array.from(document.querySelectorAll(sel)).some((el) => {
              return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
            });
          }
          const fab = document.getElementById('btn-note-fab');
          return {
            newPost: shown('.btn-feed-create-first'),
            comment: shown('.btn-focus-comment'),
            sendDm: shown('.btn-dm-share-post'),
            share: shown('.btn-share-post'),
            messages: shown('#btn-open-messages'),
            fabPresent: !!fab,
            fabShown: !!(fab && getComputedStyle(fab).display !== 'none' && !fab.classList.contains('hidden'))
          };
        });
        a.ok(ownChrome.newPost, 'A normal login still shows + New Post on the feed');
        a.ok(ownChrome.comment && ownChrome.sendDm && ownChrome.share, 'A normal login still shows Comment, Send via DM, and Share on posts');
        a.ok(ownChrome.messages, 'A normal login still shows Messages in the nav');
        a.ok(ownChrome.fabPresent && ownChrome.fabShown, 'A normal login still shows the floating camera button on the feed');

        const owner = h.ACCOUNTS.personal;
        await enterPrivilegedView(page, owner, account);
        await h.seedContent(page, owner);
        await page.evaluate(() => { if (typeof applyPrivilegedReadOnlyUi === "function") applyPrivilegedReadOnlyUi(); if (typeof switchMainTab === "function") switchMainTab("feed"); if (typeof renderFeed === "function") renderFeed(); });

        const ro = await page.evaluate(async () => {
          function vis(id) {
            const el = document.getElementById(id);
            if (!el) return false;
            return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
          }
          const hidden = (id) => {
            const el = document.getElementById(id);
            return !el || el.classList.contains('hidden') || getComputedStyle(el).display === 'none';
          };

          // Seed probe content so write attempts have a real target.
          if (!state.posts) state.posts = [];
          if (!state.notes) state.notes = [];
          if (!state.messages) state.messages = [];
          if (!state.likedPostIds) state.likedPostIds = new Set();
          const postId = 'priv-ro-post';
          const noteId = 'priv-ro-note';
          if (!state.posts.some((p) => p && String(p.id) === postId)) {
            state.posts.push({ id: postId, author: 'reg_personal', authorName: 'Reg Personal', caption: 'probe', image: '', comments: [], likes: 0, likedBy: [] });
          }
          if (!state.notes.some((n) => n && String(n.id) === noteId)) {
            state.notes.push({ id: noteId, author: 'reg_personal', authorName: 'Reg Personal', text: 'probe note', comments: [], likes: 0 });
          }
          if (!state.messages.length) state.messages.push({ name: 'Probe', chat: [], lastMsg: '' });
          state.activeDmThreadIndex = 0;

          const bar = document.getElementById('privileged-readonly-banner');
          const barText = (bar && bar.innerText) || '';

          // Likes
          const likeBefore = state.likedPostIds.has(postId) || state.likedPostIds.has(String(postId));
          if (typeof togglePostLike === 'function') togglePostLike(postId);
          if (typeof toggleLikeNote === 'function') toggleLikeNote(noteId);
          const likeAfter = !!(state.likedPostIds && (state.likedPostIds.has(postId) || state.likedPostIds.has(String(postId))));
          const note = (typeof getNoteById === 'function') ? getNoteById(noteId) : state.notes.find((n) => String(n.id) === noteId);
          const noteLiked = !!(note && (note.isLiked || (note.likedBy && note.likedBy.length)));

          // Comments
          const post = (typeof getPostById === 'function') ? getPostById(postId) : state.posts.find((p) => String(p.id) === postId);
          const commentsBefore = (post && post.comments && post.comments.length) || 0;
          const noteCommentsBefore = (note && note.comments && note.comments.length) || 0;
          state.currentModalNoteId = noteId;
          const noteInp = document.getElementById('note-modal-comment-input');
          if (noteInp) noteInp.value = 'should not post';
          if (typeof submitNoteModalComment === 'function') submitNoteModalComment();
          const commentsAfter = (post && post.comments && post.comments.length) || 0;
          const noteCommentsAfter = (note && note.comments && note.comments.length) || 0;

          // Posting
          const postsBefore = state.posts.length;
          if (typeof openCreatePostModal === 'function') openCreatePostModal('post');
          if (typeof handleCreatePostAction === 'function') handleCreatePostAction();
          const createModal = document.getElementById('modal-create-post');
          const createOpen = !!(createModal && !createModal.classList.contains('hidden') && createModal.style.display !== 'none');

          // Follows / connects
          const followBefore = JSON.stringify(state.following || []);
          if (typeof applyLocalFollowToggle === 'function') applyLocalFollowToggle('reg_empty', true);
          let connectResult = null;
          if (typeof sendConnectRequest === 'function') connectResult = await sendConnectRequest('reg_empty');
          const followAfter = JSON.stringify(state.following || []);

          // DMs
          const thread = state.messages[0];
          const dmBefore = (thread && thread.chat && thread.chat.length) || 0;
          const dmInp = document.getElementById('dm-input-text');
          if (dmInp) dmInp.value = 'should not send';
          if (typeof handleSendDirectMessage === 'function') handleSendDirectMessage({ preventDefault() {} });
          if (typeof sendDmQuickReaction === 'function') sendDmQuickReaction('❤️');
          const dmAfter = (state.messages[0] && state.messages[0].chat && state.messages[0].chat.length) || 0;

          // Subscription sign-up and cancel (Stripe)
          try { sessionStorage.removeItem('pixly_stripe_checkout_initiated'); } catch (e) {}
          try { sessionStorage.removeItem('pixly_stripe_portal_visit'); } catch (e) {}
          try { localStorage.removeItem('pixly_stripe_checkout_initiated'); } catch (e) {}
          try { localStorage.removeItem('pixly_stripe_portal_visit'); } catch (e) {}
          window.__pixlyCancelSubscriptionCalls = [];
          if (typeof markStripeCheckoutInitiated === 'function') markStripeCheckoutInitiated('plus');
          if (typeof markStripePortalVisit === 'function') markStripePortalVisit();
          if (typeof stampStripeBuyButton === 'function') stampStripeBuyButton(document.getElementById('pixly-stripe-buy-btn'));
          if (typeof wireStripeBuyButton === 'function') wireStripeBuyButton(document.getElementById('pixly-stripe-buy-btn'), 'plus');
          let cancelResult = null;
          if (typeof cancelStripeSubscriptionForAccount === 'function') {
            cancelResult = await cancelStripeSubscriptionForAccount('reg_personal', 'plus');
          }
          if (typeof confirmCancelMembership === 'function') await confirmCancelMembership();
          if (typeof openCancelMembershipConfirm === 'function') openCancelMembershipConfirm();
          const cancelModalOpen = vis('modal-cancel-membership');
          const buyBtn = document.getElementById('pixly-stripe-buy-btn');
          const checkoutFlag = (function () {
            try { return sessionStorage.getItem('pixly_stripe_checkout_initiated') || localStorage.getItem('pixly_stripe_checkout_initiated'); } catch (e) { return null; }
          })();
          const portalFlag = (function () {
            try { return sessionStorage.getItem('pixly_stripe_portal_visit') || localStorage.getItem('pixly_stripe_portal_visit'); } catch (e) { return null; }
          })();

          // Settings and other writes
          const bioBefore = (state.currentUser && state.currentUser.bio) || '';
          if (state.currentUser) state.currentUser.bio = 'should not save ' + Date.now();
          if (typeof saveUserProfile === 'function') saveUserProfile();
          if (typeof saveEditedContent === 'function') saveEditedContent();
          if (typeof openDeactivateConfirmModal === 'function') openDeactivateConfirmModal();
          let pwChange = null;
          if (window.pixlyGuard && typeof window.pixlyGuard.changeAuthPassword === 'function') {
            pwChange = await window.pixlyGuard.changeAuthPassword('reg_personal', 'TestPass123!', 'NewPass123!');
          }

          // Viewing is still allowed
          if (typeof switchMainTab === 'function') switchMainTab('feed');
          if (typeof renderFeed === 'function') renderFeed();
          function hiddenSel(sel) {
            const els = Array.from(document.querySelectorAll(sel));
            return {
              count: els.length,
              hidden: els.length > 0 && els.every((el) => el.classList.contains('hidden') || getComputedStyle(el).display === 'none')
            };
          }
          const newPost = hiddenSel('.btn-feed-create-first');
          const commentBtn = hiddenSel('.btn-focus-comment');
          const sendDm = hiddenSel('.btn-dm-share-post');
          const shareBtn = hiddenSel('.btn-share-post');
          const messagesBtn = hidden('btn-open-messages');
          if (typeof openMessagesModal === 'function') openMessagesModal();
          const messagesOpen = vis('modal-messages');
          if (typeof openDmShareModal === 'function') openDmShareModal('post', postId);
          const dmShareOpen = vis('modal-dm-share');
          if (typeof openPostDetailModal === 'function') openPostDetailModal(3001);
          const detail = document.getElementById('modal-post-detail');
          const canViewPost = !!(detail && !detail.classList.contains('hidden') && getComputedStyle(detail).display !== 'none');
          const modalComment = hidden('btn-modal-focus-comment') && hidden('btn-modal-post-comment') && hidden('modal-comment-form');
          const modalShare = hidden('btn-modal-share') && hidden('btn-modal-dm-share');
          const commentsView = (function () {
            const lists = Array.from(document.querySelectorAll('#modal-comments-list, .modal-comments-list, .post-comments, #post-detail-comments'));
            if (lists.length) return lists.some((el) => getComputedStyle(el).display !== 'none');
            return canViewPost;
          })();

          return {
            flag: typeof isPrivilegedReadOnly === 'function' && isPrivilegedReadOnly(),
            viewing: (state.currentUser && state.currentUser.username) || '',
            banner: vis('privileged-readonly-banner'),
            bannerText: barText,
            createHidden: hidden('nav-btn-create'),
            newPostHidden: newPost.hidden,
            newPostCount: newPost.count,
            commentHidden: commentBtn.hidden,
            commentCount: commentBtn.count,
            sendDmHidden: sendDm.hidden,
            sendDmCount: sendDm.count,
            shareHidden: shareBtn.hidden,
            shareCount: shareBtn.count,
            messagesHidden: messagesBtn,
            messagesBlocked: !messagesOpen,
            dmShareBlocked: !dmShareOpen,
            modalActionsHidden: modalComment && modalShare,
            commentsViewable: commentsView,
            fabHidden: (function () {
              const fab = document.getElementById('btn-note-fab');
              if (fab) fab.classList.add('is-visible');
              if (typeof updateNoteComposerFab === 'function') updateNoteComposerFab();
              const el = document.getElementById('btn-note-fab');
              return !el || el.classList.contains('hidden') || getComputedStyle(el).display === 'none';
            })(),
            composerBlocked: (function () {
              if (typeof setNoteComposerExpanded === 'function') setNoteComposerExpanded(true);
              const sheet = document.getElementById('note-composer-sheet');
              const panel = document.getElementById('note-composer-panel');
              const sheetOpen = !!(sheet && sheet.classList.contains('is-open') && getComputedStyle(sheet).display !== 'none');
              const panelOpen = !!(panel && panel.classList.contains('is-expanded') && getComputedStyle(panel).display !== 'none');
              return !sheetOpen && !panelOpen;
            })(),
            editHidden: hidden('btn-edit-profile'),
            likeBlocked: likeBefore === likeAfter && !noteLiked,
            commentsBlocked: commentsAfter === commentsBefore && noteCommentsAfter === noteCommentsBefore,
            postBlocked: state.posts.length === postsBefore && !createOpen,
            followBlocked: followBefore === followAfter && connectResult !== true,
            dmBlocked: dmAfter === dmBefore,
            stripeSignupBlocked: !checkoutFlag && hidden('pixly-stripe-buy-btn'),
            stripeCancelBlocked: !(window.__pixlyCancelSubscriptionCalls && window.__pixlyCancelSubscriptionCalls.length) && !cancelModalOpen && hidden('btn-stripe-cancel-membership') && hidden('btn-stripe-billing-portal') && !(cancelResult && cancelResult.ok),
            portalNotMarked: !portalFlag,
            settingsBlocked: hidden('btn-edit-profile') && hidden('form-ac-change-password') && !vis('modal-deactivate-confirm') && !(pwChange && pwChange.ok),
            canViewFeed: !!(document.getElementById('main-view') && getComputedStyle(document.getElementById('main-view')).display !== 'none'),
            canViewPost: canViewPost,
            bioAttempt: (state.currentUser && state.currentUser.bio) || bioBefore
          };
        });
        a.ok(ro.flag, 'Privileged session is marked read-only');
        a.ok(ro.viewing === 'reg_personal', 'Passwordless privileged switch opens the owner account');
        a.ok(ro.banner, 'A read-only banner is shown');
        a.ok(/read only/i.test(ro.bannerText) && /@reg_personal/.test(ro.bannerText), 'Banner names the owner and says read only');
        a.ok(ro.fabHidden && ro.composerBlocked, 'The floating camera button is hidden and blocked in a privileged session');
        a.ok(ro.createHidden, 'Create is hidden while viewing with Privileged Access');
        a.ok(ro.newPostHidden && ro.newPostCount > 0, '+ New Post is hidden while viewing with Privileged Access');
        a.ok(ro.commentHidden && ro.commentCount > 0, 'Comment is hidden on posts in a privileged session');
        a.ok(ro.sendDmHidden && ro.sendDmCount > 0, 'Send via DM is hidden on posts in a privileged session');
        a.ok(ro.shareHidden && ro.shareCount > 0, 'Share is hidden on posts in a privileged session');
        a.ok(ro.messagesHidden && ro.messagesBlocked, 'Messages is hidden and blocked in a privileged session');
        a.ok(ro.dmShareBlocked && ro.modalActionsHidden, 'Post comment, Send via DM, and Share stays blocked in the post modal');
        a.ok(ro.commentsViewable, 'Viewing comments still works in a privileged session');
        a.ok(ro.editHidden, 'Edit profile is hidden while viewing with Privileged Access');
        a.ok(ro.likeBlocked, 'Likes are blocked in a privileged session');
        a.ok(ro.commentsBlocked, 'Comments are blocked in a privileged session');
        a.ok(ro.postBlocked, 'Posting is blocked in a privileged session');
        a.ok(ro.followBlocked, 'Follows and connect requests are blocked in a privileged session');
        a.ok(ro.dmBlocked, 'DMs are blocked in a privileged session');
        a.ok(ro.stripeSignupBlocked, 'Stripe subscription sign-up is blocked in a privileged session');
        a.ok(ro.stripeCancelBlocked && ro.portalNotMarked, 'Stripe subscription cancel and billing portal are blocked in a privileged session');
        a.ok(ro.settingsBlocked, 'Settings changes are blocked in a privileged session');
        a.ok(ro.canViewFeed && ro.canViewPost, 'Viewing the feed and a post still works in a privileged session');

        // Passwordless switch helper also marks the session read-only.
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        const switchResult = await page.evaluate(async ({ owner, viewer }) => {
          if (typeof savePrivilegedAccountsList === 'function') {
            savePrivilegedAccountsList(viewer, [{ username: owner.username, status: 'accepted', fullName: owner.fullName }]);
          }
          window.firebaseReady = true;
          window.firebase = window.firebase || {};
          window.firebase.db = window.firebase.db || { __pixly: true };
          window.firebase.doc = function (db, col, id) { return { path: col + '/' + id, id: id }; };
          window.firebase.getDoc = async function (ref) {
            return {
              exists: function () { return true; },
              data: function () {
                return {
                  privilegedAccessGranted: [{ username: viewer, status: 'accepted' }]
                };
              }
            };
          };
          const before = (state.currentUser && state.currentUser.username) || '';
          await requestAccountSwitchWithAuth({
            username: owner.username,
            fullName: owner.fullName,
            email: owner.email || '',
            phone: owner.phone || '',
            accountType: owner.accountType || 'personal'
          });
          return {
            before,
            after: (state.currentUser && state.currentUser.username) || '',
            readonly: typeof isPrivilegedReadOnly === 'function' && isPrivilegedReadOnly()
          };
        }, { owner, viewer: account.username });
        a.ok(switchResult.after === 'reg_personal' && switchResult.readonly, 'requestAccountSwitchWithAuth passwordless path is read-only');

        // Leaving privileged view via a normal login restores write access and admin tools stay intact.
        await h.loadApp(page, { port });
        await h.loginAs(page, h.ACCOUNTS.pixlynote);
        if (typeof page.evaluate === 'function') {
          await page.evaluate(() => { if (typeof clearPrivilegedReadOnlySession === 'function') clearPrivilegedReadOnlySession(); });
        }
        await h.openOwnerMenu(page);
        const admin = await page.evaluate(() => {
          const create = document.getElementById('nav-btn-create');
          const vis = (id) => {
            const el = document.getElementById(id);
            return !!(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
          };
          return {
            user: (window.state && state.currentUser && state.currentUser.username) || '',
            readonly: typeof isPrivilegedReadOnly === 'function' && isPrivilegedReadOnly(),
            createShown: !!(create && getComputedStyle(create).display !== 'none'),
            metrics: vis('drawer-pixlynote-metrics'),
            pending: vis('drawer-pixlynote-deactivations'),
            ver: vis('drawer-pixlynote-verifications'),
            bizVer: vis('drawer-business-verification-admin')
          };
        });
        a.ok(admin.user === 'pixlynote' && !admin.readonly && admin.createShown, 'A direct @pixlynote login is full access, not read-only');
        a.ok(admin.metrics && admin.pending && admin.ver && admin.bizVer, 'Admin tools are still present for @pixlynote');
      }
    },

    {
      name: 'Privileged Access invite card becomes Accepted or Declined with no buttons after a response',
      accounts: ['business'],
      covers: [
        'handler:respondToPrivilegedAccessInvite',
        'handler:privilegedInviteIsResolved',
        'handler:privilegedInviteActionsHtml',
        'handler:notificationsForDisplay',
        'el:.notif-priv-accept',
        'el:.notif-priv-decline',
        'el:.notif-priv-resolved'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        const pending = await page.evaluate(() => {
          if (typeof savePrivilegedAccountsList === 'function') savePrivilegedAccountsList('reg_business', []);
          try { localStorage.removeItem('pixly_priv_accounts_reg_business'); } catch (e) {}
          if (typeof setNotificationMode === 'function') setNotificationMode('all');
          else { state.notifMode = 'all'; state.notifModeUser = 'reg_business'; }
          window._incomingConnectRequests = {
            owner: (state.currentUser && state.currentUser.username) || 'reg_business',
            list: [{ username: 'reg_empty', fullName: 'Reg Empty', avatar: '' }]
          };
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
          const accept = document.querySelector('.notif-priv-accept');
          const decline = document.querySelector('.notif-priv-decline');
          const display = (typeof notificationsForDisplay === 'function')
            ? notificationsForDisplay(state.notifications)
            : state.notifications;
          const timeEl = (function () {
            const mark = document.querySelector('.notif-priv-accept, .notif-priv-decline, .notif-priv-resolved');
            let node = mark;
            for (let i = 0; i < 6 && node; i++) {
              const prev = node.previousElementSibling;
              const text = prev && String(prev.textContent || '').trim();
              if (text && /just now|\d+m ago|\d+h ago|\d{12,}|[A-Za-z]{3} \d/i.test(text)) return text;
              node = node.parentElement;
            }
            return '';
          })();
          return {
            hasButtons: !!(accept && decline),
            resolved: !!document.querySelector('.notif-priv-resolved'),
            idx: accept ? accept.getAttribute('data-idx') : null,
            displayLen: display.length,
            displayTypes: display.map((n) => n && n.type),
            timeText: String(timeEl).trim(),
            rawTime: /\b\d{12,}\b/.test(String(timeEl))
          };
        });
        a.ok(pending.hasButtons && !pending.resolved, 'A pending invite shows Accept and Decline');
        a.ok(pending.idx === '1' && pending.displayLen >= 2, 'Invite Accept uses the display-list index when a connect request is also shown');
        a.ok(!pending.rawTime && /just now|\d+m ago|\d+h ago|[A-Za-z]{3} \d/i.test(pending.timeText), 'A pending invite shows a normal time, not a raw number');

        const accepted = await page.evaluate(async (idx) => {
          await respondToPrivilegedAccessInvite(Number(idx), true);
          const n = (state.notifications || []).find((x) => x && x.type === 'privileged_access_invite' && String(x.fromUser).toLowerCase() === 'reg_personal');
          const label = document.querySelector('.notif-priv-resolved');
          const timeEl = (function () {
            const mark = document.querySelector('.notif-priv-accept, .notif-priv-decline, .notif-priv-resolved');
            let node = mark;
            for (let i = 0; i < 6 && node; i++) {
              const prev = node.previousElementSibling;
              const text = prev && String(prev.textContent || '').trim();
              if (text && /just now|\d+m ago|\d+h ago|\d{12,}|[A-Za-z]{3} \d/i.test(text)) return text;
              node = node.parentElement;
            }
            return '';
          })();
          return {
            status: n && n.status,
            buttons: !!document.querySelector('.notif-priv-accept, .notif-priv-decline'),
            label: (label && label.textContent) || '',
            listText: (document.getElementById('notifications-list') && document.getElementById('notifications-list').innerText) || '',
            timeText: String(timeEl).trim(),
            rawTime: /\b\d{12,}\b/.test(String(timeEl))
          };
        }, pending.idx);
        a.ok(accepted.status === 'accepted', 'Accept marks the real invite notification, not the prepended connect-request row');
        a.ok(!accepted.buttons && /Accepted/i.test(accepted.label), 'After accepting, the card shows Accepted and has no buttons');
        a.ok(!accepted.rawTime && /just now|\d+m ago|\d+h ago|[A-Za-z]{3} \d/i.test(accepted.timeText), 'An accepted invite shows a normal time, not a raw number');

        const declined = await page.evaluate(async () => {
          window._incomingConnectRequests = { owner: '', list: [] };
          state.notifications = [{
            type: 'privileged_access_invite',
            fromUser: 'pixlynote',
            fromFullName: 'Pixlynote',
            text: 'invited you to have Privileged Access to @pixlynote',
            status: 'pending',
            read: false,
            time: Date.now()
          }];
          if (typeof renderNotifications === 'function') renderNotifications(true);
          const accept = document.querySelector('.notif-priv-accept');
          const idx = accept ? parseInt(accept.getAttribute('data-idx'), 10) : 0;
          await respondToPrivilegedAccessInvite(idx, false);
          const n = (state.notifications || []).find((x) => x && x.type === 'privileged_access_invite' && String(x.fromUser).toLowerCase() === 'pixlynote');
          const label = document.querySelector('.notif-priv-resolved');
          const timeEl = (function () {
            const mark = document.querySelector('.notif-priv-accept, .notif-priv-decline, .notif-priv-resolved');
            let node = mark;
            for (let i = 0; i < 6 && node; i++) {
              const prev = node.previousElementSibling;
              const text = prev && String(prev.textContent || '').trim();
              if (text && /just now|\d+m ago|\d+h ago|\d{12,}|[A-Za-z]{3} \d/i.test(text)) return text;
              node = node.parentElement;
            }
            return '';
          })();
          return {
            status: n && n.status,
            buttons: !!document.querySelector('.notif-priv-accept, .notif-priv-decline'),
            label: (label && label.textContent) || '',
            timeText: String(timeEl).trim(),
            rawTime: /\b\d{12,}\b/.test(String(timeEl))
          };
        });
        a.ok(declined.status === 'declined', 'Decline marks the invite notification as declined');
        a.ok(!declined.buttons && /Declined/i.test(declined.label), 'After declining, the card shows Declined and has no buttons');
        a.ok(!declined.rawTime && /just now|\d+m ago|\d+h ago|[A-Za-z]{3} \d/i.test(declined.timeText), 'A declined invite shows a normal time, not a raw number');

        const fallback = await page.evaluate(() => {
          if (typeof savePrivilegedAccountsList === 'function') {
            savePrivilegedAccountsList('reg_business', [{ username: 'reg_personal', status: 'accepted' }]);
          }
          window._incomingConnectRequests = { owner: '', list: [] };
          state.notifications = [{
            type: 'privileged_access_invite',
            fromUser: 'reg_personal',
            fromFullName: 'Reg Personal',
            text: 'invited you to have Privileged Access to @reg_personal',
            status: 'pending',
            read: false,
            time: Date.now()
          }];
          if (typeof renderNotifications === 'function') renderNotifications(true);
          const label = document.querySelector('.notif-priv-resolved');
          return {
            buttons: !!document.querySelector('.notif-priv-accept, .notif-priv-decline'),
            label: (label && label.textContent) || '',
            resolved: typeof privilegedInviteIsResolved === 'function' && privilegedInviteIsResolved(state.notifications[0])
          };
        });
        a.ok(fallback.resolved && !fallback.buttons && /Accepted/i.test(fallback.label), 'An already-accepted grant still shows the invite as Accepted with no buttons');
      }
    }
  ]
};
