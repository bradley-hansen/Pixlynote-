'use strict';

/**
 * Phone, email, and the rest of Edit Profile must survive login, hard reload,
 * Firestore hydration, account switch, and Save. A blank persist must not
 * wipe a stored number, and a hard reload must not return a signed-in user
 * to the Join Pixlynote splash.
 */

const AV = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function snapshotUser() {
  return `(function () {
    const u = state.currentUser || {};
    const vis = (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
    };
    return {
      isLoggedIn: !!state.isLoggedIn,
      username: u.username || '',
      fullName: u.fullName || '',
      email: u.email || '',
      phone: u.phone || '',
      bio: u.bio || '',
      link: u.link || '',
      accountType: u.accountType || '',
      avatar: u.avatar || '',
      dbaName: u.dbaName || '',
      businessIndustry: u.businessIndustry || '',
      businessStreet: u.businessStreet || '',
      businessCity: u.businessCity || '',
      businessState: u.businessState || '',
      businessPostal: u.businessPostal || '',
      businessHours: u.businessHours || '',
      businessSupportEmail: u.businessSupportEmail || '',
      isPlus: u.isPlus === true,
      isVerified: u.isVerified === true,
      isBusinessPlus: u.isBusinessPlus === true,
      subscriptionStatus: u.subscriptionStatus || '',
      stripeSessionId: u.stripeSessionId || '',
      verificationType: u.verificationType || '',
      verificationStatus: u.verificationStatus || '',
      governmentBadgeColor: u.governmentBadgeColor || '',
      businessVerificationStatus: u.businessVerificationStatus || '',
      flagLoggedIn: localStorage.getItem('pixly_is_logged_in'),
      flagUser: localStorage.getItem('pixly_active_username'),
      splash: vis('splash-container') && vis('auth-view'),
      main: vis('main-view')
    };
  })()`;
}

function stampProfile(page, fields) {
  return page.evaluate((f) => {
    const u = state.currentUser;
    Object.keys(f).forEach((k) => { u[k] = f[k]; });
    if (typeof markStoredProfileFieldsLoaded === 'function') markStoredProfileFieldsLoaded(u, u);
    if (typeof persistState === 'function') persistState();
    if (typeof persistCurrentUserSubscription === 'function') persistCurrentUserSubscription();
  }, fields);
}

function personalFields(account) {
  return {
    fullName: 'Persisted ' + account.username,
    email: account.email,
    phone: '+1 (202) 555-0187',
    bio: 'Persisted bio for ' + account.username,
    link: 'https://example.test/persist-' + account.username,
    accountType: 'personal',
    avatar: AV,
    isPlus: true,
    isVerified: true,
    isBusinessPlus: false,
    subscriptionStatus: 'active',
    stripeSessionId: 'cs_test_PERSISTPHONE01',
    verificationType: 'government',
    verificationStatus: 'approved',
    governmentBadgeColor: 'navy'
  };
}

function businessFields(account) {
  return {
    fullName: 'Persisted Biz ' + account.username,
    email: account.email,
    phone: '+1 (202) 555-0188',
    bio: 'Persisted business bio for ' + account.username,
    link: 'https://example.test/biz-' + account.username,
    accountType: 'business',
    avatar: AV,
    dbaName: 'Trade ' + account.username,
    businessIndustry: 'software_tech',
    businessStreet: '10 Persist Ave',
    businessCity: 'Austin',
    businessState: 'TX',
    businessPostal: '78701',
    businessHours: 'Mon–Fri 9–5',
    businessSupportEmail: 'support.' + account.username + '@example.test',
    isPlus: false,
    isVerified: false,
    isBusinessPlus: true,
    subscriptionStatus: 'active',
    stripeBusinessSessionId: 'cs_test_PERSISTBIZ01',
    businessVerificationStatus: 'approved'
  };
}

