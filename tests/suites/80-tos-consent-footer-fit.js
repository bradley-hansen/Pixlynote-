'use strict';

/**
 * Terms consent modal footer must stay fully visible and tappable at any viewport
 * height, including a short landscape screen and a ~70px mobile browser toolbar
 * (Android Chrome). Layout only; consent behavior is unchanged.
 * Mock Firestore only; never touches production.
 */

const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const MODAL_COVERS = ['el:#tos-consent-checkbox', 'el:#btn-tos-consent-agree', 'el:#btn-tos-consent-logout'];
const SIGNUP_COVERS = ['el:#signup-tos-checkbox', 'el:#btn-signup-to-step2'];
const DEFAULT_VIEWPORT = { width: 390, height: 844 };
const TOOLBAR = 70;
const VIEWPORTS = [
  { w: 360, h: 640 },
  { w: 390, h: 844 },
  { w: 412, h: 780 },
  { w: 412, h: 600 },
  { w: 915, h: 300 }
];

const TEXT = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? (el.textContent || '').trim() : '';
}, sel);

async function waitModal(page, open, ms) {
  try {
    await page.waitForFunction((open) => !!(window.pixlyTos && window.pixlyTos.isOpen()) === open, open, { timeout: ms || 10000 });
    return true;
  } catch (e) { return false; }
}

async function scrollPanelToEnd(page, sel) {
  await page.evaluate((sel) => {
    const p = document.querySelector(sel);
    p.scrollTop = p.scrollHeight;
    p.dispatchEvent(new Event('scroll'));
  }, sel);
  await page.waitForTimeout(60);
}

function login(page, account) {
  return page.evaluate((a) => {
    performLogin(a.username, a.fullName, a.email, null, a.phone, a.accountType);
  }, account);
}

async function openLegacyModal(page, account) {
  await page.evaluate(installPixlyMockFirestore, {
    ['users/' + account.username]: { username: account.username, accountType: account.accountType }
  });
  await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), account.username);
  await login(page, account);
  const shown = await waitModal(page, true);
  return shown;
}

