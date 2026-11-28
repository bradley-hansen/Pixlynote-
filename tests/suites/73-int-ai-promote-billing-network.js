'use strict';

/**
 * Interaction failure paths: Suggest with Gemini (caption AI), Pixlynote AI chat, Promote checkout,
 * Promoted Insights live stats, and Cancel Membership. A failed Worker call must show an error and
 * must never invent captions or replies, start a checkout, inflate stats, or say charges stopped.
 * Worker calls are fulfilled locally; Gemini and Stripe are never contacted.
 */

const nf = require('../helpers/net-fail');
const fx = require('../helpers/showcase-promote-fixtures');

async function tinyJpeg(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const g = c.getContext('2d'); g.fillStyle = '#c84'; g.fillRect(0, 0, 8, 8);
    return c.toDataURL('image/jpeg', 0.8);
  });
}

async function openCreateWithImage(page) {
  const src = await tinyJpeg(page);
  await page.evaluate((src) => {
    if (typeof openCreateModal === 'function') { try { openCreateModal(); } catch (e) {} }
    state.selectedCreateImage = src;
    try { localStorage.removeItem(aiCaptionUsageKey()); } catch (e) {}
    try { localStorage.removeItem('pixai_gemini_key'); } catch (e) {}
    const inp = document.getElementById('create-caption-input'); if (inp) inp.value = '';
  }, src);
}

const captionUi = (page) => page.evaluate(() => ({
  status: ((document.getElementById('create-caption-ai-status') || {}).textContent || '').trim(),
  chips: Array.from(document.querySelectorAll('#create-caption-ai-chips button')).map((b) => b.textContent.trim()),
  btnDisabled: !!(document.getElementById('btn-caption-gemini') || {}).disabled,
  caption: ((document.getElementById('create-caption-input') || {}).value || '')
}));

async function grantPlus(page) {
  await page.evaluate(() => {
    const cur = state.currentUser;
    cur.isVerified = true; cur.isPlus = true; cur.isBusinessPlus = false; cur.subscriptionStatus = 'active';
    cur.stripeSessionId = 'cs_test_INTFAIL1234567890';
    cur.stripeSubscriptionId = 'sub_test_intfail1';
    cur.stripeCurrentPeriodEnd = Math.floor(Date.parse('2026-12-23T17:00:00-05:00') / 1000);
    cur.stripeCancelAtPeriodEnd = false;
  });
}

