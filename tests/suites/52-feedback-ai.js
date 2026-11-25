'use strict';

/**
 * Submit feedback modal: "Get an instant AI answer? AI" option (grokbot/feedback-ai).
 * The send path is unchanged (Worker /support/feedback, then mailto fallback to support@pixlynote.com);
 * with the toggle on, grokbot@pixlynote.com is added as a second recipient. No worker route, no AI API.
 */

const SUPPORT = 'support@pixlynote.com';
const GROKBOT = 'grokbot@pixlynote.com';

async function fresh(page, h, account) {
  const port = Number(new URL(page.url()).port);
  await page.setViewportSize({ width: 390, height: 844 });
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
  return port;
}
async function reset(page, h, account, port) {
  await page.unroute('**/support/feedback').catch(() => {});
  await page.setViewportSize({ width: 390, height: 844 });
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
}
async function openModal(page, h) {
  await page.evaluate(() => openSubmitFeedbackModal(''));
  await page.waitForTimeout(80);
}
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), sel);
const vis = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
}, sel);

module.exports = {
  name: 'Feedback AI option',
  tests: [
    {
      name: 'Feedback AI: heading, toggle, helper text, button label and footer note follow the toggle',
      accounts: ['personal', 'business'],
      covers: ['el:#feedback-ai-toggle', 'el:#feedback-reply-email'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          await openModal(page, h);
          a.ok(await vis(page, '#modal-submit-feedback'), 'modal opens');
          a.ok(await vis(page, '#feedback-category') && await vis(page, '#feedback-message'), 'Topic and Message are kept');
          const section = await txt(page, '#feedback-ai-section');
          a.ok(section.includes('Get an instant AI answer?') && section.includes('AI'), 'heading: ' + section);
          a.ok(section.includes('Let Grokbot try to answer right away (instant reply via email)'), 'toggle label: ' + section);
          a.ok(section.includes('Your query will be sent to grokbot@pixlynote.com to get you quick help.'), 'helper text: ' + section);
          a.equal(await page.evaluate(() => document.getElementById('feedback-ai-toggle').checked), false, 'toggle defaults to off');
          const sw = await page.evaluate(() => {
            const el = document.getElementById('feedback-ai-toggle');
            const track = document.getElementById('feedback-ai-switch-track');
            const knob = document.getElementById('feedback-ai-switch-knob');
            const hex = (c) => {
              const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (!m) return c;
              return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
            };
            const r = track.getBoundingClientRect();
            const kr = knob.getBoundingClientRect();
            return {
              type: el.type, role: el.getAttribute('role'),
              w: Math.round(r.width), h: Math.round(r.height),
              radius: getComputedStyle(track).borderRadius,
              offBg: hex(getComputedStyle(track).backgroundColor),
              knobLeft: Math.round(kr.left - r.left)
            };
          });
          a.equal(sw.type, 'checkbox', 'toggle stays a checkbox input');
          a.equal(sw.role, 'switch', 'toggle has role=switch');
          a.ok(sw.w > sw.h && sw.w >= 32 && sw.h >= 20, 'pill shape: ' + sw.w + 'x' + sw.h);
          a.ok(sw.offBg === '#d4d4d4' || sw.offBg === '#d3d3d3', 'off is gray: ' + sw.offBg);
          a.ok(sw.knobLeft < 8, 'knob starts on the left when off: ' + sw.knobLeft);
          await page.click('#feedback-ai-toggle');
          await page.waitForTimeout(200);
          const onBg = await page.evaluate(() => {
            const track = document.getElementById('feedback-ai-switch-track');
            const knob = document.getElementById('feedback-ai-switch-knob');
            const btn = document.getElementById('btn-feedback-send');
            const hex = (c) => {
              const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (!m) return c;
              return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
            };
            const r = track.getBoundingClientRect();
            const kr = knob.getBoundingClientRect();
            return {
              sw: hex(getComputedStyle(track).backgroundColor),
              btn: hex(getComputedStyle(btn).backgroundColor),
              knobLeft: Math.round(kr.left - r.left)
            };
          });
          a.equal(onBg.sw, onBg.btn, 'on uses the Submit button purple: ' + JSON.stringify(onBg));
          a.ok(onBg.knobLeft > 12, 'knob slides right when on: ' + onBg.knobLeft);
          await page.click('#feedback-ai-toggle');
          a.equal(await txt(page, '#btn-feedback-send'), 'Send', 'off: current button label');
          a.equal(await txt(page, '#feedback-footer-note'), 'Sent to ' + SUPPORT + ' with your @username.', 'off: footer names only support@');
          await page.click('#feedback-ai-toggle');
          a.equal(await txt(page, '#btn-feedback-send'), 'Submit & Ask Grokbot', 'on: button label');
          a.equal(await txt(page, '#feedback-footer-note'), 'Sent to ' + SUPPORT + ' & ' + GROKBOT + ' with your @username.', 'on: footer names both');
          await page.click('#feedback-ai-toggle');
          a.equal(await txt(page, '#btn-feedback-send'), 'Send', 'toggling off restores the label');
          a.equal(await txt(page, '#feedback-footer-note'), 'Sent to ' + SUPPORT + ' with your @username.', 'toggling off restores the footer');
          await page.click('#feedback-ai-toggle');
          await page.evaluate(() => openSubmitFeedbackModal(''));
          a.equal(await page.evaluate(() => document.getElementById('feedback-ai-toggle').checked), false, 'reopening resets the toggle to off');
          a.equal(await txt(page, '#btn-feedback-send'), 'Send', 'reopen: button label reset');
          a.ok(!(await vis(page, '#feedback-reply-wrap')), 'account with an email: no reply-email field');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Feedback AI: toggle off sends to support@ only; toggle on adds grokbot@ (Worker payload and mailto), with @username and reply-to',
      accounts: ['personal', 'business'],
      covers: ['el:#btn-feedback-send', 'handler:submitPostFeedback'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          const user = account.username.toLowerCase();
          let captured = null;
          await page.route('**/support/feedback', async (route) => {
            captured = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
          });
          // Off, Worker path
          await openModal(page, h);
          await page.fill('#feedback-message', 'Normal feedback, no AI');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          a.ok(captured && captured.to === SUPPORT && !captured.askGrokbot && captured.username === user && captured.replyTo === account.email.toLowerCase(), 'off payload: ' + JSON.stringify(captured));
          // On, Worker path
          captured = null;
          await openModal(page, h);
          await page.fill('#feedback-message', 'Please help me with AI');
          await page.click('#feedback-ai-toggle');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          a.ok(captured && captured.to === SUPPORT && captured.askGrokbot === true && captured.username === user && captured.replyTo === account.email.toLowerCase(), 'on payload: ' + JSON.stringify(captured));
          // mailto fallback
          await page.unroute('**/support/feedback');
          await page.route('**/support/feedback', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' }));
          await page.evaluate(() => { window.__mailto = []; window.__pixlyOpenMailto = (href) => window.__mailto.push(href); });
          await openModal(page, h);
          await page.fill('#feedback-message', 'Off via mailto');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          await openModal(page, h);
          await page.fill('#feedback-message', 'On via mailto');
          await page.click('#feedback-ai-toggle');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          const mt = await page.evaluate(() => window.__mailto.slice());
          a.equal(mt.length, 2, 'two mailto hand-offs');
          a.ok(mt[0].startsWith('mailto:' + SUPPORT + '?subject=') && !mt[0].includes('grokbot'), 'off mailto goes only to support@: ' + mt[0].slice(0, 90));
          a.ok(mt[1].startsWith('mailto:' + SUPPORT + ',' + GROKBOT + '?subject='), 'on mailto goes to both: ' + mt[1].slice(0, 100));
          const body = decodeURIComponent(mt[1]);
          a.ok(body.includes('On via mailto') && body.includes('From: @' + user) && body.includes('Reply to: ' + account.email.toLowerCase()) && body.includes('reply-to=' + account.email.toLowerCase()), 'on mailto carries @username and reply-to: ' + body);
          a.ok((await txt(page, '#feedback-mailto-link')).includes(GROKBOT), 'manual link names both addresses');
          a.ok((await page.evaluate(() => document.getElementById('feedback-mailto-link').href)).startsWith('mailto:' + SUPPORT + ',' + GROKBOT), 'manual link goes to both');
        } finally { await reset(page, h, account, port); }
      }
    },
    {
      name: 'Feedback AI: phone-only account sees an optional "Email for reply" field',
      accounts: ['personal'],
      covers: ['el:#feedback-reply-email'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await fresh(page, h, account);
        try {
          await page.evaluate(() => { state.currentUser.email = ''; });
          let captured = null;
          await page.route('**/support/feedback', async (route) => {
            captured = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
          });
          await openModal(page, h);
          a.ok(await vis(page, '#feedback-reply-wrap'), 'reply field is shown');
          a.ok((await txt(page, '#feedback-reply-wrap')).includes('Email for reply'), 'labelled Email for reply');
          // Blank is allowed.
          await page.fill('#feedback-message', 'Phone only, no reply email');
          await page.click('#feedback-ai-toggle');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          a.ok(captured && captured.askGrokbot === true && !('replyTo' in captured), 'blank reply email is accepted and omitted: ' + JSON.stringify(captured));
          // Invalid is rejected.
          captured = null;
          await openModal(page, h);
          await page.fill('#feedback-message', 'Bad reply email');
          await page.fill('#feedback-reply-email', 'not-an-email');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(150);
          a.ok(captured === null, 'invalid reply email is not sent');
          a.ok(/valid email/i.test(await txt(page, '#feedback-status')), 'invalid reply email shows an error: ' + await txt(page, '#feedback-status'));
          // Valid is used.
          await page.fill('#feedback-reply-email', 'phone.user@example.test');
          await page.click('#btn-feedback-send');
          await page.waitForTimeout(300);
          a.ok(captured && captured.replyTo === 'phone.user@example.test', 'typed reply email is the reply-to: ' + JSON.stringify(captured));
          // The field is cleared on reopen.
          await openModal(page, h);
          a.equal(await page.evaluate(() => document.getElementById('feedback-reply-email').value), '', 'reply field cleared on reopen');
        } finally { await reset(page, h, account, port); }
      }
    }
  ]
};
