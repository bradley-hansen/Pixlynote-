'use strict';
// Business badge fix (Nov 27): the Worker side. Firestore + Auth emulators only; Stripe and R2 are fakes (no network, no real keys).
//  - /sync-subscription: a paid or no-payment (free / $0) Business Plus session writes isBusinessPlus:true and a $0 billing row;
//    unpaid, canceled and non-membership sessions never turn it on or write a row.
//  - GET /business-verification/pending-count: a number only, no application details, Origin-gated, rate limited, honest on failure.
//  - Stripe webhook: never overwrites the "Business Plus (free)" row.
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
const PATCH2 = path.resolve(__dirname, '..', '..', 'tools', 'phase2', 'patch_worker.py');
const PATCHP = path.resolve(__dirname, '..', '..', 'tools', 'promote', 'patch_worker.py');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'bizbadge-'));
const PROJECT = 'demo-pixlynote-rules';
const FS = 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const AUTH = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const ORIGIN = 'https://bradley-hansen.github.io';
const WHSEC = 'whsec_test_' + crypto.randomBytes(12).toString('hex');
const BIZ_PRICE = 'price_biz_test_1';
const PLUS_PRICE = 'price_1UbNIvFSVMbdmupTwHKWqLKj';
const SID = 'cs_test_bizfree1234567890abcdef';
const SID_PAID = 'cs_test_bizpaid1234567890abcdef';

function build() {
  if (!fs.existsSync(BASE_SRC) || !fs.existsSync(PATCH2) || !fs.existsSync(PATCHP)) return '';
  const p2 = path.join(SCRATCH, 'worker.phase2.js');
  const pp = path.join(SCRATCH, 'worker.promote.js');
  execFileSync('python3', [PATCH2, BASE_SRC, p2], { encoding: 'utf8' });
  execFileSync('python3', [PATCHP, p2, pp], { encoding: 'utf8' });
  return pp;
}
const FILE = build();

let worker, guard, env, realFetch, sessions, bucket;

