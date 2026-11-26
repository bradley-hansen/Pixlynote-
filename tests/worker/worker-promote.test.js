'use strict';
// Promote Post Worker (branch grokbot/showcase-promote): /promote/checkout, /stripe/webhook, /promote/impression,
// /promote/stats. Firestore + Auth emulators only; Stripe is a fake in this file (no network, no real keys).
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const WDIR = path.resolve(__dirname, '..', '..', '..', 'worker');
const BASE_SRC = path.join(WDIR, 'worker.db-lockdown.js');
const PHASE2 = path.join(WDIR, 'worker.phase2.js');
// Built to a scratch file so a test run never overwrites worker.promote.js (the record of what is deployed).
const OUT = path.join(WDIR, process.env.WORKER_PROMOTE_OUT || 'worker.promote.test-build.js');
const PATCH2 = path.resolve(__dirname, '..', '..', 'tools', 'phase2', 'patch_worker.py');
const PATCHP = path.resolve(__dirname, '..', '..', 'tools', 'promote', 'patch_worker.py');
const INDEX = path.resolve(__dirname, '..', '..', 'index.html');
const PROJECT = 'demo-pixlynote-rules';
const FS = 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const AUTH = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const ORIGIN = 'https://bradley-hansen.github.io';
const WHSEC = 'whsec_test_' + crypto.randomBytes(12).toString('hex'); // generated per run, never a real secret

function build() {
  if (!fs.existsSync(PATCHP)) return '';
  if (!fs.existsSync(PHASE2)) {
    if (!fs.existsSync(BASE_SRC)) return '';
    execFileSync('python3', [PATCH2, BASE_SRC, PHASE2], { encoding: 'utf8' });
  }
  execFileSync('python3', [PATCHP, PHASE2, OUT], { encoding: 'utf8' });
  return OUT;
}
const FILE = process.env.WORKER_PROMOTE_FILE || build();

let worker, guard, env, realFetch, stripeCalls, tokens, sessionSeq = 0;

async function loadWorker() {
  const src = fs.readFileSync(FILE, 'utf8').replace(/import\s*\{\s*DurableObject\s*\}\s*from\s*["']cloudflare:workers["'];?/,
    'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  const tmp = path.join(os.tmpdir(), 'worker-promote-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, src);
  return import('file://' + tmp + '?t=' + Date.now());
}
function makeGuard(GuardClass) {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...args) { const st = db.prepare(q); const rows = /^\s*select/i.test(q) ? st.all(...args) : (st.run(...args), []); return { toArray: () => rows }; } };
  return new GuardClass({ storage: { sql, getAlarm: async () => 1, setAlarm: async () => {} } }, {});
}
const toVal = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } }
  : (v && typeof v === 'object') ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } }
  : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
