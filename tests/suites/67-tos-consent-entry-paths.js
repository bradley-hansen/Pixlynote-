'use strict';

/**
 * Terms of Service consent: one success and one failure test for EVERY way a user becomes signed in.
 * performLogin is the only place that sets state.isLoggedIn = true; each entry path below ends there, and the consent
 * check is hooked at the end of performLogin (plus a re-check when the tab comes back and when Firebase Auth reports a user).
 *
 * Entry inventory (see the report for the file/line of each):
 *   E1 login page                     E2 saved-session restore (reload / reopened browser)
 *   E3 Account Center "Log into another account"    E4 account switcher (password, owner switch-back, showcase accounts)
 *   E5 sign-up completion (66-tos-consent.js)       E6 password reset, then sign-in
 *   E7 owner full access from a delegate view       E8 privileged read-only viewers (skipped on purpose)
 *   E9 tab regains focus / pageshow / Firebase Auth state (re-check)     E10 UI behind the modal is blocked
 * Mock Firestore only; never touches production.
 */

const { VERIFY_CODE } = require('../helpers/harness');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const MODAL_COVERS = ['el:#tos-consent-checkbox', 'el:#btn-tos-consent-agree', 'el:#btn-tos-consent-logout'];
const FIXTURES = ['reg_personal', 'reg_business', 'reg_empty', 'pixlynote'];

const modalOpen = (page) => page.evaluate(() => !!(window.pixlyTos && window.pixlyTos.isOpen()));
async function waitModal(page, open, ms) {
  try { await page.waitForFunction((o) => !!(window.pixlyTos && window.pixlyTos.isOpen()) === o, open, { timeout: ms || 4000 }); return true; } catch (e) { return false; }
}
const noModal = async (page, ms) => !(await waitModal(page, true, ms || 900));
const mockDoc = (page, p) => page.evaluate((p) => JSON.parse(JSON.stringify(window.__pfs.docs[p] || null)), p);
const loggedInAs = (page) => page.evaluate(() => (window.state && state.isLoggedIn && state.currentUser) ? String(state.currentUser.username).toLowerCase() : '');

