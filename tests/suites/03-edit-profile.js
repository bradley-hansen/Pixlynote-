'use strict';

const { VERIFY_CODE, ALL_ACCOUNT_KEYS } = require('../helpers/harness');


async function profileSnapshot(page) {
  return page.evaluate(() => {
    const u = state.currentUser || {};
    const fields = {};
    const keys = window.STORED_PROFILE_FIELDS || ['fullName', 'email', 'phone', 'bio', 'link', 'accountType'];
    keys.forEach((k) => { fields[k] = u[k] == null ? '' : u[k]; });
    const writes = window.__pixlyUserDocWrites || [];
    return {
      fields,
      writeCount: writes.length,
      lastEdit: [...writes].reverse().find((w) => w.source === 'edit-profile') || null
    };
  });
}

async function submitEditProfile(page) {
  await page.evaluate(() => {
    const form = document.getElementById('edit-profile-form');
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    else document.getElementById('btn-save-edit-profile')?.click();
  });
}

function assertSameStoredFields(a, before, after, label) {
  const keys = Object.keys(before.fields);
  keys.forEach((k) => {
    a.equal(String(after.fields[k] == null ? '' : after.fields[k]), String(before.fields[k] == null ? '' : before.fields[k]), label + ' did not change stored ' + k);
  });
  a.equal(after.writeCount, before.writeCount, label + ' did not write a profile document');
}

function isVisiblyShown(entry) {
  return !!(entry && entry.exists && !entry.hidden);
}

async function readContactUi(page, kind) {
  return page.evaluate((kind) => {
    const vis = (el) => {
      if (!el) return { exists: false, hidden: true, text: '' };
      const cs = getComputedStyle(el);
      let hidden = el.classList.contains('hidden') || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
      let node = el.parentElement;
      while (node && node !== document.body) {
        const pcs = getComputedStyle(node);
        if (node.classList.contains('hidden') || pcs.display === 'none' || pcs.visibility === 'hidden') hidden = true;
        node = node.parentElement;
      }
      const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
        ? String(el.value || '')
        : String(el.textContent || '').trim();
      return { exists: true, hidden, display: cs.display, text };
    };
    const sendId = kind === 'phone' ? 'btn-edit-send-phone-code' : 'btn-edit-send-email-code';
    const send = document.getElementById(sendId);
    const scs = send ? getComputedStyle(send) : null;
    return {
      send: send ? {
        exists: true,
        hidden: send.classList.contains('hidden') || !!(scs && scs.display === 'none'),
        disabled: !!send.disabled,
        text: String(send.textContent || '').trim()
      } : { exists: false, hidden: true, disabled: true, text: '' },
      status: vis(document.getElementById(kind === 'phone' ? 'edit-profile-phone-status' : 'edit-profile-email-status')),
      error: vis(document.getElementById(kind === 'phone' ? 'edit-profile-phone-error' : 'edit-profile-email-error')),
      panel: vis(document.getElementById(kind === 'phone' ? 'edit-profile-phone-verify-panel' : 'edit-profile-email-verify-panel')),
      wrap: vis(document.getElementById(kind === 'phone' ? 'edit-profile-phone-code-wrap' : 'edit-profile-email-code-wrap')),
      input: vis(document.getElementById(kind === 'phone' ? 'edit-profile-phone-code' : 'edit-profile-email-code')),
      verifyStatus: vis(document.getElementById(kind === 'phone' ? 'edit-profile-phone-verify-status' : 'edit-profile-email-verify-status')),
      field: vis(document.getElementById(kind === 'phone' ? 'edit-profile-phone' : 'edit-profile-email')),
      saved: (state.currentUser && state.currentUser[kind === 'phone' ? 'phone' : 'email']) || ''
    };
  }, kind);
}

function codeEntryVisible(ui) {
  return isVisiblyShown(ui.panel) && isVisiblyShown(ui.wrap) && isVisiblyShown(ui.input);
}

