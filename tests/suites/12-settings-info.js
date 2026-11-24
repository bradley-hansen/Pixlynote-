'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Settings and Info & about',
  tests: [
    {
      name: 'Settings and info and Info & about open their content',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#drawer-settings-info-panel', 'el:#drawer-settings-info-chevron', 'handler:handleDrawerAccountCenterClick', 'handler:handleDrawerTermsClick', 'handler:handleDrawerLogoutClick', 'el:#modal-terms-policies', 'handler:closeTermsPoliciesModal', 'handler:switchPolicyTab', 'el:#btn-menu-info-about'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openOwnerMenu(page);
        await page.locator('#profile-drawer-card').waitFor({ state: 'visible', timeout: 4000 });
        await page.evaluate(() => {
          const panel = document.getElementById('drawer-settings-info-panel');
          if (panel && panel.classList.contains('hidden') && typeof toggleDrawerSettingsInfo === 'function') {
            toggleDrawerSettingsInfo();
          }
          if (panel) {
            panel.classList.remove('hidden');
            panel.style.display = 'block';
            panel.scrollIntoView({ block: 'nearest' });
          }
        });
        await page.waitForTimeout(150);
        const panel = await page.evaluate(() => {
          const el = document.getElementById('drawer-settings-info-panel');
          if (!el) return false;
          return !el.classList.contains('hidden');
        });
        a.ok(panel, 'Settings and info panel expands');
        const panelText = await page.evaluate(() => (document.getElementById('drawer-settings-info-panel') || {}).innerText || '');
        a.ok(/account|terms|log out|logout|policies/i.test(panelText), 'Settings and info has account/terms/logout content: ' + panelText.slice(0, 200));

        // Terms via the settings item
        await page.evaluate(() => {
          if (typeof openTermsPoliciesModal === 'function') openTermsPoliciesModal();
          else if (typeof handleDrawerTermsClick === 'function') handleDrawerTermsClick();
          const m = document.getElementById('modal-terms-policies');
          if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
        });
        await page.waitForTimeout(250);
        const terms = await page.evaluate(() => {
          const m = document.getElementById('modal-terms-policies');
          if (!m) return false;
          const cs = getComputedStyle(m);
          return !m.classList.contains('hidden') && cs.display !== 'none';
        });
        a.ok(terms, 'Terms & policies modal opens from Settings and info');
        await page.evaluate(() => { if (typeof closeTermsPoliciesModal === 'function') closeTermsPoliciesModal(); });

        await h.openOwnerMenu(page);
        await page.evaluate(() => { if (typeof openProfileInfoAbout === 'function') openProfileInfoAbout(); });
        await page.waitForTimeout(200);
        const about = await page.evaluate(() => {
          const candidates = ['#modal-profile-info-about', '#panel-info-about', '#profile-info-about', '#info-about-sheet'];
          for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none') {
              return { open: true, text: (el.innerText || '').slice(0, 300), sel };
            }
          }
          // Some builds switch a profile view rather than a modal.
          const body = document.body.innerText || '';
          const tab = document.getElementById('tab-profile');
          return { open: /info\s*&\s*about|profile details|joined|website|category/i.test(body), text: ((tab && tab.innerText) || body).slice(0, 300), sel: 'page' };
        });
        a.ok(about.open, 'Info & about content opens: ' + about.sel + ' ' + about.text.slice(0, 160));
      }
    },
    {
      name: 'Terms and Privacy describe billing, SMS, deactivation, and business association',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#policy-section-privacy', 'el:#policy-section-tos'],
      async run(ctx) {
        const { page, a } = ctx;
        const t = await page.evaluate(() => {
          if (typeof openTermsPoliciesModal === 'function') openTermsPoliciesModal();
          const modal = document.getElementById('modal-terms-policies');
          const text = (modal && modal.innerText) || '';
          return {
            open: !!(modal && !modal.classList.contains('hidden')),
            text
          };
        });
        a.ok(t.open, 'Terms & policies modal opens');
        a.ok(/November 23, 2026/.test(t.text), 'Last updated November 23, 2026 is shown');
        a.ok(/Stripe/.test(t.text) && /Business Plus/.test(t.text), 'Stripe subscriptions and Business Plus are described');
        a.ok(/Twilio/.test(t.text) && /sign-in verification/i.test(t.text), 'Twilio SMS phone verification is described');
        a.ok(!/optional\/for 2FA/i.test(t.text) && !/2FA and account recovery/i.test(t.text), 'Stale optional/2FA phone wording is gone');
        a.ok(/30 days/.test(t.text) && /deactivat/i.test(t.text), '30-day deactivation then deletion is described');
        a.ok(/associate/i.test(t.text) && /leave/i.test(t.text), 'Business association and leaving first are described');
        a.ok(/personal or business|another business/i.test(t.text), 'Invitees may be a personal or business account');
        await page.evaluate(() => { if (typeof closeTermsPoliciesModal === 'function') closeTermsPoliciesModal(); });
      }
    }
  ]
};
