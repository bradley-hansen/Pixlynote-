'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const SWITCHER_IDS = [
  'btn-header-profile',
  'header-account-count-badge',
  'modal-account-switcher',
  'btn-close-account-switcher',
  'account-switcher-list',
  'btn-switcher-login',
  'btn-switcher-signup',
  'modal-switch-password',
  'btn-close-switch-password',
  'switch-password-target',
  'switch-password-input',
  'switch-password-error',
  'btn-cancel-switch-password',
  'btn-confirm-switch-password'
];

const SWITCHER_FNS = [
  'openAccountSwitcher',
  'closeAccountSwitcher',
  'renderAccountSwitcherList',
  'getSessionAccounts',
  'registerSessionAccount',
  'updateChatHeadBadge',
  'openAuthFromSwitcher',
  'requestAccountSwitchWithAuth',
  'confirmSwitchWithPassword',
  'closeSwitchPasswordModal'
];

const SWITCHER_COVERS = [
  'el:#btn-header-profile',
  'el:#header-account-count-badge',
  'el:#modal-account-switcher',
  'el:#btn-close-account-switcher',
  'el:#account-switcher-list',
  'el:#btn-switcher-login',
  'el:#btn-switcher-signup',
  'el:#modal-switch-password',
  'el:#btn-close-switch-password',
  'el:#switch-password-input',
  'el:#btn-cancel-switch-password',
  'el:#btn-confirm-switch-password',
  'handler:openAccountSwitcher',
  'handler:closeAccountSwitcher',
  'handler:renderAccountSwitcherList',
  'handler:getSessionAccounts',
  'handler:registerSessionAccount',
  'handler:updateChatHeadBadge',
  'handler:openAuthFromSwitcher',
  'handler:requestAccountSwitchWithAuth',
  'handler:confirmSwitchWithPassword',
  'handler:closeSwitchPasswordModal',
  'handler:clearPasswordFields',
  'handler:disarmAuthCredentialForms',
  'listener:#btn-header-profile:click',
  'listener:#btn-confirm-switch-password:click',
  'listener:#btn-cancel-switch-password:click',
  'listener:#btn-close-switch-password:click',
  'listener:#switch-password-input:keydown'
];

const AVATARS = {
  personal: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#111111"/></svg>'),
  business: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#c026d3"/></svg>'),
  pixlynote: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2563eb"/></svg>')
};

const BUSINESS_PKG = {
  business: {
    dbaName: 'Reg Business Switch DBA',
    businessIndustry: 'retail',
    businessStreet: '9 Market St',
    businessCity: 'Atlantic City',
    businessState: 'NJ',
    businessPostal: '08401',
    businessAddressVisibility: 'city_state',
    businessHours: 'Sat-Sun 10am-4pm EST',
    businessSupportEmail: 'hello@regbusiness.test'
  },
  pixlynote: {
    dbaName: 'Pixlynote Switch DBA',
    businessIndustry: 'software_tech',
    businessStreet: '1 Shutter Lane',
    businessCity: 'Galloway',
    businessState: 'NJ',
    businessPostal: '08205',
    businessAddressVisibility: 'city_state',
    businessHours: 'Mon-Fri 9am-5pm EST',
    businessSupportEmail: 'support@pixlynote.test'
  }
};

function isModalOpen(display, hidden) {
  return !hidden && display !== 'none';
}

async function dismissBlockingChrome(page, h) {
  if (h && h.closeOverlays) await h.closeOverlays(page);
  await page.evaluate(() => {
    try { if (typeof toggleNotificationsDropdown === 'function') toggleNotificationsDropdown(false); } catch (e) {}
    document.querySelectorAll('[id$="-backdrop"], [id$="-overlay"]').forEach((el) => {
      if (!el) return;
      el.classList.add('hidden');
      if (el.style) el.style.display = 'none';
    });
  });
  if (h && h.hideToasts) await h.hideToasts(page);
}

async function tap(page, selector) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
  if (!ok) throw new Error('Could not click ' + selector);
}


async function seedSwitcherAccounts(page, accounts) {
  await page.evaluate((accounts) => {
    accounts.forEach((a) => {
      if (typeof registerSessionAccount === 'function') {
        registerSessionAccount({
          username: a.username,
          fullName: a.fullName,
          email: a.email,
          phone: a.phone,
          avatar: a.avatar || '',
          accountType: a.accountType
        });
      }
    });
    if (typeof updateChatHeadBadge === 'function') updateChatHeadBadge();
  }, accounts);
}

