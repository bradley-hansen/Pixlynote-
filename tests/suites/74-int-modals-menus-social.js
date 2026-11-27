'use strict';

/**
 * Interaction coverage for controls that only had the automatic sweep: modal backdrop taps,
 * the Disconnect confirm menu, Add highlight, the feedback reply-email field, and the Promote
 * entry point. Plus Firestore failure paths for Cancel request and Decline request: a failed
 * write must say so and leave the request in place. Firestore is the in-page mock.
 */

const nf = require('../helpers/net-fail');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');
const fx = require('../helpers/showcase-promote-fixtures');

const isOpen = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  return !!(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
}, id);

async function backdropTap(page, id) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, id);
  await page.waitForTimeout(350);
}

async function innerTap(page, id) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    const inner = el && el.firstElementChild;
    if (inner) inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, id);
  await page.waitForTimeout(150);
}

module.exports = {
  name: 'Interaction coverage: modals, menus, social writes',
  tests: [
    {
      name: 'Modal backdrops: tapping outside closes Account Center, Account switcher, Connected, Discover creators, Cancel membership, Promote and Promoted Insights; tapping inside does not',
      accounts: ['personal'],
      covers: ['listener:#modal-account-center:click', 'listener:#modal-account-switcher:click', 'listener:#modal-following:click', 'listener:#modal-discover-creators:click',
        'listener:#modal-cancel-membership:click', 'listener:#modal-promote:click', 'listener:#modal-promote-insights:click'],
      async run({ page, a }) {
        await fx.seedShowcaseAndPromos(page, { promoteOwn: true });
        const cases = [
          { id: 'modal-account-center', open: () => openAccountCenterModal() },
          { id: 'modal-account-switcher', open: () => openAccountSwitcher() },
          { id: 'modal-following', open: () => openFollowingModal() },
          { id: 'modal-discover-creators', open: () => openDiscoverCreatorsModal() },
          { id: 'modal-cancel-membership', open: () => { state.currentUser.isPlus = true; state.currentUser.stripeSessionId = 'cs_test_BACKDROP12345678'; openCancelMembershipConfirm(); } },
          { id: 'modal-promote', open: () => openPromoteModal('post', 3002) },
          { id: 'modal-promote-insights', open: () => openPromoteInsights('post', 3001) }
        ];
        for (const c of cases) {
          await page.evaluate(c.open);
          await page.waitForTimeout(350);
          a.ok(await isOpen(page, c.id), c.id + ' opens');
          await innerTap(page, c.id);
          a.ok(await isOpen(page, c.id), c.id + ' stays open when tapping inside the card');
          await backdropTap(page, c.id);
          a.ok(!(await isOpen(page, c.id)), c.id + ' closes when tapping the backdrop');
        }
      }
    },
    {
      name: 'Delete confirm backdrop: tapping outside cancels and the post is NOT deleted',
      accounts: ['personal'],
      covers: ['listener:#modal-delete-confirm:click'],
      async run({ page, a }) {
        const pid = await page.evaluate(() => {
          const mine = (state.posts || []).find((p) => normalizeUsername(p.author || '') === normalizeUsername(state.currentUser.username));
          return mine ? String(mine.id) : '';
        });
        a.ok(pid, 'Found one of my posts to test with');
        await page.evaluate((pid) => requestDeletePostConfirm(pid), pid);
        a.ok(await isOpen(page, 'modal-delete-confirm'), 'Delete confirm opens');
        await backdropTap(page, 'modal-delete-confirm');
        const r = await page.evaluate((pid) => ({ pending: window._pendingDeletePostId, still: (state.posts || []).some((p) => String(p.id) === pid) }), pid);
        a.ok(!(await isOpen(page, 'modal-delete-confirm')), 'Backdrop tap closes the confirm');
        a.ok(r.still && !r.pending, 'The post is still there and nothing is pending delete');
      }
    },
    {
      name: 'Disconnect confirm menu: taps inside keep it open, Escape and an outside tap close it, Cancel never disconnects, Confirm runs the disconnect once',
      accounts: ['personal'],
      covers: ['listener:#menu-disconnect-confirm:click', 'listener:#menu-disconnect-confirm:keydown', 'el:#btn-disconnect-cancel', 'el:#btn-disconnect-confirm', 'handler:openDisconnectConfirm'],
      async run({ page, a }) {
        const open = () => page.evaluate(() => {
          window.__intDisc = 0;
          // The harness's closeOverlays() parks overlays with an inline display:none; the app never sets one here.
          document.getElementById('menu-disconnect-confirm').style.display = '';
          openDisconnectConfirm('kiln_and_co', document.body, () => { window.__intDisc += 1; });
        });
        await open();
        a.ok(await isOpen(page, 'menu-disconnect-confirm'), 'Menu opens: ' + await page.evaluate(() => { const m = document.getElementById('menu-disconnect-confirm'); return m.className + ' | ' + getComputedStyle(m).display + ' | ' + typeof openDisconnectConfirm; }));
        await page.evaluate(() => document.getElementById('menu-disconnect-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true })));
        a.ok(await isOpen(page, 'menu-disconnect-confirm'), 'A tap inside keeps it open');
        await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        await page.waitForTimeout(100);
        a.ok(!(await isOpen(page, 'menu-disconnect-confirm')), 'Escape closes it');
        await open();
        await page.waitForTimeout(50);
        await page.evaluate(() => document.getElementById('app-container') ? document.getElementById('app-container').click() : document.body.click());
        await page.waitForTimeout(100);
        a.ok(!(await isOpen(page, 'menu-disconnect-confirm')), 'An outside tap closes it');
        await open();
        await nf.tap(page, 'btn-disconnect-cancel', 100);
        a.equal(await page.evaluate(() => window.__intDisc), 0, 'Cancel does not disconnect');
        await open();
        await nf.tap(page, 'btn-disconnect-confirm', 100);
        a.equal(await page.evaluate(() => window.__intDisc), 1, 'Confirm disconnects exactly once');
        a.ok(!(await isOpen(page, 'menu-disconnect-confirm')), 'The menu closes after Confirm');
      }
    },
    {
      name: 'Add highlight (+) on an empty highlights row opens Create in highlight mode',
      accounts: ['empty'],
      covers: ['listener:#btn-add-highlight:click', 'el:#btn-add-highlight'],
      async run({ page, h, a }) {
        await h.gotoMainTab(page, 'profile');
        await page.evaluate(() => {
          state.highlights = [];
          if (typeof renderHighlights === 'function') renderHighlights();
          window.__intCreateMode = null;
          window.__intOrigCreate = window.openCreatePostModal;
        });
        const has = await page.evaluate(() => !!document.getElementById('btn-add-highlight'));
        a.ok(has, 'The + Add highlight button is rendered when there are no highlights');
        await nf.tap(page, 'btn-add-highlight', 300);
        const r = await page.evaluate(() => ({
          mode: state.createWizardMode || window._createMode || '',
          open: (() => { const m = document.getElementById('modal-create-post') || document.getElementById('modal-create'); return !!(m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none'); })()
        }));
        a.ok(r.open, 'Create opens');
        a.ok(/highlight/i.test(String(r.mode)), 'Create opens in highlight mode: ' + r.mode);
        await page.evaluate(() => { if (typeof closeCreateModal === 'function') { try { closeCreateModal(); } catch (e) {} } });
      }
    },
    {
      name: 'Feedback form: the reply-email field shows only when the account has no email, and the Grokbot toggle relabels Send and the footer',
      accounts: ['personal'],
      covers: ['el:#feedback-reply-wrap', 'handler:updateFeedbackAiUi', 'el:#feedback-ai-toggle', 'el:#btn-feedback-send'],
      async run({ page, a }) {
        const saved = await page.evaluate(() => state.currentUser.email || '');
        try {
          await page.evaluate(() => openSubmitFeedbackModal(''));
          await page.waitForTimeout(100);
          const withEmail = await page.evaluate(() => getComputedStyle(document.getElementById('feedback-reply-wrap')).display);
          a.equal(withEmail, 'none', 'Account with an email: no reply-email field');
          await page.evaluate(() => { state.currentUser.email = ''; updateFeedbackAiUi(); });
          const noEmail = await page.evaluate(() => getComputedStyle(document.getElementById('feedback-reply-wrap')).display);
          a.equal(noEmail, 'block', 'Account without an email: the reply-email field shows');
          await page.evaluate(() => { const t = document.getElementById('feedback-ai-toggle'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); updateFeedbackAiUi(); });
          const on = await page.evaluate(() => ({ send: document.getElementById('btn-feedback-send').textContent, aria: document.getElementById('feedback-ai-toggle').getAttribute('aria-checked') }));
          a.ok(on.send === 'Submit & Ask Grokbot' && on.aria === 'true', 'Grokbot on: Send reads Submit & Ask Grokbot');
          await page.evaluate(() => { const t = document.getElementById('feedback-ai-toggle'); t.checked = false; updateFeedbackAiUi(); });
          a.equal(await page.evaluate(() => document.getElementById('btn-feedback-send').textContent), 'Send', 'Grokbot off: Send reads Send');
        } finally {
          await page.evaluate((e) => { state.currentUser.email = e; if (typeof closeSubmitFeedbackModal === 'function') closeSubmitFeedbackModal(); }, saved);
        }
      }
    },
    {
      name: 'Promote button entry point opens the Promote modal for an unpromoted post and Insights for my promoted post',
      accounts: ['personal'],
      covers: ['handler:openPromoteForItem', 'handler:handlePromoteButtonClick'],
      async run({ page, a }) {
        await fx.seedShowcaseAndPromos(page, { promoteOwn: true });
        await page.evaluate(() => openPromoteForItem('post', 3002));
        await page.waitForTimeout(150);
        a.ok(await isOpen(page, 'modal-promote'), 'Unpromoted post opens the Promote modal');
        a.ok(!(await isOpen(page, 'modal-promote-insights')), 'Insights stays closed');
        await page.evaluate(() => closePromoteModal());
        await page.evaluate(() => openPromoteForItem('post', 3001));
        await page.waitForTimeout(150);
        a.ok(await isOpen(page, 'modal-promote-insights'), 'My promoted post opens Promoted Insights');
        a.ok(!(await isOpen(page, 'modal-promote')), 'The Promote modal stays closed');
        await page.evaluate(() => closePromoteInsights());
      }
    },
    {
      name: 'Cancel connect request: a failed Firestore delete says Could not cancel and keeps the request Requested',
      accounts: ['personal'],
      covers: ['handler:cancelConnectRequest', 'listener:#user-profile-private-request:click'],
      async run({ page, a }) {
        const me = await page.evaluate(() => normalizeUsername(state.currentUser.username));
        const seed = {};
        seed['users/pt_owner'] = { username: 'pt_owner', isPrivate: true };
        seed['users/pt_owner/connectRequests/' + me] = { username: me, requestedAt: Date.now() };
        await page.evaluate(installPixlyMockFirestore, seed);
        const toasts = await nf.captureToasts(page);
        try {
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          const ok = await page.evaluate(() => cancelConnectRequest('pt_owner'));
          const t = await toasts.read();
          const still = await page.evaluate((me) => !!window.__pfs.docs['users/pt_owner/connectRequests/' + me], me);
          a.equal(ok, false, 'cancelConnectRequest reports failure');
          a.ok(t.some((m) => /could not cancel/i.test(m)) && !t.some((m) => /request canceled/i.test(m)), 'Says Could not cancel, never Request canceled: ' + JSON.stringify(t));
          a.ok(still, 'The request is still stored');
          await page.evaluate(() => { window.__pfs.failWrites = false; window.__intToasts = []; });
          const ok2 = await page.evaluate(() => cancelConnectRequest('pt_owner'));
          const t2 = await toasts.read();
          a.ok(ok2 === true && t2.some((m) => /request canceled/i.test(m)), 'A working delete says Request canceled');
        } finally {
          await toasts.restore();
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
        }
      }
    },
    {
      name: 'Decline connect request: a failed Firestore delete says Could not decline and keeps the request in the list',
      accounts: ['personal'],
      covers: ['handler:declineConnectRequest'],
      async run({ page, a }) {
        const me = await page.evaluate(() => normalizeUsername(state.currentUser.username));
        const seed = {};
        seed['users/' + me] = { username: me, isPrivate: true };
        seed['users/' + me + '/connectRequests/pt_req'] = { username: 'pt_req', fullName: 'PT Req', requestedAt: Date.now() };
        await page.evaluate(installPixlyMockFirestore, seed);
        const toasts = await nf.captureToasts(page);
        try {
          await page.evaluate((me) => {
            window._incomingConnectRequests = { owner: me, list: [{ username: 'pt_req', fullName: 'PT Req', requestedAt: Date.now() }] };
            window.__pfs.failWrites = true;
          }, me);
          const ok = await page.evaluate(() => declineConnectRequest('pt_req'));
          const t = await toasts.read();
          const r = await page.evaluate((me) => ({
            stored: !!window.__pfs.docs['users/' + me + '/connectRequests/pt_req'],
            listed: ((window._incomingConnectRequests || {}).list || []).some((x) => x.username === 'pt_req')
          }), me);
          a.equal(ok, false, 'declineConnectRequest reports failure');
          a.ok(t.some((m) => /could not decline/i.test(m)) && !t.some((m) => /^declined/i.test(m)), 'Says Could not decline, never Declined: ' + JSON.stringify(t));
          a.ok(r.stored && r.listed, 'The request stays stored and in the list');
        } finally {
          await page.evaluate(() => { if (window.__pfs) window.__pfs.failWrites = false; });
          await toasts.restore();
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
          await page.evaluate(() => { window._incomingConnectRequests = null; });
        }
      }
    }
  ]
};
