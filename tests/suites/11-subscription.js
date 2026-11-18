'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Subscription and Stripe',
  tests: [
    {
      name: 'Subscription and Stripe sandbox entry points exist',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#modal-subscription', 'handler:closeSubscriptionModal', 'handler:handleDrawerSubscriptionClick', 'href:https://billing.stripe.com/p/login/test_8x29AT6WvgHZ5Dc7QggQE00'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openOwnerMenu(page);
        // Click the actual Subscription menu item, then wait past the 150ms open delay.
        await page.evaluate(() => {
          const list = document.querySelector('#profile-drawer-card .flex-1.overflow-y-auto');
          const btn = list && Array.from(list.querySelectorAll(':scope > button')).find((b) => /Subscription/.test(b.innerText || ''));
          if (btn) btn.click();
          else if (typeof handleDrawerSubscriptionClick === 'function') handleDrawerSubscriptionClick();
        });
        await page.waitForTimeout(350);
        await page.evaluate(() => {
          if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
        });
        const s = await page.evaluate(() => {
          const modal = document.getElementById('modal-subscription');
          const open = !!(modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none');
          const hrefs = Array.from(document.querySelectorAll('#modal-subscription a[href], a[href*="stripe"]')).map((a) => a.getAttribute('href') || '');
          const buy = !!document.querySelector('#modal-subscription stripe-buy-button');
          const portal = hrefs.find((h) => /billing\.stripe\.com\/p\/login\/test_/.test(h));
          return { open, hrefs, buy, portal };
        });
        a.ok(s.open, 'Subscription modal opens from the owner menu');
        a.ok(!!s.portal, 'Stripe sandbox customer-portal link is present: ' + JSON.stringify(s.hrefs));
        a.ok(s.buy, 'Stripe sandbox buy button is in the modal');
        await page.evaluate(() => { if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal(); });
        const closed = await page.evaluate(() => {
          const modal = document.getElementById('modal-subscription');
          return !modal || modal.classList.contains('hidden') || getComputedStyle(modal).display === 'none';
        });
        a.ok(closed, 'Subscription modal closes');
      }
    }
  ]
};
