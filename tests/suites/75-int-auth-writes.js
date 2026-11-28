'use strict';

/**
 * Interaction failure paths for Firebase Auth backed controls: Create account (Sign up) and
 * Account Center Update password. When Firebase Auth fails (offline or refused), sign-up must not
 * create or sign in the account, and Update password must not store a new password or say it worked.
 * Auth is replaced by in-page stubs on window.pixlyGuard; nothing reaches Firebase.
 */

const nf = require('../helpers/net-fail');
const { VERIFY_CODE } = require('../helpers/harness');

async function stubGuard(page, impl) {
  await page.evaluate((impl) => {
    const g = window.pixlyGuard;
    window.__intGuardOrig = window.__intGuardOrig || { authReady: g.authReady, createAuthAccount: g.createAuthAccount, changeAuthPassword: g.changeAuthPassword };
    if (impl.createFails) {
      g.authReady = () => true;
      g.createAuthAccount = async () => { throw Object.assign(new Error('auth failed'), { code: impl.createFails }); };
    }
    if (impl.changeResult) {
      g.changeAuthPassword = async () => impl.changeResult;
    }
  }, impl);
}
const restoreGuard = (page) => page.evaluate(() => {
  const o = window.__intGuardOrig; if (!o) return;
  Object.assign(window.pixlyGuard, o);
  window.__intGuardOrig = null;
});

module.exports = {
  name: 'Interaction failure paths: Firebase Auth controls',
  tests: [
    {
      name: 'Create account: when Firebase Auth refuses or is offline, no account is created or signed in and the reason is shown',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-direct-submit', 'el:#btn-signup-complete'],
      async run({ page, h, a }) {
        const toasts = await nf.captureToasts(page);
        try {
          for (const code of ['auth/network-request-failed', 'auth/internal-error']) {
            await stubGuard(page, { createFails: code });
            await h.openSignupForm(page);
            const uname = 'int_auth_' + String(Date.now()).slice(-7);
            await nf.setValue(page, 'login-fullname', 'Int Auth');
            await nf.setValue(page, 'signup-username', uname);
            await nf.setValue(page, 'signup-password', 'TestPass123!');
            await nf.setValue(page, 'login-email', uname + '@example.test');
            await page.evaluate(() => { if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi(); if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState(); });
            await nf.tap(page, 'btn-signup-send-email-code', 300);
            await nf.setValue(page, 'signup-email-code', VERIFY_CODE);
            await nf.tap(page, 'btn-signup-verify-email-code', 300);
            await h.acceptSignupTos(page);
            await page.evaluate(() => { window.__intToasts = []; if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState(); });
            await page.evaluate(() => {
              const btn = document.getElementById('btn-signup-direct-submit');
              if (btn && !btn.disabled) btn.click();
              else if (typeof handleCompleteSignUp === 'function') handleCompleteSignUp(true);
            });
            await page.waitForTimeout(800);
            const r = await page.evaluate((u) => ({
              verified: !!(state.signupVerify && state.signupVerify.emailVerified),
              loggedIn: !!state.isLoggedIn,
              stored: !!localStorage.getItem('pixly_account_' + u)
            }), uname);
            const t = await toasts.read();
            a.ok(r.verified, code + ': (setup) the email was verified first');
            a.ok(!r.loggedIn, code + ': not signed in');
            a.ok(!r.stored, code + ': no account record is saved');
            a.ok(t.some((m) => /no connection|could not create your account/i.test(m)), code + ': the reason is shown: ' + JSON.stringify(t));
            await restoreGuard(page);
          }
        } finally {
          await restoreGuard(page);
          await toasts.restore();
        }
      }
    },
    {
      name: 'Update password: when Firebase Auth re-auth or update fails, the error is shown and no new password is stored',
      accounts: ['personal'],
      covers: ['el:#form-ac-change-password', 'el:#ac-pw-status', 'listener:#form-ac-change-password:submit'],
      async run({ page, a }) {
        const u = await page.evaluate(() => normalizeUsername(state.currentUser.username));
        const before = await page.evaluate((u) => ({ pw: localStorage.getItem('pixly_user_password_' + u), at: localStorage.getItem('pixly_pw_updated_at_' + u) }), u);
        try {
          const results = [
            { handled: true, ok: false, message: 'No connection. Please try again.' },
            { handled: true, ok: false, message: 'Current password is incorrect.' },
            { handled: true, ok: false, message: 'Password update failed. Please try again.' }
          ];
          await page.evaluate(() => { if (typeof openAccountCenterModal === 'function') openAccountCenterModal(); });
          for (const res of results) {
            await stubGuard(page, { changeResult: res });
            await nf.setValue(page, 'ac-pw-current', 'TestPass123!');
            await nf.setValue(page, 'ac-pw-new', 'BrandNew-Pass-9');
            await nf.setValue(page, 'ac-pw-confirm', 'BrandNew-Pass-9');
            await page.evaluate(() => document.getElementById('form-ac-change-password').requestSubmit());
            await page.waitForTimeout(400);
            const r = await page.evaluate((u) => ({
              status: (document.getElementById('ac-pw-status').textContent || '').trim(),
              err: document.getElementById('ac-pw-status').classList.contains('text-rose-700'),
              pw: localStorage.getItem('pixly_user_password_' + u)
            }), u);
            a.ok(r.err && r.status === res.message, res.message + ': shown as an error, got "' + r.status + '"');
            a.equal(r.pw, before.pw, res.message + ': the stored password is unchanged');
            await restoreGuard(page);
          }
        } finally {
          await restoreGuard(page);
          await page.evaluate(({ u, before }) => {
            if (before.pw == null) localStorage.removeItem('pixly_user_password_' + u); else localStorage.setItem('pixly_user_password_' + u, before.pw);
            if (before.at == null) localStorage.removeItem('pixly_pw_updated_at_' + u); else localStorage.setItem('pixly_pw_updated_at_' + u, before.at);
            if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal();
          }, { u, before });
        }
      }
    }
  ]
};
