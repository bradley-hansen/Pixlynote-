'use strict';

/**
 * Controls whose addEventListener binding no behavioural test ever fired (found by the listener
 * fire audit in tests/helpers/harness.js). Each is tapped for real (Playwright click/fill/press)
 * and the visible result is checked. Nothing here reaches the network: the Worker is the harness
 * mock and Firestore is unavailable, so state stays local.
 */

const VERIFY_CODE = '123456';

// page.click with a short timeout that names the control when it cannot be tapped (hidden, covered, disabled).
function tapper(page) {
  return async (sel, opts) => {
    try { await page.click(sel, Object.assign({ timeout: 4000 }, opts || {})); } catch (e) {
      const st = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? { disabled: !!el.disabled, hidden: el.classList.contains('hidden'), display: getComputedStyle(el).display } : null; }, sel).catch(() => null);
      throw new Error('Could not tap ' + sel + ': ' + JSON.stringify(st) + ' ' + String(e.message).split('\n')[0]);
    }
  };
}

async function openAcYourAccount(page, h) {
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
    if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    else if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
  });
  await page.waitForTimeout(250);
  await page.click('#btn-ac-open-your-account');
  await page.waitForTimeout(150);
}

async function closeAc(page) {
  await page.evaluate(() => { if (typeof closeAccountCenterModal === 'function') { try { closeAccountCenterModal(); } catch (e) {} } });
}

async function toasts(page) {
  await page.evaluate(() => {
    window.__t77 = [];
    if (!window.__t77orig) window.__t77orig = window.showToast;
    const orig = window.__t77orig;
    window.showToast = function (m) { window.__t77.push(String(m || '')); try { return orig && orig.apply(this, arguments); } catch (e) {} };
    try { showToast = window.showToast; } catch (e) {}
  });
  return {
    read: () => page.evaluate(() => (window.__t77 || []).slice()),
    restore: () => page.evaluate(() => { if (window.__t77orig) { window.showToast = window.__t77orig; try { showToast = window.__t77orig; } catch (e) {} } window.__t77orig = null; })
  };
}

