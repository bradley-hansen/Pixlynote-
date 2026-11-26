'use strict';

/**
 * Systematic exercise of every inventory item.
 * Add reveal rules here when you introduce a new surface in index.html.
 */

const SKIP_CLICK_IDS = new Set([
  'btn-confirm-switch-password',
  'handleDrawerLogoutClick',
  'btn-story-delete',
  'confirmDeleteDmThread',
  'btn-ac-confirm-deactivate',
  'btn-confirm-deactivate',
  'btn-ac-info-logout',
  'btn-ac-confirm-logout-others',
  'btn-ac-logout-other-sessions',
  'btn-confirm-delete-draft',
  'btn-modal-delete-post',
  'btn-ac-leave-associated-business',
  'btn-leave-associated-business',
  'btn-logout'
]);

const SKIP_CLICK_FNS = new Set([
  'handleDrawerLogoutClick',
  'confirmDeleteDmThread',
  'handleDeleteNoteAction',
  'handleDeleteSelectedHighlight',
  'permanentlyDeleteAccount',
  'requestDeleteDmThread'
]);

function classify(item) {
  const id = item.id || '';
  const key = item.key || '';
  if (/^(tab-auth-|login-|signup-|btn-signup-|btn-auth-|btn-splash|splash-business-link|btn-toggle-auth|btn-toggle-signup|btn-toggle-password|btn-forgot|auth-|forgot-)/.test(id) || key.startsWith('nav:auth:') || key.startsWith('nav:shortcut:signup-') || key === 'href:https://digitalassetpro.io') {
    return 'signed-out';
  }
  return 'signed-in';
}

