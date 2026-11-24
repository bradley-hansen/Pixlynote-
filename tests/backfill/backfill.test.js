'use strict';
// End-to-end backfill rehearsal in the local emulators (Firestore + Auth) with the real firestore.rules.
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PROJECT = 'demo-pixlynote-rules';
const FS = 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const AUTH = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const DOCS = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
const SCRIPT = path.join(__dirname, '..', '..', 'tools', 'db-lockdown', 'backfill.js');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pixly-backfill-'));
const hash = (pw) => 'sha256:' + crypto.createHash('sha256').update('pixlynote_v1:' + pw).digest('hex');
const ckey = (kind, n) => crypto.createHash('sha256').update('pixlynote-contact-v1|' + kind + '|' + n).digest('hex');
const toVal = (v) => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } } : { stringValue: String(v) };
const fromVal = (v) => v == null ? undefined : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'arrayValue' in v ? (v.arrayValue.values || []).map(fromVal) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromVal(x)])) : null;
async function put(p, obj) {
  const r = await fetch(`${DOCS}/${p}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toVal(v)])) }) });
  assert.ok(r.ok, 'seed ' + p);
}
async function get(p, token) {
  const r = await fetch(`${DOCS}/${p}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!r.ok) return { status: r.status, data: null };
  const j = await r.json(); return { status: 200, data: Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromVal(v)])) };
}
async function signIn(email, password) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  return r.ok ? (await r.json()).idToken : null;
}
const run = (...a) => execFileSync(process.execPath, [SCRIPT, ...a, '--emulator', '--dir', DIR], { encoding: 'utf8', env: process.env });

