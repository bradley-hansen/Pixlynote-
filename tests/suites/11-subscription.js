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
        await page.evaluate(() => {
          if (typeof handleDrawerSubscriptionClick === 'function') handleDrawerSubscriptionClick();
          else if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
          else if (typeof openSubscription === 'function') openSubscription();
        });
        await page.waitForTimeout(200);
        const s = await page.evaluate(() => {
          const modal = document.getElementById('modal-subscription');
          const open = !!(modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none');
          const hrefs = Array.from(document.querySelectorAll('#modal-subscription a[href], a[href*="stripe"]')).map((a) => a.getAttribute('href') || '');
          const buy = !!document.querySelector('#modal-subscription stripe-buy-button, #modal-subscription [id*="stripe"], script[src*="js.stripe.com"]');
          const html = (modal && modal.innerHTML) || '';
          return { open, hrefs, buy, hasStripe: /stripe/i.test(hrefs.join(' ') + html) };
        });
        a.ok(s.open, 'Subscription modal opens');
        a.ok(s.hasStripe || s.hrefs.some((h) => /stripe/i.test(h)), 'A Stripe sandbox entry point is present: ' + JSON.stringify(s.hrefs));
        await page.evaluate(() => { if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal(); });
      }
    }
  ]
};
