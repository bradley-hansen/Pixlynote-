'use strict';
// Phase 2 Worker: POST /sync-subscription writes Plus flags via the emulator (never production).
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const SRC = path.resolve(__dirname, '..', '..', '..', 'worker', 'worker.db-lockdown.js');
const PATCH = path.resolve(__dirname, '..', '..', 'tools', 'phase2', 'patch_worker.py');
const OUT = path.resolve(__dirname, '..', '..', '..', 'worker', 'worker.phase2.js');
const PROJECT = 'demo-pixlynote-rules';
const FS = 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const AUTH = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const ORIGIN = 'https://bradley-hansen.github.io';
const PRICE = 'price_1UbNIvFSVMbdmupTwHKWqLKj';
const SID = 'cs_test_abcdefghijklmnopqrstuvwxyz';

let worker, Guard, guard, env, realFetch;

function ensurePatched() {
  if (!fs.existsSync(SRC) || !fs.existsSync(PATCH)) return '';
  execFileSync('python3', [PATCH, SRC, OUT], { encoding: 'utf8' });
  return OUT;
}
const FILE = process.env.WORKER_PHASE2_FILE || (fs.existsSync(OUT) || fs.existsSync(SRC) ? ensurePatched() : '');

async function loadWorker() {
  const src = fs.readFileSync(FILE, 'utf8').replace(/import\s*\{\s*DurableObject\s*\}\s*from\s*["']cloudflare:workers["'];?/,
    'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  const tmp = path.join(os.tmpdir(), 'worker-phase2-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, src);
  return import('file://' + tmp + '?t=' + Date.now());
}
function makeGuard(GuardClass) {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...args) { const st = db.prepare(q); const rows = /^\s*select/i.test(q) ? st.all(...args) : (st.run(...args), []); return { toArray: () => rows }; } };
  return new GuardClass({ storage: { sql, getAlarm: async () => 1, setAlarm: async () => {} } }, {});
}
async function fsPut(p, fields) {
  const toVal = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toVal(v)])) };
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.ok(r.ok, 'seed ' + p + ' ' + r.status);
}
async function fsGet(p) {
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`, { headers: { Authorization: 'Bearer owner' } });
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
function plusSession(overrides) {
  return Object.assign({
    id: SID, object: 'checkout.session', status: 'complete', payment_status: 'paid', mode: 'subscription',
    client_reference_id: 'alice', livemode: false,
    customer: 'cus_test_1',
    subscription: { id: 'sub_test_1', status: 'active', cancel_at_period_end: false, current_period_end: 2000000000, items: { data: [] } },
    line_items: { data: [{ price: { id: PRICE } }] }
  }, overrides || {});
}
async function call(p, body) {
  const req = new Request('https://worker.test' + p, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await worker.default.fetch(req, env);
  return { status: res.status, body: await res.json() };
}
async function resetEmulators() {
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

before(async () => {
  if (!FILE) return;
  await resetEmulators();
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.stripe.com/v1/checkout/sessions/')) {
      const sid = decodeURIComponent(u.split('/sessions/')[1].split('?')[0]);
      if (sid !== SID) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(plusSession()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, init);
  };
  const mod = await loadWorker();
  worker = mod; Guard = mod.Guard; guard = makeGuard(Guard);
  env = {
    FIRESTORE_BASE: FS, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_API_KEY: 'fake', AUTH_EMULATOR_BASE: AUTH,
    STRIPE_SECRET_KEY: 'sk_test_fake', EMAIL_MODE: 'test', SMS_MODE: 'test',
    GUARD: { idFromName: () => 'global', get: () => guard },
  };
  await fsPut('users/alice', { username: 'alice', isPlus: false, isVerified: false });
});

const t = (name, fn) => test(name, { skip: FILE ? false : 'phase2 worker source not present' }, fn);

t('health reports sync_subscription when the Auth emulator is available', async () => {
  const req = new Request('https://worker.test/health', { headers: { Origin: ORIGIN } });
  const res = await worker.default.fetch(req, env);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.sync_subscription, true);
});

t('POST /sync-subscription writes isPlus and isVerified for the session owner', async () => {
  const r = await call('/sync-subscription', { username: 'alice', session_id: SID, action: 'activate' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.ok, true);
  const doc = await fsGet('users/alice');
  assert.strictEqual(doc.isPlus, true);
  assert.strictEqual(doc.isVerified, true);
  assert.strictEqual(doc.subscriptionStatus, 'active');
});

t('POST /sync-subscription refuses a username that does not own the session', async () => {
  const r = await call('/sync-subscription', { username: 'mallory', session_id: SID, action: 'activate' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.error, 'not_owner');
  const mallory = await fsGet('users/mallory');
  assert.strictEqual(mallory, null);
});

t('POST /sync-subscription cancel clears Plus flags for the owner', async () => {
  const r = await call('/sync-subscription', { username: 'alice', session_id: SID, action: 'cancel' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const doc = await fsGet('users/alice');
  assert.strictEqual(doc.isPlus, false);
  assert.strictEqual(doc.isVerified, false);
  assert.strictEqual(doc.subscriptionStatus, 'canceled');
});

t('without a service account or Auth emulator the route changes nothing (503)', async () => {
  const req = new Request('https://worker.test/sync-subscription', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', session_id: SID, action: 'activate' }) });
  const res = await worker.default.fetch(req, { ...env, AUTH_EMULATOR_BASE: '', FIREBASE_SA_JSON: '' });
  const body = await res.json();
  assert.strictEqual(res.status, 503);
  assert.strictEqual(body.error, 'auth_admin_unavailable');
});