async function agree(page) {
  await page.evaluate(() => { const p = document.getElementById('tos-consent-panel'); p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(60);
  await page.check('#tos-consent-checkbox');
  await page.click('#btn-tos-consent-agree');
}

// Mock Firestore with chosen cloud docs; the listed users have NO local proof of consent. Everything is restored afterwards.
async function withMock(page, opts, fn) {
  const o = opts || {};
  const seed = {};
  Object.keys(o.docs || {}).forEach((u) => { seed['users/' + u] = Object.assign({ username: u }, o.docs[u]); });
  await page.evaluate(installPixlyMockFirestore, seed);
  await page.evaluate((clear) => { (clear || []).forEach((u) => localStorage.removeItem('pixly_tos_consent_' + u)); }, o.clearLocal || []);
  try { await fn(); } finally {
    await page.evaluate(() => { try { window.pixlyTos.hide(); } catch (e) {} });
    await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
    await page.evaluate((users) => {
      users.forEach((u) => localStorage.setItem('pixly_tos_consent_' + u, JSON.stringify({ tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' })));
      document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
      document.body.style.overflow = '';
    }, FIXTURES);
  }
}

async function loginForm(page, h, user, pw) {
  await h.openLoginForm(page);
  await page.fill('#login-username', user);
  await page.fill('#login-password', pw);
  await page.click('#btn-auth-submit');
}

async function registerSessions(page, accounts) {
  await page.evaluate((accounts) => {
    accounts.forEach((a) => registerSessionAccount({ username: a.username, fullName: a.fullName, email: a.email, phone: a.phone, avatar: '', accountType: a.accountType }));
  }, accounts);
}
async function openSwitcherAndTap(page, h, target) {
  await h.closeOverlays(page);
  await page.evaluate(() => document.getElementById('btn-header-profile').click());
  await page.waitForTimeout(250);
  await page.evaluate((u) => document.querySelector('.account-switcher-row[data-username="' + u + '"]').click(), target);
  await page.waitForTimeout(300);
}
async function submitSwitchPassword(page, pw) {
  await page.fill('#switch-password-input', pw);
  await page.evaluate(() => document.getElementById('btn-confirm-switch-password').click());
  await page.waitForTimeout(400);
}

module.exports = {
  name: 'Terms of Service consent: entry paths',
  tests: [
    // ---------------- E1 login page ----------------
    {
      name: 'ToS entry E1 login page: a never-consented account signs in and meets the blocking modal',
      accounts: ['signed-out'],
      covers: MODAL_COVERS,
      async run({ page, h, a }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await loginForm(page, h, e.username, e.password);
          a.ok(await waitModal(page, true), 'The modal appears right after the login page signs the account in');
          a.equal(await loggedInAs(page), e.username, 'Signed in as the account that must consent');
          a.ok(await page.evaluate(() => { const m = document.getElementById('main-view'); return !!(m.closest('[inert]')); }), 'The app is blocked behind the modal');
          await agree(page);
          a.ok(await waitModal(page, false), 'Agreeing closes it');
          a.ok((await mockDoc(page, 'users/' + e.username)).tosAcceptedAt, 'Consent saved for the account that logged in');
        });
      }
    },
    {
      name: 'ToS entry E1 login page: a wrong password never signs in and never shows the modal; a consented account logs in with no modal',
      accounts: ['signed-out'],
      covers: [],
      async run({ page, h, a }) {
        const e = h.ACCOUNTS.empty, p = h.ACCOUNTS.personal;
        await withMock(page, { docs: { [e.username]: { accountType: 'personal' }, [p.username]: { accountType: 'personal', tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' } }, clearLocal: [e.username, p.username] }, async () => {
          await loginForm(page, h, e.username, 'definitely-wrong');
          a.ok(await noModal(page, 900), 'No modal after a failed login');
          a.equal(await loggedInAs(page), '', 'Not signed in');
          await page.fill('#login-username', p.username);
          await page.fill('#login-password', p.password);
          await page.click('#btn-auth-submit');
          await page.waitForFunction((u) => !!(window.state && state.isLoggedIn && String(state.currentUser.username).toLowerCase() === u), p.username, { timeout: 5000 });
          a.ok(await noModal(page, 900), 'An account that already agreed is not asked');
        });
      }
    },

    // ---------------- E2 saved-session restore ----------------
    {
      name: 'ToS entry E2 saved session: reopening/reloading as a never-consented account shows the modal again until answered',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const url = page.url();
        const flush = () => page.evaluate(() => { (window._onFirebaseReadyQueue || []).splice(0).forEach((f) => { try { f(); } catch (e) {} }); });
        await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), account.username);
        try {
          for (let i = 0; i < 2; i++) {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
            await h.installAppStubs(page);
            await page.evaluate(installPixlyMockFirestore, { ['users/' + account.username]: { username: account.username, accountType: 'personal' } });
            await flush();
            a.ok(await waitModal(page, true, 5000), 'Reload #' + (i + 1) + ': the restored session is asked to consent (nothing was answered)');
            a.equal(await loggedInAs(page), account.username, 'The session was restored');
          }
          await agree(page);
          a.ok(await waitModal(page, false), 'Agreeing closes it');
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
          await h.installAppStubs(page);
          await page.evaluate(installPixlyMockFirestore, { ['users/' + account.username]: { username: account.username, accountType: 'personal', tosAcceptedAt: 1764000000001, tosVersion: '2026-11-23' } });
          await flush();
          a.ok(await noModal(page, 1200), 'After agreeing, the next reload is quiet');
        } finally {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
          await h.installAppStubs(page);
          await h.seedAccountsStore(page);
          await h.loginAs(page, account);
        }
      }
    },
    {
      name: 'ToS entry E2 saved session: a signed-out reload and a consented restored session show no modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const url = page.url();
        const flush = () => page.evaluate(() => { (window._onFirebaseReadyQueue || []).splice(0).forEach((f) => { try { f(); } catch (e) {} }); });
        try {
          await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), account.username);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
          await h.installAppStubs(page);
          await page.evaluate(installPixlyMockFirestore, { ['users/' + account.username]: { username: account.username, accountType: 'personal', tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' } });
          await flush();
          a.ok(await noModal(page, 1200), 'Cloud says consented: no modal on restore');
          // Signed out: nothing to ask.
          await h.clearLoginSession(page);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
          await h.installAppStubs(page);
          a.equal(await loggedInAs(page), '', 'Signed out after the session was cleared');
          a.ok(await noModal(page, 600), 'No modal on the signed-out welcome screen');
        } finally {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
          await h.installAppStubs(page);
          await h.seedAccountsStore(page);
          await h.loginAs(page, account);
        }
      }
    },

    // ---------------- E3 Account Center login ----------------
    {
      name: 'ToS entry E3 Account Center "Log into another account": a never-consented account meets the modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await h.closeOverlays(page);
          await page.evaluate(() => document.getElementById('btn-header-profile').click());
          await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
          await page.click('#btn-switcher-login');
          await page.waitForSelector('#auth-login-container:not(.hidden)', { timeout: 3000 });
          await page.fill('#login-username', e.username);
          await page.fill('#login-password', e.password);
          await page.click('#btn-auth-submit');
          a.ok(await waitModal(page, true), 'The modal appears for the account added through Account Center');
          a.equal(await loggedInAs(page), e.username, 'Signed in as the added account');
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS entry E3 Account Center "Log into another account": a wrong password adds nothing and shows no modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await h.closeOverlays(page);
          await page.evaluate(() => document.getElementById('btn-header-profile').click());
          await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
          await page.click('#btn-switcher-login');
          await page.waitForSelector('#auth-login-container:not(.hidden)', { timeout: 3000 });
          await page.fill('#login-username', e.username);
          await page.fill('#login-password', 'nope-nope');
          await page.click('#btn-auth-submit');
          a.ok(await noModal(page, 900), 'No modal for a failed login');
          a.ok((await loggedInAs(page)) !== e.username, 'The other account was not signed in');
          a.ok(await h.isVisible(page, '#btn-auth-return-session'), 'The way back to the original account is still offered');
        });
        await h.loginAs(page, account);
      }
    },

    // ---------------- E4 account switcher ----------------
    {
      name: 'ToS entry E4 account switcher (password): switching into a never-consented saved account meets the modal; showcase accounts too',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const e = h.ACCOUNTS.empty;
        for (const showcase of [false, true]) {
          await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [e.username]: { accountType: showcase ? 'showcase' : 'personal', isShowcase: showcase } }, clearLocal: [e.username] }, async () => {
            await registerSessions(page, [account, e]);
            await openSwitcherAndTap(page, h, e.username);
            await submitSwitchPassword(page, e.password);
            a.ok(await waitModal(page, true), (showcase ? 'Showcase' : 'Saved') + ' account: the modal appears after switching in');
            a.equal(await loggedInAs(page), e.username, 'Switched into the account');
            await page.evaluate(() => document.getElementById('btn-tos-consent-logout').click());
            await page.waitForTimeout(200);
          });
          await h.loginAs(page, account);
        }
      }
    },
    {
      name: 'ToS entry E4 account switcher (password): a wrong password does not switch and shows no modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await registerSessions(page, [account, e]);
          await openSwitcherAndTap(page, h, e.username);
          await submitSwitchPassword(page, 'wrong-pass');
          a.ok(await noModal(page, 800), 'No modal');
          a.equal(await loggedInAs(page), account.username, 'Still on the original account');
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS entry E4 account switcher (owner switch-back with a kept sign-in): SUCCESS - a never-consented account meets the modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await registerSessions(page, [account, e]);
          await page.evaluate(({ me, other }) => {
            savePrivilegedAccountsList(me, [{ username: other, status: 'accepted' }]);
            window.__origRestore = window.pixlyOwnerSessions.restore;
            window.pixlyOwnerSessions.restore = async () => true;
          }, { me: account.username, other: e.username });
          await openSwitcherAndTap(page, h, e.username);
          a.ok(await waitModal(page, true), 'The kept sign-in switches in with full access and the modal appears');
          a.equal(await loggedInAs(page), e.username, 'Switched into the account');
          await page.evaluate((me) => { window.pixlyOwnerSessions.restore = window.__origRestore; localStorage.removeItem('pixly_priv_accounts_' + me); }, account.username);
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS entry E4 account switcher (owner switch-back): FAILURE - no kept sign-in means nobody is signed in and no modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await registerSessions(page, [account, e]);
          await page.evaluate(({ me, other }) => {
            savePrivilegedAccountsList(me, [{ username: other, status: 'accepted' }]);
            window.__origRestore = window.pixlyOwnerSessions.restore;
            window.pixlyOwnerSessions.restore = async () => false;
          }, { me: account.username, other: e.username });
          await openSwitcherAndTap(page, h, e.username);
          a.ok(await noModal(page, 800), 'No modal');
          a.equal(await loggedInAs(page), account.username, 'Still the original account');
          await page.evaluate((me) => { closeSwitchPasswordModal(); window.pixlyOwnerSessions.restore = window.__origRestore; localStorage.removeItem('pixly_priv_accounts_' + me); }, account.username);
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS entry E4 account switcher (privileged switch granted by the owner): a read-only view is never asked',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const e = h.ACCOUNTS.empty;
        const grantDoc = { privilegedAccessGranted: [{ username: account.username, status: 'accepted', grants: ['like'] }] };
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [e.username]: Object.assign({ accountType: 'personal' }, grantDoc) }, clearLocal: [e.username] }, async () => {
          await registerSessions(page, [account, e]);
          await page.evaluate(({ me, other }) => {
            savePrivilegedAccountsList(me, [{ username: other, status: 'accepted' }]);
            window.__origRestore = window.pixlyOwnerSessions.restore;
            window.pixlyOwnerSessions.restore = async () => false;
          }, { me: account.username, other: e.username });
          await openSwitcherAndTap(page, h, e.username);
          a.ok(await noModal(page, 900), 'A privileged read-only switch is not asked');
          a.ok(await page.evaluate(() => !!state.privilegedReadOnly), 'It really is a read-only view');
          await page.evaluate((me) => { clearPrivilegedReadOnlySession(); window.pixlyOwnerSessions.restore = window.__origRestore; localStorage.removeItem('pixly_priv_accounts_' + me); }, account.username);
        });
        await h.loginAs(page, account);
      }
    },

    // ---------------- E6 password reset then sign-in ----------------
    {
      name: 'ToS entry E6 password reset then sign-in: the new password signs in a never-consented account into the modal',
      accounts: ['signed-out'],
      covers: [],
      async run({ page, h, a }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await h.openLoginForm(page);
          await page.click('#btn-forgot-password');
          await page.fill('#forgot-identifier', e.email);
          await page.click('#btn-forgot-send-code');
          await page.waitForSelector('#form-forgot-step-2:not(.hidden)', { timeout: 4000 });
          await page.fill('#forgot-reset-code', VERIFY_CODE);
          await page.fill('#forgot-new-password', 'ResetTos77!');
          await page.fill('#forgot-confirm-password', 'ResetTos77!');
          await page.click('#btn-forgot-confirm-reset');
          await page.waitForTimeout(500);
          a.ok(!(await h.isVisible(page, '#modal-forgot-password')), 'The reset finished');
          a.ok(await noModal(page, 500), 'The reset alone signs nobody in');
          await page.fill('#login-username', e.username);
          await page.fill('#login-password', 'ResetTos77!');
          await page.click('#btn-auth-submit');
          a.ok(await waitModal(page, true), 'Signing in with the new password meets the modal');
          a.equal(await loggedInAs(page), e.username, 'Signed in as the reset account');
        });
      }
    },
    {
      name: 'ToS entry E6 password reset then sign-in: a wrong reset code changes nothing, the new password cannot sign in, no modal',
      accounts: ['signed-out'],
      covers: [],
      async run({ page, h, a }) {
        const e = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [e.username]: { accountType: 'personal' } }, clearLocal: [e.username] }, async () => {
          await h.openLoginForm(page);
          await page.click('#btn-forgot-password');
          await page.fill('#forgot-identifier', e.email);
          await page.click('#btn-forgot-send-code');
          await page.waitForSelector('#form-forgot-step-2:not(.hidden)', { timeout: 4000 });
          await page.fill('#forgot-reset-code', '000000');
          await page.fill('#forgot-new-password', 'NeverSet88!');
          await page.fill('#forgot-confirm-password', 'NeverSet88!');
          await page.click('#btn-forgot-confirm-reset');
          await page.waitForTimeout(500);
          await page.evaluate(() => { const m = document.getElementById('modal-forgot-password'); if (m) { m.classList.add('hidden'); m.style.display = 'none'; } });
          await page.fill('#login-username', e.username);
          await page.fill('#login-password', 'NeverSet88!');
          await page.click('#btn-auth-submit');
          a.ok(await noModal(page, 900), 'No modal');
          a.equal(await loggedInAs(page), '', 'Not signed in with a password that was never set');
        });
      }
    },

    // ---------------- E7 owner full access from a delegate view ----------------
    {
      name: 'ToS entry E7 owner full access from a delegate view: SUCCESS - a kept sign-in opens full access and a never-consented owner meets the modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const owner = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [owner.username]: { accountType: 'personal' } }, clearLocal: [owner.username] }, async () => {
          await registerSessions(page, [account, owner]);
          await page.evaluate((o) => {
            window.__origRestore = window.pixlyOwnerSessions.restore;
            performLogin(o.username, o.fullName, o.email, null, o.phone, o.accountType, { username: o.username, fullName: o.fullName, accountType: o.accountType }, { privilegedReadOnly: true, viewer: 'reg_personal', grants: ['like'] });
          }, owner);
          a.ok(await noModal(page, 700), 'The read-only view itself is not asked');
          await page.evaluate(() => { window.pixlyOwnerSessions.restore = async () => true; });
          await page.evaluate(() => switchPrivilegedToFullAccess());
          a.ok(await waitModal(page, true), 'Full owner access meets the modal');
          await page.evaluate(() => { window.pixlyOwnerSessions.restore = window.__origRestore; });
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS entry E7 owner full access from a delegate view: FAILURE - no kept sign-in means no full access and no modal',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const owner = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 }, [owner.username]: { accountType: 'personal' } }, clearLocal: [owner.username] }, async () => {
          await registerSessions(page, [account, owner]);
          await page.evaluate((o) => {
            window.__origRestore = window.pixlyOwnerSessions.restore;
            window.pixlyOwnerSessions.restore = async () => false;
            performLogin(o.username, o.fullName, o.email, null, o.phone, o.accountType, { username: o.username, fullName: o.fullName, accountType: o.accountType }, { privilegedReadOnly: true, viewer: 'reg_personal', grants: ['like'] });
          }, owner);
          await page.evaluate(() => switchPrivilegedToFullAccess());
          a.ok(await noModal(page, 800), 'No modal');
          a.ok(await page.evaluate(() => !!state.privilegedReadOnly), 'Still a read-only view');
          await page.evaluate(() => { closeSwitchPasswordModal(); clearPrivilegedReadOnlySession(); window.pixlyOwnerSessions.restore = window.__origRestore; });
        });
        await h.loginAs(page, account);
      }
    },

    // ---------------- E8 privileged read-only viewers ----------------
    {
      name: 'ToS entry E8 privileged read-only viewer: SUCCESS (skipped on purpose) - the viewer is never asked',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const t = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [t.username]: { accountType: 'personal' } }, clearLocal: [t.username] }, async () => {
          await page.evaluate((t) => performLogin(t.username, t.fullName, t.email, null, t.phone, t.accountType, { username: t.username, fullName: t.fullName, accountType: t.accountType }, { privilegedReadOnly: true, viewer: 'reg_personal', grants: ['like'] }), t);
          a.ok(await noModal(page, 900), 'A read-only privileged viewer is not blocked');
          await page.evaluate(() => { clearPrivilegedReadOnlySession(); });
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS entry E8 privileged read-only viewer: FAILURE (not skipped) - the same account signing in normally IS asked',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        const t = h.ACCOUNTS.empty;
        await withMock(page, { docs: { [t.username]: { accountType: 'personal' } }, clearLocal: [t.username] }, async () => {
          await page.evaluate((t) => performLogin(t.username, t.fullName, t.email, null, t.phone, t.accountType), t);
          a.ok(await waitModal(page, true), 'A normal sign-in to the same account is asked');
        });
        await h.loginAs(page, account);
      }
    },

    // ---------------- E9 re-check ----------------
    {
      name: 'ToS entry E9 re-check: coming back to the tab asks a never-consented signed-in account that was missed; a consented one is left alone',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        await withMock(page, { docs: { [account.username]: { accountType: 'personal' } }, clearLocal: [account.username] }, async () => {
          await page.evaluate(() => { window.__realGet = window.firebase.getDoc; window.firebase.getDoc = async () => { throw new Error('offline blip'); }; });
          await page.evaluate((t) => performLogin(t.username, t.fullName, t.email, null, t.phone, t.accountType), account);
          a.ok(await noModal(page, 700), 'A cloud read error at login does not block');
          await page.evaluate(() => { window.firebase.getDoc = window.__realGet; });
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
          a.ok(await waitModal(page, true), 'Focus returning to the tab re-checks and asks');
          await page.evaluate(() => window.pixlyTos.hide());
          await page.waitForTimeout(3100);
          await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
          a.ok(await waitModal(page, true), 'Becoming visible again re-checks and asks');
          await page.evaluate(() => window.pixlyTos.hide());
          await page.waitForTimeout(3100);
          await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
          a.ok(await waitModal(page, true), 'pageshow (back/forward cache restore) re-checks and asks');
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS entry E9 re-check: tab focus, pageshow and Firebase Auth state leave a consented account and a signed-out page alone',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a, account }) {
        await withMock(page, { docs: { [account.username]: { tosAcceptedAt: 1764000000000 } }, clearLocal: [] }, async () => {
          await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); return window.pixlyTos.recheck(true); });
          a.ok(await noModal(page, 900), 'A consented account is not re-asked');
        });
        a.equal(typeof (await page.evaluate(() => typeof window.pixlyTos.recheck)), 'string', 'recheck exists');
        await page.evaluate(() => { const was = state.isLoggedIn; state.isLoggedIn = false; window.__tosSignedOutRecheck = null; window.pixlyTos.recheck(true).then((r) => { window.__tosSignedOutRecheck = r; }); state.isLoggedIn = was; });
        await page.waitForTimeout(100);
        a.equal(await page.evaluate(() => window.__tosSignedOutRecheck), false, 'Nothing to ask when nobody is signed in');
      }
    },

    // ---------------- E10 UI behind the modal ----------------
    {
      name: 'ToS entry E10 blocking: nothing behind the modal can be reached by tab, keys, Escape, taps, or scroll; it all works again after agreeing',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run({ page, h, a, account }) {
        await withMock(page, { docs: { [account.username]: { accountType: 'personal' } }, clearLocal: [account.username] }, async () => {
          await page.evaluate(() => { window.__keys = 0; document.addEventListener('keydown', () => { window.__keys++; }); });
          await page.evaluate((t) => performLogin(t.username, t.fullName, t.email, null, t.phone, t.accountType), account);
          a.ok(await waitModal(page, true), 'modal is open');
          const st = await page.evaluate(() => {
            const modal = document.getElementById('tos-consent-modal');
            const behind = Array.from(document.body.children).filter((el) => el !== modal && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.id !== 'toast');
            const notInert = behind.filter((el) => !el.hasAttribute('inert')).map((el) => el.id || el.tagName);
            const mid = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
            const corner = document.elementFromPoint(3, 3);
            return { notInert, midInModal: modal.contains(mid), cornerInModal: modal.contains(corner), overflow: document.body.style.overflow };
          });
          a.equal(st.notInert.length, 0, 'Every element behind the modal is inert: ' + JSON.stringify(st.notInert));
          a.ok(st.midInModal && st.cornerInModal, 'Taps anywhere land on the modal');
          a.equal(st.overflow, 'hidden', 'The page behind does not scroll');
          // New UI that appears behind the modal while it is open is locked too.
          await page.evaluate(() => { const d = document.createElement('div'); d.id = 'late-overlay'; d.textContent = 'late'; document.body.appendChild(d); });
          await page.waitForTimeout(80);
          a.ok(await page.evaluate(() => document.getElementById('late-overlay').hasAttribute('inert')), 'A late-added element behind the modal is locked');
          await page.evaluate(() => document.getElementById('late-overlay').remove());
          const before = await page.evaluate(() => window.__keys);
          await page.keyboard.press('Escape');
          await page.keyboard.press('/');
          await page.keyboard.press('ArrowRight');
          a.equal(await page.evaluate(() => window.__keys), before, 'Key presses never reach the app behind the modal');
          a.ok(await modalOpen(page), 'Escape did not close it');
          for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
          a.ok(await page.evaluate(() => document.getElementById('tos-consent-modal').contains(document.activeElement) || document.activeElement === document.body), 'Tab never lands on the app behind the modal');
          await agree(page);
          a.ok(await waitModal(page, false), 'Agreed');
          a.equal(await page.evaluate(() => document.querySelectorAll('body > [inert]').length), 0, 'Nothing stays locked after agreeing');
          a.equal(await page.evaluate(() => document.body.style.overflow), '', 'Page scroll is restored');
          await page.keyboard.press('ArrowRight');
          a.ok((await page.evaluate(() => window.__keys)) > before, 'Keys reach the app again');
        });
        await h.loginAs(page, account);
      }
    }
  ]
};

// Signed-out tests start from a freshly loaded welcome screen, whatever earlier suites left on the page.
module.exports.tests.forEach((t) => {
  if (!(t.accounts || []).includes('signed-out')) return;
  const orig = t.run;
  t.run = async (ctx) => {
    const port = Number(new URL(ctx.page.url()).port);
    await ctx.h.resetToSignedOut(ctx.page, { port });
    return orig(ctx);
  };
});
