'use strict';
// Worker (misty-frog) database-lockdown checks against the local Firestore + Auth emulators (never production).
// The Worker source lives outside this repo: WORKER_FILE=/path/to/worker.db-lockdown.js npm run test:worker
// Skips cleanly when WORKER_FILE is not set.
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_WORKER = path.resolve(__dirname, '..', '..', '..', 'worker', 'worker.db-lockdown.js');
const FILE = process.env.WORKER_FILE || (fs.existsSync(DEFAULT_WORKER) ? DEFAULT_WORKER : '');
const PROJECT = 'demo-pixlynote-rules';
const FS = 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const AUTH = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const ORIGIN = 'https://bradley-hansen.github.io';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const ckey = (kind, norm) => sha('pixlynote-contact-v1|' + kind + '|' + norm);

let worker, Guard, guard, env;

async function loadWorker() {
  // Swap the Cloudflare runtime import for a tiny stand-in and import the module as ESM.
  const src = fs.readFileSync(FILE, 'utf8').replace(/import\s*\{\s*DurableObject\s*\}\s*from\s*["']cloudflare:workers["'];?/,
    'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  const tmp = path.join(os.tmpdir(), 'worker-db-lockdown-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, src);
  const mod = await import('file://' + tmp);
  return mod;
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
async function authSignUp(email, password) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json(); assert.ok(j.localId, 'auth signUp'); return j.localId;
}
async function authSignIn(email, password) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return r.ok;
}
async function call(p, body, extraEnv) {
  const req = new Request('https://worker.test' + p, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await worker.default.fetch(req, { ...env, ...(extraEnv || {}) });
  return { status: res.status, body: await res.json() };
}

const ALICE_EMAIL = 'alice.private@example.test';
const ALICE_AUTH = 'alice.0123456789ab@users.pixlynote.app';
const LEGACY_EMAIL = 'legacy@example.test';

async function resetEmulators() {
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

before(async () => {
  if (!FILE) return;
  await resetEmulators();
  const mod = await loadWorker();
  worker = mod; Guard = mod.Guard; guard = makeGuard(Guard);
  env = {
    FIRESTORE_BASE: FS, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_API_KEY: 'fake', AUTH_EMULATOR_BASE: AUTH,
    EMAIL_MODE: 'test', SMS_MODE: 'test', GUARD: { idFromName: () => 'global', get: () => guard },
  };
  const uid = await authSignUp(ALICE_AUTH, 'pixlynote_v1:old-password');
  await fsPut('users/alice', { username: 'alice', uid, authEmail: ALICE_AUTH, isPrivate: false });
  await fsPut('contactIndex/' + ckey('email', ALICE_EMAIL), { usernames: ['alice'], by: 'alice' });
  await fsPut('contactIndex/' + ckey('phone', '5555550123'), { usernames: ['alice'], by: 'alice' });
  await fsPut('users/legacy_user', { username: 'legacy_user', email: LEGACY_EMAIL, passwordHash: 'sha256:x' });
  await fsPut('users/bob', { username: 'bob', uid: 'uid-bob' });
});

const t = (name, fn) => test(name, { skip: FILE ? false : 'WORKER_FILE not set' }, fn);

t('migrated account: emails go to the address in the contact index (email is not on the public doc)', async () => {
  const r = await call('/email', { type: 'password_changed', to: ALICE_EMAIL, username: 'alice' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.sent, true);
  const bad = await call('/email', { type: 'password_changed', to: 'victim@example.test', username: 'alice' });
  assert.strictEqual(bad.status, 403);
});
t('legacy account: public email fallback still works', async () => {
  const r = await call('/email', { type: 'password_changed', to: LEGACY_EMAIL, username: 'legacy_user' });
  assert.strictEqual(r.status, 200);
});
t('sign-up taken checks see indexed email and phone', async () => {
  const e = await call('/email', { type: 'signup_code', to: ALICE_EMAIL, username: 'newbie' });
  assert.strictEqual(e.status, 409); assert.strictEqual(e.body.error, 'email_taken');
  const p = await call('/sms/send', { phone: '+1 (555) 555-0123' });
  assert.strictEqual(p.body.error, 'phone_taken');
  const free = await call('/email', { type: 'signup_code', to: 'fresh@example.test', username: 'newbie' });
  assert.strictEqual(free.status, 200);
});
t('password reset of a migrated account updates Firebase Auth only after a verified code, once', async () => {
  const noCode = await call('/auth/reset-password', { to: ALICE_EMAIL, username: 'alice', newPassword: 'brand-new-pw' });
  assert.strictEqual(noCode.status, 403);
  const sent = await call('/email', { type: 'reset_code', to: ALICE_EMAIL });
  assert.strictEqual(sent.body.sent, true);
  const v = await call('/email/reset-verify', { to: ALICE_EMAIL, code: sent.body.debug_code });
  assert.strictEqual(v.body.valid, true); assert.strictEqual(v.body.username, 'alice');
  const wrongAcct = await call('/auth/reset-password', { to: ALICE_EMAIL, username: 'bob', newPassword: 'brand-new-pw' });
  assert.strictEqual(wrongAcct.status, 403);
  const ok = await call('/auth/reset-password', { to: ALICE_EMAIL, username: 'alice', newPassword: 'brand-new-pw' });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.ok, true);
  assert.strictEqual(await authSignIn(ALICE_AUTH, 'pixlynote_v1:brand-new-pw'), true);
  assert.strictEqual(await authSignIn(ALICE_AUTH, 'pixlynote_v1:old-password'), false);
  const replay = await call('/auth/reset-password', { to: ALICE_EMAIL, username: 'alice', newPassword: 'again-pw-123' });
  assert.strictEqual(replay.status, 403);
});
t('without the service-account secret the reset route changes nothing (503)', async () => {
  const r = await call('/auth/reset-password', { to: ALICE_EMAIL, username: 'alice', newPassword: 'whatever-pw' }, { AUTH_EMULATOR_BASE: '' });
  assert.strictEqual(r.status, 503); assert.strictEqual(r.body.error, 'auth_admin_unavailable');
});
t('bad input and foreign origins are refused', async () => {
  const r = await call('/auth/reset-password', { to: 'x', username: 'alice', newPassword: '1' });
  assert.strictEqual(r.status, 400);
  const req = new Request('https://worker.test/auth/reset-password', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual((await worker.default.fetch(req, env)).status, 403);
});