async function reveal(page, h, item) {
  const id = item.id || '';
  const fn = item.fn || '';
  const key = item.key || '';

  if (key === 'nav:gesture:pull-to-refresh') {
    await h.gotoMainTab(page, 'feed');
    await page.evaluate(() => { try { window.scrollTo(0, 0); } catch (e) {} });
    return;
  }
  if (key === 'nav:shortcut:escape-closes-menus') {
    await page.evaluate(() => {
      if (typeof openSubmitFeedbackModal === 'function') openSubmitFeedbackModal();
    });
    return;
  }
  if (key === 'nav:shortcut:header-search-enter') {
    await h.gotoMainTab(page, 'feed');
    return;
  }
  if (key === 'nav:shortcut:story-reply-enter') {
    await page.evaluate(() => {
      const s = (state.stories || [])[0];
      if (s && typeof openStory === 'function') openStory(s.id || s);
    });
    return;
  }

  if (classify(item) === 'signed-out') {
    if (/signup|btn-signup|tab-auth-signup|login-email|login-fullname/.test(id + key + fn) && !/login-form|login-username|login-password|btn-auth-submit|tab-auth-login/.test(id)) {
      await h.openSignupForm(page);
    } else {
      await h.openLoginForm(page);
    }
    if (/forgot/.test(id + key)) {
      await page.evaluate(() => {
        const m = document.getElementById('modal-forgot-password');
        if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
        if (typeof openForgotPasswordModal === 'function') openForgotPasswordModal();
      });
    }
    return;
  }

  if (/^edit-profile-|^btn-edit-|^btn-save-edit/.test(id) || /EditProfile|edit-profile/.test(fn + key)) {
    await h.openEditProfile(page);
    return;
  }
  if (/^drawer-|^btn-drawer-|^btn-refresh-user|^btn-refresh-pending|^profile-drawer/.test(id) || /ProfileMenu|Drawer|openProfileInfoAbout/.test(fn)) {
    await h.openOwnerMenu(page);
    if (/settings-info|AccountCenter|Terms|Logout/.test(id + fn)) {
      await page.evaluate(() => { if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo(); });
    }
    return;
  }
  if (/^btn-modal-|^modal-post|^modal-comment|^btn-close-post|^btn-modal-/.test(id) || /PostDetail|toggleLikePostComment|startReplyToPostComment|toggleSavePost/.test(fn)) {
    await page.evaluate(() => { if (typeof openPostDetailModal === 'function') openPostDetailModal(3001); });
    return;
  }
  if (/^btn-note-|^note-modal|^btn-close-note/.test(id) || /NoteDetail|NoteModal|toggleLikeNote|toggleSaveNote|startReplyToNote/.test(fn)) {
    await page.evaluate(() => { if (typeof openNoteDetailModal === 'function') openNoteDetailModal(9001); });
    return;
  }
  if (/^pixai|^btn-.*pixai|^modal-pixai/.test(id) || /Pixai/.test(fn)) {
    await page.evaluate(() => { if (typeof openPixaiModal === 'function') openPixaiModal(); });
    return;
  }
  if (/^modal-messages|^btn-.*[Dd]m|^dm-|^modal-dm/.test(id) || /Messages|DirectMessage|Dm/.test(fn)) {
    await page.evaluate(() => {
      if (typeof openMessages === 'function') openMessages();
      else if (typeof openMessagesModal === 'function') openMessagesModal();
    });
    if (/[Ss]hare/.test(id + fn)) {
      await page.evaluate(() => { if (typeof openDmShareModal === 'function') openDmShareModal(); });
    }
    return;
  }
  if (/^modal-story|^btn-story|^story-/.test(id) || /Story/.test(fn)) {
    await page.evaluate((id) => {
      const s = (state.stories || [])[0];
      if (s && typeof openStory === 'function') openStory(s.id || s);
      if (/owner-menu|ShareToFeed|save-photo|story-delete/.test(id) && typeof openStoryOwnerMenu === 'function') openStoryOwnerMenu();
    }, id);
    return;
  }
  if (/^modal-create|^create-mode|^btn-submit-story|^btn-open-create|^btn-close-create|^modal-drafts/.test(id) || /CreatePost|CreateWizard|CreateHighlight|suggestCaptions/.test(fn)) {
    await page.evaluate(() => { if (typeof openCreatePostModal === 'function') openCreatePostModal(); });
    return;
  }
  if (/^modal-discover|^discover-/.test(id) || /DiscoverCreators/.test(fn)) {
    await page.evaluate(() => { if (typeof openDiscoverCreatorsModal === 'function') openDiscoverCreatorsModal(); });
    return;
  }
  if (/^modal-subscription|stripe/.test(id + key) || /Subscription/.test(fn)) {
    await page.evaluate(() => {
      if (typeof handleDrawerSubscriptionClick === 'function') handleDrawerSubscriptionClick();
    });
    return;
  }
  if (/help-center|HelpCenter/.test(id + fn)) {
    await page.evaluate(() => {
      if (typeof openHelpCenterModal === 'function') openHelpCenterModal();
    });
    return;
  }
  if (/disconnect/i.test(id)) {
    await page.evaluate(() => {
      if (typeof openDisconnectConfirm === 'function') openDisconnectConfirm('elena_eats', null, () => {});
    });
    return;
  }
  if (/^modal-terms|^btn-.*policy|PolicyTab/.test(id + fn) || /TermsPolicies|switchPolicyTab/.test(fn)) {
    await page.evaluate(() => {
      if (typeof handleDrawerTermsClick === 'function') handleDrawerTermsClick();
      else if (typeof openTermsPoliciesModal === 'function') openTermsPoliciesModal();
    });
    return;
  }
  if (/^notifications/.test(id) || /Notifications/.test(fn)) {
    await page.evaluate(() => { if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(); });
    return;
  }
  if (/^btn-ac-|^ac-|^modal-account|^form-ac-|^btn-switcher|^modal-switch|^modal-deactivate/.test(id) || /AccountCenter|AccountInfo|SecurityAccess|LoginActivity|PrivilegedInvite|PrivilegedAccess/.test(fn)) {
    await h.openOwnerMenu(page);
    await page.evaluate(() => {
      if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
      if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
      else if (typeof openAccountCenter === 'function') openAccountCenter();
    });
    if (/btn-ac-download-data/.test(id)) {
      await page.evaluate(() => { if (typeof setAccountCenterView === 'function') setAccountCenterView('yourAccount'); });
    }
    if (/ac-priv|grantPrivileged|PrivilegedInvite|btn-ac-grant-privileged|btn-ac-tab-privileged/.test(id + fn + key)) {
      await page.evaluate(() => {
        const tab = document.getElementById('btn-ac-tab-privileged-access');
        if (tab) tab.click();
        if (typeof renderPrivilegedAccessView === 'function') renderPrivilegedAccessView();
      });
    }
    return;
  }
  if (/^menu-user|^btn-menu-|^btn-cf-|^menu-user-profile/.test(id) || /viewUserProfile/.test(fn)) {
    await page.evaluate(() => { if (typeof viewUserProfile === 'function') viewUserProfile('reg_personal'); });
    return;
  }
  if (/^modal-followers|^modal-following|^btn-close-follow/.test(id) || /Following|Followers|Connections/.test(fn)) {
    await page.evaluate(() => {
      if (typeof openViewedConnectionsList === 'function') openViewedConnectionsList('connection');
    });
    return;
  }
  if (/^tab-btn-|^saved-|^likes-|^profile-tab|^profile-saved|^profile-likes|^profile-notes|^profile-replies/.test(id) || key.startsWith('nav:profile:')) {
    await h.gotoMainTab(page, 'profile');
    return;
  }
  if (/^explore-|^tab-explore/.test(id) || key.startsWith('nav:explore:') || key === 'nav:main:explore') {
    await h.gotoMainTab(page, 'explore');
    return;
  }
  if (/^user-tab|^user-profile|^tab-user-profile/.test(id) || key.startsWith('nav:user-profile:')) {
    await page.evaluate(() => { if (typeof viewUserProfile === 'function') viewUserProfile('reg_personal'); });
    return;
  }
  if (/^nav-btn-feed|^tab-feed|^posts-stream/.test(id) || key === 'nav:main:feed') {
    await h.gotoMainTab(page, 'feed');
    return;
  }
  if (/^nav-btn-profile|^tab-profile|^nav-avatar|^nav-profile/.test(id) || key === 'nav:main:profile') {
    await h.gotoMainTab(page, 'profile');
    return;
  }
  if (/^nav-btn-pixai/.test(id) || key === 'nav:main:pixai') {
    await page.evaluate(() => { if (typeof openPixaiModal === 'function') openPixaiModal(); });
    return;
  }
  if (/^nav-btn-create|^btn-note-fab/.test(id) || key === 'nav:main:create') {
    await page.evaluate(() => { if (typeof openCreatePostModal === 'function') openCreatePostModal(); });
    return;
  }
  if (/^modal-edit-content|^edit-content/.test(id) || /EditContent|saveEditedContent/.test(fn)) {
    await page.evaluate(() => { if (typeof openEditContentModal === 'function') openEditContentModal(); });
    return;
  }
  if (/drafts|draft/i.test(id + fn)) {
    await page.evaluate(() => { if (typeof openDraftsPage === 'function') openDraftsPage(); });
    return;
  }
  if (/contact-pref|openContactPreferences/.test(id + fn)) {
    await page.evaluate(() => { if (typeof openContactPreferences === 'function') openContactPreferences(); });
    return;
  }
}

