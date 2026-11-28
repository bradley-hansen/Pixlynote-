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
      name: 'Business Plus is offered to business accounts and paints a green check, never Plus blue',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#pixly-stripe-business-buy-btn', 'el:#sub-business-plus-box', 'el:#sub-business-active-pill'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const info = await page.evaluate(async () => {
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
            await applyBusinessPlusVerification(state.currentUser.username, 'cs_test_businessplus1234567890');
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
            badgeGreen: !!(badge && badge.classList.contains('text-emerald-500')),
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
          a.ok(/text-emerald-500/.test(info.html) || info.badgeGreen, 'Business Plus uses a green check');
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
    },
    {
      name: 'Subscription modal header stays fully visible on mobile viewports and in a short overlay',
      accounts: ['business'],
      covers: ['el:#modal-subscription', 'handler:openSubscriptionModal', 'handler:updateSubscriptionModalUI'],
      async run(ctx) {
        const { page, h, a } = ctx;

        async function measureAt(width, height, shortOverlay) {
          await page.setViewportSize({ width, height });
          return page.evaluate((short) => {
            state.currentUser = Object.assign({}, state.currentUser, {
              accountType: 'business',
              isBusinessPlus: false,
              businessVerificationStatus: '',
              businessVerificationLegacyExempt: false
            });
            if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
            if (typeof updateBusinessPlusCheckoutGate === 'function') updateBusinessPlusCheckoutGate();
            const overlay = document.getElementById('modal-subscription');
            if (short) {
              overlay.style.bottom = 'auto';
              overlay.style.top = '0px';
              overlay.style.height = '400px';
            }
            const card = overlay && overlay.firstElementChild;
            const header = card && card.firstElementChild;
            const title = header && header.querySelector('h3');
            const or = overlay.getBoundingClientRect();
            const cr = card.getBoundingClientRect();
            const hr = header.getBoundingClientRect();
            const padTop = parseFloat(getComputedStyle(overlay).paddingTop) || 0;
            const padBottom = parseFloat(getComputedStyle(overlay).paddingBottom) || 0;
            const out = {
              subOpen: !!(overlay && !overlay.classList.contains('hidden') && getComputedStyle(overlay).display !== 'none'),
              title: title ? String(title.textContent || '').trim() : '',
              headerTop: hr.top,
              headerBottom: hr.bottom,
              headerHeight: hr.height,
              headerScrollHeight: header.scrollHeight,
              cardTop: cr.top,
              cardBottom: cr.bottom,
              overlayTop: or.top,
              overlayBottom: or.bottom,
              padTop,
              padBottom,
              maxHeight: getComputedStyle(card).maxHeight,
              headerClipped: hr.top < Math.max(0, or.top) - 0.5 || hr.bottom > or.bottom + 0.5 || hr.top < -0.5,
              cardOverflows: cr.top < or.top - 0.5 || cr.bottom > or.bottom + 0.5,
              headerShrunk: hr.height + 1 < header.scrollHeight,
              headerWithinPad: hr.top + 0.5 >= or.top + padTop
            };
            if (short) {
              overlay.style.bottom = '';
              overlay.style.top = '';
              overlay.style.height = '';
            }
            if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
            return out;
          }, !!shortOverlay);
        }

        const at390 = await measureAt(390, 844, false);
        const at360 = await measureAt(360, 740, false);
        const short = await measureAt(390, 844, true);
        await page.setViewportSize({ width: 390, height: 844 });

        for (const [label, r] of [['390x844', at390], ['360x740', at360], ['short 400px overlay', short]]) {
          a.ok(r.subOpen, label + ': subscription modal opens');
          a.equal(r.title, 'Pixlynote Subscription', label + ': header title is present');
          a.ok(!r.headerClipped, label + ': header is not clipped: ' + JSON.stringify(r));
          a.ok(!r.cardOverflows, label + ': card stays inside the overlay: ' + JSON.stringify({ cardTop: r.cardTop, cardBottom: r.cardBottom, overlayTop: r.overlayTop, overlayBottom: r.overlayBottom }));
          a.ok(!r.headerShrunk, label + ': header is not flex-shrunk');
          a.ok(r.headerWithinPad, label + ': header sits below the overlay padding');
        }
        a.ok(short.headerTop >= 0 && short.headerBottom <= 400, 'short overlay: header stays inside the 400px overlay');
      }
    },
    {
      name: 'Open application shows the verification form on top and returns to the subscription modal when it is closed or submitted',
      accounts: ['business'],
      covers: ['el:#btn-subscription-open-business-verification', 'el:#business-plus-verification-gate', 'el:#modal-business-verification', 'el:#btn-close-business-verification', 'handler:openBusinessVerificationModal', 'handler:closeBusinessVerificationModal', 'handler:submitBusinessVerificationApplication'],
      async run(ctx) {
        const { page, a } = ctx;

        const flow = await page.evaluate(async () => {
          function isOpen(id) {
            const el = document.getElementById(id);
            return !!(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
          }
          function hitIn(id) {
            const root = document.getElementById(id);
            const title = root && root.querySelector('h3');
            if (!title) return { title: '', hitIn: false };
            const r = title.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(10, Math.max(1, r.height / 2)));
            return { title: String(title.textContent || '').trim(), hitIn: !!(hit && root.contains(hit)), titleTop: r.top };
          }
          state.currentUser = Object.assign({}, state.currentUser, {
            accountType: 'business',
            isBusinessPlus: false,
            businessVerificationStatus: '',
            businessVerificationLegacyExempt: false
          });
          if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
          if (typeof updateBusinessPlusCheckoutGate === 'function') updateBusinessPlusCheckoutGate();
          const gate = document.getElementById('business-plus-verification-gate');
          const gateOpen = !!(gate && !gate.classList.contains('hidden') && gate.style.display !== 'none');
          const before = { sub: isOpen('modal-subscription'), app: isOpen('modal-business-verification'), gateOpen };

          const btn = document.getElementById('btn-subscription-open-business-verification');
          if (btn) btn.click();
          const afterTap = Object.assign({ sub: isOpen('modal-subscription'), app: isOpen('modal-business-verification') }, hitIn('modal-business-verification'));

          const closeBtn = document.getElementById('btn-close-business-verification');
          if (closeBtn) closeBtn.click();
          const afterClose = { sub: isOpen('modal-subscription'), app: isOpen('modal-business-verification'), fromCheckout: !!window._businessVerificationFromCheckout };

          if (btn) btn.click();
          document.getElementById('bizver-legal-name').value = 'Brand LLC';
          document.getElementById('bizver-dba-name').value = 'Brand';
          document.getElementById('bizver-entity-type').value = 'llc';
          document.getElementById('bizver-country').value = 'US';
          document.getElementById('bizver-rep-name').value = 'Jane Doe';
          document.getElementById('bizver-rep-title').value = 'Owner';
          const bin = new Uint8Array([37, 80, 68, 70, 45, 49]);
          const file = new File([bin], 'articles.pdf', { type: 'application/pdf' });
          const idFile = new File([bin], 'id.png', { type: 'image/png' });
          const dt1 = new DataTransfer(); dt1.items.add(file);
          const dt2 = new DataTransfer(); dt2.items.add(idFile);
          document.getElementById('bizver-file-articles').files = dt1.files;
          document.getElementById('bizver-file-photo-id').files = dt2.files;
          const ok = await submitBusinessVerificationApplication();
          await new Promise((resolve) => setTimeout(resolve, 500));
          const afterSubmit = { ok, sub: isOpen('modal-subscription'), app: isOpen('modal-business-verification'), fromCheckout: !!window._businessVerificationFromCheckout };

          if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
          if (typeof closeBusinessVerificationModal === 'function') closeBusinessVerificationModal();
          return { before, afterTap, afterClose, afterSubmit };
        });

        a.ok(flow.before.sub && !flow.before.app && flow.before.gateOpen, 'Gate is shown in the open subscription modal');
        a.ok(flow.afterTap.app, 'Open application opens the verification form');
        a.ok(!flow.afterTap.sub, 'Open application hides the subscription modal so the form is visible');
        a.equal(flow.afterTap.title, 'Business verification application', 'Verification title is present');
        a.ok(flow.afterTap.hitIn, 'The verification title is on top, not covered by the subscription modal');
        a.ok(flow.afterTap.titleTop >= 0, 'Verification header is not clipped');
        a.ok(flow.afterClose.sub && !flow.afterClose.app, 'Closing the application returns to the subscription modal');
        a.ok(!flow.afterClose.fromCheckout, 'fromCheckout flag is cleared after close');
        a.ok(flow.afterSubmit.ok, 'Application submit succeeds');
        a.ok(flow.afterSubmit.sub && !flow.afterSubmit.app, 'Submitting the application returns to the subscription modal');
      }
    }
  ]
};
