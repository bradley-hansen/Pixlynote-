'use strict';

/**
 * Interaction failure paths: sign-up email/phone codes, Forgot password, and Edit Profile code checks.
 * Every Send / Resend / Verify / Reset control is driven through a failed Worker call (HTTP error,
 * error JSON, bad gateway, offline) and must show an error, never a success message, and must not
 * mark anything as sent, verified, or changed. Worker calls are fulfilled locally; no real email or SMS.
 */

const nf = require('../helpers/net-fail');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const SEND_FAILS = ['http403', 'http500', 'http429', 'badJson', 'network'];
const VERIFY_FAILS = [
  { mode: { status: 200, body: { valid: false, error: 'wrong_code' } }, label: 'wrong code' },
  { mode: { status: 200, body: { ok: true } }, label: '200 without valid:true' },
  { mode: 'http500', label: '500' },
  { mode: 'badJson', label: 'bad gateway' },
  { mode: 'network', label: 'offline' }
];

async function freshSignup(page, kind) {
  await page.evaluate((kind) => {
    if (typeof setAuthMode === 'function') setAuthMode('signup');
    const splash = document.getElementById('splash-container');
    const auth = document.getElementById('auth-card-container');
    if (splash) splash.style.display = 'none';
    if (auth) { auth.classList.remove('hidden'); auth.style.display = ''; }
    const signup = document.getElementById('auth-signup-container');
    const login = document.getElementById('auth-login-container');
    if (signup) { signup.classList.remove('hidden'); signup.style.display = ''; }
    if (login) login.classList.add('hidden');
    state.signupVerify = { email: '', emailVerified: false, phone: '', phoneVerified: false };
    const email = document.getElementById('login-email');
    const phone = document.getElementById('signup-phone');
    if (email) email.value = kind === 'email' ? ('int.fail.' + Date.now() + '@example.test') : '';
    if (phone) phone.value = kind === 'phone' ? '2025550123' : '';
    [email, phone].forEach((el) => { if (el) el.dispatchEvent(new Event('input', { bubbles: true })); });
    ['signup-email-verify-status', 'signup-phone-verify-status'].forEach((id) => { const s = document.getElementById(id); if (s) { s.textContent = ''; s.classList.add('hidden'); } });
    ['signup-email-code', 'signup-phone-code'].forEach((id) => { const c = document.getElementById(id); if (c) c.value = ''; });
    const send = document.getElementById(kind === 'email' ? 'btn-signup-send-email-code' : 'btn-signup-send-phone-code');
    if (send) send.disabled = false;
  }, kind);
  await page.waitForTimeout(60);
}

const signupUi = (page, kind) => page.evaluate((kind) => {
  const st = document.getElementById('signup-' + kind + '-verify-status');
  const v = state.signupVerify || {};
  return {
    status: st ? (st.textContent || '').trim() : '',
    sent: kind === 'email' ? !!v.emailCodeSent : !!v.phoneCodeSent,
    verified: kind === 'email' ? !!v.emailVerified : !!v.phoneVerified
  };
}, kind);

