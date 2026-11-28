'use strict';

/**
 * Terms of Service consent (branch tos-consent-nov27).
 *  - Sign-up (step 1): the current Terms of Service sit in a scroll panel; the "I agree" checkbox unlocks only after the
 *    panel is scrolled to its end; Continue and Quick sign up are blocked until it is checked; the consent
 *    (tosAcceptedAt + tosVersion) is saved with the new account.
 *  - Existing accounts: a signed-in account with no tosAcceptedAt gets a blocking modal ONCE at login. Once an account has any
 *    tosAcceptedAt it is never prompted again, even when tosVersion changes.
 *  - A failed save (permission denied, network) keeps the modal up with an honest error and never shows success.
 * Mock Firestore only; never touches production.
 */

const { VERIFY_CODE } = require('../helpers/harness');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const SIGNUP_COVERS = ['el:#signup-tos-checkbox', 'el:label[onclick=none]'];
const MODAL_COVERS = ['el:#tos-consent-checkbox', 'el:#btn-tos-consent-agree', 'el:#btn-tos-consent-logout'];

const TEXT = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? (el.textContent || '').trim() : ''; }, sel);
const modalOpen = (page) => page.evaluate(() => !!(window.pixlyTos && window.pixlyTos.isOpen()));
const toastText = (page) => TEXT(page, '#toast-text');

async function waitModal(page, open, ms) {
  try { await page.waitForFunction((open) => !!(window.pixlyTos && window.pixlyTos.isOpen()) === open, open, { timeout: ms || 10000 }); return true; } catch (e) { return false; }
}
async function scrollPanelToEnd(page, sel) {
  await page.evaluate((sel) => { const p = document.querySelector(sel); p.scrollTop = p.scrollHeight; p.dispatchEvent(new Event('scroll')); }, sel);
  await page.waitForTimeout(60);
}
const cbDisabled = (page, sel) => page.evaluate((sel) => document.querySelector(sel).disabled, sel);

function login(page, account) {
  return page.evaluate((a) => {
    performLogin(a.username, a.fullName, a.email, null, a.phone, a.accountType);
  }, account);
}

// Mock Firestore + a chosen local/cloud consent state, restored afterwards.
async function scenario(ctx, opts, fn) {
  const { page, account } = ctx;
  const me = account.username;
  const o = opts || {};
  const seed = {};
  if (o.doc !== null) seed['users/' + me] = Object.assign({ username: me, accountType: account.accountType }, o.doc || {});
  (o.extraDocs || []).forEach((d) => { seed['users/' + d.username] = d; });
  await page.evaluate(installPixlyMockFirestore, seed);
  await page.evaluate(({ me, local, version }) => {
    window.__tosSnap = { version: window.PIXLY_TOS_VERSION };
    if (!local) localStorage.removeItem('pixly_tos_consent_' + me);
    if (version) window.PIXLY_TOS_VERSION = version;
  }, { me, local: !!o.local, version: o.version || '' });
  try { await fn(); } finally {
    await page.evaluate(() => { try { window.pixlyTos.hide(); } catch (e) {} });
    await page.evaluate(uninstallPixlyMockFirestore);
    await page.evaluate((me) => {
      if (window.__tosSnap) window.PIXLY_TOS_VERSION = window.__tosSnap.version;
      ['reg_personal', 'reg_business', 'reg_empty', 'pixlynote'].forEach((u) => {
        localStorage.setItem('pixly_tos_consent_' + u, JSON.stringify({ tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' }));
      });
      document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
    }, me);
  }
}
const mockDoc = (page, path) => page.evaluate((p) => JSON.parse(JSON.stringify(window.__pfs.docs[p] || null)), path);
const mockWrites = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__pfs.writes)));

async function fillSignup(page, h) {
  await h.openSignupForm(page);
  const uname = 'tos_new_' + String(Date.now()).slice(-8);
  await page.fill('#login-fullname', 'Tos New User');
  await page.fill('#signup-username', uname);
  await page.fill('#signup-password', 'TestPass123!');
  await page.fill('#login-email', uname + '@example.test');
  await page.evaluate(() => {
    document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('signup-username')?.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
    if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
  });
  await page.waitForTimeout(100);
  await page.click('#btn-signup-send-email-code');
  await page.waitForTimeout(250);
  await page.fill('#signup-email-code', VERIFY_CODE);
  await page.click('#btn-signup-verify-email-code');
  await page.waitForFunction(() => !!(window.state && state.signupVerify && state.signupVerify.emailVerified), null, { timeout: 5000 });
  await page.evaluate(() => { if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState(); });
  await page.waitForTimeout(80);
  return uname;
}