async function seedAccountExtras(page, account, extras) {
  await page.evaluate(({ username, extras }) => {
    const key = 'pixly_account_' + String(username).toLowerCase();
    let rec = {};
    try { rec = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { rec = {}; }
    Object.assign(rec, extras, { username });
    try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e) {}
    if (!window._pixlyAccounts) window._pixlyAccounts = {};
    window._pixlyAccounts[String(username).toLowerCase()] = Object.assign({}, window._pixlyAccounts[String(username).toLowerCase()] || {}, rec);
    try {
      const map = JSON.parse(localStorage.getItem('pixly_accounts') || '{}') || {};
      map[String(username).toLowerCase()] = Object.assign({}, map[String(username).toLowerCase()] || {}, rec);
      localStorage.setItem('pixly_accounts', JSON.stringify(map));
    } catch (e) {}
  }, { username: account.username, extras: extras || {} });
}

async function closeProfileChrome(page, h) {
  await page.evaluate(() => {
    if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
    if (typeof closeSwitchPasswordModal === 'function') closeSwitchPasswordModal();
    if (typeof closeAccountSwitcher === 'function') closeAccountSwitcher();
  });
  await dismissBlockingChrome(page, h);
}

async function switchViaSwitcherUi(page, h, targetUsername, password) {
  await closeProfileChrome(page, h);
  await tap(page, '#btn-header-profile');
  await page.waitForTimeout(250);
  const modalOpen = await page.evaluate(() => {
    const m = document.getElementById('modal-account-switcher');
    return !!(m && !m.classList.contains('hidden') && m.style.display !== 'none');
  });
  if (!modalOpen) throw new Error('Account switcher did not open for @' + targetUsername);
  const hasRow = await page.evaluate((u) => !!document.querySelector('.account-switcher-row[data-username="' + u + '"]'), targetUsername);
  if (!hasRow) throw new Error('Switcher has no row for @' + targetUsername);
  await tap(page, '.account-switcher-row[data-username="' + targetUsername + '"]');
  await page.waitForTimeout(300);
  const already = await page.evaluate((u) => ((window.state && state.currentUser && state.currentUser.username) || '') === u, targetUsername);
  if (already) return;
  const pwOpen = await page.evaluate(() => {
    const m = document.getElementById('modal-switch-password');
    return !!(m && !m.classList.contains('hidden') && m.style.display !== 'none');
  });
  if (!pwOpen) throw new Error('Switch-password modal did not open for @' + targetUsername);
  await page.fill('#switch-password-input', password);
  await tap(page, '#btn-confirm-switch-password');
  await page.waitForFunction((u) => {
    return !!(window.state && state.currentUser && state.currentUser.username === u);
  }, targetUsername, { timeout: 8000 });
  await page.waitForTimeout(200);
  if (h && h.hideToasts) await h.hideToasts(page);
}

async function readActiveSurface(page, h) {
  if (h) await h.gotoMainTab(page, 'profile');
  else await page.evaluate(() => { if (typeof switchMainTab === 'function') switchMainTab('profile'); });
  await page.waitForTimeout(150);
  if (h) await h.openEditProfile(page);
  else await page.evaluate(() => { if (typeof openEditProfileModal === 'function') openEditProfileModal(); });
  await page.waitForTimeout(150);
  const data = await page.evaluate(() => {
    const val = (id) => {
      const el = document.getElementById(id);
      if (!el) return '';
      if ('value' in el) return el.value || '';
      return (el.textContent || '').trim();
    };
    return {
      username: (state.currentUser && state.currentUser.username) || '',
      fullName: (state.currentUser && state.currentUser.fullName) || '',
      accountType: (state.currentUser && state.currentUser.accountType) || '',
      email: (state.currentUser && state.currentUser.email) || '',
      profileUsername: ((document.getElementById('profile-page-username') || {}).textContent || '').trim(),
      headerAvatar: (document.getElementById('header-avatar') && document.getElementById('header-avatar').getAttribute('src')) || '',
      profileAvatar: (document.getElementById('profile-page-avatar') && document.getElementById('profile-page-avatar').getAttribute('src')) || '',
      nameField: val('edit-profile-name'),
      emailField: val('edit-profile-email'),
      bio: val('edit-profile-bio'),
      dba: val('edit-profile-dba-name'),
      industry: val('edit-profile-business-industry'),
      city: val('edit-profile-business-city'),
      hours: val('edit-profile-business-hours'),
      support: val('edit-profile-support-email')
    };
  });
  await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
  return data;
}