function assertCore(a, got, expected, label) {
  ['fullName', 'email', 'phone', 'bio', 'link', 'accountType'].forEach((k) => {
    a.equal(got[k], expected[k], label + ' keeps ' + k + ': ' + JSON.stringify({ got: got[k], expected: expected[k] }));
  });
  if (expected.avatar) a.ok(got.avatar, label + ' keeps an avatar');
  if (expected.isPlus) a.equal(got.isPlus, true, label + ' keeps Plus');
  if (expected.isVerified) a.equal(got.isVerified, true, label + ' keeps isVerified');
  if (expected.subscriptionStatus) a.equal(got.subscriptionStatus, expected.subscriptionStatus, label + ' keeps subscriptionStatus');
  if (expected.verificationType) a.equal(got.verificationType, expected.verificationType, label + ' keeps verificationType');
  if (expected.verificationStatus) a.equal(got.verificationStatus, expected.verificationStatus, label + ' keeps verificationStatus');
  if (expected.governmentBadgeColor) a.equal(got.governmentBadgeColor, expected.governmentBadgeColor, label + ' keeps governmentBadgeColor');
  if (expected.isBusinessPlus) a.equal(got.isBusinessPlus, true, label + ' keeps Business Plus');
  if (expected.dbaName) a.equal(got.dbaName, expected.dbaName, label + ' keeps DBA');
  if (expected.businessIndustry) a.equal(got.businessIndustry, expected.businessIndustry, label + ' keeps industry');
  if (expected.businessCity) a.equal(got.businessCity, expected.businessCity, label + ' keeps city');
  if (expected.businessSupportEmail) a.equal(got.businessSupportEmail, expected.businessSupportEmail, label + ' keeps support email');
  if (expected.businessVerificationStatus) a.equal(got.businessVerificationStatus, expected.businessVerificationStatus, label + ' keeps business verification status');
}

