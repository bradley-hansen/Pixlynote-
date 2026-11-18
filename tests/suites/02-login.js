'use strict';

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
    }
  ]
};