function expectAccount(a, got, account, pkg, prevAvatar, label) {
  a.equal(got.username, account.username, label + ': current user is @' + account.username);
  a.ok(got.profileUsername.replace(/^@/, '') === account.username, label + ': profile header shows @' + account.username + ' (got ' + got.profileUsername + ')');
  a.equal(got.fullName, account.fullName, label + ': display name is ' + account.fullName);
  a.ok(got.nameField === account.fullName || got.nameField === account.username, label + ': Edit Profile name is the active account (' + got.nameField + ')');
  a.equal(got.emailField, account.email, label + ': Edit Profile email is the active account');
  a.ok(!!got.headerAvatar, label + ': header avatar is present');
  a.ok(!!got.profileAvatar, label + ': profile avatar is present');
  a.ok(got.headerAvatar === got.profileAvatar, label + ': header and profile avatars match');
  if (prevAvatar) {
    a.ok(got.headerAvatar !== prevAvatar, label + ': header avatar changed with the account switch');
    a.ok(got.profileAvatar !== prevAvatar, label + ': profile avatar changed with the account switch');
  }
  if (pkg) {
    a.equal(got.dba, pkg.dbaName, label + ': Edit Profile DBA is the active account');
    a.equal(got.industry, pkg.businessIndustry, label + ': Edit Profile industry is the active account');
    a.equal(got.city, pkg.businessCity, label + ': Edit Profile city is the active account');
    a.equal(got.hours, pkg.businessHours, label + ': Edit Profile hours are the active account');
    a.equal(got.support, pkg.businessSupportEmail, label + ': Edit Profile support email is the active account');
  } else {
    a.equal(got.dba, '', label + ': personal account does not show another account\'s DBA');
    a.ok(!got.industry || got.industry === '', label + ': personal account does not show another account\'s industry (' + got.industry + ')');
    a.equal(got.city, '', label + ': personal account does not show another account\'s city');
    a.equal(got.hours, '', label + ': personal account does not show another account\'s hours');
    a.equal(got.support, '', label + ': personal account does not show another account\'s support email');
    a.ok(got.dba !== BUSINESS_PKG.business.dbaName && got.dba !== BUSINESS_PKG.pixlynote.dbaName, label + ': no business DBA leaked');
    a.ok(got.city !== BUSINESS_PKG.business.businessCity && got.city !== BUSINESS_PKG.pixlynote.businessCity, label + ': no business city leaked');
    a.ok(got.support !== BUSINESS_PKG.business.businessSupportEmail && got.support !== BUSINESS_PKG.pixlynote.businessSupportEmail, label + ': no business support email leaked');
  }
}

async function prepareThreeAccounts(page, h) {
  const personal = Object.assign({}, h.ACCOUNTS.personal, { avatar: AVATARS.personal });
  const business = Object.assign({}, h.ACCOUNTS.business, { avatar: AVATARS.business });
  const pixly = Object.assign({}, h.ACCOUNTS.pixlynote, { avatar: AVATARS.pixlynote });
  await seedAccountExtras(page, personal, { avatar: AVATARS.personal, bio: personal.username === 'pixlynote' ? '' : ('Bio for ' + personal.fullName) });
  await seedAccountExtras(page, business, Object.assign({ avatar: AVATARS.business, bio: 'Bio for ' + business.fullName }, BUSINESS_PKG.business));
  await seedAccountExtras(page, pixly, Object.assign({ avatar: AVATARS.pixlynote, bio: 'The official Pixlynote account' }, BUSINESS_PKG.pixlynote));
  await seedSwitcherAccounts(page, [personal, business, pixly]);
  return { personal, business, pixly };
}