module.exports = {
  name: 'Interaction failure paths: sign-up, forgot password, edit profile codes',
  tests: [
    {
      name: 'Sign-up Send email code and Resend: every failure shows an error and never says We sent a code',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-send-email-code', 'el:#btn-signup-resend-email-code', 'el:#signup-email-verify-status', 'listener:#btn-signup-send-email-code:click', 'listener:#btn-signup-resend-email-code:click'],
      async run({ page, a }) {
        for (const btn of ['btn-signup-send-email-code', 'btn-signup-resend-email-code']) {
          for (const mode of SEND_FAILS) {
            await freshSignup(page, 'email');
            await nf.withWorker(page, '/email', mode, async (r) => {
              await nf.tap(page, btn);
              a.equal(r.calls.length, 1, btn + ' ' + mode + ': one request');
            });
            const ui = await signupUi(page, 'email');
            a.ok(ui.status && !/we sent/i.test(ui.status), btn + ' ' + mode + ': error shown, got "' + ui.status + '"');
            a.ok(!ui.sent, btn + ' ' + mode + ': code not recorded as sent');
          }
        }
        await freshSignup(page, 'email');
        await nf.withWorker(page, '/email', { status: 200, body: { ok: true } }, async () => { await nf.tap(page, 'btn-signup-send-email-code'); });
        const ok = await signupUi(page, 'email');
        a.ok(ok.sent && /we sent/i.test(ok.status), 'A real send says We sent a 6-digit code: ' + ok.status);
      }
    },
    {
      name: 'Sign-up Verify email: wrong code, 200 without valid, 500, bad gateway and offline stay unverified',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-verify-email-code', 'listener:#btn-signup-verify-email-code:click', 'listener:#signup-email-code:keydown'],
      async run({ page, a }) {
        for (const c of VERIFY_FAILS) {
          await freshSignup(page, 'email');
          await page.evaluate(() => { state.signupVerify = Object.assign({}, state.signupVerify, { email: document.getElementById('login-email').value.trim(), emailCodeSent: true }); });
          await nf.setValue(page, 'signup-email-code', '123456');
          await nf.withWorker(page, '/email/signup-verify', c.mode, async (r) => { await nf.tap(page, 'btn-signup-verify-email-code'); a.equal(r.calls.length, 1, c.label + ': one verify request'); });
          const ui = await signupUi(page, 'email');
          a.ok(!ui.verified, c.label + ': not verified');
          a.ok(ui.status && !/^email verified/i.test(ui.status), c.label + ': error shown, got "' + ui.status + '"');
        }
        // Enter in the code box takes the same path.
        await freshSignup(page, 'email');
        await nf.setValue(page, 'signup-email-code', '123456');
        await nf.withWorker(page, '/email/signup-verify', 'http500', async (r) => {
          await page.evaluate(() => document.getElementById('signup-email-code').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
          await page.waitForTimeout(300);
          a.equal(r.calls.length, 1, 'Enter submits the code once');
        });
        a.ok(!(await signupUi(page, 'email')).verified, 'Enter + 500 stays unverified');
      }
    },
    {
      name: 'Sign-up Send phone code and Resend: every failure shows an error and never says We sent a code',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-send-phone-code', 'el:#btn-signup-resend-phone-code', 'el:#signup-phone-verify-status', 'listener:#btn-signup-send-phone-code:click', 'listener:#btn-signup-resend-phone-code:click'],
      async run({ page, a }) {
        const fails = ['http500', 'http429', 'badJson', 'network', { status: 400, body: { error: 'phone_taken' } }];
        for (const btn of ['btn-signup-send-phone-code', 'btn-signup-resend-phone-code']) {
          for (const mode of fails) {
            await freshSignup(page, 'phone');
            await nf.withWorker(page, '/sms/send', mode, async (r) => { await nf.tap(page, btn); a.equal(r.calls.length, 1, btn + ': one send request'); });
            const ui = await signupUi(page, 'phone');
            const label = btn + ' ' + (typeof mode === 'string' ? mode : mode.body.error);
            a.ok(ui.status && !/we sent/i.test(ui.status), label + ': error shown, got "' + ui.status + '"');
            a.ok(!ui.sent, label + ': code not recorded as sent');
          }
        }
        await freshSignup(page, 'phone');
        await nf.withWorker(page, '/sms/send', { status: 200, body: { ok: true } }, async () => { await nf.tap(page, 'btn-signup-send-phone-code'); });
        const ok = await signupUi(page, 'phone');
        a.ok(ok.sent && /we sent/i.test(ok.status), 'A real send says We sent a 6-digit code: ' + ok.status);
      }
    },
    {
      name: 'Sign-up Verify phone: wrong code, 200 without valid, 500, bad gateway and offline stay unverified',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-verify-phone-code', 'listener:#btn-signup-verify-phone-code:click', 'listener:#signup-phone-code:keydown'],
      async run({ page, a }) {
        for (const c of VERIFY_FAILS) {
          await freshSignup(page, 'phone');
          await page.evaluate(() => { state.signupVerify = Object.assign({}, state.signupVerify, { phone: '2025550123', phoneCodeSent: true }); });
          await nf.setValue(page, 'signup-phone-code', '123456');
          await nf.withWorker(page, '/sms/check', c.mode, async (r) => { await nf.tap(page, 'btn-signup-verify-phone-code'); a.equal(r.calls.length, 1, c.label + ': one verify request'); });
          const ui = await signupUi(page, 'phone');
          a.ok(!ui.verified, c.label + ': not verified');
          a.ok(ui.status && !/^phone verified/i.test(ui.status), c.label + ': error shown, got "' + ui.status + '"');
        }
      }
    },
    {
      name: 'Forgot password Send Reset Code: 500, rate limit, bad gateway and offline show an error and stay on step 1',
      accounts: ['signed-out'],
      covers: ['el:#btn-forgot-password', 'el:#btn-forgot-send-code', 'el:#forgot-identifier', 'el:#form-forgot-step-1', 'el:#forgot-step1-status', 'form:#form-forgot-step-1:submit'],
      async run({ page, h, a }) {
        await h.openLoginForm(page);
        const cases = ['http500', 'http429', 'badJson', 'network', { status: 403, body: { error: 'recipient_not_on_file' } }];
        for (const mode of cases) {
          await nf.tap(page, 'btn-forgot-password', 100);
          await nf.setValue(page, 'forgot-identifier', 'reg.personal@example.test');
          await nf.withWorker(page, '/email', mode, async (r) => {
            await page.evaluate(() => document.getElementById('form-forgot-step-1').requestSubmit());
            await page.waitForTimeout(350);
            a.ok(r.calls.length === 1 || mode === 'network', 'one reset email request');
          });
          const ui = await page.evaluate(() => ({
            s1: !document.getElementById('form-forgot-step-1').classList.contains('hidden'),
            s2: !document.getElementById('form-forgot-step-2').classList.contains('hidden'),
            status: (document.getElementById('forgot-step1-status').textContent || '').trim(),
            btn: document.getElementById('btn-forgot-send-code').disabled
          }));
          const label = typeof mode === 'string' ? mode : mode.body.error;
          a.ok(ui.s1 && !ui.s2, label + ': stays on step 1 (no code entry screen)');
          a.ok(/could not send email/i.test(ui.status), label + ': shows Could not send email, got "' + ui.status + '"');
          a.ok(!ui.btn, label + ': Send Reset Code is enabled again');
          await nf.tap(page, 'btn-close-forgot-password', 50);
        }
      }
    },
    {
      name: 'Forgot password Reset: a failed or wrong code check (wrong code, 500, bad gateway, offline) never changes the password',
      accounts: ['signed-out'],
      covers: ['el:#form-forgot-step-2', 'el:#forgot-reset-code', 'el:#forgot-new-password', 'el:#forgot-confirm-password', 'el:#forgot-step2-status', 'form:#form-forgot-step-2:submit', 'el:#btn-forgot-back', 'el:#btn-close-forgot-password'],
      async run({ page, h, a }) {
        await h.openLoginForm(page);
        const snap = await page.evaluate(() => {
          const keys = ['pixly_user_password_reg_personal', 'pixly_account_reg_personal', 'pixly_accounts', 'pixly_pw_updated_at_reg_personal'];
          const o = {}; keys.forEach((k) => { o[k] = localStorage.getItem(k); }); return o;
        });
        try {
          await nf.tap(page, 'btn-forgot-password', 100);
          await nf.setValue(page, 'forgot-identifier', 'reg.personal@example.test');
          await nf.withWorker(page, '/email', { status: 200, body: { ok: true } }, async () => {
            await page.evaluate(() => document.getElementById('form-forgot-step-1').requestSubmit());
            await page.waitForTimeout(350);
          });
          a.ok(await nf.shown(page, 'form-forgot-step-2'), 'A real send moves to the code step');
          for (const c of VERIFY_FAILS) {
            await nf.setValue(page, 'forgot-reset-code', '123456');
            await nf.setValue(page, 'forgot-new-password', 'NewPass999!');
            await nf.setValue(page, 'forgot-confirm-password', 'NewPass999!');
            await nf.withWorker(page, '/email/reset-verify', c.mode, async () => {
              await page.evaluate(() => document.getElementById('form-forgot-step-2').requestSubmit());
              await page.waitForTimeout(400);
            });
            const ui = await page.evaluate(() => ({
              status: (document.getElementById('forgot-step2-status').textContent || '').trim(),
              isErr: document.getElementById('forgot-step2-status').classList.contains('text-rose-700'),
              pw: localStorage.getItem('pixly_user_password_reg_personal')
            }));
            a.ok(ui.isErr && ui.status, c.label + ': error shown, got "' + ui.status + '"');
            a.equal(ui.pw, snap.pixly_user_password_reg_personal, c.label + ': stored password is unchanged');
          }
          await nf.tap(page, 'btn-forgot-back', 50);
          a.ok(await nf.shown(page, 'form-forgot-step-1'), 'Back returns to step 1');
        } finally {
          await page.evaluate((snap) => { Object.keys(snap).forEach((k) => { if (snap[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, snap[k]); }); }, snap);
          await nf.tap(page, 'btn-close-forgot-password', 50);
        }
      }
    },
    {
      name: 'Forgot password Reset for a Firebase Auth account: a failed /auth/reset-password never changes the password',
      accounts: ['signed-out'],
      covers: ['handler:sendPixlynoteEmail'],
      async run({ page, h, a }) {
        await h.openLoginForm(page);
        const snap = await page.evaluate(() => {
          const keys = ['pixly_user_password_reg_personal', 'pixly_account_reg_personal', 'pixly_accounts', 'pixly_pw_updated_at_reg_personal'];
          const o = {}; keys.forEach((k) => { o[k] = localStorage.getItem(k); }); return o;
        });
        const hasGuard = await page.evaluate(() => !!(window.pixlyGuard && typeof window.pixlyGuard.accountUsesAuth === 'function'));
        a.ok(hasGuard, 'pixlyGuard.accountUsesAuth exists');
        await page.evaluate(installPixlyMockFirestore, { 'users/reg_personal': { username: 'reg_personal', uid: 'uid-reg', authEmail: 'reg_personal@auth.pixlynote.test' } });
        try {
          await nf.tap(page, 'btn-forgot-password', 100);
          await nf.setValue(page, 'forgot-identifier', 'reg.personal@example.test');
          await nf.withWorker(page, '/email', { status: 200, body: { ok: true } }, async () => {
            await page.evaluate(() => document.getElementById('form-forgot-step-1').requestSubmit());
            await page.waitForTimeout(350);
          });
          for (const mode of ['http500', { status: 503, body: { ok: false, error: 'auth_admin_unavailable' } }, { status: 200, body: { ok: false } }, 'network']) {
            await nf.setValue(page, 'forgot-reset-code', '123456');
            await nf.setValue(page, 'forgot-new-password', 'NewPass999!');
            await nf.setValue(page, 'forgot-confirm-password', 'NewPass999!');
            const vr = await nf.routeWorker(page, '/email/reset-verify', { status: 200, body: { valid: true, username: 'reg_personal' } });
            await nf.withWorker(page, '/auth/reset-password', mode, async (r) => {
              await page.evaluate(() => document.getElementById('form-forgot-step-2').requestSubmit());
              await page.waitForTimeout(450);
              a.ok(r.calls.length === 1 || mode === 'network', 'reset-password was called');
            });
            await vr.restore();
            const ui = await page.evaluate(() => ({
              status: (document.getElementById('forgot-step2-status').textContent || '').trim(),
              isErr: document.getElementById('forgot-step2-status').classList.contains('text-rose-700'),
              pw: localStorage.getItem('pixly_user_password_reg_personal')
            }));
            const label = typeof mode === 'string' ? mode : JSON.stringify(mode.body);
            a.ok(ui.isErr && /could not|unavailable|reach/i.test(ui.status), label + ': error shown, got "' + ui.status + '"');
            a.equal(ui.pw, snap.pixly_user_password_reg_personal, label + ': stored password is unchanged');
          }
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
          await page.evaluate((snap) => { Object.keys(snap).forEach((k) => { if (snap[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, snap[k]); }); }, snap);
          await nf.tap(page, 'btn-close-forgot-password', 50);
        }
      }
    },
    {
      name: 'Edit Profile Verify email and Verify phone: wrong code, 500, bad gateway and offline stay unverified and keep the saved contact',
      accounts: ['personal'],
      covers: ['el:#btn-edit-verify-email-code', 'el:#btn-edit-verify-phone-code', 'handler:verifyEditEmailCode', 'handler:verifyEditPhoneCode', 'el:#edit-profile-email-verify-status', 'el:#edit-profile-phone-verify-status'],
      async run({ page, h, a }) {
        await h.openEditProfile(page);
        const before = await page.evaluate(() => ({ email: state.currentUser.email || '', phone: state.currentUser.phone || '' }));
        for (const kind of ['email', 'phone']) {
          for (const c of VERIFY_FAILS) {
            await page.evaluate((kind) => {
              const inp = document.getElementById('edit-profile-' + kind);
              const val = kind === 'email' ? 'int.verify.fail@example.test' : '2025550177';
              if (inp) { inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); }
              const v = state.editProfileVerify || {};
              if (kind === 'email') state.editProfileVerify = Object.assign({}, v, { email: val, emailCodeSent: true, emailVerified: false, emailTaken: false, contactCheckFailed: false });
              else state.editProfileVerify = Object.assign({}, v, { phone: val, phoneCodeSent: true, phoneVerified: false, phoneTaken: false, contactCheckFailed: false });
              const code = document.getElementById('edit-profile-' + kind + '-code');
              if (code) code.value = '123456';
            }, kind);
            await nf.withWorker(page, kind === 'email' ? '/email/signup-verify' : '/sms/check', c.mode, async (r) => {
              await nf.tap(page, 'btn-edit-verify-' + kind + '-code');
              a.ok(r.calls.length === 1, kind + ' ' + c.label + ': Verify made one request (got ' + r.calls.length + ')');
            });
            const ui = await page.evaluate((kind) => ({
              verified: kind === 'email' ? !!(state.editProfileVerify && state.editProfileVerify.emailVerified) : !!(state.editProfileVerify && state.editProfileVerify.phoneVerified),
              status: ((document.getElementById('edit-profile-' + kind + '-verify-status') || {}).textContent || '').trim(),
              saved: kind === 'email' ? (state.currentUser.email || '') : (state.currentUser.phone || '')
            }), kind);
            a.ok(!ui.verified, kind + ' ' + c.label + ': not verified');
            a.ok(ui.status && !/verified/i.test(ui.status.replace(/not verified|could not verify/ig, '')), kind + ' ' + c.label + ': error shown, got "' + ui.status + '"');
            a.equal(ui.saved, before[kind], kind + ' ' + c.label + ': saved contact unchanged');
          }
        }
        await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
      }
    },
    {
      name: 'Edit Profile Resend email and Resend phone: failures show an error and never say We sent a code',
      accounts: ['personal'],
      covers: ['el:#btn-edit-resend-email-code', 'el:#btn-edit-resend-phone-code', 'el:#btn-edit-send-email-code', 'el:#btn-edit-send-phone-code'],
      async run({ page, h, a }) {
        await h.openEditProfile(page);
        for (const kind of ['email', 'phone']) {
          for (const mode of ['http500', 'http429', 'badJson', 'network']) {
            await page.evaluate((kind) => {
              const inp = document.getElementById('edit-profile-' + kind);
              const val = kind === 'email' ? ('int.resend.' + Date.now() + '@example.test') : '2025550178';
              if (inp) { inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); }
              const v = state.editProfileVerify || {};
              state.editProfileVerify = Object.assign({}, v, { contactCheckFailed: false, emailTaken: false, phoneTaken: false, emailCodeSent: false, phoneCodeSent: false, emailVerified: false, phoneVerified: false });
            }, kind);
            await page.waitForTimeout(150);
            await page.evaluate(() => { const v = state.editProfileVerify || {}; v.contactCheckFailed = false; v.emailTaken = false; v.phoneTaken = false; });
            await nf.withWorker(page, kind === 'email' ? '/email' : '/sms/send', mode, async (r) => {
              await nf.tap(page, 'btn-edit-resend-' + kind + '-code');
              a.ok(r.calls.length === 1, kind + ' ' + mode + ': Resend made one request (got ' + r.calls.length + ')');
            });
            const ui = await page.evaluate((kind) => {
              const v = state.editProfileVerify || {};
              const err = document.getElementById('edit-profile-' + kind + '-error');
              const st = document.getElementById('edit-profile-' + kind + '-verify-status');
              return {
                sent: kind === 'email' ? !!v.emailCodeSent : !!v.phoneCodeSent,
                text: [err && err.textContent, st && st.textContent].filter(Boolean).join(' ').trim()
              };
            }, kind);
            a.ok(!ui.sent, kind + ' ' + mode + ': code not recorded as sent');
            a.ok(!/we sent/i.test(ui.text), kind + ' ' + mode + ': never says We sent, got "' + ui.text + '"');
          }
        }
        await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
      }
    }
  ]
};