module.exports = {
  name: 'Profile persist and session reload',
  tests: [
    {
      name: 'Profile persist: Unit: blank phone/email cannot wipe stored values; auto writes omit blank phone',
      accounts: ['personal'],
      covers: ['handler:preserveNonEmptyContactFields', 'handler:omitBlankProtectedFields', 'handler:persistState', 'handler:publicSafeUserFields'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const unit = await page.evaluate((phone) => {
          const kept = preserveNonEmptyContactFields({ phone: '', email: '', username: 'x' }, { phone: phone, email: 'keep@example.test' });
          const omitted = omitBlankProtectedFields({ username: 'x', phone: '', email: '', bio: 'ok' });
          const pub = publicSafeUserFields({ username: 'x', fullName: 'X', phone: '', email: '', bio: 'ok', accountType: 'personal' });
          const u = state.currentUser;
          const prevPhone = u.phone;
          const prevEmail = u.email;
          u.phone = phone;
          u.email = 'keep@example.test';
          persistState();
          u.phone = '';
          u.email = '';
          window._pixlyAllowBlankContactPersist = {};
          persistState();
          const key = getAccountStorageKey('pixlynote_user', normalizeUsername(u.username));
          const stored = JSON.parse(localStorage.getItem(key) || 'null') || {};
          u.phone = prevPhone;
          u.email = prevEmail;
          const remoteEmpty = { username: u.username, phone: '', email: '', fullName: u.fullName, accountType: u.accountType };
          const beforeHydrate = { phone: state.currentUser.phone, email: state.currentUser.email };
          state.currentUser.phone = phone;
          state.currentUser.email = 'keep@example.test';
          if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(normalizeUsername(u.username), remoteEmpty, false);
          const afterHydrate = { phone: state.currentUser.phone, email: state.currentUser.email };
          return {
            keptPhone: kept.phone,
            keptEmail: kept.email,
            omittedHasPhone: Object.prototype.hasOwnProperty.call(omitted, 'phone'),
            omittedHasEmail: Object.prototype.hasOwnProperty.call(omitted, 'email'),
            omittedBio: omitted.bio,
            pubPhone: pub.phone,
            storedPhone: stored.phone,
            storedEmail: stored.email,
            afterHydrate,
            beforeHydrate
          };
        }, '+1 (202) 555-0187');
        a.equal(unit.keptPhone, '+1 (202) 555-0187', 'preserveNonEmptyContactFields keeps a stored phone: ' + JSON.stringify(unit));
        a.equal(unit.keptEmail, 'keep@example.test', 'preserveNonEmptyContactFields keeps a stored email');
        a.equal(unit.omittedHasPhone, false, 'omitBlankProtectedFields drops a blank phone so merge writes cannot wipe Firestore');
        a.equal(unit.omittedHasEmail, false, 'omitBlankProtectedFields drops a blank email');
        a.equal(unit.omittedBio, 'ok', 'Other fields still go out on an auto write');
        a.equal(unit.storedPhone, '+1 (202) 555-0187', 'persistState does not save a blank phone over a stored number');
        a.equal(unit.storedEmail, 'keep@example.test', 'persistState does not save a blank email over a stored email');
        a.equal(unit.afterHydrate.phone, '+1 (202) 555-0187', 'Hydration does not apply a blank remote phone over a local number');
        a.equal(unit.afterHydrate.email, 'keep@example.test', 'Hydration does not apply a blank remote email over a local email');
      }
    },
    {
      name: 'Profile persist: E2E: session and all Edit Profile fields survive a hard reload (personal)',
      accounts: ['personal'],
      covers: ['handler:performLogin', 'handler:persistState', 'handler:openEditProfileModal', 'el:#edit-profile-phone', 'el:#edit-profile-email', 'el:#edit-profile-name', 'el:#main-view', 'el:#auth-view'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const expected = personalFields(account);
        await stampProfile(page, expected);
        const before = await page.evaluate(snapshotUser());
        a.equal(before.isLoggedIn, true, 'Signed in before reload');
        a.equal(before.flagLoggedIn, '1', 'pixly_is_logged_in is set');
        assertCore(a, before, expected, 'Before reload');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        const after = await page.evaluate(snapshotUser());
        a.equal(after.isLoggedIn, true, 'Hard reload keeps the session: ' + JSON.stringify(after));
        a.equal(after.username, account.username, 'Hard reload keeps the same username');
        a.equal(after.main, true, 'Main app is visible after hard reload');
        a.equal(after.splash, false, 'Join Pixlynote splash is not shown after hard reload');
        assertCore(a, after, expected, 'After hard reload');

        await h.openEditProfile(page);
        const form = await page.evaluate(() => ({
          name: (document.getElementById('edit-profile-name') || {}).value || '',
          username: (document.getElementById('edit-profile-username') || {}).value || '',
          email: (document.getElementById('edit-profile-email') || {}).value || '',
          phone: (document.getElementById('edit-profile-phone') || {}).value || '',
          bio: (document.getElementById('edit-profile-bio') || {}).value || '',
          link: (document.getElementById('edit-profile-link') || {}).value || ''
        }));
        a.equal(form.name, expected.fullName, 'Edit Profile name survives reload');
        a.equal(form.username, account.username, 'Edit Profile username survives reload');
        a.equal(form.email, expected.email, 'Edit Profile email survives reload');
        a.equal(form.phone, expected.phone, 'Edit Profile phone survives reload');
        a.equal(form.bio, expected.bio, 'Edit Profile bio survives reload');
        a.ok((form.link || '').includes('persist-' + account.username), 'Edit Profile website survives reload: ' + form.link);
      }
    },
    {
      name: 'Profile persist: E2E: session and all Edit Profile fields survive a hard reload (business)',
      accounts: ['business'],
      covers: ['handler:performLogin', 'handler:persistState', 'el:#edit-profile-dba-name', 'el:#edit-profile-business-industry', 'el:#edit-profile-phone', 'el:#main-view'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const expected = businessFields(account);
        await stampProfile(page, expected);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        const after = await page.evaluate(snapshotUser());
        a.equal(after.isLoggedIn, true, 'Business session survives hard reload: ' + JSON.stringify(after));
        a.equal(after.splash, false, 'Business user is not returned to the welcome page');
        assertCore(a, after, expected, 'Business after reload');
        await h.openEditProfile(page);
        const form = await page.evaluate(() => ({
          phone: (document.getElementById('edit-profile-phone') || {}).value || '',
          dba: (document.getElementById('edit-profile-dba-name') || {}).value || '',
          industry: (document.getElementById('edit-profile-business-industry') || {}).value || '',
          city: (document.getElementById('edit-profile-business-city') || {}).value || '',
          support: (document.getElementById('edit-profile-support-email') || {}).value || ''
        }));
        a.equal(form.phone, expected.phone, 'Business phone survives reload in the form');
        a.equal(form.dba, expected.dbaName, 'DBA survives reload in the form');
        a.equal(form.industry, expected.businessIndustry, 'Industry survives reload in the form');
        a.equal(form.city, expected.businessCity, 'City survives reload in the form');
        a.equal(form.support, expected.businessSupportEmail, 'Support email survives reload in the form');
      }
    },
    {
      name: 'Profile persist: E2E: fields survive Firestore hydration, Save, and account switch',
      accounts: ['personal'],
      covers: ['handler:applyActiveUserDocData', 'handler:performLogin', 'el:#btn-save-edit-profile', 'el:#edit-profile-form'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const expected = personalFields(account);
        await stampProfile(page, expected);

        const hydrated = await page.evaluate((doc) => {
          const u = state.currentUser;
          ['fullName', 'email', 'phone', 'bio', 'link'].forEach((k) => { u[k] = ''; });
          if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(normalizeUsername(u.username), doc, false);
          return { phone: u.phone, email: u.email, fullName: u.fullName, bio: u.bio, link: u.link, isPlus: u.isPlus, isVerified: u.isVerified };
        }, expected);
        a.equal(hydrated.phone, expected.phone, 'Hydration restores phone: ' + JSON.stringify(hydrated));
        a.equal(hydrated.email, expected.email, 'Hydration restores email');
        a.equal(hydrated.fullName, expected.fullName, 'Hydration restores name');

        await h.openEditProfile(page);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const saved = await page.evaluate(() => {
          const writes = (window.__pixlyUserDocWrites || []).filter((w) => w.source === 'edit-profile');
          const last = writes.length ? writes[writes.length - 1].data : null;
          return { phone: state.currentUser.phone, email: state.currentUser.email, writePhone: last && last.phone, writeEmail: last && last.email };
        });
        a.equal(saved.phone, expected.phone, 'Save keeps the existing phone');
        a.equal(saved.email, expected.email, 'Save keeps the existing email');
        a.equal(saved.writePhone, expected.phone, 'The Firestore save payload includes the phone, not a blank');

        const other = h.ACCOUNTS.business;
        await page.evaluate((o) => {
          if (typeof performLogin === 'function') performLogin(o.username, o.fullName, o.email, null, o.phone, o.accountType);
        }, other);
        const mid = await page.evaluate(() => (state.currentUser && state.currentUser.username) || '');
        a.equal(mid, other.username, 'Switched to the other account');
        await page.evaluate((o) => {
          if (typeof performLogin === 'function') performLogin(o.username, o.fullName, o.email, null, o.phone, o.accountType);
        }, { username: account.username, fullName: expected.fullName, email: expected.email, phone: expected.phone, accountType: expected.accountType });
        const back = await page.evaluate(snapshotUser());
        a.equal(back.username, account.username, 'Switched back to the original account');
        a.equal(back.phone, expected.phone, 'Phone survives account switch and back: ' + JSON.stringify(back));
        a.equal(back.email, expected.email, 'Email survives account switch and back');
        a.equal(back.fullName, expected.fullName, 'Name survives account switch and back');
        a.equal(back.isPlus, true, 'Plus survives account switch and back');
      }
    }
  ]
};