module.exports = {
  name: 'Account switcher',
  tests: [
    {
      name: 'Everything for the account switcher exists',
      accounts: ALL_ACCOUNT_KEYS,
      covers: SWITCHER_COVERS,
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const r = await page.evaluate(({ ids, fns }) => {
          const missing = ids.filter((id) => !document.getElementById(id));
          const missingFns = fns.filter((n) => {
            try {
              return typeof window[n] !== 'function' && typeof eval('typeof ' + n) !== 'function';
            } catch (e) {
              return true;
            }
          });
          const inp = document.getElementById('switch-password-input');
          return {
            missing,
            missingFns,
            ac: inp ? (inp.getAttribute('autocomplete') || '') : '',
            type: inp ? inp.type : ''
          };
        }, { ids: SWITCHER_IDS, fns: SWITCHER_FNS });
        a.equal(r.missing.join(','), '', 'All switcher elements exist (missing: ' + r.missing.join(', ') + ')');
        a.equal(r.missingFns.join(','), '', 'All switcher handlers exist (missing: ' + r.missingFns.join(', ') + ')');
        a.equal(r.type, 'password', 'Switch-password field stays type=password');
        a.ok(r.ac !== 'current-password' && r.ac !== 'username' && r.ac !== 'email', 'Switch-password field is not a Chrome login autocomplete target (autocomplete=' + r.ac + ')');

        await prepareThreeAccounts(page, h);
        await closeProfileChrome(page, h);
        await tap(page, '#btn-header-profile');
        await page.waitForTimeout(250);
        const ui = await page.evaluate((current) => {
          const modal = document.getElementById('modal-account-switcher');
          const rows = Array.from(document.querySelectorAll('.account-switcher-row')).map((el) => el.getAttribute('data-username'));
          const badge = document.getElementById('header-account-count-badge');
          return {
            open: !!(modal && !modal.classList.contains('hidden') && modal.style.display !== 'none'),
            rows,
            badge: badge ? (badge.textContent || '').trim() : '',
            badgeVisible: !!(badge && !badge.classList.contains('hidden')),
            currentRow: rows.indexOf(current) !== -1
          };
        }, account.username);
        a.ok(ui.open, 'Header chat-head button opens the account switcher');
        a.ok(ui.currentRow, 'Switcher lists the signed-in account');
        a.ok(ui.rows.length >= 3, 'Switcher lists the saved accounts (got ' + ui.rows.join(', ') + ')');
        a.ok(ui.badgeVisible && Number(ui.badge) >= 3, 'Chat-head badge shows the saved-account count');
        await tap(page, '#btn-close-account-switcher');
        await page.waitForTimeout(150);

        const others = ['reg_personal', 'reg_business', 'pixlynote'].filter((u) => u !== account.username);
        const target = others[0];
        await switchViaSwitcherUi(page, h, target, 'TestPass123!');
        const after = await page.evaluate(() => (state.currentUser && state.currentUser.username) || '');
        a.equal(after, target, 'Everything-exists check: switcher actually switches to @' + target);
        const loginState = await page.evaluate(() => ({
          loginForm: !!document.getElementById('login-form'),
          filled: Array.from(document.querySelectorAll('input[type="password"]')).filter((el) => (el.value || '') !== '').map((el) => el.id)
        }));
        a.ok(!loginState.loginForm, 'Login form stays detached after a switcher sign-in');
        a.equal(loginState.filled.join(','), '', 'No filled password inputs remain after a switch');
        await switchViaSwitcherUi(page, h, account.username, 'TestPass123!');
        a.equal(await page.evaluate(() => (state.currentUser && state.currentUser.username) || ''), account.username, 'Switcher returns to the original account so later tests stay isolated');
      }
    },
    {
      name: 'Chat head switcher drives A to B to C to A, both directions, repeatedly, and after reload without leaking business fields',
      accounts: ['personal'],
      covers: SWITCHER_COVERS.concat([
        'el:#edit-profile-name',
        'el:#edit-profile-email',
        'el:#edit-profile-dba-name',
        'el:#edit-profile-business-industry',
        'el:#edit-profile-business-city',
        'el:#edit-profile-business-hours',
        'el:#edit-profile-support-email',
        'el:#profile-page-username',
        'el:#header-avatar',
        'el:#profile-page-avatar',
        'handler:performLogin',
        'handler:resetProfileStateForAccountSwitch'
      ]),
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.loginAs(page, h.ACCOUNTS.personal);
        const { personal, business, pixly } = await prepareThreeAccounts(page, h);
        await page.evaluate((acc) => {
          if (typeof performLogin === 'function') {
            performLogin(acc.username, acc.fullName, acc.email, null, acc.phone, acc.accountType);
          }
        }, personal);
        await h.hideToasts(page);

        let prevAvatar = '';
        const assertAs = async (account, pkg, label) => {
          const got = await readActiveSurface(page, h);
          expectAccount(a, got, account, pkg, prevAvatar, label);
          prevAvatar = got.headerAvatar;
          return got;
        };

        await assertAs(personal, null, 'Start as A');

        await switchViaSwitcherUi(page, h, business.username, business.password);
        await assertAs(business, BUSINESS_PKG.business, 'A to B');

        await switchViaSwitcherUi(page, h, pixly.username, pixly.password);
        await assertAs(pixly, BUSINESS_PKG.pixlynote, 'B to C');

        await switchViaSwitcherUi(page, h, personal.username, personal.password);
        await assertAs(personal, null, 'C to A');

        // Reverse direction and a second lap.
        await switchViaSwitcherUi(page, h, pixly.username, pixly.password);
        await assertAs(pixly, BUSINESS_PKG.pixlynote, 'A to C');
        await switchViaSwitcherUi(page, h, business.username, business.password);
        await assertAs(business, BUSINESS_PKG.business, 'C to B');
        await switchViaSwitcherUi(page, h, personal.username, personal.password);
        await assertAs(personal, null, 'B to A again');
        await switchViaSwitcherUi(page, h, business.username, business.password);
        await assertAs(business, BUSINESS_PKG.business, 'Second A to B');
        await switchViaSwitcherUi(page, h, personal.username, personal.password);
        await assertAs(personal, null, 'Second B to A');

        // Reload keeps the session list and still switches.
        await closeProfileChrome(page, h);
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await page.waitForFunction(() => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username), { timeout: 8000 });
        const afterReload = await page.evaluate(() => ({
          current: (state.currentUser && state.currentUser.username) || '',
          list: (typeof getSessionAccounts === 'function') ? getSessionAccounts().map((x) => x.username) : []
        }));
        a.equal(afterReload.current, personal.username, 'Reload restores the last active account');
        a.ok(afterReload.list.indexOf(business.username) !== -1 && afterReload.list.indexOf(pixly.username) !== -1, 'Reload keeps the saved switcher accounts');
        await seedAccountExtras(page, business, Object.assign({ avatar: AVATARS.business, bio: 'Bio for ' + business.fullName }, BUSINESS_PKG.business));
        await seedAccountExtras(page, pixly, Object.assign({ avatar: AVATARS.pixlynote, bio: 'The official Pixlynote account' }, BUSINESS_PKG.pixlynote));
        await seedAccountExtras(page, personal, { avatar: AVATARS.personal, bio: 'Bio for ' + personal.fullName });
        await seedSwitcherAccounts(page, [personal, business, pixly]);

        await switchViaSwitcherUi(page, h, pixly.username, pixly.password);
        await assertAs(pixly, BUSINESS_PKG.pixlynote, 'After reload A to C');
        await switchViaSwitcherUi(page, h, personal.username, personal.password);
        await assertAs(personal, null, 'After reload C to A');

        const loginState = await page.evaluate(() => ({
          loginForm: !!document.getElementById('login-form'),
          filled: Array.from(document.querySelectorAll('input[type="password"]')).filter((el) => (el.value || '') !== '').map((el) => el.id)
        }));
        a.ok(!loginState.loginForm, 'Login form stays detached after a reload and more switches');
        a.equal(loginState.filled.join(','), '', 'No filled password inputs remain after reload switches');
      }
    },
    {
      name: 'Disarming auth forms mid-entry does not clear the switch password or block the switch',
      accounts: ['personal'],
      covers: [
        'el:#switch-password-input',
        'el:#btn-confirm-switch-password',
        'el:#btn-header-profile',
        'handler:disarmAuthCredentialForms',
        'handler:clearPasswordFields',
        'handler:switchMainTab',
        'handler:confirmSwitchWithPassword'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.loginAs(page, h.ACCOUNTS.personal);
        const { business } = await prepareThreeAccounts(page, h);
        await closeProfileChrome(page, h);
        await tap(page, '#btn-header-profile');
        await page.waitForTimeout(250);
        await tap(page, '.account-switcher-row[data-username="' + business.username + '"]');
        await page.waitForTimeout(250);
        await page.fill('#switch-password-input', business.password);
        const before = await page.evaluate(() => (document.getElementById('switch-password-input') || {}).value || '');
        a.equal(before, business.password, 'Password is in the switch field before disarm');
        await page.evaluate(() => {
          if (typeof switchMainTab === 'function') switchMainTab('profile');
          if (typeof disarmAuthCredentialForms === 'function') disarmAuthCredentialForms();
        });
        const after = await page.evaluate(() => (document.getElementById('switch-password-input') || {}).value || '');
        a.equal(after, business.password, 'Profile-tab disarm does not wipe the in-progress switch password');
        await tap(page, '#btn-confirm-switch-password');
        await page.waitForFunction((u) => !!(window.state && state.currentUser && state.currentUser.username === u), business.username, { timeout: 8000 });
        a.equal(await page.evaluate(() => (state.currentUser && state.currentUser.username) || ''), business.username, 'Switch still completes after a mid-entry disarm');
      }
    }
  ]
};