async function fsPut(p, fields) {
  const r = await realFetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toVal(v)])) }) });
  assert.ok(r.ok, 'seed ' + p + ' ' + r.status);
}
async function fsGet(p) {
  const r = await realFetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`, { headers: { Authorization: 'Bearer owner' } });
  if (r.status === 404) return null;
  const j = await r.json();
  const out = {};
  for (const [k, v] of Object.entries(j.fields || {})) {
    if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
    else out[k] = v;
  }
  return out;
}
async function fsDel(p) { await realFetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }); }
async function signUp(email) {
  const r = await realFetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'pw-' + crypto.randomBytes(6).toString('hex'), returnSecureToken: true }) });
  const j = await r.json();
  assert.ok(j.idToken, 'auth emulator signUp');
  return { idToken: j.idToken, uid: j.localId };
}
async function post(p, body, ip) {
  const req = new Request('https://worker.test' + p, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '203.0.113.1' }, body: JSON.stringify(body) });
  const res = await worker.default.fetch(req, env);
  return { status: res.status, body: await res.json() };
}
async function get(p, ip) {
  const req = new Request('https://worker.test' + p, { headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip || '203.0.113.1' } });
  const res = await worker.default.fetch(req, env);
  return { status: res.status, body: await res.json() };
}
function plan(amount) {
  return { 5: [24, 250, 'feed'], 25: [72, 1500, 'explore'], 100: [168, 7000, 'cta'], 500: [720, 50000, 'cta'] }[amount];
}
function paidSession(o) {
  o = o || {};
  const amount = o.amount || 25;
  const [h, v, tier] = plan(amount);
  return {
    id: o.id || ('cs_test_promo_' + (++sessionSeq)), object: 'checkout.session', mode: 'payment', livemode: !!o.livemode,
    payment_status: o.payment_status || 'paid', amount_total: o.amount_total != null ? o.amount_total : amount * 100, currency: 'usd',
    client_reference_id: o.username || 'alice', payment_intent: 'pi_test_' + sessionSeq,
    metadata: Object.assign({ purpose: 'promote', username: o.username || 'alice', kind: o.kind || 'post', postId: o.postId || 'p1',
      amount: String(amount), durationHours: String(h), targetImpressions: String(v), tier, ctaLabel: o.ctaLabel || '', ctaUrl: o.ctaUrl || '' }, o.meta || {})
  };
}
async function webhook(session, opts) {
  opts = opts || {};
  const raw = JSON.stringify({ id: 'evt_test_' + sessionSeq, type: opts.type || 'checkout.session.completed', data: { object: session } });
  const t = opts.t || Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', opts.secret || WHSEC).update(t + '.' + raw).digest('hex');
  const req = new Request('https://worker.test/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}`, 'Content-Type': 'application/json' }, body: raw });
  const res = await worker.default.fetch(req, env);
  return { status: res.status, body: await res.json() };
}
async function resetEmulators() {
  await realFetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await realFetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

before(async () => {
  if (!FILE) return;
  realFetch = globalThis.fetch;
  await resetEmulators();
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://api.stripe.com/')) {
      const body = new URLSearchParams(String((init && init.body) || ''));
      stripeCalls.push({ url: u, body, auth: String((init && init.headers && init.headers.Authorization) || '') });
      if (u.endsWith('/v1/checkout/sessions')) {
        if (env.__stripeFail) return new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 });
        return new Response(JSON.stringify({ id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/cs_test_new', livemode: false }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }
    return realFetch(url, init);
  };
  const mod = await loadWorker();
  worker = mod;
  tokens = { alice: await signUp('alice@example.test'), bob: await signUp('bob@example.test'), pat: await signUp('pat@example.test') };
});
beforeEach(async () => {
  if (!FILE) return;
  stripeCalls = [];
  guard = makeGuard(worker.Guard);
  env = {
    FIRESTORE_BASE: FS, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_API_KEY: 'fake', AUTH_EMULATOR_BASE: AUTH,
    STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WHSEC, EMAIL_MODE: 'test', SMS_MODE: 'test',
    GUARD: { idFromName: () => 'global', get: () => guard },
  };
  await realFetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fsPut('users/alice', { username: 'alice', uid: tokens.alice.uid, isPrivate: false });
  await fsPut('users/bob', { username: 'bob', uid: tokens.bob.uid, isPrivate: false });
  await fsPut('users/private_pat', { username: 'private_pat', uid: tokens.pat.uid, isPrivate: true });
  await fsPut('posts/p1', { id: 'p1', author: 'alice', authorPrivate: false, caption: 'mine' });
  await fsPut('posts/p_cf', { id: 'p_cf', author: 'alice', authorPrivate: false, caption: 'close friends', audience: 'close_friends' });
  await fsPut('posts/p_pat', { id: 'p_pat', author: 'private_pat', authorPrivate: true, caption: 'private' });
  await fsPut('users/alice/content/profile', { notes: [{ id: 'n1', author: 'alice', text: 'note text', audience: 'public' }, { id: 'n2', author: 'alice', text: 'cf', audience: 'close_friends' }] });
});

const t = (name, fn) => test(name, { skip: FILE ? false : 'worker source not present' }, fn);
const notPromoted = async (p) => { const d = await fsGet(p); assert.ok(!d || d.isPromoted !== true, p + ' must not be promoted: ' + JSON.stringify(d)); };

t('pricing: the Worker and index.html use identical PROMOTE_ANCHORS', async () => {
  const grab = (s) => (s.match(/PROMOTE_ANCHORS\s*=\s*(\[\s*\[[^;]*\]\s*\])/) || [])[1].replace(/\s+/g, '');
  assert.strictEqual(grab(fs.readFileSync(FILE, 'utf8')), grab(fs.readFileSync(INDEX, 'utf8')));
});

t('no refunds: the built Worker never calls the Stripe refunds API', async () => {
  const src = fs.readFileSync(FILE, 'utf8');
  assert.ok(!/stripePost\(env, "refunds"|\/v1\/refunds|promoteRefund/.test(src));
});

t('health reports promote and promote_webhook', async () => {
  const r = await get('/health');
  assert.strictEqual(r.body.promote, true);
  assert.strictEqual(r.body.promote_webhook, true);
});

t('checkout: the owner gets a Stripe Checkout URL with the plan in metadata; nothing is promoted yet', async () => {
  const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 100, ctaLabel: 'Shop now', ctaUrl: 'https://example.com/shop', idToken: tokens.alice.idToken });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.deepStrictEqual([r.body.plan.durationHours, r.body.plan.targetImpressions, r.body.plan.tier], [168, 7000, 'cta']);
  const call = stripeCalls.find((c) => c.url.endsWith('/v1/checkout/sessions'));
  const b = call.body;
  assert.strictEqual(b.get('mode'), 'payment');
  assert.strictEqual(b.get('line_items[0][price_data][unit_amount]'), '10000');
  assert.strictEqual(b.get('line_items[0][price_data][currency]'), 'usd');
  assert.strictEqual(b.get('metadata[postId]'), 'p1');
  assert.strictEqual(b.get('metadata[amount]'), '100');
  assert.strictEqual(b.get('metadata[durationHours]'), '168');
  assert.strictEqual(b.get('metadata[targetImpressions]'), '7000');
  assert.strictEqual(b.get('metadata[ctaUrl]'), 'https://example.com/shop');
  assert.strictEqual(b.get('client_reference_id'), 'alice');
  assert.match(b.get('success_url'), /\?promote=success$/);
  assert.ok(!/session_id/.test(b.get('success_url')), 'must not collide with the Plus session_id return');
  await notPromoted('posts/p1');
});

t('checkout: below $100 the CTA button is dropped; non-https CTA URLs are dropped', async () => {
  await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, ctaLabel: 'Shop now', ctaUrl: 'https://example.com', idToken: tokens.alice.idToken });
  assert.strictEqual(stripeCalls[0].body.get('metadata[ctaUrl]') || '', '');
  stripeCalls.length = 0;
  await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 500, ctaLabel: 'Shop now', ctaUrl: 'javascript:alert(1)', idToken: tokens.alice.idToken });
  assert.strictEqual(stripeCalls[0].body.get('metadata[ctaUrl]') || '', '');
});