async function cleanup(page, account) {
  await page.evaluate(() => {
    try { window.pixlyTos.hide(); } catch (e) {}
    try { delete window.__pixlyTosVisibleBox; } catch (e) {}
  });
  await page.evaluate(uninstallPixlyMockFirestore);
  await page.evaluate((me) => {
    ['reg_personal', 'reg_business', 'reg_empty', 'pixlynote'].forEach((u) => {
      localStorage.setItem('pixly_tos_consent_' + u, JSON.stringify({ tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' }));
    });
    localStorage.removeItem('pixly_tos_consent_' + me);
    document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
  }, account.username);
  await page.setViewportSize(DEFAULT_VIEWPORT);
}

async function setViewport(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(() => {
    try { delete window.__pixlyTosVisibleBox; } catch (e) {}
    if (window.pixlyTos && window.pixlyTos.isOpen() && window.pixlyTos.syncViewport) window.pixlyTos.syncViewport();
  });
  await page.waitForTimeout(40);
}

async function simulateToolbar(page, barPx, topPx) {
  topPx = topPx || 0;
  await page.evaluate(({ barPx, topPx }) => {
    window.__pixlyTosVisibleBox = {
      height: Math.max(1, window.innerHeight - barPx - topPx),
      top: topPx
    };
    if (window.pixlyTos && window.pixlyTos.syncViewport) window.pixlyTos.syncViewport();
  }, { barPx, topPx });
  await page.waitForTimeout(40);
}

async function buttonFit(page, sel, boundBottom) {
  return page.evaluate(({ sel, boundBottom }) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const hit = !!(top && (top === el || el.contains(top)));
    return {
      missing: false,
      top: r.top,
      left: r.left,
      bottom: r.bottom,
      right: r.right,
      width: r.width,
      height: r.height,
      boundBottom,
      innerH: window.innerHeight,
      innerW: window.innerWidth,
      inView: r.top >= -0.5 && r.left >= -0.5 && r.bottom <= boundBottom + 0.5 && r.right <= window.innerWidth + 0.5 && r.width > 0 && r.height > 0,
      hit
    };
  }, { sel, boundBottom });
}

async function footerFit(page, boundBottom, visibleTop) {
  visibleTop = visibleTop || 0;
  return page.evaluate(({ boundBottom, visibleTop }) => {
    const ids = {
      hint: 'tos-consent-hint',
      checkbox: 'tos-consent-checkbox',
      agree: 'btn-tos-consent-agree',
      logout: 'btn-tos-consent-logout',
      footer: 'tos-consent-footer',
      error: 'tos-consent-error',
      head: 'tos-consent-head',
      card: 'tos-consent-card'
    };
    const out = { boundBottom, visibleTop, innerH: window.innerHeight, innerW: window.innerWidth };
    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (!el) { out[key] = null; continue; }
      const boxEl = (id === 'tos-consent-checkbox') ? (el.closest('label') || el) : el;
      const r = boxEl.getBoundingClientRect();
      const hidden = el.classList.contains('hidden') || getComputedStyle(el).display === 'none';
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const clickEl = (id === 'tos-consent-checkbox') ? el : (document.getElementById(id) || el);
      const hit = !hidden && !!(top && (top === clickEl || clickEl.contains(top) || boxEl.contains(top)));
      out[key] = {
        hidden,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
        inView: hidden || (r.top >= visibleTop - 0.5 && r.left >= -0.5 && r.bottom <= boundBottom + 0.5 && r.right <= window.innerWidth + 0.5 && r.width > 0 && r.height > 0),
        hit
      };
    }
    const headTop = out.head ? out.head.top : (out.card ? out.card.top : 0);
    out.topGap = headTop - visibleTop;
    return out;
  }, { boundBottom, visibleTop });
}

function assertFooterInView(a, info, label, { requireError } = {}) {
  a.ok(info.agree && info.agree.inView, label + ': Agree is fully inside the visible area ' + JSON.stringify(info.agree));
  a.ok(info.logout && info.logout.inView, label + ': Log out is fully inside the visible area ' + JSON.stringify(info.logout));
  a.ok(info.agree && info.agree.hit, label + ': Agree is clickable at its center ' + JSON.stringify(info.agree));
  a.ok(info.logout && info.logout.hit, label + ': Log out is clickable at its center ' + JSON.stringify(info.logout));
  a.ok(info.checkbox && info.checkbox.inView, label + ': the checkbox is fully inside the visible area ' + JSON.stringify(info.checkbox));
  a.ok(info.hint && info.hint.inView, label + ': the reached-the-end note is fully inside the visible area ' + JSON.stringify(info.hint));
  a.ok(info.footer && info.footer.inView, label + ': the footer is fully inside the visible area ' + JSON.stringify(info.footer));
  a.ok(info.topGap >= 16, label + ': the header sits at least 16px below the top of the visible area (gap=' + info.topGap + ') ' + JSON.stringify({ topGap: info.topGap, head: info.head, visibleTop: info.visibleTop }));
  if (requireError) {
    a.ok(info.error && !info.error.hidden && info.error.inView, label + ': the error is fully inside the visible area ' + JSON.stringify(info.error));
  }
}

const mockDoc = (page, path) => page.evaluate((p) => JSON.parse(JSON.stringify(window.__pfs.docs[p] || null)), path);

module.exports = {
  name: 'Terms consent modal footer fit',
  tests: [
    {
      name: 'ToS modal footer: Agree and Log out stay fully in view and clickable at 360x640, 390x844, 412x780, 412x600, and 915x300; Agree stays disabled until the box is checked',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        try {
          a.ok(await openLegacyModal(page, account), 'The consent modal opens for a legacy account');
          for (const vp of VIEWPORTS) {
            const tag = vp.w + 'x' + vp.h;
            await setViewport(page, vp.w, vp.h);
            const info = await footerFit(page, vp.h);
            assertFooterInView(a, info, tag);
            a.ok(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled), tag + ': Agree is disabled before the box is checked');
            await scrollPanelToEnd(page, '#tos-consent-panel');
            a.ok(!(await page.evaluate(() => document.getElementById('tos-consent-checkbox').disabled)), tag + ': the checkbox unlocks after scrolling to the end');
            a.ok(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled), tag + ': Agree stays disabled until the box is checked');
            await page.check('#tos-consent-checkbox');
            a.ok(!(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled)), tag + ': Agree turns on once the box is checked');
            const after = await footerFit(page, vp.h);
            assertFooterInView(a, after, tag + ' after check');
            // Reset the gate for the next size so "disabled until checked" is re-tested independently.
            await page.evaluate(() => { if (window.pixlyTos && window.pixlyTos.isOpen()) { const u = (window.state && state.currentUser && state.currentUser.username) || ''; window.pixlyTos.show(u); } });
            await page.waitForTimeout(40);
          }
        } finally {
          await cleanup(page, account);
        }
      }
    },
    {
      name: 'ToS modal footer: a 70px mobile browser toolbar never covers Agree, Log out, the checkbox, or the reached-the-end note at any of the five viewports',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        try {
          a.ok(await openLegacyModal(page, account), 'The consent modal opens');
          for (const vp of VIEWPORTS) {
            const tag = vp.w + 'x' + vp.h + ' toolbar';
            await setViewport(page, vp.w, vp.h);
            await simulateToolbar(page, TOOLBAR);
            const bound = vp.h - TOOLBAR;
            const info = await footerFit(page, bound);
            assertFooterInView(a, info, tag);
          }
        } finally {
          await cleanup(page, account);
        }
      }
    },
    {
      name: 'ToS modal footer: a top address bar leaves 16-24px plus safe-area spacing above the header, and Agree and Log out stay fully visible',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        const ADDRESS_BAR = 56;
        try {
          a.ok(await openLegacyModal(page, account), 'The consent modal opens');
          for (const vp of VIEWPORTS) {
            const tag = vp.w + 'x' + vp.h + ' address bar';
            await setViewport(page, vp.w, vp.h);
            // The Playwright viewport is the visible area; offset the modal down as
            // visualViewport.offsetTop does when the address bar is showing.
            await simulateToolbar(page, 0, ADDRESS_BAR);
            const visibleTop = ADDRESS_BAR;
            const bound = vp.h;
            const info = await footerFit(page, bound, visibleTop);
            assertFooterInView(a, info, tag);
            a.ok(info.topGap >= 16 && info.topGap <= 28, tag + ': top gap is about 16-24px below the address bar (gap=' + info.topGap + ')');
          }
        } finally {
          await cleanup(page, account);
        }
      }
    },
    {
      name: 'ToS modal footer: Agree saves consent (stubbed) and closes the modal at 412x600 and 915x300, including under a 70px toolbar',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        try {
          for (const vp of [{ w: 412, h: 600 }, { w: 915, h: 300 }]) {
            const tag = vp.w + 'x' + vp.h;
            await setViewport(page, vp.w, vp.h);
            a.ok(await openLegacyModal(page, account), tag + ': modal opens');
            await simulateToolbar(page, TOOLBAR);
            await scrollPanelToEnd(page, '#tos-consent-panel');
            await page.check('#tos-consent-checkbox');
            const before = await footerFit(page, vp.h - TOOLBAR);
            assertFooterInView(a, before, tag + ' before save');
            a.ok(!(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled)), tag + ': Agree is enabled');
            await page.click('#btn-tos-consent-agree');
            a.ok(await waitModal(page, false), tag + ': the modal closes after a successful save');
            const doc = await mockDoc(page, 'users/' + account.username);
            a.ok(doc && doc.tosAcceptedAt && doc.tosVersion === '2026-11-28', tag + ': consent was recorded');
            await page.evaluate((u) => {
              try { window.__pfs.docs['users/' + u] = { username: u, accountType: 'personal' }; } catch (e) {}
              localStorage.removeItem('pixly_tos_consent_' + u);
            }, account.username);
          }
        } finally {
          await cleanup(page, account);
        }
      }
    },
    {
      name: 'ToS modal footer: a failed save shows an error, keeps the modal open, and leaves Agree, Log out, and the error fully visible at 412x600 and 915x300 under a 70px toolbar',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        try {
          for (const vp of [{ w: 412, h: 600 }, { w: 915, h: 300 }]) {
            const tag = vp.w + 'x' + vp.h;
            await setViewport(page, vp.w, vp.h);
            a.ok(await openLegacyModal(page, account), tag + ': modal opens');
            await simulateToolbar(page, TOOLBAR);
            await page.evaluate(() => {
              window.firebase.setDoc = async () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };
              const t = document.getElementById('toast-text'); if (t) t.textContent = '';
            });
            await scrollPanelToEnd(page, '#tos-consent-panel');
            await page.check('#tos-consent-checkbox');
            await page.click('#btn-tos-consent-agree');
            await page.waitForSelector('#tos-consent-error:not(.hidden)', { timeout: 3000 });
            const err = await TEXT(page, '#tos-consent-error');
            a.ok(/permission denied/i.test(err), tag + ': the error says permission was denied: ' + err);
            a.ok(await waitModal(page, true, 1000), tag + ': the modal stays open');
            a.ok(!/agreed/i.test(await TEXT(page, '#toast-text')), tag + ': no success toast');
            a.ok(!(await mockDoc(page, 'users/' + account.username)).tosAcceptedAt, tag + ': nothing was recorded');
            const info = await footerFit(page, vp.h - TOOLBAR);
            assertFooterInView(a, info, tag + ' after failed save', { requireError: true });
            a.ok(!(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled)), tag + ': Agree is available to retry');
            await page.evaluate(() => { try { window.pixlyTos.hide(); } catch (e) {} });
          }
        } finally {
          await cleanup(page, account);
        }
      }
    },
    {
      name: 'ToS modal footer: Log out works at 412x600 and 915x300 and records nothing',
      accounts: ['personal'],
      covers: ['el:#btn-tos-consent-logout'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        try {
          for (const vp of [{ w: 412, h: 600 }, { w: 915, h: 300 }]) {
            const tag = vp.w + 'x' + vp.h;
            await setViewport(page, vp.w, vp.h);
            a.ok(await openLegacyModal(page, account), tag + ': modal opens');
            const info = await footerFit(page, vp.h);
            assertFooterInView(a, info, tag);
            await page.click('#btn-tos-consent-logout');
            await page.waitForTimeout(300);
            a.ok(!(await waitModal(page, true, 800)), tag + ': the modal closes');
            a.ok(!(await page.evaluate(() => !!state.isLoggedIn)), tag + ': the person is logged out');
            a.ok(await h.isVisible(page, '#auth-view'), tag + ': the welcome screen is shown');
            a.ok(!(await mockDoc(page, 'users/' + account.username)).tosAcceptedAt, tag + ': no consent was recorded');
            await h.loginAs(page, account);
          }
        } finally {
          await cleanup(page, account);
          try { await h.loginAs(page, account); } catch (e) {}
        }
      }
    },
    {
      name: 'ToS sign-up step 1: the checkbox and Continue can be scrolled fully into view at 412x600 and 915x300',
      accounts: ['signed-out'],
      covers: SIGNUP_COVERS,
      async run({ page, h, a }) {
        try {
          for (const vp of [{ w: 412, h: 600 }, { w: 915, h: 300 }]) {
            const tag = vp.w + 'x' + vp.h;
            await page.setViewportSize({ width: vp.w, height: vp.h });
            await h.openSignupForm(page);
            await page.evaluate(() => {
              const btn = document.getElementById('btn-signup-to-step2');
              const cb = document.getElementById('signup-tos-checkbox');
              if (btn) btn.scrollIntoView({ block: 'end' });
              if (cb) cb.closest('label')?.scrollIntoView({ block: 'nearest' });
            });
            await page.waitForTimeout(60);
            const info = await page.evaluate((bound) => {
              function box(el) {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const top = document.elementFromPoint(cx, cy);
                return {
                  top: r.top, bottom: r.bottom, width: r.width, height: r.height,
                  inView: r.top >= -0.5 && r.bottom <= bound + 0.5 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.width > 0 && r.height > 0,
                  hit: !!(top && (top === el || el.contains(top)))
                };
              }
              return {
                cb: box(document.getElementById('signup-tos-checkbox')?.closest('label')),
                btn: box(document.getElementById('btn-signup-to-step2'))
              };
            }, vp.h);
            a.ok(info.cb && info.cb.inView, tag + ': the sign-up checkbox can be scrolled fully into view ' + JSON.stringify(info.cb));
            a.ok(info.btn && info.btn.inView && info.btn.hit, tag + ': Continue can be scrolled fully into view and is clickable ' + JSON.stringify(info.btn));
          }
        } finally {
          await page.setViewportSize(DEFAULT_VIEWPORT);
        }
      }
    }
  ]
};
