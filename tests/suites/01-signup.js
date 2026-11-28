'use strict';

const { VERIFY_CODE } = require('../helpers/harness');

module.exports = {
  name: 'Sign-up',
  tests: [
    {
      name: 'Sign-up: email and/or phone is required before continuing',
      accounts: ['signed-out'],
      covers: ['el:#tab-auth-signup', 'el:#btn-signup-to-step2', 'el:#login-email', 'el:#signup-phone', 'el:#login-fullname', 'el:#signup-username', 'el:#signup-password', 'nav:auth:signup'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openSignupForm(page);
        const step2 = await h.isVisible(page, '#btn-signup-to-step2');
        a.ok(step2, 'Continue to step 2 is shown');
        await page.fill('#login-fullname', 'New Person');
        await page.fill('#signup-username', 'brand_new_user_zz');
        await page.fill('#signup-password', 'TestPass123!');
        await page.fill('#login-email', '');
        await page.fill('#signup-phone', '');
        await page.evaluate(() => {
          if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(80);
        const disabled = await page.evaluate(() => {
          const b = document.getElementById('btn-signup-to-step2');
          return !!(b && (b.disabled || b.classList.contains('opacity-50') || b.classList.contains('cursor-not-allowed')));
        });
        a.ok(disabled, 'Continue stays disabled without email or phone');
      }
    },
    {
      name: 'Sign-up: taken email blocks Send code',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-send-email-code', 'el:#signup-email-error', 'el:#signup-email-verify-panel', 'el:#signup-email-send-wrap', 'handler:sendSignupEmailCode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openSignupForm(page);
        await page.fill('#login-email', 'bradley.g.hansen@hotmail.com');
        await page.evaluate(() => {
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
          if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
        });
        await page.waitForTimeout(120);
        const taken = await page.evaluate(() => typeof isSignupEmailTaken === 'function' && isSignupEmailTaken());
        a.ok(taken, 'findEmailOwner reports the built-in email as taken');
        const send = await page.evaluate(() => {
          const b = document.getElementById('btn-signup-send-email-code');
          return { exists: !!b, disabled: !!(b && b.disabled), hidden: !b || b.classList.contains('hidden') };
        });
        a.ok(send.exists, 'Send email code button exists');
        a.ok(send.disabled, 'Send code is disabled for a taken email');
        const err = await page.evaluate(() => (document.getElementById('signup-email-error') || {}).textContent || '');
        // error may live in the status or error node
        const status = await page.evaluate(() => (document.getElementById('signup-email-verify-status') || {}).textContent || '');
        a.ok(/taken|already/i.test(err + ' ' + status) || send.disabled, 'Taken state is shown or Send is blocked');
      }
    },
    {
      name: 'Sign-up: taken phone blocks Send code',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-send-phone-code', 'el:#signup-phone-error', 'el:#signup-phone-verify-panel', 'el:#signup-phone-send-wrap', 'handler:sendSignupPhoneCode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openSignupForm(page);
        await page.fill('#signup-phone', '6092896702');
        await page.evaluate(() => {
          document.getElementById('signup-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
        });
        await page.waitForTimeout(120);
        const taken = await page.evaluate(() => typeof isSignupPhoneTaken === 'function' && isSignupPhoneTaken());
        a.ok(taken, 'findPhoneOwner reports the built-in phone as taken');
        const send = await page.evaluate(() => {
          const b = document.getElementById('btn-signup-send-phone-code');
          return { exists: !!b, disabled: !!(b && b.disabled) };
        });
        a.ok(send.exists && send.disabled, 'Send phone code is disabled for a taken number');
      }
    },
    {
      name: 'Sign-up: a free email shows the code verify step after Send code',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-verify-email-code', 'el:#signup-email-code', 'el:#btn-signup-resend-email-code', 'el:#signup-email-code-wrap', 'el:#signup-email-verify-status', 'handler:verifySignupEmailCode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openSignupForm(page);
        const email = 'free.signup.' + Date.now() + '@example.test';
        await page.fill('#login-email', email);
        await page.evaluate(() => {
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
        });
        await page.waitForTimeout(80);
        const enabled = await page.evaluate(() => {
          const b = document.getElementById('btn-signup-send-email-code');
          return !!(b && !b.disabled && !b.classList.contains('hidden'));
        });
        a.ok(enabled, 'Send code is enabled for a free email');
        await page.click('#btn-signup-send-email-code');
        await page.waitForTimeout(300);
        const codeVisible = await h.isVisible(page, '#signup-email-code');
        a.ok(codeVisible, 'Code input appears after send');
        await page.fill('#signup-email-code', VERIFY_CODE);
        await page.click('#btn-signup-verify-email-code');
        await page.waitForTimeout(300);
        const verified = await page.evaluate(() => !!(state.signupVerify && state.signupVerify.emailVerified));
        const status = await page.evaluate(() => (document.getElementById('signup-email-verify-status') || {}).textContent || '');
        a.ok(verified || /verified/i.test(status), 'Email is verified after the correct code: ' + status);
      }
    },
    {
      name: 'Sign-up: a free phone shows the code verify step after Send code',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-verify-phone-code', 'el:#signup-phone-code', 'el:#btn-signup-resend-phone-code', 'el:#signup-phone-code-wrap', 'el:#signup-phone-verify-status', 'handler:verifySignupPhoneCode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openSignupForm(page);
        // Valid US NANP that is not Bradley's: 2025550109
        await page.fill('#signup-phone', '2025550109');
        await page.evaluate(() => {
          document.getElementById('signup-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
        });
        await page.waitForTimeout(80);
        const enabled = await page.evaluate(() => {
          const b = document.getElementById('btn-signup-send-phone-code');
          return !!(b && !b.disabled && !b.classList.contains('hidden'));
        });
        a.ok(enabled, 'Send phone code is enabled for a free number');
        await page.click('#btn-signup-send-phone-code');
        await page.waitForTimeout(300);
        const codeVisible = await h.isVisible(page, '#signup-phone-code');
        a.ok(codeVisible, 'Phone code input appears after send');
        await page.fill('#signup-phone-code', VERIFY_CODE);
        await page.click('#btn-signup-verify-phone-code');
        await page.waitForTimeout(300);
        const verified = await page.evaluate(() => !!(state.signupVerify && state.signupVerify.phoneVerified));
        const status = await page.evaluate(() => (document.getElementById('signup-phone-verify-status') || {}).textContent || '');
        a.ok(verified || /verified/i.test(status), 'Phone is verified after the correct code: ' + status);
      }
    },
    {
      name: 'Sign-up: a verified email can create an account and open the app',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-complete', 'el:#btn-signup-direct-submit', 'el:#btn-signup-back-step1', 'el:#signup-step-2', 'el:#signup-bio'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openSignupForm(page);
        const uname = 'reg_new_' + String(Date.now()).slice(-8);
        const email = uname + '@example.test';
        await page.fill('#login-fullname', 'Reg New User');
        await page.fill('#signup-username', uname);
        await page.fill('#signup-password', 'TestPass123!');
        await page.fill('#login-email', email);
        await page.evaluate(() => {
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('signup-username')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
          if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
        });
        await page.waitForTimeout(100);
        await page.click('#btn-signup-send-email-code');
        await page.waitForTimeout(300);
        await page.fill('#signup-email-code', VERIFY_CODE);
        await page.click('#btn-signup-verify-email-code');
        await page.waitForFunction(() => !!(window.state && state.signupVerify && state.signupVerify.emailVerified), null, { timeout: 5000 });
        await page.evaluate(() => {
          if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
        });
        await page.waitForTimeout(80);
        await h.acceptSignupTos(page);
        await page.evaluate(() => {
          const btn = document.getElementById('btn-signup-direct-submit');
          if (btn && !btn.disabled) btn.click();
          else if (typeof handleCompleteSignUp === 'function') handleCompleteSignUp(true);
        });
        await page.waitForFunction((uname) => !!(window.state && state.isLoggedIn && state.currentUser && String(state.currentUser.username).toLowerCase() === uname), uname, { timeout: 8000 }).catch(() => {});
        const info = await page.evaluate(() => {
          const main = document.getElementById('main-view');
          const stored = localStorage.getItem('pixly_account_' + ((state.currentUser && state.currentUser.username) || ''));
          return {
            loggedIn: !!(state && state.isLoggedIn),
            user: state && state.currentUser && state.currentUser.username,
            email: state && state.currentUser && state.currentUser.email,
            main: !!(main && !main.classList.contains('hidden') && getComputedStyle(main).display !== 'none'),
            stored: !!stored
          };
        });
        a.ok(info.loggedIn && info.main, 'New account is signed in to the app: ' + JSON.stringify(info));
        a.equal(String(info.user || '').toLowerCase(), uname, 'Signed in as the new username');
        a.ok(info.stored, 'The new account was saved locally');
      }
    }
  ]
};