t('checkout: rejects bad amounts, missing sign-in, and someone else\'s post', async () => {
  for (const amount of [4, 501, 'abc', null]) {
    const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount, idToken: tokens.alice.idToken });
    assert.strictEqual(r.status, 400, 'amount ' + amount);
  }
  assert.strictEqual((await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 5 })).status, 401);
  assert.strictEqual((await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 5, idToken: 'x'.repeat(40) })).status, 401);
  // bob signed in, claims to be alice
  const r1 = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 5, idToken: tokens.bob.idToken });
  assert.strictEqual(r1.status, 403); assert.strictEqual(r1.body.error, 'not_owner');
  // bob as himself, alice's post
  const r2 = await post('/promote/checkout', { username: 'bob', kind: 'post', id: 'p1', amount: 5, idToken: tokens.bob.idToken });
  assert.strictEqual(r2.status, 403); assert.strictEqual(r2.body.error, 'not_owner');
  assert.strictEqual(stripeCalls.length, 0, 'no Stripe session for rejected requests');
});

t('checkout: private accounts, Close Friends items and missing posts cannot be promoted', async () => {
  assert.strictEqual((await post('/promote/checkout', { username: 'private_pat', kind: 'post', id: 'p_pat', amount: 5, idToken: tokens.pat.idToken })).body.error, 'private_account');
  assert.strictEqual((await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p_cf', amount: 5, idToken: tokens.alice.idToken })).body.error, 'not_public');
  assert.strictEqual((await post('/promote/checkout', { username: 'alice', kind: 'note', id: 'n2', amount: 5, idToken: tokens.alice.idToken })).body.error, 'not_public');
  assert.strictEqual((await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'nope', amount: 5, idToken: tokens.alice.idToken })).status, 404);
  assert.strictEqual(stripeCalls.length, 0);
});

t('fail safe: without STRIPE_WEBHOOK_SECRET there is no checkout, webhooks are rejected, nothing is promoted', async () => {
  delete env.STRIPE_WEBHOOK_SECRET;
  const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 5, idToken: tokens.alice.idToken });
  assert.strictEqual(r.status, 503); assert.strictEqual(r.body.error, 'promote_unavailable'); assert.ok(!r.body.url);
  assert.strictEqual(stripeCalls.length, 0, 'no Stripe session is created');
  const h = await get('/health');
  assert.strictEqual(h.body.promote, false); assert.strictEqual(h.body.promote_webhook, false);
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: paidSession() } });
  const res = await worker.default.fetch(new Request('https://worker.test/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=00' }, body: raw }), env);
  assert.strictEqual(res.status, 503);
  await notPromoted('posts/p1');
});

t('checkout: a live Stripe key is refused unless PROMOTE_ALLOW_LIVE=on; a Stripe outage returns an error, not a URL', async () => {
  env.STRIPE_SECRET_KEY = 'sk_live_fake';
  const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 5, idToken: tokens.alice.idToken });
  assert.strictEqual(r.status, 503); assert.strictEqual(r.body.error, 'stripe_not_configured');
  env.STRIPE_SECRET_KEY = 'sk_test_fake'; env.__stripeFail = true;
  const r2 = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 5, idToken: tokens.alice.idToken });
  assert.strictEqual(r2.status, 502); assert.ok(!r2.body.url);
  await notPromoted('posts/p1');
});

t('webhook: a bad or stale signature is rejected and nothing is promoted', async () => {
  const s = paidSession();
  assert.strictEqual((await webhook(s, { secret: 'whsec_wrong' })).status, 400);
  assert.strictEqual((await webhook(s, { t: Math.floor(Date.now() / 1000) - 3600 })).status, 400);
  const req = new Request('https://worker.test/stripe/webhook', { method: 'POST', body: JSON.stringify({ type: 'checkout.session.completed', data: { object: s } }) });
  assert.strictEqual((await worker.default.fetch(req, env)).status, 400);
  await notPromoted('posts/p1');
  delete env.STRIPE_WEBHOOK_SECRET;
  assert.strictEqual((await webhook(s)).status, 503);
  await notPromoted('posts/p1');
});

