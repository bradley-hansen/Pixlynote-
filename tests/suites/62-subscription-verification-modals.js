'use strict';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 740 }
];

function measureSrc() {
  return function measure(id) {
    function isOpen(el) {
      return !!(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
    }
    const overlay = document.getElementById(id);
    if (!overlay) return { missing: true, id, open: false };
    const card = overlay.firstElementChild;
    const title = overlay.querySelector('h3');
    const or = overlay.getBoundingClientRect();
    const cr = card ? card.getBoundingClientRect() : null;
    const tr = title ? title.getBoundingClientRect() : null;
    const mid = tr ? { x: tr.left + tr.width / 2, y: tr.top + Math.min(10, Math.max(1, tr.height / 2)) } : null;
    const hit = mid ? document.elementFromPoint(mid.x, mid.y) : null;
    const padTop = parseFloat(getComputedStyle(overlay).paddingTop) || 0;
    return {
      id,
      open: isOpen(overlay),
      title: title ? String(title.textContent || '').trim() : '',
      titleTop: tr ? tr.top : null,
      titleBottom: tr ? tr.bottom : null,
      overlayTop: or.top,
      overlayBottom: or.bottom,
      cardTop: cr ? cr.top : null,
      cardBottom: cr ? cr.bottom : null,
      headerClipped: !!(tr && (tr.top < Math.max(0, or.top) - 0.5 || tr.bottom > or.bottom + 0.5 || tr.top < -0.5)),
      cardOverflows: !!(cr && (cr.top < or.top - 0.5 || cr.bottom > or.bottom + 0.5)),
      headerWithinPad: !!(tr && tr.top + 0.5 >= or.top + Math.min(padTop, tr.top + 1)),
      hitInModal: !!(hit && overlay.contains(hit)),
      hitId: hit && (hit.id || hit.tagName)
    };
  };
}

async function measure(page, id) {
  return page.evaluate(measureSrc(), id);
}

function assertVisibleOnTop(a, r, label) {
  a.ok(r.open, label + ': modal is open');
  a.ok(r.title, label + ': title is present (' + r.title + ')');
  a.ok(!r.headerClipped, label + ': header is not clipped: ' + JSON.stringify(r));
  a.ok(!r.cardOverflows, label + ': card stays inside the overlay: ' + JSON.stringify({ cardTop: r.cardTop, cardBottom: r.cardBottom, overlayTop: r.overlayTop, overlayBottom: r.overlayBottom }));
  a.ok(r.hitInModal, label + ': title is the top visible element (elementFromPoint hit ' + r.hitId + ')');
  a.ok(r.titleTop >= 0, label + ': title is within the viewport');
}

async function resetModals(page) {
  await page.evaluate(() => {
    window._businessVerificationFromCheckout = false;
    if (typeof closeAllVerificationModals === 'function') closeAllVerificationModals();
    if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
    if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
    if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal();
    const biz = document.getElementById('modal-business-verification');
    if (biz) { biz.classList.add('hidden'); biz.style.display = 'none'; }
  });
}

module.exports = {
  name: 'Subscription and verification modal mobile layout',
  tests: [
    {
      name: 'Business: subscription header stays visible at 390x844 and 360x740, Open application appears on top, and close returns to the subscription modal',
      accounts: ['business'],
      covers: ['el:#modal-subscription', 'el:#btn-subscription-open-business-verification', 'el:#modal-business-verification', 'el:#btn-close-business-verification'],
      async run(ctx) {
        const { page, a } = ctx;
        for (const vp of VIEWPORTS) {
          const label = 'Business ' + vp.width + 'x' + vp.height;
          await page.setViewportSize(vp);
          await resetModals(page);
          await page.evaluate(() => {
            state.currentUser = Object.assign({}, state.currentUser, {
              accountType: 'business',
              isPlus: false,
              isBusinessPlus: false,
              isVerified: false,
              businessVerificationStatus: '',
              businessVerificationLegacyExempt: false
            });
            openSubscriptionModal();
            updateBusinessPlusCheckoutGate();
          });
          const sub = await measure(page, 'modal-subscription');
          assertVisibleOnTop(a, sub, label + ' subscription');
          a.ok(/Pixlynote Subscription/i.test(sub.title), label + ': subscription title');

          await page.evaluate(() => {
            const btn = document.getElementById('btn-subscription-open-business-verification');
            if (btn) btn.click();
          });
          const app = await measure(page, 'modal-business-verification');
          const subAfterTap = await measure(page, 'modal-subscription');
          assertVisibleOnTop(a, app, label + ' application after tap');
          a.ok(/Business verification application/i.test(app.title), label + ': application title');
          a.ok(!subAfterTap.open, label + ': subscription modal is hidden so the application is visible');

          await page.evaluate(() => {
            const btn = document.getElementById('btn-close-business-verification');
            if (btn) btn.click();
          });
          const afterClose = {
            sub: await measure(page, 'modal-subscription'),
            app: await measure(page, 'modal-business-verification')
          };
          assertVisibleOnTop(a, afterClose.sub, label + ' subscription after close');
          a.ok(!afterClose.app.open, label + ': application is closed');
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await resetModals(page);
      }
    },
    {
      name: 'Government: paywall and subscription headers stay visible at 390x844 and 360x740, the application opens on top from the Government tab, and close returns to Edit Profile',
      accounts: ['personal'],
      covers: ['el:#modal-verification-paywall', 'el:#btn-verification-paywall-subscribe', 'el:#modal-verification-request', 'el:#btn-edit-account-government', 'handler:handleEditProfileOfficialTab', 'handler:goToSubscriptionFromVerificationPaywall'],
      async run(ctx) {
        const { page, a, h } = ctx;
        for (const vp of VIEWPORTS) {
          const label = 'Government ' + vp.width + 'x' + vp.height;
          await page.setViewportSize(vp);
          await resetModals(page);
          await h.openEditProfile(page);
          await page.evaluate(() => {
            state.currentUser = Object.assign({}, state.currentUser, {
              accountType: 'personal',
              isPlus: false,
              isBusinessPlus: false,
              isVerified: false,
              verificationStatus: '',
              verificationType: ''
            });
            handleEditProfileOfficialTab('government');
          });
          const pay = await measure(page, 'modal-verification-paywall');
          assertVisibleOnTop(a, pay, label + ' paywall');
          a.ok(/Verification/i.test(pay.title), label + ': paywall title');

          await page.evaluate(() => {
            const btn = document.getElementById('btn-verification-paywall-subscribe');
            if (btn) btn.click();
          });
          const sub = await measure(page, 'modal-subscription');
          const payAfter = await measure(page, 'modal-verification-paywall');
          assertVisibleOnTop(a, sub, label + ' subscription from paywall');
          a.ok(/Pixlynote Subscription/i.test(sub.title), label + ': subscription title after Go to Subscription');
          a.ok(!payAfter.open, label + ': paywall is closed after Go to Subscription');

          await resetModals(page);
          await h.openEditProfile(page);
          await page.evaluate(() => {
            state.currentUser = Object.assign({}, state.currentUser, {
              accountType: 'personal',
              isPlus: true,
              isVerified: true,
              isBusinessPlus: false,
              subscriptionStatus: 'active',
              verificationStatus: '',
              verificationType: ''
            });
            const btn = document.getElementById('btn-edit-account-government');
            if (btn) btn.click();
            else handleEditProfileOfficialTab('government');
          });
          const app = await measure(page, 'modal-verification-request');
          const typeOn = await page.evaluate(() => {
            const gov = document.getElementById('btn-verification-type-government');
            return !!(gov && (gov.className || '').includes('font-bold'));
          });
          assertVisibleOnTop(a, app, label + ' application after tap');
          a.ok(/Government \/ Organization Verification Request/i.test(app.title), label + ': application title');
          a.ok(typeOn, label + ': Government type is selected');

          await page.evaluate(() => {
            const btn = document.getElementById('btn-close-verification-request');
            if (btn) btn.click();
          });
          const afterClose = {
            app: await measure(page, 'modal-verification-request'),
            edit: await measure(page, 'modal-edit-profile')
          };
          a.ok(!afterClose.app.open, label + ': application is closed');
          assertVisibleOnTop(a, afterClose.edit, label + ' Edit Profile after close');
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await resetModals(page);
      }
    },
    {
      name: 'Organization: paywall and subscription headers stay visible at 390x844 and 360x740, the application opens on top from the Organization tab, and close returns to Edit Profile',
      accounts: ['personal'],
      covers: ['el:#modal-verification-paywall', 'el:#modal-verification-request', 'el:#btn-edit-account-organization', 'el:#btn-verification-type-organization', 'handler:handleEditProfileOfficialTab'],
      async run(ctx) {
        const { page, a, h } = ctx;
        for (const vp of VIEWPORTS) {
          const label = 'Organization ' + vp.width + 'x' + vp.height;
          await page.setViewportSize(vp);
          await resetModals(page);
          await h.openEditProfile(page);
          await page.evaluate(() => {
            state.currentUser = Object.assign({}, state.currentUser, {
              accountType: 'personal',
              isPlus: false,
              isBusinessPlus: false,
              isVerified: false,
              verificationStatus: '',
              verificationType: ''
            });
            handleEditProfileOfficialTab('organization');
          });
          const pay = await measure(page, 'modal-verification-paywall');
          assertVisibleOnTop(a, pay, label + ' paywall');
          a.ok(/Verification/i.test(pay.title), label + ': paywall title');

          await page.evaluate(() => {
            const btn = document.getElementById('btn-verification-paywall-subscribe');
            if (btn) btn.click();
          });
          const sub = await measure(page, 'modal-subscription');
          const payAfter = await measure(page, 'modal-verification-paywall');
          assertVisibleOnTop(a, sub, label + ' subscription from paywall');
          a.ok(/Pixlynote Subscription/i.test(sub.title), label + ': subscription title after Go to Subscription');
          a.ok(!payAfter.open, label + ': paywall is closed after Go to Subscription');

          await resetModals(page);
          await h.openEditProfile(page);
          await page.evaluate(() => {
            state.currentUser = Object.assign({}, state.currentUser, {
              accountType: 'personal',
              isPlus: true,
              isVerified: true,
              isBusinessPlus: false,
              subscriptionStatus: 'active',
              verificationStatus: '',
              verificationType: ''
            });
            const btn = document.getElementById('btn-edit-account-organization');
            if (btn) btn.click();
            else handleEditProfileOfficialTab('organization');
          });
          const app = await measure(page, 'modal-verification-request');
          const typeOn = await page.evaluate(() => {
            const org = document.getElementById('btn-verification-type-organization');
            return !!(org && (org.className || '').includes('font-bold'));
          });
          assertVisibleOnTop(a, app, label + ' application after tap');
          a.ok(/Government \/ Organization Verification Request/i.test(app.title), label + ': application title');
          a.ok(typeOn, label + ': Organization type is selected');

          await page.evaluate(() => {
            const btn = document.getElementById('btn-close-verification-request');
            if (btn) btn.click();
          });
          const afterClose = {
            app: await measure(page, 'modal-verification-request'),
            edit: await measure(page, 'modal-edit-profile')
          };
          a.ok(!afterClose.app.open, label + ': application is closed');
          assertVisibleOnTop(a, afterClose.edit, label + ' Edit Profile after close');
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await resetModals(page);
      }
    }
  ]
};