async function resetEmulators() {
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

before(async () => {
  await resetEmulators();
  await put('users/alice', { username: 'alice', fullName: 'Alice', passwordHash: hash('alice-pw-1'), email: 'Alice@Example.test', phone: '(555) 555-0101', isPlus: true, likedPostIds: ['p1'], savedPostIds: ['p2'], following: ['pat'], dms: [{ with: 'pat', text: 'hi' }], stripeCustomerId: 'cus_x', contactPrefs: { showEmail: true, showPhone: false }, isPrivate: false });
  await put('users/pat', { username: 'pat', fullName: 'Pat', passwordHash: hash('pat-pw-22'), email: 'pat@example.test', isPrivate: true, customPosts: [{ id: 'cp1' }] });
  await put('users/persona_jane', { username: 'persona_jane', fullName: 'Jane', email: 'jane@example.test' });
  await put('users/Q1s3sbFaIuUtEb73ajmADaNJCxy2', { email: 'junk@example.test', dms: [] });
  await put('users/alice__dms', { dms: [] });
  await put('posts/p1', { id: 'p1', author: 'alice', caption: 'public' });
  await put('posts/p2', { id: 'p2', author: 'pat', caption: 'private' });
  await put('posts/p3', { id: 'p3', username: 'alice', caption: 'old post without author' });
});

test('dry runs change nothing', async () => {
  run('backup'); run('plan');
  const out = run('migrate');
  assert.match(out, /dry run/);
  assert.strictEqual((await get('users/alice')).data.uid, undefined);
  assert.ok(!/@example\.test|sha256:|555/.test(out), 'no PII or hashes printed');
});
test('canary: --only migrates one account and leaves everyone else untouched', async () => {
  assert.match(run('import-auth', '--apply', '--only', 'alice'), /1 to create/);
  run('migrate', '--apply', '--only', 'alice');
  assert.match(run('verify', '--only', 'alice'), /1\/1 accounts OK/);
  assert.ok((await get('users/alice')).data.uid, 'alice migrated');
  assert.strictEqual((await get('users/pat')).data.uid, undefined, 'pat untouched');
  const raw = await fetch(`${DOCS}/posts/p2`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
  assert.ok(!('authorPrivate' in (raw.fields || {})), "pat's post not stamped yet");
  assert.ok(!fs.existsSync(path.join(DIR, 'verify.json')), 'canary verify cannot unlock cleanup');
});
test('full rehearsal: import, migrate, verify, cleanup; every account still logs in and keeps its data', async () => {
  const plan = JSON.parse(fs.readFileSync(path.join(DIR, 'plan.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(plan.accounts).sort(), ['alice', 'pat']);
  assert.deepStrictEqual(plan.junk.sort(), ['Q1s3sbFaIuUtEb73ajmADaNJCxy2', 'alice__dms'].sort());
  const auth = JSON.parse(fs.readFileSync(path.join(DIR, 'auth-import.json'), 'utf8'));
  assert.ok(auth.users.every((u) => u.email.endsWith('@users.pixlynote.app')), 'placeholder login emails only');
  const logs = [run('import-auth', '--apply'), run('migrate', '--apply'), run('verify')];
  assert.match(logs[0], /1 already in Firebase Auth, 1 to create/);
  assert.match(logs[2], /2\/2 accounts OK/);
  // Same password as before: Auth stores the existing SHA-256 digest (base64 of the raw bytes, 1 round).
  // The Auth emulator cannot check imported hashes (it only stores them), so production does a canary
  // sign-in first (DB-LOCKDOWN.md step 4b). Here we check the stored hash, then set an emulator password
  // only to get real ID tokens for the rules checks below.
  for (const [u, pw] of [['alice', 'alice-pw-1'], ['pat', 'pat-pw-22']]) {
    const lk = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [plan.accounts[u].uid] }) }).then((r) => r.json());
    const want = crypto.createHash('sha256').update('pixlynote_v1:' + pw).digest('base64');
    assert.strictEqual(lk.users[0].passwordHash, want, u + ': imported hash matches the old password');
    assert.strictEqual(lk.users[0].email, plan.accounts[u].authEmail);
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: plan.accounts[u].uid, password: 'pixlynote_v1:' + pw }) });
  }
  const aliceTok = await signIn(plan.accounts.alice.authEmail, 'pixlynote_v1:alice-pw-1');
  assert.ok(aliceTok);
  // Idempotent.
  assert.match(run('import-auth', '--apply'), /2 already in Firebase Auth, 0 to create/);
  logs.push(run('cleanup', '--apply', '--delete-junk'));
  for (const l of logs) assert.ok(!/@example\.test|sha256:[0-9a-f]|cus_x/.test(l), 'no PII or hashes printed');

  const pub = (await get('users/alice')).data;
  assert.strictEqual(pub.email, undefined); assert.strictEqual(pub.phone, undefined); assert.strictEqual(pub.passwordHash, undefined);
  assert.strictEqual(pub.dms, undefined); assert.strictEqual(pub.stripeCustomerId, undefined);
  assert.strictEqual(pub.publicEmail, 'Alice@Example.test', 'contact button kept because showEmail was on');
  assert.strictEqual(pub.publicPhone, undefined, 'phone hidden because showPhone was off');
  assert.strictEqual(pub.isPlus, true); assert.deepStrictEqual(pub.likedPostIds, ['p1']); assert.deepStrictEqual(pub.savedPostIds, ['p2']); assert.deepStrictEqual(pub.following, ['pat']);
  // Owner reads private data with their own token; a stranger cannot.
  const priv = await get('users/alice/private/account', aliceTok);
  assert.strictEqual(priv.status, 200); assert.strictEqual(priv.data.email, 'Alice@Example.test'); assert.strictEqual(priv.data.phone, '(555) 555-0101'); assert.strictEqual(priv.data.stripeCustomerId, 'cus_x');
  assert.notStrictEqual((await get('users/alice/private/account')).status, 200);
  // Contact index (normalized) for taken checks / Worker.
  assert.deepStrictEqual((await get('contactIndex/' + ckey('email', 'alice@example.test'))).data.usernames, ['alice']);
  assert.deepStrictEqual((await get('contactIndex/' + ckey('phone', '5555550101'))).data.usernames, ['alice']);
  // Private account: customPosts mirror moved, posts stamped; strangers cannot read the private post.
  assert.deepStrictEqual((await get('users/pat')).data.customPosts, []);
  assert.strictEqual((await get('posts/p2')).status !== 200, true);
  assert.strictEqual((await get('posts/p1')).data.authorPrivate, false);
  assert.strictEqual((await get('posts/p3')).data.author, 'alice');
  // Stub persona keeps its doc; its email moved to the admin-only private doc. Junk archived then deleted.
  assert.strictEqual((await get('users/persona_jane')).data.fullName, 'Jane');
  assert.strictEqual((await get('users/persona_jane')).data.email, undefined);
  assert.strictEqual((await get('users/alice__dms')).status, 404);
  assert.ok(fs.existsSync(path.join(DIR, 'junk-archive.json')));
  assert.strictEqual((fs.statSync(path.join(DIR, 'backup.json')).mode & 0o777), 0o600);
});