t('webhook: a paid session marks the post promoted with the server-computed plan', async () => {
  const s = paidSession({ amount: 100, ctaLabel: 'Learn more', ctaUrl: 'https://example.com/x' });
  const r = await webhook(s);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.promoted, true);
  const d = await fsGet('posts/p1');
  assert.strictEqual(d.isPromoted, true);
  assert.strictEqual(d.targetImpressions, 7000);
  assert.strictEqual(d.promotedImpressionsCount, 0);
  assert.strictEqual(d.ctaLabel, 'Learn more');
  assert.strictEqual(d.ctaUrl, 'https://example.com/x');
  assert.strictEqual(d.promotionTier, 'cta');
  assert.strictEqual(d.promoteSessionId, s.id);
  assert.ok(Math.abs(d.promotedUntil - (Date.now() + 168 * 3600e3)) < 60e3);
  assert.strictEqual(d.caption, 'mine', 'other fields untouched');
  assert.strictEqual(stripeCalls.filter((c) => c.url.endsWith('/refunds')).length, 0);
});

t('webhook: replaying the same event is a no-op (no double write)', async () => {
  const s = paidSession();
  assert.strictEqual((await webhook(s)).body.promoted, true);
  const r2 = await webhook(s);
  assert.strictEqual(r2.body.duplicate, true);
  // Guard lost its row (e.g. retried after a crash between write and bookkeeping): still a duplicate
  guard = makeGuard(worker.Guard);
  const r3 = await webhook(s);
  assert.strictEqual(r3.body.duplicate, true);
  assert.strictEqual(stripeCalls.filter((c) => c.url.endsWith('/refunds')).length, 0);
});

t('webhook: unpaid, non-promote, tampered or live sessions do nothing', async () => {
  assert.strictEqual((await webhook(paidSession({ payment_status: 'unpaid' }))).body.pending, true);
  assert.strictEqual((await webhook(paidSession({ meta: { purpose: 'plus' } }))).body.ignored, 'not_promote');
  assert.strictEqual((await webhook(paidSession({ amount: 500, amount_total: 500 }))).body.ignored, 'metadata_mismatch');
  assert.strictEqual((await webhook(paidSession({ meta: { targetImpressions: '999999' } }))).body.ignored, 'metadata_mismatch');
  assert.strictEqual((await webhook(paidSession({ livemode: true }))).body.ignored, 'livemode');
  assert.strictEqual((await webhook(paidSession(), { type: 'payment_intent.created' })).body.ignored, 'payment_intent.created');
  await notPromoted('posts/p1');
});

t('webhook: NO refunds: a post deleted or made private before payment completes is recorded as paid with a note, never re-created', async () => {
  await fsDel('posts/p1');
  const s1 = paidSession();
  const r = await webhook(s1);
  assert.strictEqual(r.body.promoted, false);
  assert.ok(!('refunded' in r.body));
  assert.strictEqual(await fsGet('posts/p1'), null, 'the deleted post must not come back');
  const b1 = await fsGet('users/alice/billing/' + s1.id);
  assert.strictEqual(b1.status, 'paid'); assert.match(b1.note, /Not started: the item was deleted/);
  await fsPut('users/alice', { username: 'alice', uid: tokens.alice.uid, isPrivate: true });
  await fsPut('posts/p1', { id: 'p1', author: 'alice', authorPrivate: true, caption: 'mine' });
  const s2 = paidSession();
  const r2 = await webhook(s2);
  assert.strictEqual(r2.body.reason, 'private_account');
  await notPromoted('posts/p1');
  assert.match((await fsGet('users/alice/billing/' + s2.id)).note, /private/);
  assert.strictEqual(stripeCalls.filter((c) => /refund/.test(c.url)).length, 0, 'no refund is ever requested');
});

t('webhook: two paid checkouts for the same post stack (more time + more views), nothing is lost or refunded', async () => {
  const a1 = paidSession({ amount: 5 });
  assert.strictEqual((await webhook(a1)).body.promoted, true);
  await post('/promote/impression', { key: 'post_p1', sid: 'sess_stack_aaaa' }, '198.51.100.77');
  const before = await fsGet('posts/p1');
  const a2 = paidSession({ amount: 25 });
  const r = await webhook(a2);
  assert.strictEqual(r.body.extended, true, JSON.stringify(r.body));
  const after = await fsGet('posts/p1');
  assert.strictEqual(after.targetImpressions, 250 + 1500);
  assert.ok(Math.abs(after.promotedUntil - (before.promotedUntil + 72 * 3600e3)) < 60e3, 'time is added on top');
  assert.strictEqual(after.promotedImpressionsCount, 1, 'views already delivered are kept');
  const st = await get('/promote/stats?key=post_p1');
  assert.deepStrictEqual([st.body.count, st.body.target], [1, 1750]);
  assert.match((await fsGet('users/alice/billing/' + a2.id)).note, /Added to the promotion already running/);
  assert.strictEqual((await webhook(a2)).body.duplicate, true, 'replay of the second purchase is a no-op');
  assert.strictEqual((await fsGet('posts/p1')).targetImpressions, 1750);
  assert.strictEqual(stripeCalls.filter((c) => /refund/.test(c.url)).length, 0);
});

