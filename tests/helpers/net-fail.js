'use strict';

/**
 * Failure-path helpers for interaction tests. Page-level routes take priority over the
 * harness's context-level Worker mock, so a test can make one Worker path fail (HTTP error,
 * error JSON, or a dropped connection) and then restore the default success mock.
 * Nothing here reaches the network: every response is fulfilled or aborted locally.
 */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

// Failure modes every network-backed control must survive without showing success.
const FAILURES = {
  http500: { status: 500, body: { ok: false, error: 'server_error' } },
  http403: { status: 403, body: { ok: false, error: 'email_taken', message: 'This email is already on an account' } },
  http429: { status: 429, body: { ok: false, error: 'rate_limited' } },
  badJson: { status: 502, raw: '<html>Bad gateway</html>' },
  network: { abort: true }
};

function pathRegex(p) {
  if (p instanceof RegExp) return p;
  const esc = String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the Worker path exactly (optionally followed by a query string) so '/email' does not catch '/email/signup-verify'.
  return new RegExp('workers\\.dev' + esc + '(?:\\?|$)');
}

/**
 * Route one Worker path. mode: a FAILURES key, or { status, body } / { abort: true } / { raw }.
 * Returns { calls, restore } where calls is the list of request bodies seen.
 */
async function routeWorker(page, p, mode) {
  const re = pathRegex(p);
  const spec = typeof mode === 'string' ? FAILURES[mode] : mode;
  const calls = [];
  const handler = async (route) => {
    const req = route.request();
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = req.postData() || null; }
    calls.push({ url: req.url(), method: req.method(), body });
    const cur = handler.spec;
    if (cur.abort) return route.abort('failed');
    if (cur.raw !== undefined) return route.fulfill({ status: cur.status || 200, contentType: 'text/html', body: cur.raw, headers: CORS });
    return route.fulfill({ status: cur.status || 200, contentType: 'application/json', body: JSON.stringify(cur.body || {}), headers: CORS });
  };
  handler.spec = spec;
  await page.route(re, handler);
  return {
    calls,
    set(next) { handler.spec = typeof next === 'string' ? FAILURES[next] : next; },
    async restore() { await page.unroute(re, handler).catch(() => {}); }
  };
}

async function withWorker(page, p, mode, fn) {
  const r = await routeWorker(page, p, mode);
  try { return await fn(r); } finally { await r.restore(); }
}

// Capture toasts for the duration of a test. Returns a reader; call restore() at the end.
async function captureToasts(page) {
  await page.evaluate(() => {
    window.__intToasts = [];
    if (!window.__intToastOrig) window.__intToastOrig = window.showToast;
    const orig = window.__intToastOrig;
    window.showToast = function (m) { window.__intToasts.push(String(m || '')); try { return orig && orig.apply(this, arguments); } catch (e) {} };
    try { showToast = window.showToast; } catch (e) {}
  });
  return {
    read: () => page.evaluate(() => (window.__intToasts || []).slice()),
    restore: () => page.evaluate(() => {
      if (window.__intToastOrig) { window.showToast = window.__intToastOrig; try { showToast = window.__intToastOrig; } catch (e) {} }
      window.__intToastOrig = null;
    })
  };
}

const textOf = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
}, id);

const shown = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  if (!el) return false;
  if (el.classList.contains('hidden')) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}, id);

// Text that would tell a person a send/verify/save worked.
const SUCCESS_WORDS = /\b(code sent|we sent|sent a 6-digit|verified|submitted|saved|approved|thanks|pending review)\b/i;

module.exports = { FAILURES, routeWorker, withWorker, captureToasts, textOf, shown, SUCCESS_WORDS, pathRegex };

// Click a control the way a tap would (DOM click, so off-screen modal controls still work), then let async work settle.
async function tap(page, id, settleMs) {
  const ok = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.click();
    return true;
  }, id);
  await page.waitForTimeout(settleMs == null ? 350 : settleMs);
  return ok;
}

async function setValue(page, id, value) {
  return page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { id, value });
}

module.exports.tap = tap;
module.exports.setValue = setValue;
