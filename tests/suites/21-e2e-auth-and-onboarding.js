'use strict';

/**
 * End-to-end UI tests for Splash, Business & Personal Sign-up (Step 1 + Step 2),
 * Password visibility toggles, Forgot Password reset flow, Login, and Logout.
 */

const { VERIFY_CODE } = require('../helpers/harness');

module.exports = {
  name: 'E2E Auth and Onboarding',
  tests: [
    {
      name: 'E2E Auth: Splash -> Business sign-up (DBA + Industry Other + Step 2 bio/link) -> Main view',
      accounts: ['signed-out'],
      covers: [
        'el:#btn-splash-get-started',
        'el:#btn-account-type-business',
        'el:#btn-account-type-personal',
        'el:#signup-dba-name',
        'el:#signup-business-industry',
        'el:#signup-business-industry-other',
        'el:#btn-toggle-signup-password',
        'el:#signup-bio',
        'el:#signup-link',
        'el:#btn-signup-back-step1',
        'el:#btn-signup-complete',
        'handler:syncBusinessIndustryOther'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.resetToSignedOut(page, { port: Number(new URL(page.url()).port) });

        // Click Get Started on splash
        await page.click('#btn-splash-get-started');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#auth-signup-container'), 'Splash Get Started opens Sign-up');

        // Toggle password visibility
        await page.fill('#signup-password', 'BizPass123!');
        const typeBefore = await page.getAttribute('#signup-password', 'type');
        a.equal(typeBefore, 'password', 'Signup password starts masked');
        await page.click('#btn-toggle-signup-password');
        const typeAfter = await page.getAttribute('#signup-password', 'type');
        a.equal(typeAfter, 'text', 'Clicking Show reveals signup password');
        await page.click('#btn-toggle-signup-password');
        a.equal(await page.getAttribute('#signup-password', 'type'), 'password', 'Clicking Hide masks signup password again');

        // Switch to Business account category
        await page.click('#btn-account-type-business');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#signup-business-fields'), 'Business fields appear when Business category is selected');
        a.ok(await h.isVisible(page, '#signup-dba-name'), 'DBA input is visible for Business sign-up');

        // Industry "Other" reveals optional other input
        await page.selectOption('#signup-business-industry', 'other');
        await page.waitForTimeout(80);
        a.ok(await h.isVisible(page, '#signup-business-industry-other'), 'Selecting Other industry shows custom industry input');
        await page.fill('#signup-business-industry-other', 'Specialty Roastery');

        const bizUser = 'e2e_roast_' + Date.now();
        const bizEmail = bizUser + '@example.test';
        await page.fill('#login-fullname', 'E2E Roasters LLC');
        await page.fill('#signup-dba-name', 'E2E Roastery');
        await page.fill('#signup-username', bizUser);
        await page.fill('#login-email', bizEmail);
        await page.evaluate(() => {
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('signup-username')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
          if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
        });
        await page.waitForTimeout(100);

        await page.click('#btn-signup-send-email-code');
        await page.waitForTimeout(250);
        await page.fill('#signup-email-code', VERIFY_CODE);
        await page.click('#btn-signup-verify-email-code');
        await page.waitForTimeout(250);

        await h.acceptSignupTos(page);
        await page.click('#btn-signup-to-step2');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#signup-step-2'), 'Step 2 profile setup opens');

        // Back button returns to step 1 and forward returns to step 2
        await page.click('#btn-signup-back-step1');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#btn-signup-to-step2'), 'Back button returns to Step 1');
        await page.click('#btn-signup-to-step2');
        await page.waitForTimeout(100);

        await page.fill('#signup-bio', 'Fresh beans daily');
        await page.fill('#signup-link', 'example.test/roastery');
        await page.click('#btn-signup-complete');
        await page.waitForTimeout(350);

        const created = await page.evaluate(() => ({
          loggedIn: !!(window.state && state.isLoggedIn),
          username: state.currentUser && state.currentUser.username,
          accountType: state.currentUser && state.currentUser.accountType,
          fullName: state.currentUser && state.currentUser.fullName,
          dbaName: state.currentUser && state.currentUser.dbaName,
          industry: state.currentUser && state.currentUser.businessIndustry,
          industryOther: state.currentUser && state.currentUser.businessIndustryOther
        }));
        a.ok(created.loggedIn, 'Business sign-up logs user into main app');
        a.equal(created.accountType, 'business', 'Account type saved as business');
        a.equal(created.fullName, 'E2E Roasters LLC', 'Legal/Display Name saved');
        a.equal(created.dbaName, 'E2E Roastery', 'DBA saved');
        a.equal(created.industry, 'other', 'Business industry saved');
        a.equal(created.industryOther, 'Specialty Roastery', 'Business industry other note saved');
      }
    },

    {
      name: 'E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout',
      accounts: ['signed-out'],
      covers: [
        'el:#btn-splash-login',
        'el:#btn-auth-back-to-splash',
        'el:#btn-toggle-password',
        'el:#btn-forgot-password',
        'el:#modal-forgot-password',
        'el:#form-forgot-step-1',
        'el:#forgot-identifier',
        'el:#btn-forgot-send-code',
        'el:#form-forgot-step-2',
        'el:#forgot-reset-code',
        'el:#forgot-new-password',
        'el:#forgot-confirm-password',
        'el:#btn-forgot-confirm-reset',
        'el:#btn-forgot-back',
        'el:#btn-close-forgot-password'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.resetToSignedOut(page, { port });

        // Splash -> Login -> Back to Splash -> Login again
        await page.click('#btn-splash-login');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#login-form'), 'Splash Log in shows login form');
        await page.click('#btn-auth-back-to-splash');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#splash-container'), 'Back returns to Splash screen');
        await page.click('#btn-splash-login');
        await page.waitForTimeout(100);

        // Login password toggle
        await page.fill('#login-password', 'Secret123!');
        a.equal(await page.getAttribute('#login-password', 'type'), 'password', 'Login password starts masked');
        await page.click('#btn-toggle-password');
        a.equal(await page.getAttribute('#login-password', 'type'), 'text', 'Show toggle unmasks login password');
        await page.click('#btn-toggle-password');

        // Open Forgot Password modal
        await page.click('#btn-forgot-password');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#modal-forgot-password'), 'Forgot Password modal opens');

        // Empty submit shows validation error
        await page.fill('#forgot-identifier', '');
        await page.click('#btn-forgot-send-code');
        await page.waitForTimeout(100);
        const err1 = await page.evaluate(() => (document.getElementById('forgot-step1-status') || {}).textContent || '');
        a.ok(/enter your email|username/i.test(err1), 'Empty forgot-password identifier shows error: ' + err1);

        // Enter seeded personal account email and send code
        await page.fill('#forgot-identifier', h.ACCOUNTS.personal.email);
        await page.click('#btn-forgot-send-code');
        await page.waitForTimeout(300);
        a.ok(await h.isVisible(page, '#form-forgot-step-2'), 'Forgot password advances to step 2');

        // Back button goes back to step 1
        await page.click('#btn-forgot-back');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#form-forgot-step-1'), 'Forgot Back returns to step 1');
        await page.click('#btn-forgot-send-code');
        await page.waitForTimeout(300);

        // Mismatched passwords rejected
        await page.fill('#forgot-reset-code', VERIFY_CODE);
        await page.fill('#forgot-new-password', 'ResetPass99!');
        await page.fill('#forgot-confirm-password', 'Mismatch99!');
        await page.click('#btn-forgot-confirm-reset');
        await page.waitForTimeout(150);
        const mismatchMsg = await page.evaluate(() => (document.getElementById('forgot-step2-status') || {}).textContent || '');
        a.ok(/do not match/i.test(mismatchMsg), 'Mismatched passwords show inline error: ' + mismatchMsg);

        // Wrong code rejected
        await page.fill('#forgot-reset-code', '000000');
        await page.fill('#forgot-confirm-password', 'ResetPass99!');
        await page.click('#btn-forgot-confirm-reset');
        await page.waitForTimeout(250);
        const badCodeMsg = await page.evaluate(() => (document.getElementById('forgot-step2-status') || {}).textContent || '');
        a.ok(/incorrect|code/i.test(badCodeMsg), 'Wrong 6-digit code is rejected: ' + badCodeMsg);

        // Valid code resets password
        await page.fill('#forgot-reset-code', VERIFY_CODE);
        await page.click('#btn-forgot-confirm-reset');
        await page.waitForTimeout(350);
        const modalClosed = !(await h.isVisible(page, '#modal-forgot-password'));
        a.ok(modalClosed, 'Forgot password modal closes after successful reset');

        // Log in with the new password
        await page.fill('#login-username', h.ACCOUNTS.personal.username);
        await page.fill('#login-password', 'ResetPass99!');
        await page.click('#btn-auth-submit');
        await page.waitForTimeout(350);
        const signedIn = await page.evaluate(() => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === 'reg_personal'));
        a.ok(signedIn, 'User can sign in with the newly reset password');

        // Log out from owner menu Settings & info
        await h.openOwnerMenu(page);
        await page.evaluate(() => {
          if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
          if (typeof handleDrawerLogoutClick === 'function') handleDrawerLogoutClick();
        });
        await page.waitForTimeout(250);
        const loggedOut = await page.evaluate(() => !(window.state && state.isLoggedIn));
        a.ok(loggedOut, 'Owner menu Log out returns to signed-out state');
      }
    }
  ]
};