module.exports = {
  name: 'Interaction coverage: controls no test tapped before',
  tests: [
    {
      name: 'Auth by taps: the Sign up / Log in link switches forms, Personal restores personal fields, Forgot password X closes, Create now is refused before verifying and works after',
      accounts: ['signed-out'],
      covers: ['listener:#btn-toggle-auth-mode:click', 'listener:#btn-account-type-personal:click', 'listener:#btn-close-forgot-password:click', 'listener:#btn-signup-direct-submit:click',
        'el:#btn-toggle-auth-mode', 'el:#btn-account-type-personal', 'el:#btn-close-forgot-password', 'el:#btn-signup-direct-submit'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        await h.resetToSignedOut(page, { port: Number(new URL(page.url()).port) });
        await tap('#btn-splash-login');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#login-form'), 'Log in form is shown');
        await tap('#btn-toggle-auth-mode');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#auth-signup-container'), 'The Sign up link switches to the sign-up form');
        a.ok(await page.evaluate(() => state.isSignUpMode === true), 'Sign-up mode is on');
        await tap('#btn-toggle-auth-mode');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#login-form') && await page.evaluate(() => state.isSignUpMode === false), 'The Log in link switches back');

        // Forgot password X.
        await tap('#btn-forgot-password');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#modal-forgot-password'), 'Forgot password opens');
        await tap('#btn-close-forgot-password');
        await page.waitForTimeout(150);
        a.ok(!(await h.isVisible(page, '#modal-forgot-password')), 'The X closes Forgot password');

        // Business -> Personal.
        await tap('#btn-toggle-auth-mode');
        await page.waitForTimeout(150);
        await tap('#btn-account-type-business');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#signup-business-fields'), 'Business shows business fields');
        await tap('#btn-account-type-personal');
        await page.waitForTimeout(100);
        a.ok(!(await h.isVisible(page, '#signup-business-fields')), 'Personal hides business fields');
        a.ok(await page.evaluate(() => state.signUpAccountType === 'personal'), 'Sign-up type is personal');
        a.equal(await page.textContent('#lbl-signup-fullname').then((t) => (t || '').trim()), 'Full Name', 'The name label is Full Name again');

        // Create now (skip step 2) before verifying: refused.
        const user = 'int77_' + Date.now().toString(36);
        await page.fill('#login-fullname', 'Int Seventy Seven');
        await page.fill('#signup-username', user);
        await page.fill('#login-email', user + '@example.test');
        await page.fill('#signup-password', 'Int77Pass!x');
        const t = await toasts(page);
        try {
          const disabled = await page.evaluate(() => document.getElementById('btn-signup-direct-submit').disabled);
          if (!disabled) {
            await tap('#btn-signup-direct-submit');
            await page.waitForTimeout(300);
            a.ok((await t.read()).some((m) => /verify your email or phone/i.test(m)), 'Says to verify first: ' + JSON.stringify(await t.read()));
          }
          // Even a forced DOM click (which a disabled button ignores) must not create the account.
          await page.evaluate(() => document.getElementById('btn-signup-direct-submit').click());
          await page.waitForTimeout(300);
          a.ok(await page.evaluate(() => !state.isLoggedIn), 'Not signed in before the contact is verified (Create now disabled=' + disabled + ')');
        } finally { await t.restore(); }

        // Verify, then Create now.
        await tap('#btn-signup-send-email-code');
        await page.waitForTimeout(300);
        await page.fill('#signup-email-code', VERIFY_CODE);
        await tap('#btn-signup-verify-email-code');
        await page.waitForTimeout(300);
        await h.acceptSignupTos(page);
        await tap('#btn-signup-direct-submit');
        await page.waitForTimeout(600);
        const r = await page.evaluate(() => ({ loggedIn: !!state.isLoggedIn, u: state.currentUser && state.currentUser.username, bio: state.currentUser && state.currentUser.bio, type: state.currentUser && state.currentUser.accountType }));
        a.ok(r.loggedIn && r.u === user, 'Create now signs the new account in: ' + JSON.stringify(r));
        a.ok(!r.bio, 'Skipping step 2 leaves the bio blank');
        a.equal(r.type, 'personal', 'The account is personal');
      }
    },
    {
      name: 'Account Center Sessions by taps: Log out other sessions asks first, Cancel keeps them, Confirm clears them; with none it says No other active sessions',
      accounts: ['personal'],
      covers: ['listener:#btn-ac-logout-other-sessions:click', 'listener:#btn-ac-cancel-logout-others:click', 'listener:#btn-ac-confirm-logout-others:click',
        'el:#btn-ac-logout-other-sessions', 'el:#btn-ac-cancel-logout-others', 'el:#btn-ac-confirm-logout-others'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        const key = await page.evaluate(() => 'pixly_sessions_' + getSecurityUsernameKey());
        const seed = [{ id: 'sess_int77_a', device: 'Chrome on Windows', location: 'Elsewhere', lastActive: Date.now() - 3600e3 }, { id: 'sess_int77_b', device: 'Safari on iPhone', location: 'Elsewhere', lastActive: Date.now() - 7200e3 }];
        await page.evaluate(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key, seed });
        const others = () => page.evaluate(() => getAccountSessions().filter((s) => !s.isCurrent).length);
        const t = await toasts(page);
        try {
          await openAcYourAccount(page, h);
          await tap('#btn-ac-tab-security-access');
          await page.waitForTimeout(120);
          await tap('#btn-ac-sa-tab-apps-sessions');
          await page.waitForTimeout(100);
          await tap('#btn-ac-open-sessions');
          await page.waitForTimeout(150);
          a.equal(await others(), 2, 'Two other sessions are seeded');
          await tap('#btn-ac-logout-other-sessions');
          await page.waitForTimeout(100);
          a.ok(await h.isVisible(page, '#ac-logout-others-confirm'), 'Log out other sessions asks for confirmation first');
          a.equal(await others(), 2, 'Nothing is logged out before confirming');
          await tap('#btn-ac-cancel-logout-others');
          await page.waitForTimeout(100);
          a.ok(!(await h.isVisible(page, '#ac-logout-others-confirm')), 'Cancel hides the confirmation');
          a.equal(await others(), 2, 'Cancel keeps the other sessions');
          await tap('#btn-ac-logout-other-sessions');
          await page.waitForTimeout(100);
          await tap('#btn-ac-confirm-logout-others');
          await page.waitForTimeout(150);
          a.equal(await others(), 0, 'Confirm logs out the other sessions');
          a.ok((await t.read()).some((m) => /logged out of all other sessions/i.test(m)), 'Confirms with a toast');
          const none = await page.evaluate(() => { const b = document.getElementById('btn-ac-logout-other-sessions'); return { disabled: !!b.disabled }; });
          if (!none.disabled) {
            await tap('#btn-ac-logout-other-sessions');
            await page.waitForTimeout(100);
            a.ok((await t.read()).some((m) => /no other active sessions/i.test(m)), 'Says No other active sessions');
          }
          a.ok(!(await h.isVisible(page, '#ac-logout-others-confirm')), 'With no other sessions there is nothing to confirm (button disabled=' + none.disabled + ')');
        } finally {
          await t.restore();
          await page.evaluate((key) => localStorage.removeItem(key), key);
          await closeAc(page);
        }
      }
    },
    {
      name: 'Account Center Blocked and Muted search boxes suggest matching accounts as you type; Close Friends Enter in the search box adds the user',
      accounts: ['personal'],
      covers: ['listener:#ac-blocked-search:input', 'listener:#ac-muted-search:input', 'listener:#ac-cf-add-form:submit', 'el:#ac-blocked-search', 'el:#ac-muted-search', 'el:#ac-cf-add-form'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        const target = await page.evaluate(() => {
          const me = normalizeUsername(state.currentUser.username);
          return collectKnownUsernames().find((u) => u !== me && !isBlocked(u) && !isMuted(u) && !isCloseFriend(u)) || '';
        });
        a.ok(target, 'There is a known account to search for');
        try {
          await openAcYourAccount(page, h);
          await tap('#btn-ac-tab-privacy-safety');
          await page.waitForTimeout(120);
          for (const kind of ['blocked', 'muted']) {
            await tap('#btn-ac-tab-' + kind);
            await page.waitForTimeout(120);
            await page.fill('#ac-' + kind + '-search', target.slice(0, Math.max(3, target.length - 1)));
            await page.waitForTimeout(100);
            const sug = await page.evaluate((k) => { const el = document.getElementById('ac-' + k + '-suggestions'); return { shown: !!(el && !el.classList.contains('hidden')), text: el ? el.textContent : '' }; }, kind);
            a.ok(sug.shown && sug.text.includes('@' + target), kind + ' search suggests @' + target + ': ' + sug.text.slice(0, 120));
            await page.fill('#ac-' + kind + '-search', '');
            await page.waitForTimeout(80);
            a.ok(await page.evaluate((k) => document.getElementById('ac-' + k + '-suggestions').classList.contains('hidden'), kind), kind + ': clearing the box hides suggestions');
            a.ok(await page.evaluate((u) => !isBlocked(u) && !isMuted(u), target), kind + ': typing alone blocks or mutes no one');
            await tap('#btn-ac-back');
            await page.waitForTimeout(100);
          }
          await tap('#btn-ac-back');
          await page.waitForTimeout(100);
          await tap('#btn-ac-tab-close-friends');
          await page.waitForTimeout(120);
          await page.fill('#ac-cf-search', target);
          await page.press('#ac-cf-search', 'Enter');
          await page.waitForTimeout(150);
          a.ok(await page.evaluate((u) => isCloseFriend(u), target), 'Enter in the Close Friends box adds @' + target);
          a.equal(await page.inputValue('#ac-cf-search'), '', 'The box is cleared after adding');
        } finally {
          await page.evaluate((u) => { if (typeof removeCloseFriend === 'function') removeCloseFriend(u); }, target).catch(() => {});
          await closeAc(page);
        }
      }
    },
    {
      name: 'Account Center Billing history and Deactivate by taps: History opens its view; Deactivate asks first and Cancel leaves the account active',
      accounts: ['personal'],
      covers: ['listener:#btn-ac-tab-billing-history:click', 'listener:#btn-ac-deactivate-account:click', 'listener:#btn-cancel-deactivate:click',
        'el:#btn-ac-tab-billing-history', 'el:#btn-ac-deactivate-account', 'el:#btn-cancel-deactivate'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        try {
          await openAcYourAccount(page, h);
          await tap('#btn-ac-tab-billing-history');
          await page.waitForTimeout(200);
          a.ok(await h.isVisible(page, '#ac-view-billing-history'), 'History opens the billing history view');
          await tap('#btn-ac-back');
          await page.waitForTimeout(120);
          await tap('#btn-ac-deactivate-account');
          await page.waitForTimeout(150);
          a.ok(await h.isVisible(page, '#modal-deactivate-confirm'), 'Deactivate opens a confirmation first');
          const u = await page.evaluate(() => normalizeUsername(state.currentUser.username));
          a.ok((await page.textContent('#deactivate-confirm-handle')).includes('@' + u), 'The confirmation names the account');
          await tap('#btn-cancel-deactivate');
          await page.waitForTimeout(150);
          a.ok(!(await h.isVisible(page, '#modal-deactivate-confirm')), 'Cancel closes the confirmation');
          const after = await page.evaluate((u) => ({ map: !!(getDeactivatedAccountsMap() || {})[u], loggedIn: !!state.isLoggedIn }), u);
          a.ok(!after.map && after.loggedIn, 'Cancel leaves the account active and signed in: ' + JSON.stringify(after));
        } finally {
          await page.evaluate(() => { if (typeof closeDeactivateConfirmModal === 'function') closeDeactivateConfirmModal(); });
          await closeAc(page);
        }
      }
    },
    {
      name: 'Account Center Associate by taps (business): the tab shows, Invite sends a pending invite, empty and own usernames are refused',
      accounts: ['business'],
      covers: ['listener:#btn-ac-tab-associate:click', 'listener:#btn-ac-invite-associate:click', 'el:#btn-ac-tab-associate', 'el:#btn-ac-invite-associate', 'el:#ac-associate-username-input'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        const me = await page.evaluate(() => normalizeUsername(state.currentUser.username));
        const target = await page.evaluate((me) => collectKnownUsernames().find((u) => u !== me && !getBusinessAssociatesList(me).some((g) => normalizeUsername(g.username) === u)) || '', me);
        const before = await page.evaluate((me) => JSON.stringify(getBusinessAssociatesList(me)), me);
        const t = await toasts(page);
        try {
          await openAcYourAccount(page, h);
          a.ok(await h.isVisible(page, '#btn-ac-tab-associate'), 'A business account sees the Associate tab');
          await tap('#btn-ac-tab-associate');
          await page.waitForTimeout(150);
          a.ok(await h.isVisible(page, '#ac-view-associate'), 'The tab opens the Associate view');
          await page.fill('#ac-associate-username-input', '');
          await tap('#btn-ac-invite-associate');
          await page.waitForTimeout(150);
          await page.fill('#ac-associate-username-input', me);
          await tap('#btn-ac-invite-associate');
          await page.waitForTimeout(150);
          let msgs = await t.read();
          a.ok(msgs.some((m) => /enter a username/i.test(m)), 'Empty username is refused: ' + JSON.stringify(msgs));
          a.ok(msgs.some((m) => /cannot associate your business with itself/i.test(m)), 'Own username is refused');
          await page.fill('#ac-associate-username-input', target);
          await tap('#btn-ac-invite-associate');
          await page.waitForTimeout(250);
          msgs = await t.read();
          const list = await page.evaluate((me) => getBusinessAssociatesList(me), me);
          a.ok(list.some((g) => String(g.username || '').toLowerCase().replace(/^@/, '') === target && g.status === 'pending'), 'A pending invite to @' + target + ' is listed');
          a.ok(msgs.some((m) => m.includes('Association invite sent to @' + target)), 'Confirms the invite');
          a.equal(await page.inputValue('#ac-associate-username-input'), '', 'The box is cleared');
        } finally {
          await t.restore();
          await page.evaluate(({ me, before }) => { try { saveBusinessAssociatesList(me, JSON.parse(before)); } catch (e) {} }, { me, before });
          await closeAc(page);
        }
      }
    },
    {
      name: 'Leave business by tap: an associated personal account can leave, the association is cleared and it is told it can accept another invite',
      accounts: ['personal'],
      covers: ['listener:#btn-ac-leave-associated-business:click', 'el:#btn-ac-leave-associated-business'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        const me = await page.evaluate(() => normalizeUsername(state.currentUser.username));
        await page.evaluate((me) => { saveAssociatedBusiness(me, { username: 'reg_business', fullName: 'Reg Business', avatar: '' }); if (typeof updateAssociateTabVisibility === 'function') updateAssociateTabVisibility(); }, me);
        const t = await toasts(page);
        try {
          await openAcYourAccount(page, h);
          a.ok(await h.isVisible(page, '#btn-ac-tab-associate'), 'An associated personal account sees the Associate tab');
          await tap('#btn-ac-tab-associate');
          await page.waitForTimeout(150);
          a.ok(await h.isVisible(page, '#btn-ac-leave-associated-business'), 'Leave business is shown');
          await tap('#btn-ac-leave-associated-business');
          await page.waitForTimeout(250);
          const assoc = await page.evaluate((me) => getAssociatedBusiness(me), me);
          a.ok(!assoc || !assoc.username, 'The association is cleared');
          a.ok((await t.read()).some((m) => /you left @reg_business/i.test(m)), 'Says you left @reg_business');
        } finally {
          await t.restore();
          await page.evaluate((me) => { try { saveAssociatedBusiness(me, null); } catch (e) {} }, me);
          await closeAc(page);
        }
      }
    },
    {
      name: 'Profile by taps: Edit profile opens the form and Save Changes saves it, Personal category tab, Create (+) opens Create, and the profile picture opens your story',
      accounts: ['personal'],
      covers: ['listener:#btn-edit-profile-modal:click', 'listener:#edit-profile-form:submit', 'listener:#btn-edit-account-personal:click', 'listener:#btn-open-create-modal:click',
        'listener:#btn-profile-pic:click', 'listener:#profile-avatar-container:click', 'el:#btn-edit-profile-modal', 'el:#btn-save-edit-profile', 'el:#btn-edit-account-personal', 'el:#btn-open-create-modal', 'el:#btn-profile-pic'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        const orig = await page.evaluate(() => state.currentUser.bio || '');
        const newBio = 'Interaction test bio ' + Date.now().toString(36);
        try {
          await h.gotoMainTab(page, 'profile');
          await tap('#btn-edit-profile-modal');
          await page.waitForTimeout(200);
          a.ok(await h.isVisible(page, '#modal-edit-profile'), 'Edit profile opens the form');
          // Personal category tab (switch to Business, then back to Personal).
          await tap('#btn-edit-account-business');
          await page.waitForTimeout(120);
          const mid = await page.evaluate(() => window._editingAccountType);
          await tap('#btn-edit-account-personal');
          await page.waitForTimeout(120);
          a.ok(mid === 'business' && await page.evaluate(() => window._editingAccountType === 'personal'), 'Business then Personal switches the category back to personal (mid=' + mid + ')');
          await page.fill('#edit-profile-bio', newBio);
          await tap('#btn-save-edit-profile');
          await page.waitForTimeout(500);
          const saved = await page.evaluate(() => state.currentUser.bio);
          a.equal(saved, newBio, 'Save Changes submits the form and saves the bio');

          await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
          await tap('#btn-open-create-modal');
          await page.waitForTimeout(200);
          a.ok(await h.isVisible(page, '#modal-create-post'), 'Create (+) opens the Create modal');
          await page.evaluate(() => { if (typeof closeCreatePostModal === 'function') closeCreatePostModal(); });

          // Profile picture: with a live story it opens the viewer; with none it says so.
          for (const sel of ['#btn-profile-pic', '#profile-avatar-container']) {
            await h.gotoMainTab(page, 'profile');
            const hasStory = await page.evaluate(() => pruneExpiredUserStories(true).length > 0);
            const t = await toasts(page);
            try {
              await tap(sel, { position: { x: 20, y: 20 } });
              await page.waitForTimeout(250);
              const open = await h.isVisible(page, '#modal-story-viewer');
              if (hasStory) a.ok(open, sel + ' opens your story');
              else a.ok(!open && (await t.read()).some((m) => /no active stories/i.test(m)), sel + ' says No active stories');
            } finally {
              await t.restore();
              await page.evaluate(() => { if (typeof closeStoryViewer === 'function') { try { closeStoryViewer(); } catch (e) {} } });
            }
          }
        } finally {
          await page.evaluate((b) => { state.currentUser.bio = b; if (typeof persistState === 'function') { try { persistState(); } catch (e) {} } }, orig);
          await h.closeOverlays(page);
        }
      }
    },
    {
      name: 'Viewed profile ... menu: Info & About by tap opens the Info tab of that profile',
      accounts: ['personal'],
      covers: ['listener:#btn-menu-info-about:click', 'el:#btn-menu-info-about'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        await page.evaluate(() => { if (typeof viewUserProfile === 'function') viewUserProfile('fresh_creator'); });
        await page.waitForTimeout(200);
        await tap('#btn-user-profile-more');
        await page.waitForTimeout(100);
        await tap('#btn-menu-info-about');
        await page.waitForTimeout(200);
        a.ok(await h.isVisible(page, '#user-profile-info-view'), 'Info & About shows the Info view');
        a.ok(!(await h.isVisible(page, '#menu-user-profile-more')), 'The menu closes');
        await h.gotoMainTab(page, 'home');
      }
    },
    {
      name: 'Story owner menu Close by tap hides the menu and resumes the story',
      accounts: ['personal'],
      covers: ['listener:#btn-close-story-owner-menu:click', 'el:#btn-close-story-owner-menu'],
      async run({ page, h, a }) {
        const tap = tapper(page);
        const added = await page.evaluate(() => {
          if (pruneExpiredUserStories(true).length > 0) return false;
          const u = state.currentUser.username;
          state.userStories = state.userStories || [];
          state.userStories.unshift({ id: Date.now(), username: u, image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', caption: 'int77', timestamp: Date.now(), createdAt: Date.now(), viewers: [] });
          return true;
        });
        try {
          await page.evaluate(() => openStoryViewer(0));
          await page.waitForTimeout(250);
          a.ok(await h.isVisible(page, '#modal-story-viewer'), 'Your story opens');
          await tap('#btn-story-owner-more');
          await page.waitForTimeout(120);
          a.ok(await h.isVisible(page, '#story-owner-menu'), 'The owner menu opens');
          await tap('#btn-close-story-owner-menu');
          await page.waitForTimeout(120);
          a.ok(!(await h.isVisible(page, '#story-owner-menu')), 'Close hides the owner menu');
          a.ok(await page.evaluate(() => state.storyPaused === false), 'The story resumes');
          a.ok(await h.isVisible(page, '#modal-story-viewer'), 'The story stays open');
        } finally {
          await page.evaluate(() => { if (typeof closeStoryViewer === 'function') { try { closeStoryViewer(); } catch (e) {} } });
          if (added) await page.evaluate(() => { state.userStories = (state.userStories || []).filter((s) => s.caption !== 'int77'); });
        }
      }
    }
  ]
};