module.exports = {
  name: 'Interaction failure paths: AI, Promote, billing',
  tests: [
    {
      name: 'Suggest with Gemini: rate limit, 500, bad gateway and offline show an error, add no caption chips, and leave the caption untouched',
      accounts: ['personal'],
      covers: ['el:#btn-caption-gemini', 'handler:suggestCaptionsWithGemini', 'el:#create-caption-ai-status', 'el:#create-caption-ai-chips'],
      async run({ page, a }) {
        await openCreateWithImage(page);
        const cases = [
          { mode: 'http429', re: /limit/i },
          { mode: 'http500', re: /couldn.t get a suggestion/i },
          { mode: 'badJson', re: /couldn.t get a suggestion/i },
          { mode: 'network', re: /couldn.t get a suggestion/i },
          { mode: { status: 200, body: { captions: [] } }, re: /couldn.t get a suggestion/i }
        ];
        for (const c of cases) {
          await nf.withWorker(page, '/ai/caption', c.mode, async (r) => {
            await nf.tap(page, 'btn-caption-gemini', 900);
            a.equal(r.calls.length, 1, 'one caption request');
          });
          const ui = await captionUi(page);
          const label = typeof c.mode === 'string' ? c.mode : 'empty captions';
          a.ok(c.re.test(ui.status), label + ': shows the error, got "' + ui.status + '"');
          a.equal(ui.chips.length, 0, label + ': no caption chips are invented');
          a.equal(ui.caption, '', label + ': the caption box is untouched');
          a.ok(!ui.btnDisabled, label + ': the button is enabled again');
        }
        await nf.withWorker(page, '/ai/caption', { status: 200, body: { captions: ['Golden hour on the pier #sunset #pier'] } }, async () => {
          await nf.tap(page, 'btn-caption-gemini', 900);
        });
        const ok = await captionUi(page);
        a.ok(ok.chips.length === 1 && /tap one/i.test(ok.status), 'A real reply shows the suggestion chip: ' + ok.status);
        await page.evaluate(() => { const b = document.querySelector('#create-caption-ai-chips button'); if (b) b.click(); });
        a.equal((await captionUi(page)).caption, 'Golden hour on the pier #sunset #pier', 'Tapping the chip fills the caption');
        await page.evaluate(() => { try { localStorage.removeItem(aiCaptionUsageKey()); } catch (e) {} if (typeof closeCreateModal === 'function') { try { closeCreateModal(); } catch (e) {} } });
      }
    },
    {
      name: 'Pixlynote AI chat Send: rate limit, 500, bad gateway, offline and empty replies show an error bubble and never a made-up answer',
      accounts: ['personal'],
      covers: ['el:#btn-pixai-send', 'el:#pixai-chat-input', 'el:#pixai-chat-form', 'handler:submitPixaiMessage', 'el:#pixai-messages-container'],
      async run({ page, a }) {
        await page.evaluate(() => { try { localStorage.removeItem('pixai_gemini_key'); } catch (e) {} });
        const cases = ['http429', 'http500', 'badJson', 'network', { status: 200, body: { reply: '' } }];
        for (const mode of cases) {
          const before = await page.evaluate(() => document.querySelectorAll('#pixai-messages-container > div').length);
          await nf.setValue(page, 'pixai-chat-input', 'Give me a caption for a beach photo');
          await nf.withWorker(page, '/ai/chat', mode, async (r) => {
            await nf.tap(page, 'btn-pixai-send', 600);
            a.equal(r.calls.length, 1, 'one chat request');
          });
          const ui = await page.evaluate((before) => {
            const kids = Array.from(document.querySelectorAll('#pixai-messages-container > div')).slice(before);
            return {
              added: kids.length,
              lastIsError: !!(kids.length && kids[kids.length - 1].classList.contains('pixai-error-bubble')),
              lastText: kids.length ? (kids[kids.length - 1].textContent || '').trim() : '',
              thinking: !!document.getElementById('pixai-thinking-indicator'),
              input: (document.getElementById('pixai-chat-input') || {}).value || ''
            };
          }, before);
          const label = typeof mode === 'string' ? mode : 'empty reply';
          a.ok(ui.lastIsError, label + ': the reply is an error bubble, got "' + ui.lastText + '"');
          a.ok(!/Pixlynote AI Idea|Caption Concept/i.test(ui.lastText), label + ': no canned answer');
          a.ok(!ui.thinking, label + ': the thinking indicator is removed');
          a.equal(ui.input, '', label + ': the input is cleared after sending');
        }
        const before = await page.evaluate(() => document.querySelectorAll('#pixai-messages-container > div').length);
        await nf.setValue(page, 'pixai-chat-input', 'hello');
        await nf.withWorker(page, '/ai/chat', { status: 200, body: { reply: 'Hi there from Gemini' } }, async () => { await nf.tap(page, 'btn-pixai-send', 600); });
        const ok = await page.evaluate((before) => {
          const kids = Array.from(document.querySelectorAll('#pixai-messages-container > div')).slice(before);
          const last = kids[kids.length - 1];
          return { text: last ? last.textContent : '', err: !!(last && last.classList.contains('pixai-error-bubble')) };
        }, before);
        a.ok(!ok.err && /Hi there from Gemini/.test(ok.text), 'A real reply is shown as the AI answer');
      }
    },
    {
      name: 'Promote checkout: 500, Stripe not configured, bad gateway, offline and a non-Stripe URL show an error, never navigate, and re-enable the button',
      accounts: ['personal'],
      covers: ['el:#btn-promote-checkout', 'handler:startPromoteCheckout', 'el:#promote-error'],
      async run({ page, h, a }) {
        await fx.seedShowcaseAndPromos(page, { promoteOwn: false });
        await page.evaluate(() => {
          window.__pixlyNav = [];
          window.__pixlyPromoteIdToken = async () => 'test-id-token-not-real-0123456789';
          window.__pixlyPromoteNavigate = (u) => window.__pixlyNav.push(u);
        });
        const cases = ['http500', { status: 503, body: { ok: false, error: 'stripe_not_configured' } }, 'badJson', 'network', { status: 200, body: { ok: true, url: 'https://evil.example/checkout' } }];
        try {
          for (const mode of cases) {
            await page.evaluate(() => { openPromoteModal('post', 3002); setPromoteAmount(25); const e = document.getElementById('promote-error'); if (e) e.textContent = ''; });
            await nf.withWorker(page, '/promote/checkout', mode, async (r) => {
              await nf.tap(page, 'btn-promote-checkout', 400);
              a.equal(r.calls.length, 1, 'one checkout request');
            });
            const ui = await page.evaluate(() => ({
              nav: window.__pixlyNav.length,
              err: (document.getElementById('promote-error') || {}).textContent || '',
              open: !document.getElementById('modal-promote').classList.contains('hidden'),
              btn: !!document.getElementById('btn-promote-checkout').disabled
            }));
            const label = typeof mode === 'string' ? mode : JSON.stringify(mode.body);
            a.equal(ui.nav, 0, label + ': no redirect to a checkout page');
            a.ok(ui.open && ui.err.trim().length > 0, label + ': the modal stays open with an error, got "' + ui.err + '"');
            a.ok(!/promotion started/i.test(ui.err), label + ': never says the promotion started');
            a.ok(!ui.btn, label + ': Checkout is enabled again');
          }
        } finally {
          await page.evaluate(() => { if (typeof closePromoteModal === 'function') closePromoteModal(); delete window.__pixlyPromoteIdToken; delete window.__pixlyPromoteNavigate; });
        }
      }
    },
    {
      name: 'Promoted Insights: a failed live stats call keeps the stored view count instead of inventing one',
      accounts: ['personal'],
      covers: ['handler:refreshPromoteInsights', 'handler:openPromoteInsights', 'el:#promote-insights-views'],
      async run({ page, a }) {
        await fx.seedShowcaseAndPromos(page, { promoteOwn: true });
        for (const mode of ['http500', 'badJson', 'network', { status: 200, body: { ok: false, found: true, count: 99999 } }]) {
          await nf.withWorker(page, '/promote/stats', mode, async () => {
            await page.evaluate(() => openPromoteInsights('post', 3001));
            await page.waitForTimeout(300);
          });
          const views = await nf.textOf(page, 'promote-insights-views');
          const label = typeof mode === 'string' ? mode : 'ok:false';
          a.ok(/^1,234 \/ 7,000 views$/.test(views), label + ': shows the stored 1,234 / 7,000 views, got "' + views + '"');
          await page.evaluate(() => closePromoteInsights());
        }
        await nf.withWorker(page, '/promote/stats', { status: 200, body: { ok: true, found: true, count: 2000 } }, async () => {
          await page.evaluate(() => openPromoteInsights('post', 3001));
          await page.waitForTimeout(300);
        });
        a.ok(/^2,000 \/ 7,000 views$/.test(await nf.textOf(page, 'promote-insights-views')), 'A real live count updates the views');
        await page.evaluate(() => closePromoteInsights());
      }
    },
    {
      name: 'Cancel Membership confirm: 500, bad gateway, offline and an unconfirmed reply never say Future charges stopped and keep the membership unchanged',
      accounts: ['personal'],
      covers: ['el:#btn-confirm-cancel-membership', 'handler:confirmCancelMembership'],
      async run({ page, a }) {
        const toasts = await nf.captureToasts(page);
        try {
          const cases = ['http500', 'badJson', 'network', { status: 200, body: { ok: true, canceled: true } }, { status: 200, body: { ok: false, error: 'stripe_error' } }];
          for (const mode of cases) {
            await grantPlus(page);
            await page.evaluate(() => { window.__intToasts = []; if (typeof openSubscriptionModal === 'function') openSubscriptionModal(); });
            await page.waitForTimeout(100);
            // The legacy /cancel-subscription route cancels immediately; a failed period-end cancel must never fall back to it.
            const legacy = await nf.routeWorker(page, '/cancel-subscription', { status: 200, body: { ok: true, canceled: true } });
            let plusBefore = true;
            try {
              await nf.withWorker(page, '/cancel-subscription-at-period-end', mode, async (r) => {
                await nf.tap(page, 'btn-stripe-cancel-membership', 150);
                plusBefore = await page.evaluate(() => !!state.currentUser.isPlus);
                await nf.tap(page, 'btn-confirm-cancel-membership', 400);
                a.equal(r.calls.length, 1, 'one period-end cancel request');
              });
            } finally { await legacy.restore(); }
            const ui = await page.evaluate(() => ({ plus: !!state.currentUser.isPlus, sched: !!state.currentUser.stripeCancelAtPeriodEnd }));
            const t = await toasts.read();
            const label = typeof mode === 'string' ? mode : JSON.stringify(mode.body);
            a.ok(!t.some((m) => /future charges stopped/i.test(m)), label + ': never says Future charges stopped: ' + JSON.stringify(t));
            a.equal(legacy.calls.length, 0, label + ': never falls back to the immediate /cancel-subscription');
            a.ok(!ui.sched, label + ': no period-end cancel is recorded');
            // Plus can only be judged if it was on when the tap happened (a background Stripe session check may change it).
            if (plusBefore) a.ok(ui.plus, label + ': Plus stays on after the failed cancel');
            await page.evaluate(() => { if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal(); });
          }
        } finally {
          await toasts.restore();
        }
      }
    }
  ]
};