t('webhook: if the Firestore write fails the Worker returns 500 (Stripe retries) and nothing is promoted', async () => {
  const good = env.FIRESTORE_BASE;
  // reads work, writes fail: point writes at a dead port by failing PATCH only
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => (init && init.method === 'PATCH' && String(url).startsWith(good)) ? new Response('{}', { status: 503 }) : prev(url, init);
  try {
    const s = paidSession();
    const r = await webhook(s);
    assert.strictEqual(r.status, 500);
    assert.strictEqual(await guard.promoGet('post_p1'), null, 'no bookkeeping for a failed write');
    await notPromoted('posts/p1');
    globalThis.fetch = prev;
    const r2 = await webhook(s); // Stripe's retry succeeds
    assert.strictEqual(r2.body.promoted, true);
  } finally { globalThis.fetch = prev; }
});

t('notes: a paid note promotion is written to promotions/note_{id}', async () => {
  const r = await post('/promote/checkout', { username: 'alice', kind: 'note', id: 'n1', amount: 5, idToken: tokens.alice.idToken });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const w = await webhook(paidSession({ kind: 'note', postId: 'n1', amount: 5 }));
  assert.strictEqual(w.body.promoted, true);
  const d = await fsGet('promotions/note_n1');
  assert.strictEqual(d.isPromoted, true); assert.strictEqual(d.author, 'alice'); assert.strictEqual(d.noteId, 'n1');
  assert.strictEqual(d.targetImpressions, 250);
  assert.ok(!('text' in d), 'note text is not copied into the public promotion doc');
});

t('impressions: one per browser session per promotion, capped per IP, flushed to Firestore', async () => {
  await webhook(paidSession({ amount: 5 }));
  const r1 = await post('/promote/impression', { key: 'post_p1', sid: 'sess_aaaaaaaa' }, '198.51.100.1');
  assert.deepStrictEqual([r1.body.counted, r1.body.count], [true, 1]);
  assert.strictEqual((await fsGet('posts/p1')).promotedImpressionsCount, 1, 'first view is flushed');
  assert.strictEqual((await post('/promote/impression', { key: 'post_p1', sid: 'sess_aaaaaaaa' }, '198.51.100.1')).body.counted, false, 'same session');
  assert.strictEqual((await post('/promote/impression', { key: 'post_p1', sid: 'sess_bbbbbbbb' }, '198.51.100.1')).body.counted, true);
  assert.strictEqual((await post('/promote/impression', { key: 'post_p1', sid: 'sess_cccccccc' }, '198.51.100.1')).body.counted, true);
  assert.strictEqual((await post('/promote/impression', { key: 'post_p1', sid: 'sess_dddddddd' }, '198.51.100.1')).body.counted, false, '3 per IP per promotion per day');
  for (let i = 0; i < 7; i++) await post('/promote/impression', { key: 'post_p1', sid: 'sess_x' + i + 'xxxxxxx' }, '198.51.100.' + (10 + i));
  assert.strictEqual((await fsGet('posts/p1')).promotedImpressionsCount, 10, 'flushed every 10th view');
  const st = await get('/promote/stats?key=post_p1');
  assert.deepStrictEqual([st.body.count, st.body.target, st.body.active], [10, 250, true]);
  assert.strictEqual((await post('/promote/impression', { key: 'post_nope', sid: 'sess_zzzzzzzz' })).body.counted, false, 'unknown promotion');
  assert.strictEqual((await post('/promote/impression', { key: '../users/alice', sid: 'sess_zzzzzzzz' })).status, 400);
  assert.strictEqual((await fsGet('posts/p1')).isPromoted, true);
});

t('impressions: the promotion ends only when BOTH the time is up and the target is met', async () => {
  await guard.promoStart('post_p1', 'cs_test_end', 2, Date.now() - 1000); // time already up, target 2
  await fsPut('posts/p1', { id: 'p1', author: 'alice', authorPrivate: false, caption: 'mine', isPromoted: true, targetImpressions: 2, promotedImpressionsCount: 0 });
  const a = await post('/promote/impression', { key: 'post_p1', sid: 'sess_end_aaaa' }, '192.0.2.1');
  assert.strictEqual(a.body.counted, true);
  assert.strictEqual((await fsGet('posts/p1')).isPromoted, true, 'target not met yet: keeps running at no extra cost');
  const b = await post('/promote/impression', { key: 'post_p1', sid: 'sess_end_bbbb' }, '192.0.2.2');
  assert.strictEqual(b.body.count, 2);
  const d = await fsGet('posts/p1');
  assert.strictEqual(d.isPromoted, false); assert.strictEqual(d.promotedImpressionsCount, 2); assert.ok(d.promotionEndedAt > 0);
  assert.strictEqual((await post('/promote/impression', { key: 'post_p1', sid: 'sess_end_cccc' }, '192.0.2.3')).body.counted, false);
  // target met but time left: stays active
  await guard.promoStart('post_q', 'cs_test_q', 1, Date.now() + 3600e3);
  await post('/promote/impression', { key: 'post_q', sid: 'sess_q_aaaaaa' }, '192.0.2.9');
  assert.strictEqual((await get('/promote/stats?key=post_q')).body.active, true);
});