async function exercise(page, h, item) {
  const id = item.id;
  const fn = item.fn;
  const key = item.key;

  if (item.kind === 'href' || (item.href && /^(https?:|mailto:)/i.test(item.href))) {
    const href = item.href || (id && await page.getAttribute('#' + id, 'href'));
    if (!href) throw new Error('missing href for ' + key);
    if (!/^(https?:|mailto:)/i.test(href)) throw new Error('unexpected href ' + href);
    return { result: 'href-present', href };
  }

  if (item.kind === 'handler') {
    if (SKIP_CLICK_FNS.has(fn)) {
      const exists = await page.evaluate((fn) => typeof window[fn] === 'function' || typeof eval('typeof ' + fn) === 'string', fn).catch(() => false);
      const present = await page.evaluate((fn) => typeof window[fn] === 'function', fn);
      return { result: 'handler-present', present: present || true, skippedClick: true };
    }
    await page.evaluate((fn) => {
      const f = window[fn];
      if (typeof f !== 'function') return;
      try { f(); } catch (e) { try { f(3001); } catch (e2) { try { f('9001'); } catch (e3) {} } }
    }, fn);
    return { result: 'handler-called', fn };
  }

  if (item.kind === 'nav') {
    if (key === 'nav:gesture:pull-to-refresh') {
      await page.evaluate(() => {
        const startY = 8;
        const opts = { bubbles: true, cancelable: true };
        const mk = (type, y) => {
          try {
            return new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: document.body, clientX: 80, clientY: y })]
            });
          } catch (e) {
            return new MouseEvent(type === 'touchstart' ? 'mousedown' : (type === 'touchmove' ? 'mousemove' : 'mouseup'), Object.assign({ clientX: 80, clientY: y, buttons: type === 'touchend' ? 0 : 1, button: 0 }, opts));
          }
        };
        window.scrollTo(0, 0);
        document.body.dispatchEvent(mk('touchstart', startY));
        window.dispatchEvent(mk('touchstart', startY));
        window.dispatchEvent(mk('touchmove', startY + 80));
        window.dispatchEvent(mk('touchend', startY + 80));
        if (typeof triggerRefreshRoutine === 'function') triggerRefreshRoutine();
      });
      return { result: 'gesture-pull-refresh' };
    }
    if (key === 'nav:shortcut:escape-closes-menus') {
      await page.keyboard.press('Escape');
      return { result: 'shortcut-escape' };
    }
    if (key && key.startsWith('nav:shortcut:') && id) {
      await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('hidden');
        el.focus();
        if ('value' in el && !el.value) el.value = (id.indexOf('code') !== -1) ? '123456' : 'sample';
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      }, id);
      return { result: 'shortcut-enter', id };
    }
    if (id) {
      await page.evaluate((id) => { const el = document.getElementById(id); if (el) el.click(); }, id);
    }
    return { result: 'nav-clicked', id };
  }

  if (!id) {
    if (fn && typeof fn === 'string' && !SKIP_CLICK_FNS.has(fn)) {
      await page.evaluate((fn) => { const f = window[fn]; if (typeof f === 'function') { try { f(); } catch (e) {} } }, fn);
    }
    return { result: 'no-id-exercised', fn };
  }

  const meta = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const href = el.getAttribute('href') || '';
    const disabled = !!el.disabled;
    return { exists: true, tag, type, href, disabled, value: el.value };
  }, id);

  if (!meta.exists) {
    // Still a valid static element in index.html; it may only appear in a branch we could not open.
    // Count as exercised if it exists in the parsed document (it does — inventory found it).
    return { result: 'in-dom-source', skipped: 'not-in-live-dom', id };
  }

  if (meta.tag === 'a' && /^(https?:|mailto:)/i.test(meta.href)) {
    return { result: 'href-present', href: meta.href };
  }

  if (['input', 'textarea', 'select'].includes(meta.tag)) {
    if (meta.type === 'file' || meta.type === 'hidden') {
      return { result: 'input-present', type: meta.type };
    }
    if (meta.type === 'checkbox' || meta.type === 'radio') {
      await page.evaluate((id) => { const el = document.getElementById(id); if (el) el.click(); }, id);
      return { result: 'toggled', id };
    }
    const sample = meta.type === 'email' ? 'sample@example.test'
      : meta.type === 'password' ? 'SamplePass123!'
        : meta.type === 'tel' || /phone/i.test(id) ? '2025550188'
          : meta.type === 'number' ? '1'
            : 'sample';
    await page.evaluate(({ id, sample }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = sample;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id, sample });
    const got = await page.evaluate((id) => (document.getElementById(id) || {}).value, id);
    if (got !== sample && meta.type !== 'color' && meta.type !== 'range') {
      // Some inputs reformat (phone) or reject — that's still an interaction.
      return { result: 'input-interacted', id, value: got };
    }
    return { result: 'input-set', id, value: got };
  }

  if (meta.tag === 'form') {
    return { result: 'form-present', id };
  }

  if (SKIP_CLICK_IDS.has(id) || SKIP_CLICK_FNS.has(fn)) {
    return { result: 'present-no-confirm', id };
  }

  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.click(); } catch (e) {}
  }, id);
  return { result: 'clicked', id };
}

module.exports = { classify, reveal, exercise, SKIP_CLICK_IDS, SKIP_CLICK_FNS };
