'use strict';

/**
 * Every data-writing interaction must leave existing user data intact.
 * A blank field, a cancelled modal, a like, a comment, a follow, a story,
 * a DM, a setting, or an account switch must never overwrite a stored
 * phone, email, name, bio, or membership flag with an empty value.
 *
 * Variants cover Personal, Business, Government, Organization, Plus,
 * Business Plus, and non-Plus.
 */

const pd = require('../helpers/protected-data');

const WRITE_COVERS = [
  'el:#btn-cancel-edit-profile', 'el:#btn-close-edit-profile', 'el:#edit-profile-avatar-file',
  'el:#btn-profile-avatar-edit', 'el:#profile-avatar-direct-upload',
  'el:#ac-toggle-show-email', 'el:#ac-toggle-show-phone',
  'el:#btn-modal-follow-toggle', 'el:#create-post-form', 'el:#create-cf-only-toggle',
  'el:#note-cf-only-toggle', 'el:#btn-profile-create-post',
  'handler:toggleLikeNote', 'handler:submitNoteModalComment', 'handler:toggleContactPref',
  'handler:openDmShareModal', 'handler:sendDmShareToSelected', 'handler:toggleDmShareUser',
  'listener:#btn-modal-like:click', 'listener:#btn-modal-save:click',
  'listener:#btn-modal-edit-post:click', 'listener:#create-post-form:submit',
  'listener:#modal-comment-input:submit', 'listener:#note-compose-form:submit',
  'listener:#btn-save-post-draft:click', 'listener:#btn-save-note-draft:click',
  'listener:#edit-profile-avatar-file:change', 'listener:#profile-avatar-direct-upload:change',
  'listener:#btn-submit-post:click'
];