const MODAL_ACCOUNTS = ['personal', 'business', 'pixlynote'];

module.exports = {
  name: 'Terms of Service consent',
  tests: [
    // ---------------- Sign-up ----------------
    {
      name: 'ToS sign-up: the panel shows the current Terms; checkbox is disabled before scrolling to the end and enabled after',
      accounts: ['signed-out'],
      covers: SIGNUP_COVERS,
      async run({ page, h, a }) {
        await h.openSignupForm(page);
        const info = await page.evaluate(() => {
          const panel = document.getElementById('signup-tos-panel');
          const src = document.getElementById('policy-section-tos');
          const srcText = Array.from(src.children).slice(1).map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' ');
          return {
            sections: panel.children.length,
            srcSections: src.children.length - 1,
            same: panel.textContent.replace(/\s+/g, ' ').trim() === srcText,
            hasAcceptance: /ACCEPTANCE OF TERMS/.test(panel.textContent),
            overflow: panel.scrollHeight > panel.clientHeight + 20,
            updated: document.getElementById('signup-tos-updated').textContent
          };
        });
        a.ok(info.sections === info.srcSections && info.sections >= 9, 'All Terms of Service sections are in the panel: ' + JSON.stringify(info));
        a.ok(info.same, 'The panel text is exactly the Terms of Service text in Terms & Policies');
        a.ok(info.hasAcceptance, 'Section 1 (Acceptance of Terms) is shown');
        a.ok(info.overflow, 'The panel scrolls (the Terms are longer than the panel)');
        a.ok(/November 23, 2026/.test(info.updated), 'Last updated date is shown: ' + info.updated);
        a.ok(await cbDisabled(page, '#signup-tos-checkbox'), 'Checkbox is disabled before scrolling');
        await page.evaluate(() => { const p = document.getElementById('signup-tos-panel'); p.scrollTop = Math.floor(p.scrollHeight / 2); p.dispatchEvent(new Event('scroll')); });
        a.ok(await cbDisabled(page, '#signup-tos-checkbox'), 'Checkbox stays disabled when only halfway down');
        await scrollPanelToEnd(page, '#signup-tos-panel');
        a.ok(!(await cbDisabled(page, '#signup-tos-checkbox')), 'Checkbox is enabled after scrolling to the end');
        await page.check('#signup-tos-checkbox');
        a.ok(await page.evaluate(() => window.pixlySignupTos.isAccepted()), 'Checking it counts as agreeing');
        await page.evaluate(() => window.pixlySignupTos.reset());
        a.ok(await cbDisabled(page, '#signup-tos-checkbox'), 'Reset locks the checkbox again');
        a.ok(!(await page.evaluate(() => window.pixlySignupTos.isAccepted())), 'Reset clears the agreement');
      }
    },
    {
      name: 'ToS sign-up: the version constant matches the Terms "Last updated" date',
      accounts: ['signed-out'],
      covers: [],
      async run({ page, a }) {
        const r = await page.evaluate(() => {
          const sec = document.getElementById('policy-section-tos');
          const m = /Last updated:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(sec.textContent);
          const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
          const iso = m ? m[3] + '-' + String(months.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0') : '';
          return { iso, version: window.PIXLY_TOS_VERSION };
        });
        a.equal(r.version, r.iso, 'PIXLY_TOS_VERSION must be bumped whenever the Terms text date changes');
      }
    },
    {
      name: 'ToS sign-up: Continue and Quick sign up are blocked without consent (no account is created)',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-to-step2', 'el:#btn-signup-direct-submit'],
      async run({ page, h, a }) {
        const uname = await fillSignup(page, h);
        await page.click('#btn-signup-to-step2');
        await page.waitForTimeout(200);
        a.ok(!(await h.isVisible(page, '#signup-step-2')), 'Step 2 does not open without consent');
        a.ok(/Terms of Service/i.test(await toastText(page)), 'A toast asks the person to read and agree: ' + (await toastText(page)));
        await page.click('#btn-signup-direct-submit');
        await page.waitForTimeout(300);
        a.ok(!(await page.evaluate(() => !!(window.state && state.isLoggedIn))), 'Quick sign up does not sign in without consent');
        // Even if step 2 were forced open, Complete Sign Up still refuses without consent.
        await page.evaluate(() => {
          const s2 = document.getElementById('signup-step-2');
          s2.classList.remove('hidden'); s2.style.display = 'block';
          document.getElementById('btn-signup-complete').click();
        });
        await page.waitForTimeout(300);
        a.ok(!(await page.evaluate(() => !!(window.state && state.isLoggedIn))), 'Calling the submit directly does not sign in either');
        a.ok(!(await page.evaluate((u) => !!localStorage.getItem('pixly_account_' + u), uname)), 'No account record was saved');
        // Scrolled but not checked is still not consent.
        await scrollPanelToEnd(page, '#signup-tos-panel');
        await page.click('#btn-signup-direct-submit');
        await page.waitForTimeout(300);
        a.ok(!(await page.evaluate(() => !!(window.state && state.isLoggedIn))), 'Scrolling without checking the box is not consent');
      }
    },
    {
      name: 'ToS sign-up: consent is saved with the new account (tosAcceptedAt + tosVersion) and no modal follows',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-to-step2', 'el:#btn-signup-direct-submit', 'el:#btn-signup-complete'],
      async run({ page, h, a }) {
        await page.evaluate(installPixlyMockFirestore, {});
        try {
          const uname = await fillSignup(page, h);
          const before = Date.now();
          await h.acceptSignupTos(page);
          await page.click('#btn-signup-to-step2');
          await page.waitForSelector('#signup-step-2:not(.hidden)', { timeout: 3000 });
          await page.click('#btn-signup-complete');
          await page.waitForFunction((u) => !!(window.state && state.isLoggedIn && state.currentUser && String(state.currentUser.username).toLowerCase() === u), uname, { timeout: 8000 });
          await page.waitForTimeout(500);
          const doc = await mockDoc(page, 'users/' + uname);
          a.ok(doc && typeof doc.tosAcceptedAt === 'number' && doc.tosAcceptedAt >= before - 5000, 'The new account doc has tosAcceptedAt: ' + JSON.stringify(doc && { at: doc.tosAcceptedAt }));
          a.equal(doc.tosVersion, '2026-11-23', 'The new account doc has tosVersion');
          const local = await page.evaluate((u) => ({ rec: JSON.parse(localStorage.getItem('pixly_account_' + u) || '{}'), proof: JSON.parse(localStorage.getItem('pixly_tos_consent_' + u) || 'null') }), uname);
          a.ok(local.rec.tosAcceptedAt && local.rec.tosVersion === '2026-11-23', 'The local account record carries the consent');
          a.ok(local.proof && local.proof.tosAcceptedAt, 'Local proof of consent is stored');
          a.ok(!(await modalOpen(page)), 'No consent modal appears for an account that just agreed');
          a.ok(!(await page.evaluate(() => window.pixlySignupTos.isAccepted())), 'The sign-up form is reset for the next person');
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore);
        }
      }
    },
    {
      name: 'ToS sign-up: Quick sign up with consent also saves it',
      accounts: ['signed-out'],
      covers: ['el:#btn-signup-direct-submit'],
      async run({ page, h, a }) {
        await page.evaluate(installPixlyMockFirestore, {});
        try {
          const uname = await fillSignup(page, h);
          await h.acceptSignupTos(page);
          await page.click('#btn-signup-direct-submit');
          await page.waitForFunction((u) => !!(window.state && state.isLoggedIn && state.currentUser && String(state.currentUser.username).toLowerCase() === u), uname, { timeout: 8000 });
          await page.waitForTimeout(400);
          const doc = await mockDoc(page, 'users/' + uname);
          a.ok(doc && doc.tosAcceptedAt && doc.tosVersion === '2026-11-23', 'Quick sign up recorded the consent');
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore);
        }
      }
    },

    // ---------------- Existing accounts ----------------
    {
      name: 'ToS modal: an account with no tosAcceptedAt is blocked by the modal at login until it scrolls and checks',
      accounts: MODAL_ACCOUNTS,
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await login(page, account);
          const shown = await waitModal(page, true);
          const diag = shown ? '' : JSON.stringify(await page.evaluate(() => ({ li: state.isLoggedIn, u: state.currentUser && state.currentUser.username, pro: state.privilegedReadOnly, fr: window.firebaseReady, disp: document.getElementById('tos-consent-modal').style.display, cls: document.getElementById('tos-consent-modal').className.slice(0, 30), local: Object.keys(localStorage).filter((k) => /tos_consent/.test(k)), queue: (window._onFirebaseReadyQueue || []).length })));
          a.ok(shown, 'The consent modal appears for a legacy account ' + diag);
          const st = await page.evaluate(() => ({
            inertMain: document.getElementById('main-view').hasAttribute('inert'),
            sections: document.getElementById('tos-consent-panel').children.length,
            cbDisabled: document.getElementById('tos-consent-checkbox').disabled,
            agreeDisabled: document.getElementById('btn-tos-consent-agree').disabled,
            z: getComputedStyle(document.getElementById('tos-consent-modal')).zIndex
          }));
          a.ok(st.inertMain, 'The app behind the modal is blocked');
          a.ok(st.sections >= 9, 'The Terms are shown in the modal');
          a.ok(st.cbDisabled && st.agreeDisabled, 'Checkbox and Agree are disabled before scrolling');
          await scrollPanelToEnd(page, '#tos-consent-panel');
          a.ok(!(await cbDisabled(page, '#tos-consent-checkbox')), 'Checkbox is enabled after scrolling to the end');
          a.ok(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled), 'Agree stays disabled until the box is checked');
          await page.check('#tos-consent-checkbox');
          a.ok(!(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled)), 'Agree turns on once the box is checked');
        });
      }
    },
    {
      name: 'ToS modal: the modal cannot be dismissed with Escape or a tap outside',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, a, account } = ctx;
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'modal is open');
          await page.keyboard.press('Escape');
          await page.mouse.click(2, 2);
          await page.waitForTimeout(250);
          a.ok(await modalOpen(page), 'Escape and an outside tap do not close it');
        });
      }
    },
    {
      name: 'ToS modal: agreeing saves tosAcceptedAt + tosVersion to the account, closes the modal, and it never returns',
      accounts: MODAL_ACCOUNTS,
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        const me = account.username;
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'modal is open');
          await scrollPanelToEnd(page, '#tos-consent-panel');
          await page.check('#tos-consent-checkbox');
          const before = Date.now();
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitModal(page, false), 'The modal closes after the save succeeds');
          const doc = await mockDoc(page, 'users/' + me);
          a.ok(typeof doc.tosAcceptedAt === 'number' && doc.tosAcceptedAt >= before - 2000, 'tosAcceptedAt saved on the user doc');
          a.equal(doc.tosVersion, '2026-11-23', 'tosVersion saved on the user doc');
          const writes = (await mockWrites(page)).filter((w) => w.path === 'users/' + me && w.data && 'tosAcceptedAt' in w.data);
          a.equal(writes.length, 1, 'Exactly one consent write to the account doc');
          a.equal(Object.keys(writes[0].data).sort().join(','), 'tosAcceptedAt,tosVersion', 'Only the two consent fields are written');
          a.ok(/agreed/i.test(await toastText(page)), 'A success toast shows only after the save: ' + (await toastText(page)));
          a.ok(!(await page.evaluate(() => document.getElementById('main-view').hasAttribute('inert'))), 'The app is usable again');
          // Login again: no second prompt.
          await login(page, account);
          a.ok(!(await waitModal(page, true, 700)), 'Not asked again at the next login');
          // Even with the local proof gone, the cloud record keeps it quiet.
          await page.evaluate((me) => localStorage.removeItem('pixly_tos_consent_' + me), me);
          await login(page, account);
          a.ok(!(await waitModal(page, true, 700)), 'Not asked again when only the cloud record remains');
        });
      }
    },
    {
      name: 'ToS modal: an account that already agreed is not prompted (cloud record, and local proof alone)',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, a, account } = ctx;
        await scenario(ctx, { doc: { tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' }, local: false }, async () => {
          await login(page, account);
          a.ok(!(await waitModal(page, true, 800)), 'No modal for an account whose doc has tosAcceptedAt');
          const proof = await page.evaluate((me) => !!localStorage.getItem('pixly_tos_consent_' + me), account.username);
          a.ok(proof, 'The cloud consent is remembered locally');
        });
        await scenario(ctx, { doc: {}, local: true }, async () => {
          await login(page, account);
          a.ok(!(await waitModal(page, true, 800)), 'No modal when this device already holds proof of consent');
        });
      }
    },
    {
      name: 'ToS modal: a version bump does NOT re-prompt a consented account (and a new consent records the current version)',
      accounts: ['personal', 'pixlynote'],
      covers: [],
      async run(ctx) {
        const { page, a, account } = ctx;
        // Agreed to an older version; the app now ships a newer one.
        await scenario(ctx, { doc: { tosAcceptedAt: 1700000000000, tosVersion: '2020-01-01' }, local: false, version: '2026-12-31' }, async () => {
          await login(page, account);
          a.ok(!(await waitModal(page, true, 800)), 'Older tosVersion on file does not re-prompt');
          const doc = await mockDoc(page, 'users/' + account.username);
          a.equal(doc.tosVersion, '2020-01-01', 'The stored version is left alone (no silent rewrite)');
        });
        // Consented under the current version; the constant is bumped later.
        await scenario(ctx, { doc: { tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' }, local: true, version: '2027-06-01' }, async () => {
          await login(page, account);
          a.ok(!(await waitModal(page, true, 800)), 'Bumping the version does not re-prompt');
        });
        // A consent given now records whichever version is current.
        await scenario(ctx, { doc: {}, local: false, version: '2027-06-01' }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'A never-consented account is still prompted under a newer version');
          await scrollPanelToEnd(page, '#tos-consent-panel');
          await page.check('#tos-consent-checkbox');
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitModal(page, false), 'modal closes');
          const doc = await mockDoc(page, 'users/' + account.username);
          a.equal(doc.tosVersion, '2027-06-01', 'tosVersion records the version agreed to');
        });
      }
    },
    {
      name: 'ToS modal: save fails with permission denied -> modal stays, honest error, no success, nothing saved; retry works',
      accounts: ['personal', 'pixlynote'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'modal is open');
          await page.evaluate(() => {
            window.__origSetDoc = window.firebase.setDoc;
            window.firebase.setDoc = async () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };
          });
          await page.evaluate(() => { document.getElementById('toast-text').textContent = ''; });
          await scrollPanelToEnd(page, '#tos-consent-panel');
          await page.check('#tos-consent-checkbox');
          await page.click('#btn-tos-consent-agree');
          await page.waitForSelector('#tos-consent-error:not(.hidden)', { timeout: 3000 });
          const err = await TEXT(page, '#tos-consent-error');
          a.ok(/permission denied/i.test(err), 'The error says permission was denied: ' + err);
          a.ok(await modalOpen(page), 'The modal stays up');
          a.ok(!/agreed/i.test(await toastText(page)), 'No success toast');
          const doc = await mockDoc(page, 'users/' + account.username);
          a.ok(!doc.tosAcceptedAt, 'Nothing was recorded on the account');
          a.ok(!(await page.evaluate((me) => !!localStorage.getItem('pixly_tos_consent_' + me), account.username)), 'No local proof was stored');
          a.ok(!(await page.evaluate(() => document.getElementById('btn-tos-consent-agree').disabled)), 'Agree is available again to retry');
          // Retry after the problem is fixed.
          await page.evaluate(() => { window.firebase.setDoc = window.__origSetDoc; });
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitModal(page, false), 'The retry saves and closes the modal');
          a.ok((await mockDoc(page, 'users/' + account.username)).tosAcceptedAt, 'Consent recorded after the retry');
        });
      }
    },
    {
      name: 'ToS modal: save fails on the network -> modal stays with a connection error and no success',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, a, account } = ctx;
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'modal is open');
          await page.evaluate(() => {
            window.firebase.setDoc = async () => { const e = new Error('Failed to get document because the client is offline.'); e.code = 'unavailable'; throw e; };
            document.getElementById('toast-text').textContent = '';
          });
          await scrollPanelToEnd(page, '#tos-consent-panel');
          await page.check('#tos-consent-checkbox');
          await page.click('#btn-tos-consent-agree');
          await page.waitForSelector('#tos-consent-error:not(.hidden)', { timeout: 3000 });
          a.ok(/no connection/i.test(await TEXT(page, '#tos-consent-error')), 'The error says there is no connection');
          a.ok(await modalOpen(page), 'The modal stays up');
          a.ok(!/agreed/i.test(await toastText(page)), 'No success toast');
          a.ok(!(await page.evaluate((me) => !!localStorage.getItem('pixly_tos_consent_' + me), account.username)), 'No local proof was stored');
        });
      }
    },
    {
      name: 'ToS modal: Log out from the modal works and records nothing',
      accounts: ['personal'],
      covers: ['el:#btn-tos-consent-logout'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'modal is open');
          await page.click('#btn-tos-consent-logout');
          await page.waitForTimeout(300);
          a.ok(!(await modalOpen(page)), 'The modal closes');
          a.ok(!(await page.evaluate(() => !!state.isLoggedIn)), 'The person is logged out');
          a.ok(await h.isVisible(page, '#auth-view'), 'The welcome screen is shown');
          a.ok(!(await page.evaluate(() => document.getElementById('auth-view').hasAttribute('inert'))), 'The welcome screen is usable');
          a.ok(!(await mockDoc(page, 'users/' + account.username)).tosAcceptedAt, 'No consent was recorded');
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS modal: switching to another never-consented account asks that account, and saves to its own doc',
      accounts: ['personal'],
      covers: MODAL_COVERS,
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const other = h.ACCOUNTS.empty;
        await scenario(ctx, { doc: { tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23' }, local: false, extraDocs: [{ username: other.username, accountType: other.accountType }] }, async () => {
          await page.evaluate((u) => localStorage.removeItem('pixly_tos_consent_' + u), other.username);
          await login(page, account);
          a.ok(!(await waitModal(page, true, 600)), 'Consented account is not prompted');
          await login(page, other);
          a.ok(await waitModal(page, true), 'The other, never-consented account is prompted');
          await scrollPanelToEnd(page, '#tos-consent-panel');
          await page.check('#tos-consent-checkbox');
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitModal(page, false), 'modal closes');
          a.ok((await mockDoc(page, 'users/' + other.username)).tosAcceptedAt, 'Saved on the account that was prompted');
          const mine = await mockDoc(page, 'users/' + account.username);
          a.equal(mine.tosAcceptedAt, 1764000000000, 'The other account doc is untouched');
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS modal: privileged read-only viewing, a cloud read error, and signed-out visitors are not blocked',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        // Cloud read error: a blip never locks anyone out.
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await page.evaluate(() => { window.firebase.getDoc = async () => { throw new Error('boom'); }; });
          await login(page, account);
          a.ok(!(await waitModal(page, true, 800)), 'A failed cloud read does not show the modal');
        });
        // Privileged read-only session: the viewer is not the account holder.
        await scenario(ctx, { doc: {}, local: false }, async () => {
          const shown = await page.evaluate(async (acc) => {
            await window.pixlyTos.checkAfterLogin(acc.username, { privilegedReadOnly: true, viewer: 'pixlynote', grants: ['like'] });
            return window.pixlyTos.isOpen();
          }, account);
          a.ok(!shown, 'No modal in a read-only privileged session');
        });
        await h.loginAs(page, account);
      }
    },
    {
      name: 'ToS modal: a missing account doc counts as never consented',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, a, account } = ctx;
        await scenario(ctx, { doc: null, local: false }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'The modal appears when there is no consent on record');
        });
      }
    },
    {
      name: 'ToS modal: @pixlynote keeps its admin tools after agreeing',
      accounts: ['pixlynote'],
      covers: [],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await scenario(ctx, { doc: {}, local: false }, async () => {
          await login(page, account);
          a.ok(await waitModal(page, true), 'modal is open for @pixlynote too');
          await scrollPanelToEnd(page, '#tos-consent-panel');
          await page.check('#tos-consent-checkbox');
          await page.click('#btn-tos-consent-agree');
          a.ok(await waitModal(page, false), 'modal closes');
        });
        await h.openOwnerMenu(page);
        const tools = await page.evaluate(() => {
          const vis = (id) => { const el = document.getElementById(id); return !!(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'); };
          return { metrics: vis('drawer-pixlynote-metrics'), deact: vis('drawer-pixlynote-deactivations'), verif: vis('drawer-pixlynote-verifications') };
        });
        a.ok(tools.metrics && tools.deact && tools.verif, 'Admin cards are still in the owner menu: ' + JSON.stringify(tools));
        await h.closeOverlays(page);
      }
    }
  ]
};

// Signed-out tests start from a freshly loaded welcome screen, whatever earlier suites left on the page.
module.exports.tests.forEach((t) => {
  if (!(t.accounts || []).includes('signed-out')) return;
  const orig = t.run;
  t.run = async (ctx) => {
    const port = Number(new URL(ctx.page.url()).port);
    await ctx.h.resetToSignedOut(ctx.page, { port });
    return orig(ctx);
  };
});
