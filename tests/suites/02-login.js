'use strict';

async function auditPasswordForms(page) {
  return page.evaluate(() => {
    const passwords = Array.from(document.querySelectorAll('input[type="password"]')).map((el) => ({
      id: el.id,
      value: el.value || '',
      autocomplete: el.getAttribute('autocomplete') || ''
    }));
    const token = document.getElementById('business-verification-admin-token');
    const paired = Array.from(document.querySelectorAll('form')).map((f) => {
      const hasIdent = !!f.querySelector('input[type="email"], #login-username, #login-email, #forgot-identifier, input[autocomplete="username"], input[autocomplete="email"]');
      const filledPw = Array.from(f.querySelectorAll('input[type="password"]')).filter((i) => (i.value || '') !== '');
      return { id: f.id, hasIdent, filledPw: filledPw.map((i) => i.id) };
    }).filter((x) => x.hasIdent && x.filledPw.length);
    const loginEmail = document.getElementById('login-email');
    const signupPw = document.getElementById('signup-password');
    return {
      passwords,
      filledPasswords: passwords.filter((p) => p.value),
      loginFormInDom: !!document.getElementById('login-form'),
      loginPwValue: ((document.getElementById('login-password') || {}).value) || '',
      loginUserAc: (document.getElementById('login-username') && document.getElementById('login-username').getAttribute('autocomplete')) || '',
      loginPwAc: (document.getElementById('login-password') && document.getElementById('login-password').getAttribute('autocomplete')) || '',
      loginEmailValue: (loginEmail && loginEmail.value) || '',
      signupPwType: signupPw ? signupPw.type : '',
      signupPwValue: (signupPw && signupPw.value) || '',
      tokenType: token ? token.type : '',
      tokenAc: token ? (token.getAttribute('autocomplete') || '') : '',
      tokenInForm: !!(token && token.closest('form')),
      paired,
      disarmed: !!window._authFormsDisarmed,
      detached: !!window._detachedLoginForm
    };
  });
}