// ---------- Billing History records (t1007u) ----------
async function rawEvent(type, object) {
  const raw = JSON.stringify({ id: 'evt_test_b' + (++sessionSeq), type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WHSEC).update(t + '.' + raw).digest('hex');
  const res = await worker.default.fetch(new Request('https://worker.test/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}` }, body: raw }), env);
  return { status: res.status, body: await res.json() };
}

t('billing: a paid Promote writes one owner billing record (idempotent on retry)', async () => {
  const s = paidSession({ amount: 100 });
  await webhook(s);
  const rec = await fsGet('users/alice/billing/' + s.id);
  assert.ok(rec, 'billing record exists');
  assert.deepStrictEqual([rec.kind, rec.amountCents, rec.currency, rec.status, rec.source], ['promote', 10000, 'usd', 'paid', 'stripe_webhook']);
  assert.match(rec.item, /Promote post \(7 days, at least 7,000 views\)/);
  assert.strictEqual(rec.livemode, false);
  await webhook(s);
  assert.strictEqual((await fsGet('users/alice/billing/' + s.id)).status, 'paid');
});

t('billing: a subscription checkout is recorded; renewals and failures map back to the user; Stripe-reported (manual) refunds update status for display', async () => {
  const sub = { id: 'cs_test_sub_abc', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 499, currency: 'usd',
    client_reference_id: 'alice', customer: 'cus_test_alice', payment_intent: null, livemode: false, created: Math.floor(Date.now() / 1000), metadata: {} };
  const r = await rawEvent('checkout.session.completed', sub);
  assert.strictEqual(r.body.billing, true, JSON.stringify(r.body));
  const a = await fsGet('users/alice/billing/cs_test_sub_abc');
  assert.deepStrictEqual([a.kind, a.item, a.amountCents, a.status], ['subscription', 'Pixlynote subscription', 499, 'paid']);
  assert.strictEqual((await fsGet('users/alice')).isPlus, undefined, 'billing never changes Plus flags (that stays in /sync-subscription)');

  const inv = { id: 'in_test_renew_1', object: 'invoice', customer: 'cus_test_alice', billing_reason: 'subscription_cycle', amount_paid: 499, amount_due: 499, currency: 'usd',
    payment_intent: 'pi_test_renew_1', livemode: false, created: Math.floor(Date.now() / 1000), status_transitions: { paid_at: Math.floor(Date.now() / 1000) } };
  assert.strictEqual((await rawEvent('invoice.paid', inv)).body.billing, true);
  assert.strictEqual((await fsGet('users/alice/billing/in_test_renew_1')).item, 'Pixlynote subscription renewal');
  assert.strictEqual((await rawEvent('invoice.payment_failed', Object.assign({}, inv, { id: 'in_test_fail_1', payment_intent: null }))).body.billing, true);
  assert.strictEqual((await fsGet('users/alice/billing/in_test_fail_1')).status, 'failed');
  assert.strictEqual((await rawEvent('invoice.paid', Object.assign({}, inv, { id: 'in_test_first', billing_reason: 'subscription_create' }))).body.ignored, 'covered_by_checkout');

  await rawEvent('charge.refunded', { id: 'ch_test_1', object: 'charge', payment_intent: 'pi_test_renew_1', amount: 499, amount_refunded: 499, livemode: false });
  const rr = await fsGet('users/alice/billing/in_test_renew_1');
  assert.deepStrictEqual([rr.status, rr.refundedCents], ['refunded', 499]);
});

t('billing: unknown customers, unknown users, and live events write nothing', async () => {
  assert.strictEqual((await rawEvent('invoice.paid', { id: 'in_test_x', customer: 'cus_unknown', billing_reason: 'subscription_cycle', amount_paid: 499, currency: 'usd', livemode: false })).body.ignored, 'unknown_customer');
  assert.strictEqual((await rawEvent('checkout.session.completed', { id: 'cs_test_ghost', mode: 'subscription', payment_status: 'paid', client_reference_id: 'ghost_user', amount_total: 499, currency: 'usd', livemode: false, metadata: {} })).body.ignored, 'unknown_user');
  assert.strictEqual((await rawEvent('checkout.session.completed', { id: 'cs_live_x', mode: 'subscription', payment_status: 'paid', client_reference_id: 'alice', amount_total: 499, currency: 'usd', livemode: true, metadata: {} })).body.ignored, 'livemode');
  assert.strictEqual((await rawEvent('charge.refunded', { id: 'ch_x', payment_intent: 'pi_unknown', amount: 100, amount_refunded: 100, livemode: false })).body.ignored, 'unknown_payment');
  assert.strictEqual(await fsGet('users/ghost_user/billing/cs_test_ghost'), null);
  assert.strictEqual(await fsGet('users/alice/billing/cs_live_x'), null);
});

// ---------- Admin Promote Settings (t1044u): tiers from promoteSettings/tiers, free (exempt) accounts ----------
const CUSTOM = [{ price: 10, hours: 24, views: 300 }, { price: 30, hours: 72, views: 2000 }, { price: 120, hours: 168, views: 8000 }, { price: 600, hours: 720, views: 60000 }];
const setTiers = (list) => fsPut('promoteSettings/tiers', { tiers: list, updatedAt: Date.now(), updatedBy: 'pixlynote' });
const coBody = (o) => Object.assign({ username: 'alice', kind: 'post', id: 'p1', idToken: tokens.alice.idToken }, o);
const coCall = () => stripeCalls.find((c) => c.url.endsWith('/v1/checkout/sessions'));

t('admin tiers: the Worker and index.html share the same promoteNormalizeTiers', async () => {
  const grab = (s) => { const m = s.match(/function promoteNormalizeTiers\(list\) \{[\s\S]*?\n\s*return out;\n\s*\}/); assert.ok(m, 'promoteNormalizeTiers present'); return m[0].replace(/\s+/g, ''); };
  assert.strictEqual(grab(fs.readFileSync(FILE, 'utf8')), grab(fs.readFileSync(INDEX, 'utf8')));
});

t('admin tiers: checkout prices come from promoteSettings/tiers, computed server-side', async () => {
  await setTiers(CUSTOM);
  const low = await post('/promote/checkout', coBody({ amount: 5 }));
  assert.strictEqual(low.status, 400); assert.strictEqual(low.body.error, 'invalid_amount', 'below the new Tier 1 price');
  assert.strictEqual((await post('/promote/checkout', coBody({ amount: 601 }))).status, 400, 'above the new Tier 4 price');
  const cases = [[10, 24, 300, 'feed'], [30, 72, 2000, 'explore'], [120, 168, 8000, 'cta'], [600, 720, 60000, 'cta'], [29, 72, 1900, 'feed']];
  for (const [amount, h, v, tier] of cases) {
    stripeCalls.length = 0;
    const r = await post('/promote/checkout', coBody({ amount }));
    assert.strictEqual(r.status, 200, amount + ' ' + JSON.stringify(r.body));
    const b = coCall().body;
    assert.strictEqual(b.get('line_items[0][price_data][unit_amount]'), String(amount * 100));
    assert.deepStrictEqual([b.get('metadata[durationHours]'), b.get('metadata[targetImpressions]'), b.get('metadata[tier]')], [String(h), String(v), tier], 'amount ' + amount);
  }
  await notPromoted('posts/p1');
});

t('admin tiers: the browser cannot set the price, duration or views', async () => {
  const r = await post('/promote/checkout', coBody({ amount: 25, unit_amount: 1, price: 1, durationHours: 9999, targetImpressions: 999999, tier: 'cta' }));
  assert.strictEqual(r.status, 200);
  const b = coCall().body;
  assert.deepStrictEqual([b.get('line_items[0][price_data][unit_amount]'), b.get('metadata[durationHours]'), b.get('metadata[targetImpressions]'), b.get('metadata[tier]')], ['2500', '72', '1500', 'explore']);
  stripeCalls.length = 0;
  const stale = await post('/promote/checkout', coBody({ amount: 25, expect: { durationHours: 72, targetImpressions: 9999 } }));
  assert.strictEqual(stale.status, 409); assert.strictEqual(stale.body.error, 'plan_changed');
  assert.strictEqual(stale.body.plan.targetImpressions, 1500, 'returns the real plan');
  assert.strictEqual(stripeCalls.length, 0, 'nothing is charged when the shown plan is out of date');
  assert.strictEqual((await post('/promote/checkout', coBody({ amount: 25, expect: { durationHours: 72, targetImpressions: 1500 } }))).status, 200);
});

t('admin tiers: a missing or invalid config falls back to the defaults; a Firestore error fails safe', async () => {
  await setTiers([{ price: 50, hours: 24, views: 250 }, { price: 25, hours: 72, views: 1500 }, { price: 100, hours: 168, views: 7000 }, { price: 500, hours: 720, views: 50000 }]);
  let r = await post('/promote/checkout', coBody({ amount: 5 }));
  assert.strictEqual(r.status, 200, 'invalid tiers -> defaults');
  assert.strictEqual(coCall().body.get('metadata[targetImpressions]'), '250');
  await setTiers([{ price: 5, hours: 50, views: 250 }, { price: 25, hours: 72, views: 1500 }, { price: 100, hours: 168, views: 7000 }, { price: 500, hours: 720, views: 50000 }]);
  stripeCalls.length = 0;
  r = await post('/promote/checkout', coBody({ amount: 5 }));
  assert.strictEqual(coCall().body.get('metadata[durationHours]'), '24', '50 hours is not whole days -> defaults');
  await fsDel('promoteSettings/tiers');
  stripeCalls.length = 0;
  r = await post('/promote/checkout', coBody({ amount: 100 }));
  assert.strictEqual(coCall().body.get('metadata[targetImpressions]'), '7000', 'no config -> defaults');
  stripeCalls.length = 0;
  env.FIRESTORE_BASE = 'http://127.0.0.1:1';
  r = await post('/promote/checkout', coBody({ amount: 25 }));
  env.FIRESTORE_BASE = FS;
  assert.strictEqual(r.status, 502); assert.strictEqual(r.body.error, 'lookup_failed');
  assert.strictEqual(stripeCalls.length, 0, 'no checkout when the price cannot be checked');
});

t('admin tiers: a purchase keeps the plan it was sold with even if the tiers change before payment completes', async () => {
  const r = await post('/promote/checkout', coBody({ amount: 25 }));
  assert.strictEqual(r.status, 200);
  const sid = 'cs_test_new'; // what the fake Stripe returned
  await setTiers(CUSTOM); // admin edits the tiers while the buyer is on the Stripe page
  const s = paidSession({ id: sid, amount: 25 });
  const w = await webhook(s);
  assert.strictEqual(w.body.promoted, true, JSON.stringify(w.body));
  const d = await fsGet('posts/p1');
  assert.deepStrictEqual([d.targetImpressions, d.promotionDurationHours, d.promotionTier], [1500, 72, 'explore']);
  const bill = await fsGet('users/alice/billing/' + sid);
  assert.deepStrictEqual([bill.status, bill.amountCents, bill.targetImpressions, bill.tier], ['paid', 2500, 1500, 'explore']);
});

t('admin tiers: a session the Worker has no record of is checked against the current tiers (tampering still rejected)', async () => {
  await setTiers(CUSTOM);
  assert.strictEqual((await webhook(paidSession({ amount: 25 }))).body.ignored, 'metadata_mismatch', '$25 is no longer a valid plan');
  const ok = paidSession({ amount: 100, meta: { amount: '120', durationHours: '168', targetImpressions: '8000', tier: 'cta' }, amount_total: 12000 });
  assert.strictEqual((await webhook(ok)).body.promoted, true);
  assert.strictEqual((await fsGet('posts/p1')).targetImpressions, 8000);
});

t('exempt: an account on the free list skips Stripe and the promotion starts at once ($0 in History)', async () => {
  await fsPut('promoteSettings/exempt', { usernames: ['@Alice'], updatedAt: 1, updatedBy: 'pixlynote' });
  delete env.STRIPE_WEBHOOK_SECRET; env.STRIPE_SECRET_KEY = ''; // free promotions do not need Stripe at all
  const r = await post('/promote/checkout', coBody({ amount: 100, ctaLabel: 'Shop now', ctaUrl: 'https://example.com/s' }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.free, true); assert.ok(!r.body.url);
  assert.strictEqual(stripeCalls.length, 0, 'no Stripe call');
  const d = await fsGet('posts/p1');
  assert.strictEqual(d.isPromoted, true);
  assert.deepStrictEqual([d.targetImpressions, d.promotionDurationHours, d.promotionTier, d.promotionAmount, d.ctaLabel], [7000, 168, 'cta', 0, 'Shop now']);
  assert.match(d.promoteSessionId, /^free_[0-9a-f]{24}$/);
  const row = await guard.promoGet('post_p1');
  assert.strictEqual(row.target, 7000, 'view counting starts');
  const bill = await fsGet('users/alice/billing/' + d.promoteSessionId);
  assert.deepStrictEqual([bill.kind, bill.status, bill.amountCents, bill.itemId], ['promote', 'free', 0, 'p1']);
  const again = await post('/promote/checkout', coBody({ amount: 5 }));
  assert.strictEqual(again.status, 409, 'already running');
});

t('exempt: notes work too; the free list never lets anyone promote someone else\'s or a non-public item', async () => {
  await fsPut('promoteSettings/exempt', { usernames: ['alice', 'bob'], updatedAt: 1, updatedBy: 'pixlynote' });
  const n = await post('/promote/checkout', coBody({ kind: 'note', id: 'n1', amount: 5 }));
  assert.strictEqual(n.body.free, true, JSON.stringify(n.body));
  assert.strictEqual((await fsGet('promotions/note_n1')).isPromoted, true);
  const other = await post('/promote/checkout', { username: 'bob', kind: 'post', id: 'p1', amount: 5, idToken: tokens.bob.idToken });
  assert.strictEqual(other.status, 403);
  const imp = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 5, idToken: tokens.bob.idToken });
  assert.strictEqual(imp.body.error, 'not_owner', 'bob (exempt) cannot act as alice');
  assert.strictEqual((await post('/promote/checkout', coBody({ id: 'p_cf', amount: 5 }))).body.error, 'not_public');
  assert.strictEqual((await post('/promote/checkout', coBody({ amount: 5, idToken: 'x'.repeat(40) }))).status, 401);
  await notPromoted('posts/p1');
});

t('exempt: an account not on the list (or removed from it) pays through Stripe', async () => {
  await fsPut('promoteSettings/exempt', { usernames: ['bob'], updatedAt: 1, updatedBy: 'pixlynote' });
  const r = await post('/promote/checkout', coBody({ amount: 5 }));
  assert.strictEqual(r.status, 200); assert.ok(!r.body.free); assert.match(r.body.url, /^https:\/\/checkout\.stripe\.com\//);
  await notPromoted('posts/p1');
  await fsPut('promoteSettings/exempt', { usernames: 'alice' }); // malformed list -> nobody is exempt
  stripeCalls.length = 0;
  const r2 = await post('/promote/checkout', coBody({ amount: 5 }));
  assert.ok(!r2.body.free); assert.strictEqual(stripeCalls.length, 1);
});
