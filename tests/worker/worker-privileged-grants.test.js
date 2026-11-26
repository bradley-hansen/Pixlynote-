'use strict';
// Privileged Access 'Spend on Promote' grant (branch grokbot/privileged-grants): /promote/checkout lets a delegate
// start checkout for the owner only when users/{owner}.delegateUids lists the delegate's uid AND
// delegateGrants[uid] includes 'promote'. The receipt records delegatedBy. Emulators only; Stripe is faked here.
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
const OUT = path.join(WDIR, 'worker.promote.js');
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
  const tmp = path.join(os.tmpdir(), 'worker-privgrants-' + process.pid + '.mjs');
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
  tokens = { alice: await signUp('alice-g@example.test'), bob: await signUp('bob-g@example.test'), pat: await signUp('pat-g@example.test'), dee: await signUp('dee-g@example.test') };
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
  await fsPut('users/alice', { username: 'alice', uid: tokens.alice.uid, isPrivate: false,
    delegateUids: [tokens.dee.uid, tokens.bob.uid], delegateGrants: { [tokens.dee.uid]: ['promote'], [tokens.bob.uid]: ['like', 'comment'] } });
  await fsPut('users/dee', { username: 'dee', uid: tokens.dee.uid, isPrivate: false });
  await fsPut('uidIndex/' + tokens.dee.uid, { username: 'dee' });
  await fsPut('uidIndex/' + tokens.bob.uid, { username: 'bob' });
  await fsPut('users/bob', { username: 'bob', uid: tokens.bob.uid, isPrivate: false });
  await fsPut('users/private_pat', { username: 'private_pat', uid: tokens.pat.uid, isPrivate: true });
  await fsPut('posts/p1', { id: 'p1', author: 'alice', authorPrivate: false, caption: 'mine' });
  await fsPut('posts/p_cf', { id: 'p_cf', author: 'alice', authorPrivate: false, caption: 'close friends', audience: 'close_friends' });
  await fsPut('posts/p_pat', { id: 'p_pat', author: 'private_pat', authorPrivate: true, caption: 'private' });
  await fsPut('users/alice/content/profile', { notes: [{ id: 'n1', author: 'alice', text: 'note text', audience: 'public' }, { id: 'n2', author: 'alice', text: 'cf', audience: 'close_friends' }] });
});

const t = (name, fn) => test(name, { skip: FILE ? false : 'worker source not present' }, fn);

t('promote grant: a delegate with Spend on Promote gets checkout for the owner; metadata names the delegate', async () => {
  const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, idToken: tokens.dee.idToken });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const b = stripeCalls.find((c) => c.url.endsWith('/v1/checkout/sessions')).body;
  assert.strictEqual(b.get('client_reference_id'), 'alice');
  assert.strictEqual(b.get('metadata[username]'), 'alice');
  assert.strictEqual(b.get('metadata[delegatedBy]'), 'dee');
});

t('promote grant: a delegate without the promote grant (other grants on) is refused', async () => {
  const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, idToken: tokens.bob.idToken });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.error, 'not_owner');
  assert.strictEqual(stripeCalls.length, 0);
});

t('promote grant: a grant left behind after the delegate was removed from delegateUids does nothing', async () => {
  await fsPut('users/alice', { username: 'alice', uid: tokens.alice.uid, isPrivate: false, delegateUids: [], delegateGrants: { [tokens.dee.uid]: ['promote'] } });
  const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, idToken: tokens.dee.idToken });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(stripeCalls.length, 0);
});

t('promote grant: a stranger is refused; the owner still works and has no delegatedBy', async () => {
  const s = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, idToken: tokens.pat.idToken });
  assert.strictEqual(s.status, 403);
  const o = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, idToken: tokens.alice.idToken });
  assert.strictEqual(o.status, 200, JSON.stringify(o.body));
  const b = stripeCalls.find((c) => c.url.endsWith('/v1/checkout/sessions')).body;
  assert.strictEqual(b.get('metadata[delegatedBy]'), null);
});

t('promote grant: the paid receipt in Billing History records delegatedBy', async () => {
  const sess = paidSession({ amount: 25, meta: { delegatedBy: 'dee' } });
  const r = await webhook(sess);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const rec = await fsGet('users/alice/billing/' + sess.id);
  assert.ok(rec, 'billing record written');
  assert.strictEqual(rec.delegatedBy, 'dee');
});

t('promote grant: on an exempt (free) account the delegate promotion is free and History records delegatedBy; no grant = still refused', async () => {
  await fsPut('promoteSettings/exempt', { usernames: ['alice'], updatedAt: 1, updatedBy: 'pixlynote' });
  const no = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, idToken: tokens.bob.idToken });
  assert.strictEqual(no.status, 403, 'free list never bypasses the promote grant');
  const r = await post('/promote/checkout', { username: 'alice', kind: 'post', id: 'p1', amount: 25, idToken: tokens.dee.idToken });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.free, true);
  assert.strictEqual(stripeCalls.length, 0);
  const d = await fsGet('posts/p1');
  const bill = await fsGet('users/alice/billing/' + d.promoteSessionId);
  assert.deepStrictEqual([bill.status, bill.amountCents, bill.delegatedBy], ['free', 0, 'dee']);
});
