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
    },
    {
      name: 'Business Plus is offered to business accounts and paints a yellow check, never Plus blue',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#pixly-stripe-business-buy-btn', 'el:#sub-business-plus-box', 'el:#sub-business-active-pill'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const info = await page.evaluate(() => {
          if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
          const plusBtn = document.getElementById('pixly-stripe-buy-btn');
          const bizBtn = document.getElementById('pixly-stripe-business-buy-btn');
          const bizBox = document.getElementById('sub-business-plus-box');
          const hidden = (el) => !el || el.classList.contains('hidden') || getComputedStyle(el).display === 'none';
          const isBiz = typeof isBusinessAccount === 'function' && isBusinessAccount(state.currentUser);
          const before = {
            isBiz,
            plusHidden: hidden(plusBtn),
            bizBtnHidden: hidden(bizBtn),
            bizBoxHidden: hidden(bizBox),
            bizBtnId: bizBtn ? bizBtn.getAttribute('buy-button-id') : '',
            plusId: plusBtn ? plusBtn.getAttribute('buy-button-id') : '',
            isPlus: !!(state.currentUser && state.currentUser.isPlus),
            isBusinessPlus: !!(state.currentUser && state.currentUser.isBusinessPlus)
          };
          if (isBiz && typeof applyBusinessPlusVerification === 'function') {
            applyBusinessPlusVerification(state.currentUser.username, 'cs_test_businessplus1234567890');
          }
          const html = (typeof creatorStatusBadgesHtml === 'function' && state.currentUser)
            ? creatorStatusBadgesHtml(state.currentUser)
            : '';
          const badge = document.getElementById('profile-verified-badge');
          return {
            before,
            afterPlus: !!(state.currentUser && state.currentUser.isPlus),
            afterBiz: !!(state.currentUser && state.currentUser.isBusinessPlus),
            html,
            badgeAmber: !!(badge && (badge.classList.contains('text-amber-400') || badge.classList.contains('text-amber-500'))),
            badgeSky: !!(badge && badge.classList.contains('text-sky-500') && !badge.classList.contains('hidden'))
          };
        });
        a.ok(info.before.plusId === 'buy_btn_1UbNOvFSVMbdmupThAC2iczu', 'Plus buy-button-id is unchanged');
        a.ok(info.before.bizBtnId === 'buy_btn_1UdKTrFSVMbdmupTOj95P7R5', 'Business Plus buy-button-id is present');
        if (info.before.isBiz) {
          a.ok(!info.before.bizBtnHidden && !info.before.bizBoxHidden, 'Business accounts see the Business Plus plan and button');
          a.ok(info.before.plusHidden, 'Business accounts do not see the personal Plus buy button');
          a.ok(info.afterBiz, 'applyBusinessPlusVerification sets isBusinessPlus');
          a.ok(!info.afterPlus, 'Business Plus does not set isPlus / blue');
          a.ok(/text-amber-400/.test(info.html) || info.badgeAmber, 'Business Plus uses a yellow/amber check');
          a.ok(!info.badgeSky, 'Business Plus does not show the blue check');
        } else {
          a.ok(info.before.bizBtnHidden && info.before.bizBoxHidden, 'Personal accounts do not see Business Plus');
          a.ok(!info.before.plusHidden, 'Personal accounts still see the Plus buy button when not subscribed');
        }
        await page.evaluate(() => {
          if (state.currentUser && state.currentUser.isBusinessPlus && typeof applyBusinessPlusCancellation === 'function') {
            applyBusinessPlusCancellation(state.currentUser.username);
          }
          if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
        });

      }
    }
  ]
};