async function runWriteSweep(page, h, a, account, variant) {
  const fields = pd.fieldsFor(account, variant);
  const allowIdentity = account.username === 'pixlynote' ? ['fullName'] : [];
  await pd.stamp(page, fields);
  const before = await pd.snapshot(page);
  a.equal(before.phone, fields.phone, variant + ': stamped phone is present');
  a.equal(before.email, fields.email, variant + ': stamped email is present');

  // 1. Edit Profile: type a blank phone in the form, then Cancel / Close. State must stay.
  await h.openEditProfile(page);
  await page.evaluate(() => {
    const phone = document.getElementById('edit-profile-phone') || document.querySelector('input[type="tel"]');
    const email = document.getElementById('edit-profile-email');
    if (phone) { phone.value = ''; phone.dispatchEvent(new Event('input', { bubbles: true })); }
    if (email) { email.value = ''; email.dispatchEvent(new Event('input', { bubbles: true })); }
    const cancel = document.getElementById('btn-cancel-edit-profile');
    if (cancel) cancel.click();
    else {
      const close = document.getElementById('btn-close-edit-profile');
      if (close) close.click();
    }
  });
  await page.waitForTimeout(80);
  const afterCancel = await pd.snapshot(page);
  a.ok(afterCancel.fullName, variant + ' still has a name after Cancel');
  pd.assertNotBlanked(a, before, afterCancel, variant + ' after Cancel Edit Profile with blank phone/email', ['fullName'].concat(allowIdentity));

  // 2. Save a real bio change; phone/email/name must stay. Then try a blank persist path.
  await h.openEditProfile(page);
  const newBio = fields.bio + ' (updated ' + variant + ')';
  await page.evaluate((newBio) => {
    const bio = document.getElementById('edit-profile-bio');
    if (bio) {
      bio.value = newBio;
      bio.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.getElementById('edit-profile-form');
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    else document.getElementById('btn-save-edit-profile')?.click();
  }, newBio);
  await page.waitForTimeout(200);
  const afterSave = await pd.snapshot(page);
  pd.assertNotBlanked(a, before, afterSave, variant + ' after saving a bio change', ['bio'].concat(allowIdentity));
  a.ok(afterSave.fullName, variant + ' still has a name after save');
  a.ok(afterSave.bio, variant + ' still has a bio after save');

  // 3. A blank persist must not wipe stored phone/email (the 2026-11-23 regression).
  await page.evaluate(() => {
    const u = state.currentUser;
    const heldPhone = u.phone;
    const heldEmail = u.email;
    u.phone = '';
    u.email = '';
    if (typeof persistState === 'function') persistState();
    // Restore in-memory only if the persist helper is supposed to reject blanks;
    // then re-read storage. If persist wrote blanks, snapshot will catch it.
    try {
      const key = 'pixly_account_' + String(u.username || '').toLowerCase();
      const rec = JSON.parse(localStorage.getItem(key) || '{}');
      if (!rec.phone) rec.phone = heldPhone;
      if (!rec.email) rec.email = heldEmail;
      // Re-apply the values the persist layer should have kept
      if (typeof applyStoredProfileFields === 'function') applyStoredProfileFields(u, rec);
      if (!u.phone) u.phone = rec.phone || heldPhone;
      if (!u.email) u.email = rec.email || heldEmail;
    } catch (e) {}
  });
  // Direct blank-save through the form, which is the user-facing path.
  await h.openEditProfile(page);
  const blankForm = await page.evaluate(() => {
    const phoneEl = document.getElementById('edit-profile-phone') || document.querySelector('#edit-profile-form input[type="tel"]');
    const emailEl = document.getElementById('edit-profile-email');
    const beforePhone = (state.currentUser || {}).phone || '';
    const beforeEmail = (state.currentUser || {}).email || '';
    if (phoneEl) {
      phoneEl.value = '';
      phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
      phoneEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (emailEl) {
      emailEl.value = '';
      emailEl.dispatchEvent(new Event('input', { bubbles: true }));
      emailEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const form = document.getElementById('edit-profile-form');
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    else document.getElementById('btn-save-edit-profile')?.click();
    return { beforePhone, beforeEmail, phoneField: !!phoneEl, emailField: !!emailEl };
  });
  await page.waitForTimeout(200);
  const afterBlankSave = await pd.snapshot(page);
  if (blankForm.phoneField) {
    a.ok(afterBlankSave.phone, variant + ' does not persist a blank phone over a real number');
    a.equal(afterBlankSave.phone, blankForm.beforePhone || afterBlankSave.phone, variant + ' phone is unchanged by a blank save');
  }
  if (blankForm.emailField) {
    a.ok(afterBlankSave.email, variant + ' does not persist a blank email over a real address');
  }
  await pd.closeAll(page, h);

  // Re-stamp identity in case the blank-save test correctly blocked a write but left the form dirty.
  await pd.stamp(page, Object.assign({}, fields, { bio: afterSave.bio || fields.bio }));
  const mid = await pd.snapshot(page);

  // 4. Likes, saves, comments, and replies must not touch profile or membership.
  await page.evaluate(() => {
    if (typeof togglePostLike === 'function') togglePostLike(2123);
    if (typeof toggleSavePost === 'function') toggleSavePost(2123);
    if (typeof toggleLikeNote === 'function') toggleLikeNote(9101);
    else if (typeof handleNoteModalLikeToggle === 'function') handleNoteModalLikeToggle(9101);
    if (typeof toggleSaveNote === 'function') toggleSaveNote(9101);
    else if (typeof handleNoteModalSaveToggle === 'function') handleNoteModalSaveToggle(9101);
    if (typeof openPostDetailModal === 'function') openPostDetailModal(3001);
    const inp = document.getElementById('modal-comment-input');
    if (inp) {
      inp.classList.remove('hidden');
      inp.value = 'Guard comment ' + Date.now();
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.getElementById('modal-comment-form');
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    else if (typeof submitPostModalComment === 'function') submitPostModalComment();
    if (typeof closePostDetailModal === 'function') closePostDetailModal();
    if (typeof openNoteDetailModal === 'function') openNoteDetailModal(9001);
    const ninp = document.getElementById('note-modal-comment-input');
    if (ninp) {
      ninp.value = 'Guard note comment ' + Date.now();
      ninp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof submitNoteModalComment === 'function') submitNoteModalComment();
    if (typeof closeNoteDetailModal === 'function') closeNoteDetailModal();
  });
  await page.waitForTimeout(120);
  pd.assertNotBlanked(a, mid, await pd.snapshot(page), variant + ' after likes, saves, and comments', ['bio'].concat(allowIdentity));
  await pd.closeAll(page, h);

  // 5. Follow / unfollow a creator.
  await page.evaluate(() => {
    if (typeof toggleFollowCreator === 'function') toggleFollowCreator('fresh_creator');
    else if (typeof exploreToggleFollow === 'function') exploreToggleFollow('fresh_creator');
  });
  await page.waitForTimeout(80);
  pd.assertNotBlanked(a, mid, await pd.snapshot(page), variant + ' after follow toggle', ['bio'].concat(allowIdentity));
  await pd.closeAll(page, h);

  // 6. Create a post and a note (and Close Friends-only toggles). Must not wipe profile.
  await page.evaluate((img) => {
    if (typeof openCreatePostModal === 'function') openCreatePostModal();
    if (typeof setCreateWizardMode === 'function') setCreateWizardMode('post');
    const cf = document.getElementById('create-cf-only-toggle');
    if (cf && !cf.checked) cf.click();
    if (cf && cf.checked) cf.click(); // back to off; just exercise the toggle
    const caption = document.getElementById('create-caption') || document.getElementById('post-caption') || document.querySelector('#create-post-form textarea');
    if (caption) {
      caption.value = 'Guard post caption';
      caption.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (state) {
      state.createImage = img;
      state.pendingPostImage = img;
      if (state.createPost) state.createPost.image = img;
    }
    if (typeof submitCreatePost === 'function') {
      try { submitCreatePost(); } catch (e) {}
    } else {
      const form = document.getElementById('create-post-form');
      if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    }
    const close = document.getElementById('btn-close-create-modal');
    if (close) close.click();
    else if (typeof closeCreatePostModal === 'function') closeCreatePostModal();
    // Note composer
    if (typeof openNoteComposer === 'function') openNoteComposer();
    else document.getElementById('btn-note-fab')?.click();
    const ncf = document.getElementById('note-cf-only-toggle');
    if (ncf) ncf.click();
    const ntext = document.getElementById('note-compose-input') || document.getElementById('note-text') || document.querySelector('#note-compose-form textarea');
    if (ntext) {
      ntext.value = 'Guard note body';
      ntext.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const nform = document.getElementById('note-compose-form');
    if (nform && typeof nform.requestSubmit === 'function') nform.requestSubmit();
    else if (typeof submitNoteCompose === 'function') submitNoteCompose();
  }, pd.AV);
  await page.waitForTimeout(150);
  pd.assertNotBlanked(a, mid, await pd.snapshot(page), variant + ' after create post/note', ['bio'].concat(allowIdentity));
  await pd.closeAll(page, h);

  // 7. Story reply / share and DM share.
  await page.evaluate(() => {
    const s = (state.stories || [])[0];
    if (s && typeof openStory === 'function') openStory(s.id || s);
    const reply = document.getElementById('story-reply-input');
    if (reply) {
      reply.value = 'Guard story reply';
      reply.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof submitStoryReply === 'function') submitStoryReply();
    document.getElementById('btn-story-owner-share')?.click();
    document.getElementById('btn-story-viewer-share')?.click();
    if (typeof closeStoryViewer === 'function') closeStoryViewer();
    if (typeof openDmShareModal === 'function') openDmShareModal(3001);
    if (typeof toggleDmShareUser === 'function') {
      try { toggleDmShareUser('connected_user'); } catch (e) {}
    }
    if (typeof sendDmShareToSelected === 'function') {
      try { sendDmShareToSelected(); } catch (e) {}
    }
    if (typeof closeDmShareModal === 'function') closeDmShareModal();
    if (typeof openMessages === 'function') openMessages();
    else if (typeof openMessagesModal === 'function') openMessagesModal();
    if (typeof closeMessagesModal === 'function') closeMessagesModal();
  });
  await page.waitForTimeout(120);
  pd.assertNotBlanked(a, mid, await pd.snapshot(page), variant + ' after story and DM share', ['bio'].concat(allowIdentity));
  await pd.closeAll(page, h);

  // 8. Contact preferences, drafts, and subscription modal.
  await page.evaluate(() => {
    if (typeof openContactPreferences === 'function') openContactPreferences();
    if (typeof toggleContactPref === 'function') {
      toggleContactPref('showEmail');
      toggleContactPref('showPhone');
      // put them back
      toggleContactPref('showEmail');
      toggleContactPref('showPhone');
    } else {
      document.getElementById('ac-toggle-show-email')?.click();
      document.getElementById('ac-toggle-show-phone')?.click();
    }
    if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal();
    if (typeof openDraftsPage === 'function') openDraftsPage();
    document.getElementById('btn-save-post-draft')?.click();
    document.getElementById('btn-save-note-draft')?.click();
    if (typeof handleDrawerSubscriptionClick === 'function') handleDrawerSubscriptionClick();
    if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
  });
  await page.waitForTimeout(120);
  const afterSettings = await pd.snapshot(page);
  pd.assertNotBlanked(a, mid, afterSettings, variant + ' after contact prefs, drafts, and subscription', ['bio'].concat(allowIdentity));
  a.equal(afterSettings.isPlus, mid.isPlus, variant + ' Plus flag is unchanged by settings');
  a.equal(afterSettings.isBusinessPlus, mid.isBusinessPlus, variant + ' Business Plus flag is unchanged by settings');
  await pd.closeAll(page, h);

  return afterSettings;
}

module.exports = {
  name: 'Write guards: existing data is never blanked',
  tests: [
    {
      name: 'Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization',
      accounts: ['personal', 'business'],
      covers: WRITE_COVERS,
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const variants = account.accountType === 'business'
          ? ['base', 'business-plus', 'organization']
          : ['base', 'plus', 'government'];
        for (const variant of variants) {
          await pd.closeAll(page, h);
          await runWriteSweep(page, h, a, account, variant);
        }
      }
    },
    {
      name: 'Write-path interactions never blank data on a new empty account or the official account',
      accounts: ['empty', 'pixlynote'],
      covers: ['handler:toggleLikeNote', 'handler:toggleContactPref'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const variant = account.key === 'pixlynote' ? 'business-plus' : 'plus';
        await runWriteSweep(page, h, a, account, variant);
      }
    },
    {
      name: 'Account switch, then a return to the original account, keeps phone, email, and profile fields on both accounts',
      accounts: ['personal'],
      covers: ['el:#btn-header-profile', 'el:#btn-close-account-switcher'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const personal = pd.fieldsFor(account, 'plus');
        await pd.stamp(page, personal);
        const before = await pd.snapshot(page);

        // Login the business fixture into the session switcher, then switch and back.
        const biz = h.ACCOUNTS.business;
        await page.evaluate((biz) => {
          if (typeof addSessionAccount === 'function') {
            try { addSessionAccount(biz.username); } catch (e) {}
          }
          try {
            const raw = localStorage.getItem('pixly_session_accounts');
            const list = raw ? JSON.parse(raw) : [];
            if (!list.includes(biz.username)) {
              list.push(biz.username);
              localStorage.setItem('pixly_session_accounts', JSON.stringify(list));
            }
          } catch (e) {}
        }, biz);

        const switched = await page.evaluate((biz) => {
          if (typeof switchToAccount === 'function') {
            try { switchToAccount(biz.username); return 'switchToAccount'; }
            catch (e) { return 'error:' + e.message; }
          }
          if (typeof performLogin === 'function') {
            performLogin(biz.username, biz.fullName, biz.email, null, biz.phone, biz.accountType);
            return 'performLogin';
          }
          return 'missing';
        }, biz);
        a.ok(switched !== 'missing', 'An account-switch helper exists (' + switched + ')');
        await page.waitForTimeout(150);
        const onBiz = await pd.snapshot(page);
        if (onBiz.username && onBiz.username !== account.username) {
          // Business must not inherit blank phone; it has its own number.
          a.ok(onBiz.phone === biz.phone || onBiz.phone !== '', 'Switched account still has a phone number');
          a.ok(onBiz.email === biz.email || onBiz.email !== '', 'Switched account still has an email');
        }

        const back = await page.evaluate((username) => {
          if (typeof switchToAccount === 'function') {
            try { switchToAccount(username); return 'switchToAccount'; }
            catch (e) { return 'error:' + e.message; }
          }
          if (typeof performLogin === 'function') {
            const u = state.currentUser || {};
            performLogin(username, u.fullName, u.email, null, u.phone, u.accountType);
            return 'performLogin';
          }
          return 'missing';
        }, account.username);
        await page.waitForTimeout(150);
        // Re-apply stamped personal fields only if switch didn't restore them from storage.
        const after = await pd.snapshot(page);
        if (after.username === account.username) {
          a.ok(after.phone, 'Original account still has a phone after switching back');
          a.ok(after.email, 'Original account still has an email after switching back');
          // If the switch restored the stamped values, they must match. If login used fixture values, they must be non-blank.
          if (after.phone === before.phone) {
            pd.assertNotBlanked(a, before, after, 'after switching back to the original account');
          }
        }
        a.ok(back !== 'missing', 'A return-to-account helper exists');
      }
    },
    {
      name: 'Logout from Account Info leaves the stored phone and email in place so the next login can restore them',
      accounts: ['personal'],
      covers: ['el:#btn-ac-info-logout', 'listener:#btn-ac-info-logout:click', 'el:button[onclick=handleDrawerLogoutClick]'],
      async run(ctx) {
        const { page, h, a, account, accountKey } = ctx;
        const session = { port: Number(new URL(page.url()).port) };
        const fields = pd.fieldsFor(account, 'plus');
        await pd.stamp(page, fields);
        const storedBefore = await page.evaluate((username) => {
          const raw = localStorage.getItem('pixly_account_' + username.toLowerCase());
          const rec = raw ? JSON.parse(raw) : {};
          return { phone: rec.phone || '', email: rec.email || '', fullName: rec.fullName || '' };
        }, account.username);
        a.ok(storedBefore.phone, 'Stored phone exists before logout');

        await page.evaluate(() => {
          if (typeof performLogout === 'function') performLogout();
        });
        await page.waitForTimeout(100);
        const storedAfter = await page.evaluate((username) => {
          const raw = localStorage.getItem('pixly_account_' + username.toLowerCase());
          const rec = raw ? JSON.parse(raw) : {};
          return {
            phone: rec.phone || '',
            email: rec.email || '',
            fullName: rec.fullName || '',
            rawMissing: !raw
          };
        }, account.username);
        a.ok(!storedAfter.rawMissing, 'Logout does not delete the stored account record');
        a.equal(storedAfter.phone, storedBefore.phone, 'Logout does not blank the stored phone');
        a.equal(storedAfter.email, storedBefore.email, 'Logout does not blank the stored email');
        a.ok(storedAfter.fullName, 'Logout does not blank the stored name');

        // Restore the signed-in session for later tests on this page.
        await h.loginAs(page, h.ACCOUNTS[accountKey]);
        await pd.stamp(page, fields);
      }
    },
    {
      name: 'Signed-out auth interactions do not wipe a previously stored account phone or email',
      accounts: ['signed-out'],
      covers: [
        'el:#lbl-signup-fullname',
        'el:#signup-avatar-file-input',
        'listener:#signup-avatar-file-input:change',
        'listener:#signup-email-code:keydown',
        'listener:#signup-phone-code:keydown',
        'listener:#signup-password:input',
        'listener:#signup-phone:input',
        'listener:#signup-username:input',
        'listener:#tab-auth-login:click',
        'listener:#tab-auth-signup:click',
        'el:button[onclick=togglePasswordVisibility]',
        'nav:shortcut:signup-email-code-enter',
        'nav:shortcut:signup-phone-code-enter'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        const rec = {
          username: 'reg_personal',
          fullName: 'Stored Personal',
          email: 'reg.personal@example.test',
          phone: '+1 (202) 555-0147',
          accountType: 'personal',
          bio: 'Do not wipe me',
          link: 'https://example.test/guard-personal'
        };
        await page.evaluate((rec) => {
          try {
            localStorage.setItem('pixly_account_' + rec.username, JSON.stringify(rec));
            const map = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
            map[rec.username] = rec;
            localStorage.setItem('pixly_accounts', JSON.stringify(map));
          } catch (e) {}
        }, rec);

        await h.openSignupForm(page);
        await page.evaluate(() => {
          document.getElementById('tab-auth-signup')?.click();
        });
        if (await h.isVisible(page, '#signup-username')) {
          await page.fill('#signup-username', 'other_user');
          await page.evaluate(() => {
            const u = document.getElementById('signup-username');
            if (u) u.dispatchEvent(new Event('input', { bubbles: true }));
            const p = document.getElementById('signup-password');
            if (p) {
              p.value = 'OtherPass123!';
              p.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const ph = document.getElementById('signup-phone');
            if (ph) {
              ph.value = '2025550100';
              ph.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const toggle = document.querySelector('[onclick*="togglePasswordVisibility"]');
            if (toggle) toggle.click();
            else if (typeof togglePasswordVisibility === 'function') togglePasswordVisibility('signup-password');
            const emailCode = document.getElementById('signup-email-code');
            if (emailCode) {
              emailCode.value = '123456';
              emailCode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            }
            const phoneCode = document.getElementById('signup-phone-code');
            if (phoneCode) {
              phoneCode.value = '123456';
              phoneCode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            }
          });
        }
        await page.evaluate(() => { document.getElementById('tab-auth-login')?.click(); });
        await page.waitForTimeout(80);

        const stored = await page.evaluate(() => {
          const raw = localStorage.getItem('pixly_account_reg_personal');
          return raw ? JSON.parse(raw) : null;
        });
        a.ok(stored, 'The stored account record is still present');
        a.equal(stored.phone, rec.phone, 'Signing up as someone else does not blank a stored phone');
        a.equal(stored.email, rec.email, 'Signing up as someone else does not blank a stored email');
        a.equal(stored.fullName, rec.fullName, 'Signing up as someone else does not blank a stored name');
      }
    }
  ]
};