module.exports = {
  name: 'Login',
  tests: [
    {
      name: 'Login: empty credentials are rejected',
      accounts: ['signed-out'],
      covers: ['el:#login-form', 'el:#login-username', 'el:#login-password', 'el:#btn-auth-submit', 'el:#tab-auth-login', 'nav:auth:login', 'listener:#login-form:submit'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openLoginForm(page);
        await page.fill('#login-username', '');
        await page.fill('#login-password', '');
        await page.click('#btn-auth-submit');
        await page.waitForTimeout(200);
        const mainHidden = await page.evaluate(() => {
          const main = document.getElementById('main-view');
          return !main || main.classList.contains('hidden') || getComputedStyle(main).display === 'none';
        });
        a.ok(mainHidden, 'Main app does not open without credentials');
      }
    },
    {
      name: 'Login: wrong password is rejected',
      accounts: ['signed-out'],
      covers: ['el:#btn-toggle-password', 'el:#btn-forgot-password'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openLoginForm(page);
        await page.fill('#login-username', 'reg_personal');
        await page.fill('#login-password', 'definitely-wrong');
        await page.click('#btn-auth-submit');
        await page.waitForTimeout(400);
        const loggedIn = await page.evaluate(() => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === 'reg_personal' && document.getElementById('main-view') && getComputedStyle(document.getElementById('main-view')).display !== 'none' && !document.getElementById('main-view').classList.contains('hidden')));
        a.ok(!loggedIn, 'Wrong password does not sign in');
      }
    },
    {
      name: 'Login: a seeded account can sign in with the correct password',
      accounts: ['signed-out'],
      covers: ['el:#btn-splash-login', 'el:#btn-auth-back-to-splash', 'el:#btn-toggle-auth-mode', 'handler:handleLoginAction', 'listener:#btn-auth-submit:click'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openLoginForm(page);
        await page.fill('#login-username', 'reg_personal');
        await page.fill('#login-password', 'TestPass123!');
        await page.click('#btn-auth-submit');
        await page.waitForFunction(() => !!(window.state && state.isLoggedIn && state.currentUser && String(state.currentUser.username).toLowerCase() === 'reg_personal'), null, { timeout: 8000 }).catch(() => {});
        const info = await page.evaluate(() => ({
          loggedIn: !!(state && state.isLoggedIn),
          user: state && state.currentUser && state.currentUser.username,
          main: (() => {
            const el = document.getElementById('main-view');
            return !!(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
          })()
        }));
        a.ok(info.loggedIn && info.main, 'Login opens the main app: ' + JSON.stringify(info));
        a.equal(String(info.user || '').toLowerCase(), 'reg_personal', 'Signed in as the seeded personal account');
      }
    },
    {
      name: 'Login: login fields keep username and current-password autocomplete, and the admin token is not a password field',
      accounts: ['signed-out'],
      covers: ['el:#login-username', 'el:#login-password', 'el:#business-verification-admin-token', 'handler:armAuthCredentialForms'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openLoginForm(page);
        const audit = await auditPasswordForms(page);
        a.equal(audit.loginUserAc, 'username', 'The login identifier uses autocomplete=username');
        a.equal(audit.loginPwAc, 'current-password', 'The login password uses autocomplete=current-password');
        a.ok(audit.loginFormInDom, 'The login form is in the document on the login screen');
        a.equal(audit.tokenType, 'text', 'The admin token field is not type=password');
        a.equal(audit.tokenAc, 'off', 'The admin token field has autocomplete=off');
        a.ok(!audit.tokenInForm, 'The admin token field is not wrapped in a form');
      }
    },
    {
      name: 'Login: password fields are cleared and the login form is removed after sign-in, including on the Profile tab',
      accounts: ['signed-out'],
      covers: ['handler:handleLoginAction', 'handler:disarmAuthCredentialForms', 'handler:switchMainTab', 'el:#nav-btn-profile'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openLoginForm(page);
        await page.fill('#login-username', 'reg_personal');
        await page.fill('#login-password', 'TestPass123!');
        await page.fill('#login-email', 'brad.g.hansen@gmail.com').catch(() => {});
        await page.fill('#signup-password', 'ShouldNotRemainAfterLogin').catch(() => {});
        await page.click('#btn-auth-submit');
        await page.waitForFunction(() => !!(window.state && state.isLoggedIn && state.currentUser && String(state.currentUser.username).toLowerCase() === 'reg_personal'), null, { timeout: 8000 }).catch(() => {});

        const afterLogin = await auditPasswordForms(page);
        a.ok(afterLogin.disarmed && afterLogin.detached, 'Auth credential forms are disarmed and the login form is detached after sign-in');
        a.ok(!afterLogin.loginFormInDom, 'The login form is not left in the document after a successful login');
        a.equal(afterLogin.filledPasswords.length, 0, 'There is no filled password input after login: ' + JSON.stringify(afterLogin.filledPasswords));
        a.equal(afterLogin.loginPwValue, '', 'The login password value is empty after login');
        a.equal(afterLogin.loginEmailValue, '', 'The signup email (login-email) is cleared after login');
        a.ok(afterLogin.signupPwType !== 'password' || afterLogin.signupPwValue === '', 'The signup password is not left as a filled password field');
        a.equal(afterLogin.paired.length, 0, 'No hidden form pairs an identifier with a filled password after login: ' + JSON.stringify(afterLogin.paired));

        await page.evaluate(() => {
          if (typeof switchMainTab === 'function') switchMainTab('profile');
        });
        await page.waitForTimeout(200);
        const btn = await page.$('#nav-btn-profile');
        if (btn) await btn.click().catch(() => {});
        await page.waitForTimeout(200);

        const afterProfile = await auditPasswordForms(page);
        a.ok(!afterProfile.loginFormInDom, 'Opening the Profile tab does not put the login form back in the document');
        a.equal(afterProfile.filledPasswords.length, 0, 'There is no filled password input after opening the Profile tab: ' + JSON.stringify(afterProfile.filledPasswords));
        a.equal(afterProfile.paired.length, 0, 'Opening the Profile tab does not pair an email or username with a filled password: ' + JSON.stringify(afterProfile.paired));
        a.equal(afterProfile.loginEmailValue, '', 'The signup email stays empty on the Profile tab');
      }
    },
    {
      name: 'Login: switching to the Profile tab after an in-app session still has no filled password form',
      accounts: ['personal'],
      covers: ['handler:performLogin', 'handler:switchMainTab', 'handler:renderProfile', 'el:#nav-btn-profile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const afterLogin = await auditPasswordForms(page);
        a.ok(!afterLogin.loginFormInDom, 'performLogin detaches the login form for an already-signed-in session');
        a.equal(afterLogin.filledPasswords.length, 0, 'A signed-in session has no filled password inputs');

        // Simulate a leftover autofill that used to survive into profile navigation.
        await page.evaluate(() => {
          const email = document.getElementById('login-email');
          const signupPw = document.getElementById('signup-password');
          if (email) {
            email.readOnly = false;
            email.value = 'brad.g.hansen@gmail.com';
          }
          if (signupPw) {
            signupPw.readOnly = false;
            signupPw.type = 'password';
            signupPw.value = 'autofilled-secret';
          }
        });
        await page.evaluate(() => {
          if (typeof switchMainTab === 'function') switchMainTab('profile');
        });
        await page.waitForTimeout(200);
        const afterProfile = await auditPasswordForms(page);
        a.equal(afterProfile.loginEmailValue, '', 'Profile tab navigation clears a leftover signup email');
        a.equal(afterProfile.signupPwValue, '', 'Profile tab navigation clears a leftover signup password');
        a.ok(afterProfile.signupPwType !== 'password' || afterProfile.signupPwValue === '', 'Profile tab navigation does not leave signup-password as a filled password field');
        a.equal(afterProfile.filledPasswords.length, 0, 'Profile tab navigation leaves no filled password inputs: ' + JSON.stringify(afterProfile.filledPasswords));
        a.equal(afterProfile.paired.length, 0, 'Profile tab navigation leaves no email+password form pairing: ' + JSON.stringify(afterProfile.paired));
        a.equal((account && account.username) || 'reg_personal', (await page.evaluate(() => (state.currentUser && state.currentUser.username) || '')), 'Still signed in as the same account after opening Profile');
      }
    }
  ]
};