async function installVerifyCallLog(page) {
  await page.evaluate(() => {
    if (window.__editVerifyLogInstalled) return;
    window.__editVerifyLogInstalled = true;
    window.__editVerifyCalls = [];
    const origFetch = window.fetch.bind(window);
    window.__origFetchForEditVerify = origFetch;
    window.fetch = async function (url, opts) {
      const u = String(url || '');
      if (/\/email(?:\/|\?|$)|\/sms\//.test(u)) {
        let payload = null;
        try { payload = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
        window.__editVerifyCalls.push({ url: u, payload });
      }
      return origFetch(url, opts);
    };
  });
}

async function readVerifyCalls(page) {
  return page.evaluate(() => (window.__editVerifyCalls || []).slice());
}

async function setVerifySendFailure(page, fail) {
  await page.evaluate((fail) => {
    const orig = window.__origFetchForEditVerify || window.fetch.bind(window);
    if (!window.__origFetchForEditVerify) window.__origFetchForEditVerify = orig;
    if (!fail) {
      window.fetch = orig;
      return;
    }
    window.fetch = async function (url, opts) {
      const u = String(url || '');
      const isSend = (/\/sms\/send/.test(u) || (/\/email(?:\/|\?|$)/.test(u) && !/signup-verify|reset-verify/.test(u)));
      if (isSend) {
        return new Response(JSON.stringify({ error: 'sms_unavailable', message: 'Could not send the verification code.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return orig(url, opts);
    };
  }, fail);
}


async function editSaveBlockers(page) {
  return page.evaluate(() => {
    const nameVal = ((document.getElementById('edit-profile-name') || {}).value || '').trim();
    const email = (typeof editProfileEmailValue === 'function') ? editProfileEmailValue() : '';
    const phoneRaw = (typeof editProfilePhoneRaw === 'function') ? editProfilePhoneRaw() : '';
    const v = (state && state.editProfileVerify) || {};
    const reasons = [];
    if (!nameVal) reasons.push('missing-name');
    if (!email && !phoneRaw) reasons.push('missing-contact');
    if (email && typeof editProfileEmailChanged === 'function' && editProfileEmailChanged() && typeof editEmailLooksValid === 'function' && !editEmailLooksValid(email)) reasons.push('invalid-email');
    if (email && typeof editProfileEmailChanged === 'function' && editProfileEmailChanged() && typeof editProfileEmailVerified === 'function' && !editProfileEmailVerified()) reasons.push('email-unverified');
    if (phoneRaw && typeof editProfilePhoneChanged === 'function' && editProfilePhoneChanged() && typeof editProfilePhoneValue === 'function' && !editProfilePhoneValue()) reasons.push('invalid-phone');
    if (phoneRaw && typeof editProfilePhoneChanged === 'function' && editProfilePhoneChanged() && typeof editProfilePhoneVerified === 'function' && !editProfilePhoneVerified()) reasons.push('phone-unverified');
    if (v.usernameTaken) reasons.push('username-taken');
    if (v.emailTaken && typeof editProfileEmailChanged === 'function' && editProfileEmailChanged()) reasons.push('email-taken');
    if (v.phoneTaken && typeof editProfilePhoneChanged === 'function' && editProfilePhoneChanged()) reasons.push('phone-taken');
    return {
      can: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : null,
      reasons,
      nameVal,
      email,
      phoneRaw,
      emailChanged: (typeof editProfileEmailChanged === 'function') ? editProfileEmailChanged() : null,
      phoneChanged: (typeof editProfilePhoneChanged === 'function') ? editProfilePhoneChanged() : null,
      emailVerified: (typeof editProfileEmailVerified === 'function') ? editProfileEmailVerified() : null,
      phoneVerified: (typeof editProfilePhoneVerified === 'function') ? editProfilePhoneVerified() : null,
      verify: JSON.parse(JSON.stringify(v))
    };
  });
}

async function typeContactField(page, selector) {
  await page.evaluate((selector) => {
    const el = document.getElementById(selector.replace(/^#/, '')) || document.querySelector(selector);
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector);
}


const TINY_AVATAR_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function last10Digits(v) {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

async function readAllEditFields(page) {
  return page.evaluate(() => {
    const val = (id) => {
      const el = document.getElementById(id);
      return el ? String(el.value || '') : '';
    };
    const u = (state && state.currentUser) || {};
    const preview = document.getElementById('edit-profile-avatar-preview');
    const modal = document.getElementById('edit-profile-modal');
    const modalOpen = typeof isEditProfileModalOpen === 'function'
      ? isEditProfileModalOpen()
      : !!(modal && !modal.classList.contains('hidden'));
    return {
      modalOpen,
      name: modalOpen ? val('edit-profile-name') : String(u.fullName || ''),
      username: modalOpen ? val('edit-profile-username') : String(u.username || ''),
      email: modalOpen ? val('edit-profile-email') : String(u.email || ''),
      phone: modalOpen ? val('edit-profile-phone') : String(u.phone || ''),
      bio: modalOpen ? val('edit-profile-bio') : String(u.bio || ''),
      link: modalOpen ? val('edit-profile-link') : String(u.link || ''),
      accountType: modalOpen ? String(window._editingAccountType || u.accountType || '') : String(u.accountType || ''),
      avatar: (preview && preview.src) || u.avatar || '',
      state: {
        name: String(u.fullName || ''),
        username: String(u.username || ''),
        email: String(u.email || ''),
        phone: String(u.phone || ''),
        bio: String(u.bio || ''),
        link: String(u.link || ''),
        accountType: String(u.accountType || ''),
        avatar: String(u.avatar || ''),
        isPlus: u.isPlus === true,
        isBusinessPlus: u.isBusinessPlus === true,
        governmentVerified: u.governmentVerified === true,
        organizationVerified: u.organizationVerified === true,
        postCount: (state.posts || []).length,
        followingCount: (state.following || []).length
      }
    };
  });
}

function assertEveryField(a, got, expected, label) {
  a.equal(String(got.name || '').trim(), expected.fullName, label + ' keeps name: ' + JSON.stringify(got));
  a.equal(String(got.username || '').toLowerCase(), expected.username, label + ' keeps username');
  a.equal(String(got.email || '').toLowerCase(), expected.email.toLowerCase(), label + ' keeps email');
  a.equal(last10Digits(got.phone), last10Digits(expected.phone), label + ' keeps phone: ' + got.phone);
  a.equal(String(got.bio || ''), expected.bio, label + ' keeps bio');
  a.ok(String(got.link || '').includes(expected.linkPart), label + ' keeps website: ' + got.link);
  a.equal(String(got.accountType || ''), expected.accountType, label + ' keeps account category');
  a.ok(String(got.avatar || '').indexOf('data:image') === 0 && String(got.avatar).length > 40, label + ' keeps photo: ' + String(got.avatar).slice(0, 48));
  if (got.state) {
    a.equal(String(got.state.name || '').trim(), expected.fullName, label + ' stores name on the user');
    a.equal(String(got.state.username || '').toLowerCase(), expected.username, label + ' stores username on the user');
    a.equal(String(got.state.email || '').toLowerCase(), expected.email.toLowerCase(), label + ' stores email on the user');
    a.equal(last10Digits(got.state.phone), last10Digits(expected.phone), label + ' stores phone on the user: ' + got.state.phone);
    a.equal(String(got.state.bio || ''), expected.bio, label + ' stores bio on the user');
    a.ok(String(got.state.link || '').includes(expected.linkPart), label + ' stores website on the user: ' + got.state.link);
    a.equal(String(got.state.accountType || ''), expected.accountType, label + ' stores account category on the user');
    a.ok(String(got.state.avatar || '').indexOf('data:image') === 0 && String(got.state.avatar).length > 40, label + ' stores photo on the user');
  }
}

function assertProtectedUnchanged(a, before, after, label) {
  a.equal(after.isPlus, before.isPlus, label + ' does not blank Plus');
  a.equal(after.isBusinessPlus, before.isBusinessPlus, label + ' does not blank Business Plus');
  a.equal(after.governmentVerified, before.governmentVerified, label + ' does not blank government verification');
  a.equal(after.organizationVerified, before.organizationVerified, label + ' does not blank organization verification');
  a.ok(after.postCount >= before.postCount, label + ' does not drop posts: ' + after.postCount + ' < ' + before.postCount);
  a.ok(after.followingCount >= before.followingCount, label + ' does not drop following: ' + after.followingCount + ' < ' + before.followingCount);
}

async function stubLocalUsernameRename(page) {
  await page.evaluate(() => {
    const apply = async function (oldU, newU) {
      const oldKey = String(oldU || '').toLowerCase();
      const newKey = String(newU || '').toLowerCase();
      if (!oldKey || !newKey || oldKey === newKey) return true;
      const u = state && state.currentUser;
      if (u) u.username = newKey;
      try {
        const recRaw = localStorage.getItem('pixly_account_' + oldKey) || localStorage.getItem('pixlynote_user_' + oldKey);
        const rec = recRaw ? JSON.parse(recRaw) : ((u && typeof u === 'object') ? Object.assign({}, u) : {});
        rec.username = newKey;
        localStorage.setItem('pixly_account_' + newKey, JSON.stringify(rec));
        const accts = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
        accts[newKey] = Object.assign({}, accts[oldKey] || rec, { username: newKey });
        localStorage.setItem('pixly_accounts', JSON.stringify(accts));
        localStorage.setItem('pixly_active_username', newKey);
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        keys.forEach((k) => {
          if (!k || k.indexOf(oldKey) === -1) return;
          const moved = k.split(oldKey).join(newKey);
          if (moved !== k && localStorage.getItem(moved) == null) {
            localStorage.setItem(moved, localStorage.getItem(k));
          }
        });
      } catch (e) {}
      return true;
    };
    try { renameAccountUsername = apply; } catch (e) {}
    window.renameAccountUsername = apply;
  });
}

async function verifyAndAcceptContact(page, a, kind, value) {
  const field = kind === 'phone' ? '#edit-profile-phone' : '#edit-profile-email';
  const send = kind === 'phone' ? '#btn-edit-send-phone-code' : '#btn-edit-send-email-code';
  const code = kind === 'phone' ? '#edit-profile-phone-code' : '#edit-profile-email-code';
  const verify = kind === 'phone' ? '#btn-edit-verify-phone-code' : '#btn-edit-verify-email-code';
  await page.fill(field, value);
  await typeContactField(page, field);
  await page.waitForFunction((kind) => {
    const statusId = kind === 'phone' ? 'edit-profile-phone-status' : 'edit-profile-email-status';
    const sendId = kind === 'phone' ? 'btn-edit-send-phone-code' : 'btn-edit-send-email-code';
    const status = document.getElementById(statusId);
    const btn = document.getElementById(sendId);
    const text = status ? String(status.textContent || '') : '';
    return /available/i.test(text) && !!(btn && !btn.disabled && !btn.classList.contains('hidden'));
  }, kind, { timeout: 4000 });
  const ready = await readContactUi(page, kind);
  a.ok(/available/i.test(ready.status.text), 'Available is shown for the new ' + kind + ' before Send code: ' + JSON.stringify(ready));
  a.ok(!ready.send.hidden && !ready.send.disabled, 'Send code is enabled for the new ' + kind);
  await page.click(send);
  await page.waitForTimeout(250);
  const afterSend = await readContactUi(page, kind);
  a.ok(codeEntryVisible(afterSend), 'A code-entry box appears for ' + kind + ' after Send code: ' + JSON.stringify(afterSend));
  await page.fill(code, VERIFY_CODE);
  await page.click(verify);
  await page.waitForTimeout(200);
  const verified = await readContactUi(page, kind);
  const okRe = kind === 'phone' ? /Phone verified/i : /Email verified/i;
  a.ok(okRe.test(verified.verifyStatus.text), 'The correct ' + kind + ' code verifies: ' + verified.verifyStatus.text);
}

async function hardReloadKeepSession(page, h) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
  await h.installAppStubs(page);
}

async function resetSharedAccountPage(page, h, account) {
  await page.evaluate(() => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach((k) => { if (k) localStorage.removeItem(k); });
    } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try { window._activeUserDocCache = null; } catch (e) {}
    try { window._pendingSubscriptionCancelOnSave = null; } catch (e) {}
    try { window._offerSubscriptionAfterSave = null; } catch (e) {}
    try { window._cloudUserDirectoryError = null; } catch (e) {}
  });
  const port = Number(new URL(page.url()).port) || Number(process.env.REGRESSION_PORT || 8091);
  await h.loadApp(page, { port: port });
  await h.installAppStubs(page);
  await h.loginAs(page, account);
}

async function pullToRefreshProfile(page) {
  return page.evaluate(async () => {
    const u = (state && state.currentUser) || {};
    const name = (typeof normalizeUsername === 'function') ? normalizeUsername(u.username || '') : String(u.username || '').toLowerCase();
    if (typeof applyActiveUserDocData === 'function') {
      applyActiveUserDocData(name, {
        username: name,
        fullName: '',
        email: '',
        phone: '',
        bio: '',
        link: '',
        avatar: '',
        accountType: u.accountType
      }, false);
    }
    if (typeof applyPullRefreshData === 'function') await applyPullRefreshData();
    else if (typeof triggerRefreshRoutine === 'function') triggerRefreshRoutine();
    return true;
  });
}



module.exports = {
  name: 'Edit Profile',
  tests: [
    {
      name: 'Edit Profile: Send code appears on a changed email row',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-edit-profile-modal', 'el:#edit-profile-email', 'el:#btn-edit-send-email-code', 'el:#edit-profile-email-verify-panel', 'el:#edit-profile-email-code', 'el:#btn-edit-verify-email-code', 'el:#btn-edit-resend-email-code', 'handler:openEditProfileModal', 'handler:sendEditEmailCode'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const open = await h.isVisible(page, '#modal-edit-profile');
        a.ok(open, 'Edit Profile modal opens for @' + account.username);
        await page.fill('#edit-profile-email', 'new.' + account.username + '@example.test');
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(120);
        const send = await page.evaluate(() => {
          const b = document.getElementById('btn-edit-send-email-code');
          if (!b) return { exists: false };
          const cs = getComputedStyle(b);
          return { exists: true, hidden: b.classList.contains('hidden') || cs.display === 'none', disabled: !!b.disabled, text: (b.textContent || '').trim() };
        });
        a.ok(send.exists && !send.hidden, 'Send code shows on the changed email row: ' + JSON.stringify(send));
        a.ok(!send.disabled, 'Send code is enabled for a free new email');
      }
    },
    {
      name: 'Edit Profile: Send code appears on a changed phone row',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-phone', 'el:#btn-edit-send-phone-code', 'el:#edit-profile-phone-verify-panel', 'el:#edit-profile-phone-code', 'el:#btn-edit-verify-phone-code', 'el:#btn-edit-resend-phone-code', 'handler:sendEditPhoneCode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openEditProfile(page);
        await page.fill('#edit-profile-phone', '2025550199');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(120);
        const send = await page.evaluate(() => {
          const b = document.getElementById('btn-edit-send-phone-code');
          if (!b) return { exists: false };
          const cs = getComputedStyle(b);
          return { exists: true, hidden: b.classList.contains('hidden') || cs.display === 'none', disabled: !!b.disabled };
        });
        a.ok(send.exists && !send.hidden && !send.disabled, 'Send code shows on the changed phone row: ' + JSON.stringify(send));
      }
    },
    {
      name: 'Edit Profile: a taken email or phone is flagged live while typing and blocks Send code',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-email-error', 'el:#edit-profile-phone-error', 'el:#edit-profile-email-status', 'el:#edit-profile-phone-status'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        // Taken email (built-in), unless this account is bradley which we are not.
        await page.fill('#edit-profile-email', 'bradley.g.hansen@hotmail.com');
        await typeContactField(page, '#edit-profile-email');
        await page.waitForTimeout(150);
        const emailState = await readContactUi(page, 'email');
        a.ok(/already taken/i.test(emailState.status.text), 'Taken email shows already taken while typing: ' + JSON.stringify(emailState));
        a.ok(emailState.send.disabled, 'Send code is blocked for a taken email: ' + JSON.stringify(emailState.send));

        const freeEmail = 'free.' + account.username + '@example.test';
        await page.fill('#edit-profile-email', freeEmail);
        await typeContactField(page, '#edit-profile-email');
        await page.waitForTimeout(150);
        const freeState = await readContactUi(page, 'email');
        a.ok(/available/i.test(freeState.status.text), 'A free email shows available while typing: ' + JSON.stringify(freeState));
        a.ok(!freeState.send.disabled && !freeState.send.hidden, 'Send code is enabled for an available email: ' + JSON.stringify(freeState.send));

        await page.fill('#edit-profile-phone', '6092896702');
        await typeContactField(page, '#edit-profile-phone');
        await page.waitForTimeout(150);
        const phoneState = await readContactUi(page, 'phone');
        a.ok(/already taken/i.test(phoneState.status.text), 'Taken phone shows already taken while typing: ' + JSON.stringify(phoneState));
        a.ok(phoneState.send.disabled, 'Send code is blocked for a taken phone: ' + JSON.stringify(phoneState.send));

        await page.fill('#edit-profile-phone', '2025550147');
        await typeContactField(page, '#edit-profile-phone');
        await page.waitForTimeout(150);
        const freePhone = await readContactUi(page, 'phone');
        a.ok(/available/i.test(freePhone.status.text), 'A free phone shows available while typing: ' + JSON.stringify(freePhone));
        a.ok(!freePhone.send.disabled && !freePhone.send.hidden, 'Send code is enabled for an available phone: ' + JSON.stringify(freePhone.send));
      }
    },
    {
      name: 'Edit Profile: phone is flagged live while typing, shows available, and blocks Send code when taken',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-phone', 'el:#edit-profile-phone-status', 'el:#btn-edit-send-phone-code', 'handler:scheduleEditContactCheck', 'handler:syncEditProfileVerifyUi'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        // Live, debounced — same behavior as email: status updates as the field is modified, before Send code.
        await page.fill('#edit-profile-phone', '6092896702');
        await typeContactField(page, '#edit-profile-phone');
        await page.waitForTimeout(450);
        const taken = await readContactUi(page, 'phone');
        a.ok(/already taken/i.test(taken.status.text), 'A taken phone shows already taken inline while typing, before Send code: ' + JSON.stringify(taken));
        a.ok(isVisiblyShown(taken.status), 'The taken status is visible under the phone field');
        a.ok(taken.send.disabled, 'Send code is blocked for a taken phone: ' + JSON.stringify(taken.send));

        await page.fill('#edit-profile-phone', '2025550166');
        await typeContactField(page, '#edit-profile-phone');
        await page.waitForTimeout(450);
        const available = await readContactUi(page, 'phone');
        a.ok(/available/i.test(available.status.text), 'A free phone shows available inline while typing, before Send code: ' + JSON.stringify(available));
        a.ok(isVisiblyShown(available.status), 'The available status is visible under the phone field');
        a.ok(!available.send.disabled && !available.send.hidden, 'Send code is enabled for an available phone: ' + JSON.stringify(available.send));
      }
    },
    {
      name: 'Edit Profile: username shows taken or available and Save stays off when taken',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-username', 'el:#edit-profile-username-status', 'el:#btn-save-edit-profile', 'listener:#edit-profile-username:input'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        // Taken username (not self)
        const takenName = account.username === 'pixlynote' ? 'bradley_hansen' : 'pixlynote';
        await page.fill('#edit-profile-username', takenName);
        await page.evaluate(() => {
          document.getElementById('edit-profile-username')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        const taken = await page.evaluate(() => {
          const st = (document.getElementById('edit-profile-username-status') || document.getElementById('edit-profile-username-error') || {}).textContent || '';
          const btn = document.getElementById('btn-save-edit-profile');
          const can = (typeof editProfileCanSave === 'function') ? editProfileCanSave() : null;
          return { st, disabled: !!(btn && btn.disabled), can };
        });
        a.ok(/taken/i.test(taken.st), 'Shows "Username taken": ' + JSON.stringify(taken));
        a.ok(taken.disabled || taken.can === false, 'Save is disabled while the username is taken');

        await page.fill('#edit-profile-username', 'free_name_' + account.username);
        await page.evaluate(() => {
          document.getElementById('edit-profile-username')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        const free = await page.evaluate(() => (document.getElementById('edit-profile-username-status') || {}).textContent || '');
        a.ok(/available/i.test(free), 'Shows "Username available" for a free name: ' + free);
      }
    },
    {
      name: 'Edit Profile: name, bio and website can be saved without a code when contact fields are unchanged',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-form', 'el:#edit-profile-name', 'el:#edit-profile-bio', 'el:#edit-profile-website', 'el:#edit-profile-link', 'el:#btn-save-edit-profile', 'el:#edit-profile-email-verified-badge'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const nameSel = await page.evaluate(() => {
          const ids = ['edit-profile-name', 'edit-profile-fullname', 'edit-full-name', 'edit-profile-full-name'];
          return ids.find((id) => document.getElementById(id)) || (document.querySelector('#modal-edit-profile input[name="fullName"], #modal-edit-profile input[name="name"]') || {}).id || '';
        });
        const bioId = await page.evaluate(() => (document.getElementById('edit-profile-bio') || document.querySelector('#modal-edit-profile textarea')) ? (document.getElementById('edit-profile-bio') || document.querySelector('#modal-edit-profile textarea')).id : '');
        const linkId = await page.evaluate(() => {
          const ids = ['edit-profile-website', 'edit-profile-link', 'edit-profile-url'];
          return ids.find((id) => document.getElementById(id)) || '';
        });
        const newName = account.fullName + ' Edited';
        const newBio = 'Updated bio without a code';
        const newLink = 'https://example.test/updated';
        if (nameSel) await page.fill('#' + nameSel, newName);
        if (bioId) await page.fill('#' + bioId, newBio);
        if (linkId) await page.fill('#' + linkId, newLink);
        const can = await page.evaluate(() => (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !document.getElementById('btn-save-edit-profile')?.disabled);
        a.ok(can, 'Save is enabled when only name/bio/website changed');
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const isOfficial = String(account.username || '').toLowerCase() === 'pixlynote';
        const saved = await page.evaluate(() => ({
          name: state.currentUser && state.currentUser.fullName,
          bio: state.currentUser && state.currentUser.bio,
          link: state.currentUser && (state.currentUser.link || state.currentUser.website)
        }));
        // renderProfile() keeps the official @pixlynote display name, but bio and website must persist like every other account.
        if (isOfficial) {
          a.equal(saved.name, 'Pixlynote', 'Official account display name stays Pixlynote after save');
        } else {
          a.equal(saved.name, newName, 'Name was saved on the current user');
        }
        a.equal(saved.bio, newBio, 'Bio was saved on the current user');
        a.ok((saved.link || '').includes('example.test/updated'), 'Website was saved on the current user: ' + saved.link);
        // Re-open the modal and confirm the fields show the saved (or officially locked) values.
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          const m = document.getElementById('modal-edit-profile');
          if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
        });
        await h.openEditProfile(page);
        const fields = await page.evaluate(({ nameSel, bioId, linkId }) => ({
          name: nameSel ? ((document.getElementById(nameSel) || {}).value || '') : '',
          bio: bioId ? ((document.getElementById(bioId) || {}).value || '') : '',
          link: linkId ? ((document.getElementById(linkId) || {}).value || '') : ''
        }), { nameSel, bioId, linkId });
        if (isOfficial) {
          if (nameSel) a.equal(fields.name, 'Pixlynote', 'Reopened official modal keeps the locked display name');
        } else {
          if (nameSel) a.equal(fields.name, newName, 'Reopened modal shows the saved name');
        }
        if (bioId) a.equal(fields.bio, newBio, 'Reopened modal shows the saved bio');
        if (linkId) a.ok((fields.link || '').includes('example.test/updated'), 'Reopened modal shows the saved website');
      }
    },
    {
      name: 'Edit Profile: switching category starts the other type\'s name empty and requires a name to save',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-edit-account-personal', 'el:#btn-edit-account-business', 'el:#lbl-edit-profile-name', 'el:#edit-profile-name', 'el:#btn-save-edit-profile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const start = await page.evaluate(() => {
          const nameInp = document.getElementById('edit-profile-name');
          const save = document.getElementById('btn-save-edit-profile');
          const lbl = document.getElementById('lbl-edit-profile-name');
          return {
            type: window._editingAccountType || (state.currentUser && state.currentUser.accountType) || 'personal',
            name: nameInp ? nameInp.value : '',
            placeholder: nameInp ? (nameInp.placeholder || '') : '',
            label: lbl ? (lbl.textContent || '').trim() : '',
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled)
          };
        });
        const isBiz = start.type === 'business';
        const savedName = start.name;
        a.ok(savedName, 'Current category opens with the saved name: ' + savedName);
        a.ok(start.canSave && !start.saveDisabled, 'Save is enabled when the saved name for this category is present');
        a.equal(start.label, isBiz ? 'Display Name' : 'Full Name', 'Label matches the current category');

        const otherBtn = isBiz ? '#btn-edit-account-personal' : '#btn-edit-account-business';
        const backBtn = isBiz ? '#btn-edit-account-business' : '#btn-edit-account-personal';
        await page.click(otherBtn);
        await page.waitForTimeout(80);
        const switched = await page.evaluate(() => {
          const nameInp = document.getElementById('edit-profile-name');
          const save = document.getElementById('btn-save-edit-profile');
          const lbl = document.getElementById('lbl-edit-profile-name');
          const extras = ['edit-profile-category', 'edit-profile-business-category', 'edit-profile-business-contact', 'edit-profile-contact', 'edit-profile-address', 'edit-profile-business-address']
            .map((id) => {
              const el = document.getElementById(id);
              return el ? { id, value: el.value || '' } : null;
            })
            .filter(Boolean);
          return {
            type: window._editingAccountType,
            name: nameInp ? nameInp.value : 'MISSING',
            placeholder: nameInp ? (nameInp.placeholder || '') : '',
            label: lbl ? (lbl.textContent || '').trim() : '',
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled),
            extras
          };
        });
        a.equal(switched.type, isBiz ? 'personal' : 'business', 'Switcher selected the other category');
        a.equal(switched.name, '', 'The other category\'s name is not copied from the current name (got "' + switched.name + '")');
        a.ok((switched.placeholder || '').trim(), 'Empty name field shows a placeholder: ' + switched.placeholder);
        a.equal(switched.label, isBiz ? 'Full Name' : 'Display Name', 'Label updates for the other category');
        a.ok(!switched.canSave && switched.saveDisabled, 'Save is disabled until the new category name is filled');
        switched.extras.forEach((f) => {
          a.equal(f.value, '', 'Type-only field #' + f.id + ' starts empty');
        });

        await page.click(backBtn);
        await page.waitForTimeout(80);
        const restored = await page.evaluate(() => {
          const nameInp = document.getElementById('edit-profile-name');
          const save = document.getElementById('btn-save-edit-profile');
          const lbl = document.getElementById('lbl-edit-profile-name');
          return {
            type: window._editingAccountType,
            name: nameInp ? nameInp.value : '',
            label: lbl ? (lbl.textContent || '').trim() : '',
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled)
          };
        });
        a.equal(restored.type, start.type, 'Switcher returns to the original category');
        a.equal(restored.name, savedName, 'Saved name for the original category is restored unchanged');
        a.equal(restored.label, start.label, 'Original label is restored');
        a.ok(restored.canSave && !restored.saveDisabled, 'Save is enabled again after the saved name is restored');

        await page.click(otherBtn);
        await page.waitForTimeout(50);
        const typedName = isBiz ? 'Pat Person' : 'Acme Test Co';
        await page.fill('#edit-profile-name', typedName);
        await page.evaluate(() => {
          document.getElementById('edit-profile-name')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const afterType = await page.evaluate(() => {
          const save = document.getElementById('btn-save-edit-profile');
          return {
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled),
            name: (document.getElementById('edit-profile-name') || {}).value || ''
          };
        });
        a.equal(afterType.name, typedName, 'Typed name is accepted');
        a.ok(afterType.canSave && !afterType.saveDisabled, 'Save enables once the new category name is filled');

        await page.click(backBtn);
        await page.waitForTimeout(80);
        const backAgain = await page.evaluate(() => (document.getElementById('edit-profile-name') || {}).value || '');
        a.equal(backAgain, savedName, 'Switching back still keeps the original saved name unchanged');
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    }    ,
    {
      name: 'Edit Profile: a conflicting phone or email keeps other typed fields and uses a clear message',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#edit-profile-email',
        'el:#edit-profile-phone',
        'el:#edit-profile-bio',
        'el:#edit-profile-link',
        'el:#edit-profile-email-error',
        'el:#edit-profile-phone-error',
        'el:#btn-save-edit-profile',
        'handler:editProfilePhoneConflictMessage',
        'handler:editProfileEmailConflictMessage'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const originalEmail = await page.evaluate(() => ((document.getElementById('edit-profile-email') || {}).value || ''));
        const typedBio = 'Keep this bio after a phone conflict';
        const typedLink = 'https://example.test/keep-after-conflict';
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-link', typedLink);
        await page.fill('#edit-profile-phone', '6092896702');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(150);
        const afterPhone = await page.evaluate(() => {
          const toast = (document.getElementById('toast-text') || {}).textContent || '';
          const err = (document.getElementById('edit-profile-phone-error') || {}).textContent || '';
          return {
            toast,
            err,
            email: ((document.getElementById('edit-profile-email') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            link: ((document.getElementById('edit-profile-link') || {}).value || ''),
            phone: ((document.getElementById('edit-profile-phone') || {}).value || '')
          };
        });
        a.ok(/This number is already used by another account\. Remove it and use your email instead\./.test(afterPhone.err + ' ' + afterPhone.toast), 'Phone conflict uses the clear Remove it and use your email message');
        a.equal(afterPhone.email, originalEmail, 'A phone conflict does not clear the email the user already had');
        a.equal(afterPhone.bio, typedBio, 'A phone conflict does not wipe a typed bio');
        a.ok((afterPhone.link || '').includes('example.test/keep-after-conflict'), 'A phone conflict does not wipe a typed website');
        a.ok(/609/.test(afterPhone.phone.replace(/\D/g, '')) || afterPhone.phone.length > 0, 'The conflicting phone stays in the field so the user can delete it');

        await page.fill('#edit-profile-email', 'bradley.g.hansen@hotmail.com');
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(150);
        const afterEmail = await page.evaluate(() => {
          const toast = (document.getElementById('toast-text') || {}).textContent || '';
          const err = (document.getElementById('edit-profile-email-error') || {}).textContent || '';
          return {
            toast,
            err,
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            link: ((document.getElementById('edit-profile-link') || {}).value || '')
          };
        });
        a.ok(/This email is already used by another account\. Remove it and use your phone instead\./.test(afterEmail.err + ' ' + afterEmail.toast), 'Email conflict uses the matching Remove it and use your phone message');
        a.equal(afterEmail.bio, typedBio, 'An email conflict does not wipe a typed bio');
        a.ok((afterEmail.link || '').includes('example.test/keep-after-conflict'), 'An email conflict does not wipe a typed website');
      }
    },
    {
      name: 'Edit Profile: removing a phone saves and stays gone when an email remains',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-phone', 'el:#edit-profile-email', 'el:#btn-save-edit-profile', 'handler:openEditProfileModal'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const before = await page.evaluate(() => ({
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || '')
        }));
        a.ok(before.email, 'The account already has an email so the phone can be removed');
        await page.fill('#edit-profile-phone', '');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const afterSave = await page.evaluate(() => ({
          phone: state.currentUser && (state.currentUser.phone || ''),
          email: state.currentUser && (state.currentUser.email || '')
        }));
        a.equal(afterSave.phone, '', 'The saved profile does not keep the removed phone');
        a.equal(afterSave.email, before.email, 'The existing email is still on the profile after the phone is removed');
        if (typeof afterSave.email === 'string' && afterSave.email) {
          // already asserted
        }
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          if (typeof renderProfile === 'function') renderProfile();
        });
        await h.openEditProfile(page);
        const reopened = await page.evaluate(() => ({
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          statePhone: state.currentUser && (state.currentUser.phone || '')
        }));
        a.equal(reopened.phone, '', 'Reopening Edit Profile does not bring the removed phone back');
        a.equal(reopened.statePhone, '', 'renderProfile does not restore a deleted phone');
        a.equal(reopened.email, before.email, 'The email is still in the form after reopen');
      }
    },
    {
      name: 'Edit Profile: a changed email requires a code, then saves after the code is accepted',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#edit-profile-email',
        'el:#btn-edit-send-email-code',
        'el:#edit-profile-email-code',
        'el:#btn-edit-verify-email-code',
        'el:#btn-save-edit-profile',
        'el:#edit-profile-email-error',
        'handler:sendEditEmailCode',
        'handler:verifyEditEmailCode',
        'handler:validateEditProfileForm'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const newEmail = 'verify.' + account.username + '@example.test';
        const typedBio = 'Bio typed with a new email';
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-email', newEmail);
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(150);
        const beforeBlock = await profileSnapshot(page);
        const blocked = await page.evaluate(() => {
          const toast = (document.getElementById('toast-text') || {}).textContent || '';
          const err = (document.getElementById('edit-profile-email-error') || {}).textContent || '';
          const send = document.getElementById('btn-edit-send-email-code');
          const cs = send ? getComputedStyle(send) : null;
          const modal = document.getElementById('modal-edit-profile');
          return {
            toast,
            err,
            sendVisible: !!(send && !send.classList.contains('hidden') && cs && cs.display !== 'none'),
            email: ((document.getElementById('edit-profile-email') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            savedEmail: state.currentUser && (state.currentUser.email || ''),
            modalOpen: !!(modal && !modal.classList.contains('hidden'))
          };
        });
        const afterBlock = await profileSnapshot(page);
        a.ok(/Verify your new email with the code before saving/.test(blocked.err + ' ' + blocked.toast), 'Saving a changed email without a code shows the verify-before-saving message: ' + JSON.stringify({ err: blocked.err, toast: blocked.toast }));
        a.ok(blocked.sendVisible, 'Send code stays visible so the user can verify the new email');
        a.equal(blocked.email, newEmail, 'The typed email is still in the field after a blocked save');
        a.equal(blocked.bio, typedBio, 'The typed bio is still in the field after a blocked email save');
        a.ok(blocked.modalOpen, 'The Edit Profile modal stays open after a blocked save');
        a.ok(blocked.savedEmail !== newEmail, 'The new email is not saved until the code is accepted');
        assertSameStoredFields(a, beforeBlock, afterBlock, 'An unverified email');

        await page.click('#btn-edit-send-email-code');
        await page.waitForTimeout(200);
        const codeUi = await readContactUi(page, 'email');
        a.ok(codeEntryVisible(codeUi), 'The email code field is actually visible after Send code: ' + JSON.stringify(codeUi));
        await page.fill('#edit-profile-email-code', VERIFY_CODE);
        await page.click('#btn-edit-verify-email-code');
        await page.waitForTimeout(200);
        const verified = await page.evaluate(() => {
          const status = (document.getElementById('edit-profile-email-verify-status') || {}).textContent || '';
          const can = (typeof editProfileCanSave === 'function') ? editProfileCanSave() : false;
          return { status, can };
        });
        a.ok(/Email verified/i.test(verified.status), 'The form confirms the email code was accepted: ' + verified.status);
        a.ok(verified.can, 'Save is enabled after the email code is accepted');
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          if (typeof renderProfile === 'function') renderProfile();
        });
        await h.openEditProfile(page);
        const saved = await page.evaluate(() => ({
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          stateEmail: state.currentUser && (state.currentUser.email || ''),
          stateBio: state.currentUser && (state.currentUser.bio || '')
        }));
        a.equal(saved.email, newEmail, 'The verified email is in the form after reopen');
        a.equal(saved.stateEmail, newEmail, 'The verified email stayed on the profile after render');
        a.equal(saved.bio, typedBio, 'The bio typed with the email change is still in the form');
        a.equal(saved.stateBio, typedBio, 'The bio typed with the email change stayed on the profile');
      }
    }    ,
    {
      name: 'Edit Profile: every stored field survives save, reload, and reopen on a business account',
      accounts: ['business', 'pixlynote'],
      covers: [
        'el:#edit-profile-bio',
        'el:#edit-profile-link',
        'el:#edit-profile-dba-name',
        'el:#edit-profile-business-industry',
        'el:#edit-profile-business-street',
        'el:#edit-profile-business-city',
        'el:#edit-profile-business-state',
        'el:#edit-profile-business-postal',
        'el:#edit-profile-address-visibility',
        'el:#edit-profile-business-hours',
        'el:#edit-profile-support-email',
        'el:#btn-save-edit-profile',
        'handler:fillEditProfileBusinessFields',
        'handler:mergeStoredProfileFields',
        'handler:applyActiveUserDocData'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const values = {
          fullName: 'Round Trip ' + account.username,
          bio: 'Round-trip bio for ' + account.username,
          link: 'example.test/round-trip-' + account.username,
          dbaName: 'Round Trip DBA',
          businessIndustry: 'software_tech',
          businessStreet: '12 Harbor Rd',
          businessCity: 'Galloway',
          businessState: 'NJ',
          businessPostal: '08205',
          businessAddressVisibility: 'city_state',
          businessHours: 'Mon-Fri 9am-5pm EST',
          businessSupportEmail: 'support.' + account.username + '@example.test'
        };
        const beforeEmail = await page.evaluate(() => ((document.getElementById('edit-profile-email') || {}).value || ''));
        const beforePhone = await page.evaluate(() => ((document.getElementById('edit-profile-phone') || {}).value || ''));
        const beforeName = await page.evaluate(() => ((document.getElementById('edit-profile-name') || {}).value || ''));
        // The official @pixlynote display name stays "Pixlynote"; other business accounts can rename.
        if (account.username === 'pixlynote') values.fullName = beforeName || 'Pixlynote';
        else await page.fill('#edit-profile-name', values.fullName);
        await page.fill('#edit-profile-bio', values.bio);
        await page.fill('#edit-profile-link', values.link);
        await page.fill('#edit-profile-dba-name', values.dbaName);
        await page.selectOption('#edit-profile-business-industry', values.businessIndustry);
        await page.fill('#edit-profile-business-street', values.businessStreet);
        await page.fill('#edit-profile-business-city', values.businessCity);
        await page.fill('#edit-profile-business-state', values.businessState);
        await page.fill('#edit-profile-business-postal', values.businessPostal);
        await page.selectOption('#edit-profile-address-visibility', values.businessAddressVisibility);
        await page.fill('#edit-profile-business-hours', values.businessHours);
        await page.fill('#edit-profile-support-email', values.businessSupportEmail);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await submitEditProfile(page);
        await page.waitForTimeout(250);
        const stored = await page.evaluate(() => {
          const u = state.currentUser || {};
          const doc = { username: u.username, accountType: u.accountType };
          (window.STORED_PROFILE_FIELDS || []).forEach(function (k) {
            if (u[k] !== undefined) doc[k] = u[k];
          });
          const writes = (window.__pixlyUserDocWrites || []).filter((w) => w.source === 'edit-profile');
          doc.write = writes.length ? writes[writes.length - 1] : null;
          doc.editWriteCount = writes.length;
          return doc;
        });
        a.equal(stored.editWriteCount, 1, 'A successful save writes the profile document once');
        a.equal(stored.fullName, values.fullName, 'Display name was saved on the business account');
        a.equal(stored.bio, values.bio, 'Bio was saved on the business account');
        a.equal(stored.link, 'https://example.test/round-trip-' + account.username, 'Website was saved and normalized to https://');
        a.equal(stored.email, beforeEmail, 'Existing email was kept on the same save');
        a.equal(stored.phone, beforePhone, 'Existing phone was kept on the same save');
        a.ok(stored.write && stored.write.source === 'edit-profile', 'The save recorded a single edit-profile document write');
        a.equal(stored.write && stored.write.data && stored.write.data.link, stored.link, 'The Firestore payload includes the normalized website');
        a.equal(stored.write && stored.write.data && stored.write.data.email, beforeEmail, 'The Firestore payload includes the email');
        a.equal(stored.write && stored.write.data && stored.write.data.bio, values.bio, 'The Firestore payload includes the bio');
        a.equal(stored.write && stored.write.data && stored.write.data.dbaName, values.dbaName, 'The Firestore payload includes the DBA');
        a.equal(stored.dbaName, values.dbaName, 'DBA was saved');
        a.equal(stored.businessIndustry, values.businessIndustry, 'Industry was saved');
        a.equal(stored.businessStreet, values.businessStreet, 'Street was saved');
        a.equal(stored.businessCity, values.businessCity, 'City was saved');
        a.equal(stored.businessState, values.businessState, 'State was saved');
        a.equal(stored.businessPostal, values.businessPostal, 'Postal code was saved');
        a.equal(stored.businessAddressVisibility, values.businessAddressVisibility, 'Address visibility was saved');
        a.equal(stored.businessHours, values.businessHours, 'Hours were saved');
        a.equal(stored.businessSupportEmail, values.businessSupportEmail, 'Support email was saved');

        await page.evaluate((doc) => {
          const u = state.currentUser;
          const drop = ['dbaName','businessIndustry','businessIndustryOther','businessStreet','businessCity','businessState','businessPostal','businessAddressVisibility','businessHours','businessSupportEmail','bio','link'];
          drop.forEach(function (k) { delete u[k]; });
          u._loadedProfileFields = { fullName: true, email: true, phone: true, accountType: true };
          window._lastLocalProfileWriteTs = 0;
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          const m = document.getElementById('modal-edit-profile');
          if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
          const uname = (typeof normalizeUsername === 'function') ? normalizeUsername(u.username) : String(u.username || '').toLowerCase();
          if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(uname, doc, false);
          else if (typeof mergeStoredProfileFields === 'function') mergeStoredProfileFields(u, doc);
        }, stored);
        await h.openEditProfile(page);
        const fields = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || ''),
          dba: ((document.getElementById('edit-profile-dba-name') || {}).value || ''),
          industry: ((document.getElementById('edit-profile-business-industry') || {}).value || ''),
          street: ((document.getElementById('edit-profile-business-street') || {}).value || ''),
          city: ((document.getElementById('edit-profile-business-city') || {}).value || ''),
          stateVal: ((document.getElementById('edit-profile-business-state') || {}).value || ''),
          postal: ((document.getElementById('edit-profile-business-postal') || {}).value || ''),
          vis: ((document.getElementById('edit-profile-address-visibility') || {}).value || ''),
          hours: ((document.getElementById('edit-profile-business-hours') || {}).value || ''),
          support: ((document.getElementById('edit-profile-support-email') || {}).value || '')
        }));
        a.equal(fields.name, values.fullName, 'Reopened modal shows the saved display name after a reload');
        a.equal(fields.email, beforeEmail, 'Reopened modal shows the saved email after a reload');
        a.equal(fields.phone, beforePhone, 'Reopened modal shows the saved phone after a reload');
        a.equal(fields.bio, values.bio, 'Reopened modal shows the saved bio after a reload');
        a.equal(fields.link, 'https://example.test/round-trip-' + account.username, 'Reopened modal shows the saved https website after a reload');
        a.equal(fields.dba, values.dbaName, 'Reopened modal shows the saved DBA after a reload');
        a.equal(fields.industry, values.businessIndustry, 'Reopened modal shows the saved industry after a reload');
        a.equal(fields.street, values.businessStreet, 'Reopened modal shows the saved street after a reload');
        a.equal(fields.city, values.businessCity, 'Reopened modal shows the saved city after a reload');
        a.equal(fields.stateVal, values.businessState, 'Reopened modal shows the saved state after a reload');
        a.equal(fields.postal, values.businessPostal, 'Reopened modal shows the saved postal code after a reload');
        a.equal(fields.vis, values.businessAddressVisibility, 'Reopened modal shows the saved address visibility after a reload');
        a.equal(fields.hours, values.businessHours, 'Reopened modal shows the saved hours after a reload');
        a.equal(fields.support, values.businessSupportEmail, 'Reopened modal shows the saved support email after a reload');
        await page.evaluate(() => {
          window._activeUserDocCache = null;
          if (state.currentUser && state.currentUser._loadedProfileFields) {
            ['dbaName','businessIndustry','businessIndustryOther','businessStreet','businessCity','businessState','businessPostal','businessAddressVisibility','businessHours','businessSupportEmail'].forEach((k) => {
              delete state.currentUser[k];
              delete state.currentUser._loadedProfileFields[k];
            });
          }
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'Edit Profile: a stale or partial render cannot blank stored business fields',
      accounts: ['business', 'pixlynote'],
      covers: [
        'handler:publicSafeUserFields',
        'handler:omitUnloadedPublicUserFields',
        'handler:mergeStoredProfileFields',
        'handler:fillEditProfileBusinessFields',
        'el:#edit-profile-dba-name',
        'el:#edit-profile-business-industry',
        'el:#edit-profile-business-city',
        'el:#edit-profile-business-hours',
        'el:#edit-profile-support-email'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const stored = {
          dbaName: 'Keep DBA',
          businessIndustry: 'software_tech',
          businessIndustryOther: '',
          businessStreet: '12 Harbor Rd',
          businessCity: 'Galloway',
          businessState: 'NJ',
          businessPostal: '08205',
          businessAddressVisibility: 'city_state',
          businessHours: 'Mon-Fri 9am-5pm EST',
          businessSupportEmail: 'keep.support@example.test'
        };
        const persist = await page.evaluate((stored) => {
          const u = state.currentUser;
          const drop = Object.keys(stored);
          drop.forEach(function (k) { delete u[k]; });
          u._loadedProfileFields = { email: true, phone: true, bio: true, link: true, accountType: true, fullName: true };
          window._activeUserDocCache = {
            username: u.username,
            data: Object.assign({ username: u.username, accountType: u.accountType || 'business', email: u.email || '', phone: u.phone || '', bio: u.bio || '', link: u.link || '' }, stored),
            at: Date.now()
          };
          const rec = (typeof publicSafeUserFields === 'function') ? publicSafeUserFields(u) : {};
          return rec;
        }, stored);
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'dbaName'), 'A partial profile persist does not write a blank DBA');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessIndustry'), 'A partial profile persist does not write a blank industry');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessCity'), 'A partial profile persist does not write a blank city');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessState'), 'A partial profile persist does not write a blank state');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessPostal'), 'A partial profile persist does not write a blank postal code');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessHours'), 'A partial profile persist does not write blank hours');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessSupportEmail'), 'A partial profile persist does not write a blank support email');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessStreet'), 'A partial profile persist does not write a blank street');

        await h.openEditProfile(page);
        const fields = await page.evaluate(() => ({
          dba: ((document.getElementById('edit-profile-dba-name') || {}).value || ''),
          industry: ((document.getElementById('edit-profile-business-industry') || {}).value || ''),
          city: ((document.getElementById('edit-profile-business-city') || {}).value || ''),
          stateVal: ((document.getElementById('edit-profile-business-state') || {}).value || ''),
          postal: ((document.getElementById('edit-profile-business-postal') || {}).value || ''),
          hours: ((document.getElementById('edit-profile-business-hours') || {}).value || ''),
          support: ((document.getElementById('edit-profile-support-email') || {}).value || ''),
          street: ((document.getElementById('edit-profile-business-street') || {}).value || '')
        }));
        a.equal(fields.dba, stored.dbaName, 'Opening Edit Profile fills DBA from stored data even after a partial render');
        a.equal(fields.industry, stored.businessIndustry, 'Opening Edit Profile fills industry from stored data even after a partial render');
        a.equal(fields.city, stored.businessCity, 'Opening Edit Profile fills city from stored data even after a partial render');
        a.equal(fields.stateVal, stored.businessState, 'Opening Edit Profile fills state from stored data even after a partial render');
        a.equal(fields.postal, stored.businessPostal, 'Opening Edit Profile fills postal code from stored data even after a partial render');
        a.equal(fields.hours, stored.businessHours, 'Opening Edit Profile fills hours from stored data even after a partial render');
        a.equal(fields.support, stored.businessSupportEmail, 'Opening Edit Profile fills support email from stored data even after a partial render');
        a.equal(fields.street, stored.businessStreet, 'Opening Edit Profile fills street from stored data even after a partial render');
        await page.evaluate(() => {
          window._activeUserDocCache = null;
          if (state.currentUser && state.currentUser._loadedProfileFields) {
            ['dbaName','businessIndustry','businessIndustryOther','businessStreet','businessCity','businessState','businessPostal','businessAddressVisibility','businessHours','businessSupportEmail'].forEach((k) => {
              delete state.currentUser[k];
              delete state.currentUser._loadedProfileFields[k];
            });
          }
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'Edit Profile: every stored field survives save, reload, and reopen on a personal account',
      accounts: ['personal', 'empty'],
      covers: [
        'el:#edit-profile-name',
        'el:#edit-profile-email',
        'el:#edit-profile-phone',
        'el:#edit-profile-bio',
        'el:#edit-profile-link',
        'el:#btn-save-edit-profile',
        'handler:validateEditProfileForm'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const values = {
          fullName: 'Round Trip ' + account.username,
          bio: 'Personal round-trip bio for ' + account.username,
          link: 'example.test/personal-' + account.username
        };
        const beforeEmail = await page.evaluate(() => ((document.getElementById('edit-profile-email') || {}).value || ''));
        const beforePhone = await page.evaluate(() => ((document.getElementById('edit-profile-phone') || {}).value || ''));
        a.ok(beforeEmail, 'The personal account already has an email');
        await page.fill('#edit-profile-name', values.fullName);
        await page.fill('#edit-profile-bio', values.bio);
        await page.fill('#edit-profile-link', values.link);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await submitEditProfile(page);
        await page.waitForTimeout(250);
        const stored = await page.evaluate(() => {
          const u = state.currentUser || {};
          const writes = (window.__pixlyUserDocWrites || []).filter((w) => w.source === 'edit-profile');
          return {
            fullName: u.fullName || '',
            email: u.email || '',
            phone: u.phone || '',
            bio: u.bio || '',
            link: u.link || '',
            writeCount: writes.length,
            write: writes.length ? writes[writes.length - 1] : null
          };
        });
        a.equal(stored.fullName, values.fullName, 'Display name was saved on the personal account');
        a.equal(stored.bio, values.bio, 'Bio was saved on the personal account');
        a.equal(stored.link, 'https://example.test/personal-' + account.username, 'Website was saved and normalized to https://');
        a.equal(stored.email, beforeEmail, 'Existing email was kept on the same save');
        a.equal(stored.phone, beforePhone, 'Existing phone was kept on the same save');
        a.equal(stored.writeCount, 1, 'A successful personal save writes the profile document once');
        a.equal(stored.write && stored.write.data && stored.write.data.link, stored.link, 'The Firestore payload includes the normalized website');
        a.equal(stored.write && stored.write.data && stored.write.data.email, beforeEmail, 'The Firestore payload includes the email');

        await page.evaluate((doc) => {
          const u = state.currentUser;
          ['fullName', 'email', 'phone', 'bio', 'link'].forEach(function (k) { delete u[k]; });
          u._loadedProfileFields = { accountType: true };
          window._lastLocalProfileWriteTs = 0;
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          const m = document.getElementById('modal-edit-profile');
          if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
          const uname = (typeof normalizeUsername === 'function') ? normalizeUsername(u.username) : String(u.username || '').toLowerCase();
          if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(uname, doc, false);
          else if (typeof mergeStoredProfileFields === 'function') mergeStoredProfileFields(u, doc);
        }, { username: account.username, fullName: stored.fullName, email: stored.email, phone: stored.phone, bio: stored.bio, link: stored.link, accountType: 'personal' });
        await h.openEditProfile(page);
        const fields = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || '')
        }));
        a.equal(fields.name, values.fullName, 'Reopened personal modal shows the saved name');
        a.equal(fields.email, beforeEmail, 'Reopened personal modal shows the saved email');
        a.equal(fields.phone, beforePhone, 'Reopened personal modal shows the saved phone');
        a.equal(fields.bio, values.bio, 'Reopened personal modal shows the saved bio');
        a.equal(fields.link, 'https://example.test/personal-' + account.username, 'Reopened personal modal shows the saved https website');
        await page.evaluate(() => {
          window._activeUserDocCache = null;
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'Edit Profile: an invalid website is blocked inline and does not drop other typed fields',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-link', 'el:#edit-profile-link-error', 'el:#edit-profile-bio', 'el:#btn-save-edit-profile', 'handler:validateEditProfileForm', 'handler:normalizeWebsiteUrl'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const typedBio = 'Bio kept with a bad website';
        const bad = 'javascript:alert(1)';
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-link', bad);
        const before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(150);
        const after = await profileSnapshot(page);
        const ui = await page.evaluate(() => {
          const modal = document.getElementById('modal-edit-profile');
          return {
            err: (document.getElementById('edit-profile-link-error') || {}).textContent || '',
            toast: (document.getElementById('toast-text') || {}).textContent || '',
            link: ((document.getElementById('edit-profile-link') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            modalOpen: !!(modal && !modal.classList.contains('hidden')),
            stateLink: state.currentUser && (state.currentUser.link || ''),
            stateBio: state.currentUser && (state.currentUser.bio || '')
          };
        });
        a.ok(/valid website/i.test(ui.err + ' ' + ui.toast), 'An invalid website shows an inline error: ' + JSON.stringify({ err: ui.err, toast: ui.toast }));
        a.equal(ui.link, bad, 'The invalid website stays in the field instead of vanishing');
        a.equal(ui.bio, typedBio, 'The typed bio is still in the field after a blocked website save');
        a.ok(ui.modalOpen, 'The modal stays open so the user can fix the website');
        a.ok(ui.stateLink !== bad && !/javascript:/i.test(ui.stateLink || ''), 'The invalid website is not stored on the profile');
        a.ok(ui.stateBio !== typedBio || after.writeCount === before.writeCount, 'A blocked website save does not persist the bio alone');
        assertSameStoredFields(a, before, after, 'An invalid website');
      }
    },
    {
      name: 'Edit Profile: each validation failure writes nothing and keeps typed fields',
      accounts: ['personal', 'business'],
      covers: [
        'el:#edit-profile-name',
        'el:#edit-profile-email',
        'el:#edit-profile-phone',
        'el:#edit-profile-support-email',
        'el:#edit-profile-support-email-error',
        'handler:validateEditProfileForm',
        'handler:editProfileEmailConflictMessage',
        'handler:editProfilePhoneConflictMessage'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const isBiz = account.accountType === 'business';
        await h.openEditProfile(page);
        const originalName = await page.evaluate(() => ((document.getElementById('edit-profile-name') || {}).value || ''));
        const typedBio = 'Keep this bio through failed saves';
        const typedLink = 'https://example.test/keep-on-fail-' + account.username;
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-link', typedLink);

        // Missing name
        await page.fill('#edit-profile-name', '');
        let before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        let after = await profileSnapshot(page);
        let ui = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || ''),
          toast: (document.getElementById('toast-text') || {}).textContent || ''
        }));
        a.ok(/required/i.test(ui.toast), 'A missing name shows a required-name message: ' + ui.toast);
        a.equal(ui.name, '', 'The name field stays empty so the user can fill it');
        a.equal(ui.bio, typedBio, 'A missing name does not drop the typed bio');
        a.ok((ui.link || '').includes('keep-on-fail-'), 'A missing name does not drop the typed website');
        assertSameStoredFields(a, before, after, 'A missing name');
        await page.fill('#edit-profile-name', originalName);

        // Missing email and phone
        await page.fill('#edit-profile-email', '');
        await page.fill('#edit-profile-phone', '');
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        after = await profileSnapshot(page);
        ui = await page.evaluate(() => ({
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          toast: (document.getElementById('toast-text') || {}).textContent || ''
        }));
        a.ok(/email or phone/i.test(ui.toast), 'Clearing both contacts asks for an email or phone: ' + ui.toast);
        a.equal(ui.email, '', 'The email field stays empty');
        a.equal(ui.phone, '', 'The phone field stays empty');
        a.equal(ui.bio, typedBio, 'Clearing contacts does not drop the typed bio');
        assertSameStoredFields(a, before, after, 'Missing email and phone');

        // Restore email, use a conflicting phone
        const existingEmail = await page.evaluate(() => (state.currentUser && state.currentUser.email) || '');
        await page.fill('#edit-profile-email', existingEmail);
        await page.fill('#edit-profile-phone', '5555550101');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        // 5555550101 belongs to reg_personal; for the personal account use the business number instead
        const conflictPhone = account.username === 'reg_personal' ? '5555550102' : '5555550101';
        await page.fill('#edit-profile-phone', conflictPhone);
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        after = await profileSnapshot(page);
        ui = await page.evaluate(() => ({
          err: (document.getElementById('edit-profile-phone-error') || {}).textContent || '',
          toast: (document.getElementById('toast-text') || {}).textContent || '',
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || '')
        }));
        a.ok(/This number is already used by another account\. Remove it and use your email instead\./.test(ui.err + ' ' + ui.toast), 'A phone conflict uses the clear message');
        a.ok((ui.phone || '').replace(/\D/g, '').includes(conflictPhone), 'The conflicting phone stays in the field');
        a.equal(ui.bio, typedBio, 'A phone conflict does not drop the typed bio');
        assertSameStoredFields(a, before, after, 'A conflicting phone');

        // Conflicting email
        const conflictEmail = account.username === 'reg_personal' ? 'reg.business@example.test' : 'reg.personal@example.test';
        await page.fill('#edit-profile-email', conflictEmail);
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        after = await profileSnapshot(page);
        ui = await page.evaluate(() => ({
          err: (document.getElementById('edit-profile-email-error') || {}).textContent || '',
          toast: (document.getElementById('toast-text') || {}).textContent || '',
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || '')
        }));
        a.ok(/This email is already used by another account\. Remove it and use your phone instead\./.test(ui.err + ' ' + ui.toast), 'An email conflict uses the clear message');
        a.equal(ui.email, conflictEmail, 'The conflicting email stays in the field');
        a.equal(ui.bio, typedBio, 'An email conflict does not drop the typed bio');
        a.ok((ui.link || '').includes('keep-on-fail-'), 'An email conflict does not drop the typed website');
        assertSameStoredFields(a, before, after, 'A conflicting email');

        if (isBiz) {
          await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
          await h.openEditProfile(page);
          await page.waitForSelector('#edit-profile-support-email');
          await page.fill('#edit-profile-bio', typedBio);
          await page.fill('#edit-profile-link', typedLink);
          await page.fill('#edit-profile-support-email', 'not-an-email');
          before = await profileSnapshot(page);
          await page.evaluate(() => {
            const t = document.getElementById('toast-text');
            if (t) t.textContent = '';
            if (typeof clearEditProfileFieldErrors === 'function') clearEditProfileFieldErrors();
            if (typeof validateEditProfileForm === 'function' && typeof showEditProfileValidationErrors === 'function') {
              const result = validateEditProfileForm();
              if (!result.ok) {
                showEditProfileValidationErrors(result);
                return result.ok;
              }
            }
            const form = document.getElementById('edit-profile-form');
            if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
            else document.getElementById('btn-save-edit-profile')?.click();
            return true;
          });
          await page.waitForTimeout(150);
          after = await profileSnapshot(page);
          ui = await page.evaluate(() => ({
            err: (document.getElementById('edit-profile-support-email-error') || {}).textContent || '',
            toast: (document.getElementById('toast-text') || {}).textContent || '',
            support: ((document.getElementById('edit-profile-support-email') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || '')
          }));
          a.ok(/valid support email/i.test(ui.err + ' ' + ui.toast), 'An invalid support email shows an inline error: ' + JSON.stringify({ err: ui.err, toast: ui.toast }));
          a.equal(ui.support, 'not-an-email', 'The invalid support email stays in the field');
          a.equal(ui.bio, typedBio, 'An invalid support email does not drop the typed bio');
          assertSameStoredFields(a, before, after, 'An invalid support email');
        }
      }
    },
    {
      name: 'Edit Profile: a later likes sync cannot overwrite a completed profile save',
      accounts: ['business', 'pixlynote'],
      covers: ['handler:syncAllLikesToFirestore', 'handler:validateEditProfileForm'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const bio = 'Saved bio must survive likes sync ' + account.username;
        const site = 'saved-site.test/' + account.username;
        await page.fill('#edit-profile-bio', bio);
        await page.fill('#edit-profile-link', site);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await submitEditProfile(page);
        await page.waitForTimeout(250);
        const saved = await page.evaluate(() => ({
          email: state.currentUser && (state.currentUser.email || ''),
          phone: state.currentUser && (state.currentUser.phone || ''),
          bio: state.currentUser && (state.currentUser.bio || ''),
          link: state.currentUser && (state.currentUser.link || '')
        }));
        a.equal(saved.bio, bio, 'Bio was saved before the likes sync');
        a.equal(saved.link, 'https://' + site, 'Website was saved before the likes sync');

        const syncWrite = await page.evaluate(async () => {
          // Simulate a likes sync after in-memory contact fields are clobbered, like the 5:18 PM ET overwrite.
          const previous = {
            email: state.currentUser.email,
            phone: state.currentUser.phone,
            bio: state.currentUser.bio,
            link: state.currentUser.link
          };
          state.currentUser.email = '';
          state.currentUser.phone = state.currentUser.phone || '+1 (555) 010-9999';
          state.currentUser.link = '';
          const captured = [];
          const prevReady = window.firebaseReady;
          const prevFb = window.firebase;
          window.firebaseReady = true;
          window._likesHydratedFromCloud = true;
          window.firebase = {
            db: {},
            doc: function (db, col, id) { return { col, id }; },
            setDoc: async function (ref, payload) { captured.push({ ref, payload }); return true; }
          };
          try {
            if (typeof syncAllLikesToFirestore === 'function') await syncAllLikesToFirestore();
          } finally {
            window.firebaseReady = prevReady;
            window.firebase = prevFb;
            state.currentUser.email = previous.email;
            state.currentUser.phone = previous.phone;
            state.currentUser.bio = previous.bio;
            state.currentUser.link = previous.link;
          }
          const payload = captured.length ? captured[captured.length - 1].payload : null;
          return {
            count: captured.length,
            hasEmail: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'email')),
            hasPhone: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'phone')),
            hasLink: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'link')),
            hasBio: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'bio')),
            email: payload && payload.email,
            link: payload && payload.link,
            bio: payload && payload.bio
          };
        });
        a.ok(syncWrite.count >= 1, 'The likes sync still writes likes data');
        a.ok(!syncWrite.hasEmail && !syncWrite.hasPhone && !syncWrite.hasLink && !syncWrite.hasBio, 'The likes sync does not write email, phone, website, or bio: ' + JSON.stringify(syncWrite));
      }
    },
    {
      name: 'Edit Profile: switching business accounts loads only the active account and never writes the previous one',
      accounts: ['business'],
      covers: [
        'handler:performLogin',
        'handler:resetProfileStateForAccountSwitch',
        'handler:mergeStoredProfileFields',
        'handler:openEditProfileModal',
        'handler:fillEditProfileBusinessFields',
        'el:#edit-profile-dba-name',
        'el:#edit-profile-business-industry',
        'el:#edit-profile-business-city',
        'el:#edit-profile-business-hours',
        'el:#edit-profile-support-email',
        'el:#btn-save-edit-profile'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        const accountA = h.ACCOUNTS.business;
        const accountB = {
          username: 'reg_biz_empty',
          fullName: 'Reg Biz Empty',
          accountType: 'business',
          email: 'reg.biz.empty@example.test',
          phone: '5555550199'
        };
        const valuesA = {
          dbaName: 'Alpha Switch DBA',
          businessIndustry: 'software_tech',
          businessStreet: '12 Harbor Rd',
          businessCity: 'Galloway',
          businessState: 'NJ',
          businessPostal: '08205',
          businessAddressVisibility: 'city_state',
          businessHours: 'Mon-Fri 9am-5pm EST',
          businessSupportEmail: 'support.alpha@example.test',
          bio: 'Business package for account A only'
        };

        await h.openEditProfile(page);
        await page.fill('#edit-profile-bio', valuesA.bio);
        await page.fill('#edit-profile-dba-name', valuesA.dbaName);
        await page.selectOption('#edit-profile-business-industry', valuesA.businessIndustry);
        await page.fill('#edit-profile-business-street', valuesA.businessStreet);
        await page.fill('#edit-profile-business-city', valuesA.businessCity);
        await page.fill('#edit-profile-business-state', valuesA.businessState);
        await page.fill('#edit-profile-business-postal', valuesA.businessPostal);
        await page.selectOption('#edit-profile-address-visibility', valuesA.businessAddressVisibility);
        await page.fill('#edit-profile-business-hours', valuesA.businessHours);
        await page.fill('#edit-profile-support-email', valuesA.businessSupportEmail);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await submitEditProfile(page);
        await page.waitForTimeout(250);

        const storedA = await page.evaluate((username) => {
          const raw = localStorage.getItem('pixly_account_' + username) || '';
          let rec = null;
          try { rec = raw ? JSON.parse(raw) : null; } catch (e) { rec = null; }
          return {
            username: state.currentUser && state.currentUser.username,
            dbaName: state.currentUser && state.currentUser.dbaName,
            rec
          };
        }, accountA.username);
        a.equal(storedA.username, accountA.username, 'Account A is signed in after saving its business package');
        a.equal(storedA.dbaName, valuesA.dbaName, 'Account A stored its own DBA before the switch');
        a.equal(storedA.rec && storedA.rec.dbaName, valuesA.dbaName, 'Account A local store has its own DBA before the switch');

        await page.evaluate((accountB) => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          const rec = {
            username: accountB.username,
            fullName: accountB.fullName,
            email: accountB.email,
            phone: accountB.phone,
            accountType: 'business',
            bio: '',
            link: ''
          };
          try {
            const accts = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
            accts[accountB.username] = rec;
            localStorage.setItem('pixly_accounts', JSON.stringify(accts));
            localStorage.setItem('pixly_account_' + accountB.username, JSON.stringify(rec));
          } catch (e) {}
          window._pixlyAccounts = window._pixlyAccounts || {};
          window._pixlyAccounts[accountB.username] = rec;
          if (typeof performLogin === 'function') {
            performLogin(accountB.username, accountB.fullName, accountB.email, null, accountB.phone, 'business');
          }
        }, accountB);

        const afterSwitch = await page.evaluate(() => ({
          username: state.currentUser && state.currentUser.username,
          dbaName: state.currentUser && (state.currentUser.dbaName || ''),
          city: state.currentUser && (state.currentUser.businessCity || ''),
          hours: state.currentUser && (state.currentUser.businessHours || ''),
          support: state.currentUser && (state.currentUser.businessSupportEmail || ''),
          cacheU: window._activeUserDocCache && window._activeUserDocCache.username
        }));
        a.equal(afterSwitch.username, accountB.username, 'Switching signs in account B');
        a.equal(afterSwitch.dbaName, '', 'In-memory DBA is cleared on the account switch');
        a.equal(afterSwitch.city, '', 'In-memory city is cleared on the account switch');
        a.equal(afterSwitch.hours, '', 'In-memory hours are cleared on the account switch');
        a.equal(afterSwitch.support, '', 'In-memory support email is cleared on the account switch');
        a.ok(!afterSwitch.cacheU || afterSwitch.cacheU === accountB.username, 'The active user doc cache is not left on account A');

        await h.openEditProfile(page);
        const formB = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          dba: ((document.getElementById('edit-profile-dba-name') || {}).value || ''),
          industry: ((document.getElementById('edit-profile-business-industry') || {}).value || ''),
          street: ((document.getElementById('edit-profile-business-street') || {}).value || ''),
          city: ((document.getElementById('edit-profile-business-city') || {}).value || ''),
          stateVal: ((document.getElementById('edit-profile-business-state') || {}).value || ''),
          postal: ((document.getElementById('edit-profile-business-postal') || {}).value || ''),
          hours: ((document.getElementById('edit-profile-business-hours') || {}).value || ''),
          support: ((document.getElementById('edit-profile-support-email') || {}).value || '')
        }));
        a.equal(formB.name, accountB.fullName, 'Edit Profile shows account B display name');
        a.equal(formB.email, accountB.email, 'Edit Profile shows account B email');
        a.equal(String(formB.phone || '').replace(/\D/g, ''), String(accountB.phone || '').replace(/\D/g, ''), 'Edit Profile shows account B phone');
        a.equal(formB.bio, '', 'Edit Profile does not show account A bio on account B');
        a.equal(formB.dba, '', 'Edit Profile DBA is blank on a business account with no stored business info');
        a.equal(formB.industry, '', 'Edit Profile industry is blank on a business account with no stored business info');
        a.equal(formB.street, '', 'Edit Profile street is blank on a business account with no stored business info');
        a.equal(formB.city, '', 'Edit Profile city is blank on a business account with no stored business info');
        a.equal(formB.stateVal, '', 'Edit Profile state is blank on a business account with no stored business info');
        a.equal(formB.postal, '', 'Edit Profile postal code is blank on a business account with no stored business info');
        a.equal(formB.hours, '', 'Edit Profile hours are blank on a business account with no stored business info');
        a.equal(formB.support, '', 'Edit Profile support email is blank on a business account with no stored business info');

        const bioB = 'Account B bio must not land on account A';
        await page.fill('#edit-profile-bio', bioB);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; window.__pixlyUserDocWriteTargets = []; });
        const writeAudit = await page.evaluate(async (bioB) => {
          const captured = [];
          const prevReady = window.firebaseReady;
          const prevFb = window.firebase;
          window.firebaseReady = true;
          window.firebase = {
            db: {},
            doc: function (db, col, id) { return { col, id }; },
            setDoc: async function (ref, payload) {
              captured.push({ col: ref && ref.col, id: ref && ref.id, payload: payload || {} });
              return true;
            }
          };
          try {
            const form = document.getElementById('edit-profile-form');
            if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
            else document.getElementById('btn-save-edit-profile')?.click();
            await new Promise((r) => setTimeout(r, 250));
          } finally {
            window.firebaseReady = prevReady;
            window.firebase = prevFb;
          }
          const writes = window.__pixlyUserDocWrites || [];
          return {
            targets: captured,
            writes: writes.map((w) => ({
              source: w.source,
              username: (w.data && w.data.username) || w.username || '',
              dbaName: w.data && w.data.dbaName,
              bio: w.data && w.data.bio
            }))
          };
        }, bioB);

        const writeUsernames = writeAudit.writes.map((w) => String(w.username || '').toLowerCase());
        const targetIds = writeAudit.targets.map((t) => String(t.id || '').toLowerCase());
        a.ok(writeAudit.writes.length >= 1, 'Saving account B records a profile write');
        writeUsernames.forEach((u) => {
          a.equal(u, accountB.username, 'A recorded write after saving account B targets only account B, not ' + u);
        });
        targetIds.forEach((id) => {
          a.equal(id, accountB.username, 'A Firestore setDoc after saving account B targets only users/' + accountB.username + ', not ' + id);
        });
        a.ok(writeAudit.writes.every((w) => w.dbaName !== valuesA.dbaName), 'Account B writes do not include account A DBA');
        a.ok(writeAudit.writes.some((w) => w.bio === bioB), 'Account B write includes its own bio');

        const aStoreAfterBSave = await page.evaluate((username) => {
          let rec = null;
          try { rec = JSON.parse(localStorage.getItem('pixly_account_' + username) || 'null'); } catch (e) { rec = null; }
          return rec;
        }, accountA.username);
        a.equal(aStoreAfterBSave && aStoreAfterBSave.dbaName, valuesA.dbaName, 'Saving account B does not change account A stored DBA');
        a.equal(aStoreAfterBSave && aStoreAfterBSave.businessCity, valuesA.businessCity, 'Saving account B does not change account A stored city');
        a.equal(aStoreAfterBSave && aStoreAfterBSave.businessHours, valuesA.businessHours, 'Saving account B does not change account A stored hours');
        a.equal(aStoreAfterBSave && aStoreAfterBSave.bio, valuesA.bio, 'Saving account B does not change account A stored bio');

        await page.evaluate((accountA) => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          if (typeof performLogin === 'function') {
            performLogin(accountA.username, accountA.fullName, accountA.email, null, accountA.phone, 'business');
          }
        }, accountA);

        await h.openEditProfile(page);
        const formA = await page.evaluate(() => ({
          username: state.currentUser && state.currentUser.username,
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          dba: ((document.getElementById('edit-profile-dba-name') || {}).value || ''),
          industry: ((document.getElementById('edit-profile-business-industry') || {}).value || ''),
          street: ((document.getElementById('edit-profile-business-street') || {}).value || ''),
          city: ((document.getElementById('edit-profile-business-city') || {}).value || ''),
          stateVal: ((document.getElementById('edit-profile-business-state') || {}).value || ''),
          postal: ((document.getElementById('edit-profile-business-postal') || {}).value || ''),
          hours: ((document.getElementById('edit-profile-business-hours') || {}).value || ''),
          support: ((document.getElementById('edit-profile-support-email') || {}).value || '')
        }));
        a.equal(formA.username, accountA.username, 'The reverse switch signs account A back in');
        a.equal(formA.dba, valuesA.dbaName, 'Reopening account A still shows its own DBA');
        a.equal(formA.industry, valuesA.businessIndustry, 'Reopening account A still shows its own industry');
        a.equal(formA.street, valuesA.businessStreet, 'Reopening account A still shows its own street');
        a.equal(formA.city, valuesA.businessCity, 'Reopening account A still shows its own city');
        a.equal(formA.stateVal, valuesA.businessState, 'Reopening account A still shows its own state');
        a.equal(formA.postal, valuesA.businessPostal, 'Reopening account A still shows its own postal code');
        a.equal(formA.hours, valuesA.businessHours, 'Reopening account A still shows its own hours');
        a.equal(formA.support, valuesA.businessSupportEmail, 'Reopening account A still shows its own support email');
        a.equal(formA.bio, valuesA.bio, 'Reopening account A still shows its own bio, not account B bio');
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    }
    ,
    {
      name: 'Edit Profile: Unit: blank or missing remote contact fields cannot wipe a stored phone or email',
      accounts: ['personal'],
      covers: ['handler:mergeStoredProfileFields', 'handler:applyActiveUserDocData'],
      async run(ctx) {
        const { page, a } = ctx;
        const unit = await page.evaluate(() => {
          const kept = { phone: '+1 (202) 555-0187', email: 'keep@example.test', bio: 'local', fullName: 'Local Name', link: 'https://keep.example.test' };
          const afterMissing = Object.assign({}, kept);
          mergeStoredProfileFields(afterMissing, { bio: 'remote-bio' }, { replace: true, protectContact: true });
          const afterBlank = Object.assign({}, kept);
          mergeStoredProfileFields(afterBlank, { phone: '', email: '', bio: '', link: '', fullName: '' }, { replace: true, protectContact: true });
          const afterRemoteBio = Object.assign({}, kept);
          mergeStoredProfileFields(afterRemoteBio, { bio: 'blanked' }, { replace: true, protectContact: true });
          return {
            missingPhone: afterMissing.phone,
            missingEmail: afterMissing.email,
            missingBio: afterMissing.bio,
            blankPhone: afterBlank.phone,
            blankEmail: afterBlank.email,
            blankBio: afterBlank.bio,
            blankLink: afterBlank.link,
            blankName: afterBlank.fullName,
            updatedBio: afterRemoteBio.bio
          };
        });
        a.equal(unit.missingPhone, '+1 (202) 555-0187', 'replace+protectContact keeps phone when the remote doc omits it: ' + JSON.stringify(unit));
        a.equal(unit.missingEmail, 'keep@example.test', 'replace+protectContact keeps email when the remote doc omits it');
        a.equal(unit.missingBio, 'remote-bio', 'A non-blank remote bio still updates from the remote doc');
        a.equal(unit.blankPhone, '+1 (202) 555-0187', 'protectContact keeps phone when the remote value is blank');
        a.equal(unit.blankEmail, 'keep@example.test', 'protectContact keeps email when the remote value is blank');
        a.equal(unit.blankBio, 'local', 'protectContact keeps bio when the remote value is blank');
        a.equal(unit.blankLink, 'https://keep.example.test', 'protectContact keeps website when the remote value is blank');
        a.equal(unit.blankName, 'Local Name', 'protectContact keeps name when the remote value is blank');
        a.equal(unit.updatedBio, 'blanked', 'A non-blank remote bio still replaces the local bio');
      }
    },
    {
      name: 'Edit Profile: live listener updates do not flicker or overwrite open form fields',
      accounts: ['personal', 'business'],
      covers: ['handler:applyActiveUserDocData', 'handler:openEditProfileModal', 'el:#edit-profile-email', 'el:#edit-profile-phone', 'el:#edit-profile-bio', 'el:#edit-profile-name', 'el:#edit-profile-link'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.loginAs(page, account);
        await h.openEditProfile(page);
        const typed = {
          email: 'typed.while.open@example.test',
          phone: '2025550133',
          bio: 'Typed bio must not flicker',
          name: 'Typed Name',
          link: 'https://typed.example.test'
        };
        await page.fill('#edit-profile-email', typed.email);
        await page.fill('#edit-profile-phone', typed.phone);
        await page.fill('#edit-profile-bio', typed.bio);
        await page.fill('#edit-profile-name', typed.name);
        await page.fill('#edit-profile-link', typed.link);
        await typeContactField(page, '#edit-profile-email');
        await typeContactField(page, '#edit-profile-phone');
        await page.evaluate(() => {
          document.getElementById('edit-profile-bio')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('edit-profile-name')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('edit-profile-link')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const readForm = () => page.evaluate(() => {
          const val = (id) => ((document.getElementById(id) || {}).value || '');
          return {
            email: val('edit-profile-email'),
            phone: val('edit-profile-phone'),
            bio: val('edit-profile-bio'),
            name: val('edit-profile-name'),
            link: val('edit-profile-link'),
            dba: val('edit-profile-dba-name'),
            industry: val('edit-profile-business-industry'),
            hours: val('edit-profile-business-hours'),
            support: val('edit-profile-support-email')
          };
        });
        const before = await readForm();
        const after = await page.evaluate((snapshot) => {
          const cleanU = (typeof normalizeUsername === 'function')
            ? normalizeUsername(state.currentUser && state.currentUser.username)
            : String((state.currentUser && state.currentUser.username) || '').toLowerCase();
          const apply = (doc) => {
            if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(cleanU, doc, false);
          };
          const localEmail = state.currentUser && state.currentUser.email;
          const localPhone = state.currentUser && state.currentUser.phone;
          apply({ username: cleanU, phone: '', email: '', bio: 'remote-bio', fullName: 'Remote Name', link: 'https://remote.example', dbaName: 'Remote DBA', businessHours: 'remote hours', businessSupportEmail: 'remote@example.test' });
          apply({ username: cleanU });
          apply({ username: cleanU, phone: localPhone || snapshot.phone, email: localEmail || snapshot.email, bio: snapshot.bio, fullName: snapshot.name, link: snapshot.link });
          apply({ username: cleanU, phone: '', email: '' });
          const val = (id) => ((document.getElementById(id) || {}).value || '');
          return {
            email: val('edit-profile-email'),
            phone: val('edit-profile-phone'),
            bio: val('edit-profile-bio'),
            name: val('edit-profile-name'),
            link: val('edit-profile-link'),
            dba: val('edit-profile-dba-name'),
            industry: val('edit-profile-business-industry'),
            hours: val('edit-profile-business-hours'),
            support: val('edit-profile-support-email')
          };
        }, before);
        a.equal(after.email, before.email, 'Typed email is not overwritten by a live listener: ' + JSON.stringify({ before, after }));
        a.equal(after.phone, before.phone, 'Typed phone is not overwritten by a live listener: ' + JSON.stringify({ before, after }));
        a.equal(String(after.phone || '').replace(/\D/g, '').slice(-10), '2025550133', 'The typed phone digits stay in the field after remote updates');
        a.equal(after.bio, before.bio, 'Typed bio is not overwritten by a live listener');
        a.equal(after.name, before.name, 'Typed name is not overwritten by a live listener');
        a.equal(after.link, before.link, 'Typed website is not overwritten by a live listener');
        a.equal(after.dba, before.dba, 'Business DBA does not flicker from a live listener');
        a.equal(after.industry, before.industry, 'Business industry does not flicker from a live listener');
        a.equal(after.hours, before.hours, 'Business hours do not flicker from a live listener');
        a.equal(after.support, before.support, 'Support email does not flicker from a live listener');
        // Restore the signed-in account so later tests on this shared page do not inherit the simulated remote doc.
        await page.evaluate((account) => {
          const u = state && state.currentUser;
          if (u) {
            delete u.dbaName;
            delete u.businessIndustry;
            delete u.businessHours;
            delete u.businessSupportEmail;
            u.fullName = account.fullName;
            u.email = account.email;
            u.phone = account.phone;
          }
          try {
            const accts = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
            const rec = accts[account.username];
            if (rec) {
              delete rec.dbaName;
              rec.fullName = account.fullName;
              rec.email = account.email;
              rec.phone = account.phone;
              accts[account.username] = rec;
              localStorage.setItem('pixly_accounts', JSON.stringify(accts));
              localStorage.setItem('pixly_account_' + account.username, JSON.stringify(rec));
            }
          } catch (e) {}
        }, account);
        await h.loginAs(page, account);
      }
    },
    {
      name: 'Edit Profile: email Send code, wrong code, then correct code verifies and only then saves',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-edit-send-email-code', 'el:#edit-profile-email-code', 'el:#btn-edit-verify-email-code', 'handler:sendEditEmailCode', 'handler:verifyEditEmailCode'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.loginAs(page, account);
        await h.openEditProfile(page);
        await installVerifyCallLog(page);
        const newEmail = 'sequence.' + account.username + '@example.test';
        const beforeEmail = await page.evaluate(() => (state.currentUser && state.currentUser.email) || '');
        await page.fill('#edit-profile-email', newEmail);
        await typeContactField(page, '#edit-profile-email');
        await page.waitForTimeout(150);
        const ready = await readContactUi(page, 'email');
        a.ok(/available/i.test(ready.status.text), 'Available is shown before Send code: ' + JSON.stringify(ready));
        a.ok(!ready.send.hidden && !ready.send.disabled, 'Send code is enabled before sending');
        await page.click('#btn-edit-send-email-code');
        await page.waitForTimeout(250);
        const calls = await readVerifyCalls(page);
        const sendCall = calls.find((c) => /\/email(?:\/|\?|$)/.test(c.url) && !/signup-verify|reset-verify/.test(c.url));
        a.ok(sendCall, 'Send code POSTs the email verification endpoint: ' + JSON.stringify(calls));
        a.equal(sendCall && sendCall.payload && sendCall.payload.to, newEmail, 'The send payload uses the typed email');
        const afterSend = await readContactUi(page, 'email');
        a.ok(codeEntryVisible(afterSend), 'A code-entry box appears after the email code is sent: ' + JSON.stringify(afterSend));
        a.ok(/sent a 6-digit code/i.test(afterSend.verifyStatus.text), 'The form confirms the email code was sent: ' + afterSend.verifyStatus.text);
        a.equal(afterSend.saved, beforeEmail, 'The email is not saved just because a code was sent');

        await page.fill('#edit-profile-email-code', '000000');
        await page.click('#btn-edit-verify-email-code');
        await page.waitForTimeout(200);
        const wrong = await readContactUi(page, 'email');
        a.ok(/incorrect 6-digit code/i.test(wrong.verifyStatus.text), 'A wrong email code shows an error: ' + JSON.stringify(wrong));
        a.ok(codeEntryVisible(wrong), 'The code box stays visible after a wrong email code');
        a.equal(wrong.saved, beforeEmail, 'A wrong email code does not save the new email');
        const canAfterWrong = await page.evaluate(() => (typeof editProfileCanSave === 'function') ? editProfileCanSave() : false);
        a.ok(!canAfterWrong, 'Save stays disabled after a wrong email code');

        await page.fill('#edit-profile-email-code', VERIFY_CODE);
        await page.click('#btn-edit-verify-email-code');
        await page.waitForTimeout(200);
        const verified = await readContactUi(page, 'email');
        a.ok(/Email verified/i.test(verified.verifyStatus.text), 'The correct email code verifies: ' + verified.verifyStatus.text);
        a.equal(verified.saved, beforeEmail, 'The verified email is not saved until Save is pressed');
        await page.evaluate(() => { if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi(); });
        const canAfter = await editSaveBlockers(page);
        a.ok(canAfter.can, 'Save is enabled after the email code is accepted: ' + JSON.stringify(canAfter));
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const saved = await page.evaluate(() => (state.currentUser && state.currentUser.email) || '');
        a.equal(saved, newEmail, 'The new email is saved only after the correct code is accepted');
      }
    },
    {
      name: 'Edit Profile: phone Send code actually texts, wrong code fails, correct code verifies, then Save stores it',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-edit-send-phone-code', 'el:#edit-profile-phone-code', 'el:#btn-edit-verify-phone-code', 'handler:sendEditPhoneCode', 'handler:verifyEditPhoneCode'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.loginAs(page, account);
        await h.openEditProfile(page);
        await installVerifyCallLog(page);
        const newPhone = '2025550183';
        const beforePhone = await page.evaluate(() => (state.currentUser && state.currentUser.phone) || '');
        await page.fill('#edit-profile-phone', newPhone);
        await typeContactField(page, '#edit-profile-phone');
        await page.waitForTimeout(150);
        const ready = await readContactUi(page, 'phone');
        a.ok(/available/i.test(ready.status.text), 'Available is shown for a free phone before Send code: ' + JSON.stringify(ready));
        await page.click('#btn-edit-send-phone-code');
        await page.waitForTimeout(250);
        const calls = await readVerifyCalls(page);
        const sendCall = calls.find((c) => /\/sms\/send/.test(c.url));
        a.ok(sendCall, 'Send code POSTs the SMS send endpoint: ' + JSON.stringify(calls));
        a.ok(sendCall && sendCall.payload && /2025550183/.test(String(sendCall.payload.phone || '')), 'The SMS payload uses the typed phone: ' + JSON.stringify(sendCall));
        const afterSend = await readContactUi(page, 'phone');
        a.ok(codeEntryVisible(afterSend), 'A code-entry box appears after the SMS is sent: ' + JSON.stringify(afterSend));
        a.ok(/sent a 6-digit code/i.test(afterSend.verifyStatus.text), 'The form confirms the phone code was sent');
        a.equal(afterSend.saved, beforePhone, 'The phone is not saved just because an SMS was sent');

        await page.fill('#edit-profile-phone-code', '000000');
        await page.click('#btn-edit-verify-phone-code');
        await page.waitForTimeout(200);
        const wrong = await readContactUi(page, 'phone');
        a.ok(/incorrect 6-digit code/i.test(wrong.verifyStatus.text), 'A wrong phone code shows an error: ' + JSON.stringify(wrong));
        a.ok(codeEntryVisible(wrong), 'The code box stays visible after a wrong phone code');
        a.equal(wrong.saved, beforePhone, 'A wrong phone code does not save the new number');

        await page.fill('#edit-profile-phone-code', VERIFY_CODE);
        await page.click('#btn-edit-verify-phone-code');
        await page.waitForTimeout(200);
        const verified = await readContactUi(page, 'phone');
        a.ok(/Phone verified/i.test(verified.verifyStatus.text), 'The correct phone code verifies: ' + verified.verifyStatus.text);
        a.equal(verified.saved, beforePhone, 'The verified phone is not saved until Save is pressed');
        await page.evaluate(() => { if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi(); });
        const canAfter = await editSaveBlockers(page);
        a.ok(canAfter.can, 'Save is enabled after the phone code is accepted: ' + JSON.stringify(canAfter));
        const validated = await page.evaluate(() => {
          const r = (typeof validateEditProfileForm === 'function') ? validateEditProfileForm() : { ok: false };
          return { ok: !!r.ok, errors: r.errors || [], phone: r.values && r.values.phone };
        });
        a.ok(validated.ok, 'The verified phone change passes validation: ' + JSON.stringify(validated));
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const saved = await page.evaluate(() => (state.currentUser && state.currentUser.phone) || '');
        const savedDigits = String(saved).replace(/\D/g, '').slice(-10);
        a.equal(savedDigits, '2025550183', 'The new phone is saved only after the correct code is accepted: ' + saved);
      }
    },
    {
      name: 'Edit Profile: a failed Send code shows a visible error and does not render the code box or save',
      accounts: ['personal'],
      covers: ['handler:sendEditEmailCode', 'handler:sendEditPhoneCode', 'el:#edit-profile-email-code', 'el:#edit-profile-phone-code'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.loginAs(page, account);
        await h.openEditProfile(page);
        await installVerifyCallLog(page);
        await setVerifySendFailure(page, true);
        const before = await page.evaluate(() => ({
          email: (state.currentUser && state.currentUser.email) || '',
          phone: (state.currentUser && state.currentUser.phone) || ''
        }));

        await page.fill('#edit-profile-email', 'fail.' + account.username + '@example.test');
        await typeContactField(page, '#edit-profile-email');
        await page.waitForTimeout(120);
        await page.click('#btn-edit-send-email-code');
        await page.waitForTimeout(250);
        const emailUi = await readContactUi(page, 'email');
        const emailErrText = emailUi.error.text + ' ' + emailUi.verifyStatus.text;
        a.ok(/could not send the verification code/i.test(emailErrText), 'A failed email send shows a visible error: ' + JSON.stringify(emailUi));
        a.ok(!codeEntryVisible(emailUi), 'The email code box does not appear when sending fails: ' + JSON.stringify(emailUi));
        a.equal(emailUi.saved, before.email, 'A failed email send does not save the new email');

        await page.fill('#edit-profile-phone', '2025550194');
        await typeContactField(page, '#edit-profile-phone');
        await page.waitForTimeout(120);
        await page.click('#btn-edit-send-phone-code');
        await page.waitForTimeout(250);
        const phoneUi = await readContactUi(page, 'phone');
        const phoneErrText = phoneUi.error.text + ' ' + phoneUi.verifyStatus.text;
        a.ok(/could not send the verification code|sms|isn.t available/i.test(phoneErrText), 'A failed phone send shows a visible error: ' + JSON.stringify(phoneUi));
        a.ok(!codeEntryVisible(phoneUi), 'The phone code box does not appear when sending fails: ' + JSON.stringify(phoneUi));
        a.equal(phoneUi.saved, before.phone, 'A failed phone send does not save the new number');
        await setVerifySendFailure(page, false);
      }
    },
    {
      name: 'Edit Profile: a failed uniqueness check shows a visible error and blocks Send code',
      accounts: ['personal'],
      covers: ['el:#edit-profile-email-status', 'el:#btn-edit-send-email-code', 'handler:scheduleEditContactCheck'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        await page.evaluate(() => {
          if (!window.__origPreloadCloudUserDirectoryForSignUp) {
            window.__origPreloadCloudUserDirectoryForSignUp = window.preloadCloudUserDirectoryForSignUp;
          }
          window._cloudUserDirectoryError = new Error('directory failed');
          window.preloadCloudUserDirectoryForSignUp = function () {
            window._cloudUserDirectoryError = new Error('directory failed');
            return Promise.reject(window._cloudUserDirectoryError);
          };
        });
        try {
          await page.fill('#edit-profile-email', 'checkfail.' + account.username + '@example.test');
          await typeContactField(page, '#edit-profile-email');
          await page.waitForTimeout(550);
          const ui = await readContactUi(page, 'email');
          a.ok(/could not check if this email is available/i.test(ui.status.text), 'A failed email uniqueness check shows a visible error: ' + JSON.stringify(ui));
          a.ok(ui.send.disabled, 'Send code is blocked when the uniqueness check fails: ' + JSON.stringify(ui.send));
        } finally {
          await page.evaluate(() => {
            if (window.__origPreloadCloudUserDirectoryForSignUp) {
              window.preloadCloudUserDirectoryForSignUp = window.__origPreloadCloudUserDirectoryForSignUp;
            }
            window._cloudUserDirectoryError = null;
          });
        }
      }
    }
    ,
    {
      name: 'Edit Profile: every field can be edited and saved for every account type and survives reload and pull-to-refresh',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#edit-profile-name', 'el:#edit-profile-username', 'el:#edit-profile-email', 'el:#edit-profile-phone',
        'el:#edit-profile-bio', 'el:#edit-profile-link', 'el:#edit-profile-avatar-file', 'el:#edit-profile-avatar-preview',
        'el:#btn-edit-account-personal', 'el:#btn-edit-account-business',
        'handler:openEditProfileModal', 'handler:sendEditEmailCode', 'handler:verifyEditEmailCode',
        'handler:sendEditPhoneCode', 'handler:verifyEditPhoneCode', 'handler:setEditProfileAccountCategory',
        'handler:applyActiveUserDocData', 'handler:triggerRefreshRoutine', 'handler:persistState'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const isPixly = account.username === 'pixlynote';
        const startType = account.accountType === 'business' || isPixly ? 'business' : 'personal';
        const targetType = isPixly ? 'business' : (startType === 'business' ? 'personal' : 'business');
        const phones = { reg_personal: '2025550321', reg_business: '2025550322', reg_empty: '2025550323', pixlynote: '2025550324' };
        const expected = {
          fullName: isPixly ? 'Pixlynote' : ('All Fields ' + account.username),
          username: isPixly ? 'pixlynote' : ('allfields_' + account.username),
          email: 'allfields.' + account.username + '@example.test',
          phone: phones[account.username] || '2025550320',
          bio: isPixly ? 'The official Pixlynote account — all-fields check' : ('All-fields bio for ' + account.username),
          linkPart: 'example.test/all-fields-' + account.username,
          accountType: targetType
        };
        const website = 'https://example.test/all-fields-' + account.username;

        await h.loginAs(page, account);
        await page.evaluate(() => {
          window._cloudUserDirectoryError = null;
          window._activeUserDocCache = null;
          window._pendingSubscriptionCancelOnSave = null;
          window._offerSubscriptionAfterSave = null;
          if (window.__origPreloadCloudUserDirectoryForSignUp) {
            window.preloadCloudUserDirectoryForSignUp = window.__origPreloadCloudUserDirectoryForSignUp;
          }
        });
        await h.openEditProfile(page);
        const beforeProtected = (await readAllEditFields(page)).state;

        try {
          if (!isPixly) {
            const catBtn = targetType === 'business' ? '#btn-edit-account-business' : '#btn-edit-account-personal';
            await page.click(catBtn);
            await page.waitForTimeout(80);
            await page.evaluate(() => {
              const m = document.getElementById('modal-account-type-switch');
              if (m && !m.classList.contains('hidden') && typeof confirmAccountTypeSwitch === 'function') confirmAccountTypeSwitch();
            });
            await page.waitForTimeout(80);
          }

          await page.fill('#edit-profile-name', expected.fullName);
          if (targetType === 'business') {
            const dba = await page.$('#edit-profile-dba-name');
            if (dba) await page.fill('#edit-profile-dba-name', expected.fullName + ' DBA');
          }

          if (!isPixly) {
            await page.fill('#edit-profile-username', expected.username);
            await typeContactField(page, '#edit-profile-username');
            await page.waitForTimeout(500);
            const unameStatus = await page.evaluate(() => {
              const el = document.getElementById('edit-profile-username-status') || document.getElementById('edit-profile-username-error');
              return el ? String(el.textContent || '').trim() : '';
            });
            a.ok(!/taken/i.test(unameStatus), 'The new username is not flagged as taken: ' + unameStatus);
          }

          await verifyAndAcceptContact(page, a, 'email', expected.email);
          await verifyAndAcceptContact(page, a, 'phone', expected.phone);

          await page.fill('#edit-profile-bio', expected.bio);
          await page.fill('#edit-profile-link', website);

          await page.evaluate((src) => {
            if (state.currentUser) state.currentUser.avatar = src;
            const prev = document.getElementById('edit-profile-avatar-preview');
            if (prev) prev.src = src;
            const pAv = document.getElementById('profile-page-avatar');
            if (pAv) pAv.src = src;
          }, TINY_AVATAR_PNG);
          try {
            const buf = Buffer.from(TINY_AVATAR_PNG.split(',')[1], 'base64');
            await page.setInputFiles('#edit-profile-avatar-file', { name: 'all-fields-avatar.png', mimeType: 'image/png', buffer: buf });
            await page.waitForFunction(() => {
              const u = (state && state.currentUser && state.currentUser.avatar) || '';
              const prev = document.getElementById('edit-profile-avatar-preview');
              return String(u).indexOf('data:image') === 0 || !!(prev && String(prev.src || '').indexOf('data:image') === 0);
            }, null, { timeout: 4000 });
          } catch (e) {
            await page.evaluate((src) => {
              if (state.currentUser) state.currentUser.avatar = src;
              const prev = document.getElementById('edit-profile-avatar-preview');
              if (prev) prev.src = src;
            }, TINY_AVATAR_PNG);
          }

          const typedBeforeSave = await readAllEditFields(page);
          a.equal(String(typedBeforeSave.name || '').trim(), expected.fullName, 'Name is in the form before Save');
          a.equal(String(typedBeforeSave.username || '').toLowerCase(), expected.username, 'Username is in the form before Save');
          a.equal(String(typedBeforeSave.email || '').toLowerCase(), expected.email.toLowerCase(), 'Email is in the form before Save');
          a.equal(last10Digits(typedBeforeSave.phone), last10Digits(expected.phone), 'Phone is in the form before Save');
          a.equal(String(typedBeforeSave.bio || ''), expected.bio, 'Bio is in the form before Save');
          a.ok(String(typedBeforeSave.link || '').includes(expected.linkPart), 'Website is in the form before Save');
          a.equal(String(typedBeforeSave.accountType || ''), expected.accountType, 'Account category is selected before Save');

          if (!isPixly) await stubLocalUsernameRename(page);
          await page.evaluate(() => { if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi(); });
          const canSave = await editSaveBlockers(page);
          a.ok(canSave.can, 'Save is enabled after every field is filled and verified: ' + JSON.stringify(canSave));
          await submitEditProfile(page);
          await page.waitForTimeout(isPixly ? 400 : 700);

          const afterSave = await readAllEditFields(page);
          if (afterSave.modalOpen) {
            assertEveryField(a, afterSave, expected, 'After Save (open form)');
          } else {
            assertEveryField(a, {
              name: afterSave.state.name,
              username: afterSave.state.username,
              email: afterSave.state.email,
              phone: afterSave.state.phone,
              bio: afterSave.state.bio,
              link: afterSave.state.link,
              accountType: afterSave.state.accountType,
              avatar: afterSave.state.avatar,
              state: afterSave.state
            }, expected, 'After Save');
          }
          assertProtectedUnchanged(a, beforeProtected, afterSave.state, 'After Save');

          await h.closeOverlays(page);
          await hardReloadKeepSession(page, h);
          const afterReloadState = await readAllEditFields(page);
          a.ok(afterReloadState.state.username, 'Session stays signed in after hard reload');
          assertEveryField(a, {
            name: afterReloadState.state.name,
            username: afterReloadState.state.username,
            email: afterReloadState.state.email,
            phone: afterReloadState.state.phone,
            bio: afterReloadState.state.bio,
            link: afterReloadState.state.link,
            accountType: afterReloadState.state.accountType,
            avatar: afterReloadState.state.avatar,
            state: afterReloadState.state
          }, expected, 'After hard reload');
          assertProtectedUnchanged(a, beforeProtected, afterReloadState.state, 'After hard reload');

          await h.openEditProfile(page);
          const afterReloadForm = await readAllEditFields(page);
          assertEveryField(a, afterReloadForm, expected, 'Edit Profile form after hard reload');
          const flickerA = afterReloadForm;
          await page.waitForTimeout(250);
          const flickerB = await readAllEditFields(page);
          a.equal(flickerB.name, flickerA.name, 'Name does not flicker after reload');
          a.equal(flickerB.email, flickerA.email, 'Email does not flicker after reload');
          a.equal(flickerB.phone, flickerA.phone, 'Phone does not flicker after reload');
          a.equal(flickerB.bio, flickerA.bio, 'Bio does not flicker after reload');
          a.equal(flickerB.link, flickerA.link, 'Website does not flicker after reload');
          a.equal(flickerB.username, flickerA.username, 'Username does not flicker after reload');
          a.equal(flickerB.accountType, flickerA.accountType, 'Account category does not flicker after reload');

          await page.evaluate(() => {
            const u = (state && state.currentUser) || {};
            const name = (typeof normalizeUsername === 'function') ? normalizeUsername(u.username || '') : String(u.username || '').toLowerCase();
            if (typeof applyActiveUserDocData === 'function') {
              applyActiveUserDocData(name, {
                username: name,
                fullName: '',
                email: '',
                phone: '',
                bio: '',
                link: '',
                avatar: '',
                accountType: u.accountType
              }, false);
            }
          });
          const afterLive = await readAllEditFields(page);
          assertEveryField(a, afterLive, expected, 'Open form is not blanked by a live remote update');

          await h.closeOverlays(page);
          await pullToRefreshProfile(page);
          await page.waitForTimeout(200);
          const afterPtrState = await readAllEditFields(page);
          assertEveryField(a, {
            name: afterPtrState.state.name,
            username: afterPtrState.state.username,
            email: afterPtrState.state.email,
            phone: afterPtrState.state.phone,
            bio: afterPtrState.state.bio,
            link: afterPtrState.state.link,
            accountType: afterPtrState.state.accountType,
            avatar: afterPtrState.state.avatar,
            state: afterPtrState.state
          }, expected, 'After pull-to-refresh');
          assertProtectedUnchanged(a, beforeProtected, afterPtrState.state, 'After pull-to-refresh');

          await h.openEditProfile(page);
          const afterPtrForm = await readAllEditFields(page);
          assertEveryField(a, afterPtrForm, expected, 'Edit Profile form after pull-to-refresh');
          await page.waitForTimeout(250);
          const afterPtrFlicker = await readAllEditFields(page);
          a.equal(afterPtrFlicker.name, afterPtrForm.name, 'Name does not flicker after pull-to-refresh');
          a.equal(afterPtrFlicker.email, afterPtrForm.email, 'Email does not flicker after pull-to-refresh');
          a.equal(afterPtrFlicker.phone, afterPtrForm.phone, 'Phone does not flicker after pull-to-refresh');
          a.equal(afterPtrFlicker.bio, afterPtrForm.bio, 'Bio does not flicker after pull-to-refresh');
          a.equal(afterPtrFlicker.link, afterPtrForm.link, 'Website does not flicker after pull-to-refresh');
        } finally {
          try { await resetSharedAccountPage(page, h, account); } catch (e) {
            try { await h.loginAs(page, account); } catch (e2) {}
          }
        }
      }
    }


  ]
};