async function loadWorker() {
  const src = fs.readFileSync(FILE, 'utf8').replace(/import\s*\{\s*DurableObject\s*\}\s*from\s*["']cloudflare:workers["'];?/,
    'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  const tmp = path.join(SCRATCH, 'worker.mjs');
  fs.writeFileSync(tmp, src);
  return import('file://' + tmp + '?t=' + Date.now());
}
function makeGuard(GuardClass) {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...args) { const st = db.prepare(q); const rows = /^\s*select/i.test(q) ? st.all(...args) : (st.run(...args), []); return { toArray: () => rows }; } };
  return new GuardClass({ storage: { sql, getAlarm: async () => 1, setAlarm: async () => {} } }, {});
}
const toVal = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } }
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
    else out[k] = v;
  }
  return out;
}
function session(id, o) {
  o = o || {};
  return {
    id, object: 'checkout.session', status: o.status || 'complete', payment_status: o.payment_status || 'no_payment_required',
    mode: o.mode || 'subscription', client_reference_id: o.owner || 'alice', livemode: false, customer: 'cus_test_biz',
    created: 1795000000, amount_total: o.amount_total != null ? o.amount_total : 0, currency: 'usd',
    subscription: { id: 'sub_test_biz', status: o.subStatus || 'active', cancel_at_period_end: false, current_period_end: 2000000000, items: { data: [] } },
    line_items: { data: [{ price: { id: o.price || BIZ_PRICE } }] }
  };
}
async function sync(body, extraEnv) {
  const req = new Request('https://worker.test/sync-subscription', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await worker.default.fetch(req, Object.assign({}, env, extraEnv || {}));
  return { status: res.status, body: await res.json() };
}
async function count(opts) {
  opts = opts || {};
  const headers = {};
  if (opts.origin !== null) headers.Origin = opts.origin || ORIGIN;
  headers['CF-Connecting-IP'] = opts.ip || '203.0.113.9';
  const res = await worker.default.fetch(new Request('https://worker.test/business-verification/pending-count', { method: 'GET', headers }), opts.env || env);
  return { status: res.status, text: await res.text() };
}
async function webhook(sess) {
  const raw = JSON.stringify({ id: 'evt_test_biz', type: 'checkout.session.completed', data: { object: sess } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WHSEC).update(t + '.' + raw).digest('hex');
  const res = await worker.default.fetch(new Request('https://worker.test/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}`, 'Content-Type': 'application/json' }, body: raw }), env);
  return { status: res.status, body: await res.json() };
}
function fakeBucket(metas, opts) {
  opts = opts || {};
  const objects = Object.entries(metas).map(([k, v]) => ({ key: k, v }));
  return {
    async list(o) {
      if (opts.listFails) throw new Error('r2 down');
      const pageSize = opts.pageSize || 500;
      const start = o && o.cursor ? Number(o.cursor) : 0;
      const slice = objects.slice(start, start + pageSize);
      const next = start + pageSize;
      return { objects: slice.map((x) => ({ key: x.key })), truncated: next < objects.length, cursor: String(next) };
    },
    async get(k) {
      const x = objects.find((o) => o.key === k);
      if (!x) return null;
      return { json: async () => (typeof x.v === 'string' ? JSON.parse(x.v) : x.v) };
    }
  };
}

before(async () => {
  if (!FILE) return;
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.stripe.com/v1/checkout/sessions/')) {
      const sid = decodeURIComponent(u.split('/sessions/')[1].split('?')[0]);
      if (!sessions[sid]) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(sessions[sid]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, init);
  };
  worker = await loadWorker();
});
beforeEach(async () => {
  if (!FILE) return;
  guard = makeGuard(worker.Guard);
  bucket = fakeBucket({});
  env = {
    FIRESTORE_BASE: FS, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_API_KEY: 'fake', AUTH_EMULATOR_BASE: AUTH,
    STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WHSEC, EMAIL_MODE: 'test', SMS_MODE: 'test',
    BUSINESS_PRICE_IDS: BIZ_PRICE, PLUS_PRICE_IDS: PLUS_PRICE,
    GUARD: { idFromName: () => 'global', get: () => guard }, BUSINESS_VERIFY: bucket
  };
  sessions = { [SID]: session(SID), [SID_PAID]: session(SID_PAID, { payment_status: 'paid', amount_total: 1500 }) };
  await realFetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fsPut('users/alice', { username: 'alice', isBusinessPlus: false, isPlus: false });
});

const t = (name, fn) => test(name, { skip: FILE ? false : 'worker source not present' }, fn);

t('sync: a free / $0 Business Plus session turns Business Plus on, never uses the Plus-only verified flag, and writes the $0 Business Plus (free) history row', async () => {
  const r = await sync({ username: 'alice', session_id: SID, action: 'activate' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.applied, true);
  assert.strictEqual(r.body.fields.isBusinessPlus, true);
  assert.strictEqual(r.body.billing, true);
  const u = await fsGet('users/alice');
  assert.strictEqual(u.isBusinessPlus, true);
  assert.strictEqual(u.stripeBusinessSessionId, SID);
  assert.notStrictEqual(u.isPlus, true, 'Business never grants personal Plus');
  const b = await fsGet('users/alice/billing/' + SID);
  assert.ok(b, 'billing row exists');
  assert.deepStrictEqual([b.kind, b.item, b.amountCents, b.status, b.currency, b.sessionId], ['subscription', 'Business Plus (free)', 0, 'free', 'usd', SID]);
  assert.strictEqual(b.createdAt, 1795000000 * 1000);
});

t('sync: a retry is idempotent (same row, same flags)', async () => {
  await sync({ username: 'alice', session_id: SID, action: 'activate' });
  const r = await sync({ username: 'alice', session_id: SID, action: 'activate' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await fsGet('users/alice/billing/' + SID)).createdAt, 1795000000 * 1000);
  assert.strictEqual((await fsGet('users/alice')).isBusinessPlus, true);
});

t('sync: a PAID Business Plus session turns Business Plus on and writes no free row (the webhook records the real charge)', async () => {
  const r = await sync({ username: 'alice', session_id: SID_PAID, action: 'activate' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.fields.isBusinessPlus, true);
  assert.strictEqual(r.body.billing, false);
  assert.strictEqual((await fsGet('users/alice')).isBusinessPlus, true);
  assert.strictEqual(await fsGet('users/alice/billing/' + SID_PAID), null);
});

t('sync: unpaid, incomplete, dead-subscription and canceled Business sessions never turn it on and write no row', async () => {
  const cases = {
    unpaid: session('cs_test_unpaid12345678', { payment_status: 'unpaid', amount_total: 1500 }),
    open: session('cs_test_open1234567890', { status: 'open', payment_status: 'unpaid', amount_total: 1500 }),
    dead: session('cs_test_dead1234567890', { subStatus: 'canceled' })
  };
  Object.assign(sessions, Object.fromEntries(Object.values(cases).map((s) => [s.id, s])));
  for (const s of Object.values(cases)) {
    const r = await sync({ username: 'alice', session_id: s.id, action: 'activate' });
    assert.strictEqual(r.status, 200, s.id + ' ' + JSON.stringify(r.body));
    assert.strictEqual(r.body.fields.isBusinessPlus, false, s.id + ' must not turn Business Plus on');
    assert.strictEqual((await fsGet('users/alice')).isBusinessPlus, false);
    assert.strictEqual(await fsGet('users/alice/billing/' + s.id), null, s.id + ' writes no free row');
  }
  await sync({ username: 'alice', session_id: SID, action: 'activate' });
  assert.strictEqual((await fsGet('users/alice')).isBusinessPlus, true);
  const c = await sync({ username: 'alice', session_id: SID, action: 'cancel' });
  assert.strictEqual(c.status, 200, JSON.stringify(c.body));
  assert.strictEqual((await fsGet('users/alice')).isBusinessPlus, false, 'cancel turns Business Plus off');
});

t('sync: someone else\'s Business session is refused and nothing is written', async () => {
  const r = await sync({ username: 'mallory', session_id: SID, action: 'activate' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(await fsGet('users/mallory'), null);
  assert.strictEqual(await fsGet('users/mallory/billing/' + SID), null);
});

t('sync: a session that is not a Plus or Business purchase (or an unconfigured Business price) is refused with 422 and writes nothing', async () => {
  const r = await sync({ username: 'alice', session_id: SID }, { BUSINESS_PRICE_IDS: '' });
  assert.strictEqual(r.status, 422, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, 'not_a_membership_purchase');
  const u = await fsGet('users/alice');
  assert.strictEqual(u.isBusinessPlus, false);
  assert.strictEqual(u.stripeSessionId, undefined, 'no stray Plus fields written');
  assert.strictEqual(await fsGet('users/alice/billing/' + SID), null);
  const r2 = await sync({ username: 'alice', session_id: SID, action: 'activate' }, { BUSINESS_PRICE_IDS: 'price_other' });
  assert.strictEqual(r2.status, 422);
});

t('sync: if the Firestore write fails the Worker returns 502 write_failed (the app shows no success) and no flag is on', async () => {
  const r = await sync({ username: 'alice', session_id: SID, action: 'activate' }, { FIRESTORE_BASE: 'http://127.0.0.1:1' });
  assert.ok(r.status === 502 || r.status === 503, 'honest failure status: ' + r.status + ' ' + JSON.stringify(r.body));
  assert.notStrictEqual(r.body.ok, true);
  assert.strictEqual((await fsGet('users/alice')).isBusinessPlus, false);
});

t('sync: personal Plus still works (isPlus and isVerified), Business is unaffected', async () => {
  sessions['cs_test_plus1234567890ab'] = session('cs_test_plus1234567890ab', { payment_status: 'paid', amount_total: 499, price: PLUS_PRICE });
  const r = await sync({ username: 'alice', session_id: 'cs_test_plus1234567890ab', action: 'activate' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const u = await fsGet('users/alice');
  assert.strictEqual(u.isPlus, true);
  assert.strictEqual(u.isBusinessPlus, false);
  assert.strictEqual(await fsGet('users/alice/billing/cs_test_plus1234567890ab'), null);
});

t('webhook: the Stripe checkout event for the same free Business session keeps the Business Plus (free) row', async () => {
  await sync({ username: 'alice', session_id: SID, action: 'activate' });
  const r = await webhook(Object.assign({}, sessions[SID], { metadata: {} }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.kept, 'free');
  const b = await fsGet('users/alice/billing/' + SID);
  assert.deepStrictEqual([b.item, b.amountCents, b.status], ['Business Plus (free)', 0, 'free']);
});

t('webhook: without a prior free row a subscription checkout is still recorded as before', async () => {
  const r = await webhook(Object.assign({}, sessions[SID_PAID], { amount_total: 1500, metadata: {} }));
  assert.strictEqual(r.body.billing, true, JSON.stringify(r.body));
  const b = await fsGet('users/alice/billing/' + SID_PAID);
  assert.deepStrictEqual([b.item, b.amountCents, b.status], ['Pixlynote subscription', 1500, 'paid']);
});

const meta = (u, status) => ({ ['business-verify/' + u + '/meta.json']: { username: u, status, legalName: 'Secret Legal Name ' + u, email: u + '@private.example', ein: '12-3456789' } });

t('pending-count: counts ALL pending applications and returns only a number (no names, emails or documents)', async () => {
  env.BUSINESS_VERIFY = fakeBucket(Object.assign({}, meta('a1', 'pending'), meta('a2', 'pending'), meta('a3', 'approved'), meta('a4', 'rejected'), meta('a5', 'more_info'),
    { 'business-verify/a1/doc-1.pdf': 'x' }));
  const r = await count();
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(JSON.parse(r.text), { ok: true, pending: 2 });
  for (const leak of ['Secret Legal Name', '@private.example', '12-3456789', 'a1', 'a3']) assert.ok(!r.text.includes(leak), 'response must not contain ' + leak);
});

t('pending-count: pages through more than one R2 page, and zero pending is a real 0', async () => {
  const many = {};
  for (let i = 0; i < 7; i++) Object.assign(many, meta('u' + i, i % 2 === 0 ? 'pending' : 'approved'));
  env.BUSINESS_VERIFY = fakeBucket(many, { pageSize: 3 });
  assert.strictEqual(JSON.parse((await count()).text).pending, 4);
  env.BUSINESS_VERIFY = fakeBucket(meta('only', 'approved'));
  assert.deepStrictEqual(JSON.parse((await count({ ip: '203.0.113.10' })).text), { ok: true, pending: 0 });
});

t('pending-count: failures are honest: no storage 503, R2 error 502, bad Origin 403, rate limit 429; never a fake 0', async () => {
  const none = await count({ env: Object.assign({}, env, { BUSINESS_VERIFY: null, VERIFY_DOCS: null }) });
  assert.strictEqual(none.status, 503);
  assert.deepStrictEqual(JSON.parse(none.text), { ok: false, error: 'storage_not_configured' });
  const down = await count({ env: Object.assign({}, env, { BUSINESS_VERIFY: fakeBucket({}, { listFails: true }) }), ip: '203.0.113.11' });
  assert.strictEqual(down.status, 502);
  assert.strictEqual(JSON.parse(down.text).error, 'count_failed');
  assert.strictEqual(JSON.parse(down.text).pending, undefined, 'no count on failure');
  const bad = await count({ origin: 'https://evil.example', ip: '203.0.113.12' });
  assert.strictEqual(bad.status, 403);
  const noOrigin = await count({ origin: null, ip: '203.0.113.13' });
  assert.strictEqual(noOrigin.status, 403);
  let last;
  for (let i = 0; i < 62; i++) last = await count({ ip: '198.51.100.7' });
  assert.strictEqual(last.status, 429);
  assert.strictEqual(JSON.parse(last.text).error, 'rate_limited');
});

t('pending-count: the application list and decisions still need the admin token', async () => {
  env.ADMIN_TOKEN = 'admin-secret-for-test';
  for (const [m, p] of [['GET', '/business-verification/admin/list'], ['POST', '/business-verification/admin/decision']]) {
    const res = await worker.default.fetch(new Request('https://worker.test' + p, { method: m, headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: m === 'POST' ? JSON.stringify({ username: 'a1', decision: 'approve' }) : undefined }), env);
    assert.ok(res.status === 401 || res.status === 403 || res.status === 404, m + ' ' + p + ' without a token must be refused, got ' + res.status);
  }
});
