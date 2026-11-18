'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');
const EXPECT = ['Profile', 'Subscription', 'Settings and info', 'Info & about'];

module.exports = {
  name: 'Owner menu',
  tests: [
    {
      name: 'Owner menu: username with nothing under it, four items in order, no version footer',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-profile-row-menu', 'el:#btn-profile-menu', 'el:#modal-profile-drawer', 'el:#drawer-username', 'handler:openProfileMenu', 'handler:handleDrawerProfileClick', 'handler:handleDrawerSubscriptionClick', 'handler:toggleDrawerSettingsInfo', 'handler:openProfileInfoAbout', 'el:#btn-drawer-info-about'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openOwnerMenu(page);
        await page.locator('#profile-drawer-card').waitFor({ state: 'visible', timeout: 4000 });
        const s = await page.evaluate(() => {
          const modal = document.getElementById('modal-profile-drawer');
          const card = document.getElementById('profile-drawer-card');
          const cs = modal ? getComputedStyle(modal) : {};
          const r = card ? card.getBoundingClientRect() : { width: 0, height: 0 };
          const open = !!(modal && !modal.classList.contains('hidden') && cs.display !== 'none' && r.width > 0 && r.height > 0);
          const user = (document.getElementById('drawer-username') || {}).textContent || '';
          const userEl = document.getElementById('drawer-username');
          const under = userEl && userEl.parentElement
            ? Array.from(userEl.parentElement.children).filter((el) => el !== userEl).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
            : [];
          const list = document.querySelector('#profile-drawer-card .flex-1.overflow-y-auto');
          const items = list
            ? Array.from(list.querySelectorAll(':scope > button')).map((btn) => {
                const title = btn.querySelector('div.font-bold.text-xs') || btn.querySelector('.font-bold.text-xs');
                return ((title && title.textContent) || '').replace(/\s+/g, ' ').trim();
              })
            : [];
          const body = document.body.innerText || '';
          return { open, user, under, items, footer: /Version 2\.4|Visual Stories & Notes/.test(body) };
        });
        a.ok(s.open, 'Owner menu is open');
        a.equal(s.user, '@' + account.username, 'Username is at the top');
        a.ok(s.under.length === 0, 'Nothing under the username: ' + JSON.stringify(s.under));
        a.ok(JSON.stringify(s.items) === JSON.stringify(EXPECT), 'Four items in order: ' + JSON.stringify(s.items));
        a.ok(!s.footer, 'No version footer');
      }
    },
    {
      name: 'Owner menu: User Base Metrics and Pending Deactivations are only at the top for @pixlynote',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#drawer-pixlynote-metrics', 'el:#drawer-pixlynote-deactivations', 'el:#btn-refresh-user-metrics', 'el:#btn-refresh-pending-deactivations', 'handler:refreshDrawerUserMetrics', 'handler:refreshPendingDeactivations', 'handler:toggleDrawerUserMetricsList'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openOwnerMenu(page);
        const s = await page.evaluate(() => {
          const vis = (id) => {
            const el = document.getElementById(id);
            if (!el) return { exists: false, hidden: true };
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const hidden = el.classList.contains('hidden') || cs.display === 'none' || r.height < 1;
            return { exists: true, hidden };
          };
          const list = document.querySelector('#profile-drawer-card .flex-1.overflow-y-auto');
          const kids = list ? Array.from(list.children) : [];
          const metIdx = kids.findIndex((el) => el.id === 'drawer-pixlynote-metrics');
          const deIdx = kids.findIndex((el) => el.id === 'drawer-pixlynote-deactivations');
          const profileIdx = kids.findIndex((el) => (el.getAttribute('onclick') || '').includes('handleDrawerProfileClick'));
          return {
            metrics: vis('drawer-pixlynote-metrics'),
            deact: vis('drawer-pixlynote-deactivations'),
            above: metIdx >= 0 && deIdx > metIdx && profileIdx > deIdx
          };
        });
        if (account.username === 'pixlynote') {
          a.ok(s.metrics.exists && !s.metrics.hidden, 'Metrics card is visible for @pixlynote');
          a.ok(s.deact.exists && !s.deact.hidden, 'Deactivations card is visible for @pixlynote');
          a.ok(s.above, 'Both cards sit above the four items');
        } else {
          a.ok(!s.metrics.exists || s.metrics.hidden, 'Metrics card is hidden for @' + account.username);
          a.ok(!s.deact.exists || s.deact.hidden, 'Deactivations card is hidden for @' + account.username);
        }
      }
    }
  ]
};
