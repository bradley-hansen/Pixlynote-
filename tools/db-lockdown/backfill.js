#!/usr/bin/env node
'use strict';
/*
 * Pixlynote database lockdown backfill. DRY RUN unless --apply. Never prints emails, phones, hashes or secrets.
 *
 * Target (pick one):
 *   --emulator                       local emulators (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST)
 *   --sa /path/key.json              production with a Google service-account key (Bradley's Go required)
 *   --project <id>                   default: pixlynote (emulator: demo-pixlynote-rules)
 *
 * Steps (run in this order; each production run needs Bradley's Go):
 *   backup  --dir D                  copy users (+ private), posts, accountCenters, contactIndex, uidIndex to D (mode 600)
 *   plan    --dir D                  choose uid + placeholder login email per real account; writes D/plan.json, D/auth-import.json
 *   import-auth --dir D [--apply]    create the Firebase Auth users with their existing password hashes (SHA256, 1 round)
 *   migrate --dir D [--apply]        uid/authEmail on users/{u}, uidIndex, users/{u}/private/account, contactIndex, posts.authorPrivate
 *   verify  --dir D                  every account: Auth user, private doc == backup, index entries, posts stamped, nothing lost
 *   cleanup --dir D [--apply] [--delete-junk]
 *                                    remove private fields + passwordHash from public docs (only for verified accounts);
 *                                    --delete-junk also deletes docs that are not accounts (auth-uid copies, __dms) after archiving
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const EMU = flag('emulator');
const APPLY = flag('apply');
const PROJECT = opt('project', EMU ? 'demo-pixlynote-rules' : 'pixlynote');
const DIR = opt('dir', '');
// --only u1,u2 limits import-auth / migrate / verify to those accounts (canary).
const ONLY = (opt('only', '') || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const inScope = (u) => !ONLY.length || ONLY.includes(u);
const FS_HOST = EMU ? 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085') : 'https://firestore.googleapis.com';
const AUTH_HOST = EMU ? 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099') + '/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
const DOCS = `${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH_LOGIN_DOMAIN = 'users.pixlynote.app';
const CONTACT_SALT = 'pixlynote-contact-v1|';

// Same lists as the guard in index.html and firestore.rules.
const PRIVATE_FIELDS = ['email', 'phone', 'dms', 'lastDmUpdated', 'loginActivityLog', 'otherSessions', 'sessionRevokedAt',
  'stripeCustomerId', 'stripeSubscriptionId', 'stripeBusinessSubscriptionId', 'verificationEmail',
  'accountCenterAccounts', 'removedAccountCenterUsernames'];
const CREDENTIAL_FIELDS = ['passwordHash', 'password'];

const log = (...a) => console.log(...a);
const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };
if (!cmd || cmd === '--help') { log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
if (!DIR) die('--dir is required');
if (!EMU && !opt('sa')) die('production needs --sa <service-account key file>; use --emulator for local runs');

// ---------- auth ----------
let tokenCache = null;
async function bearer() {
  if (EMU) return 'owner';
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const sa = JSON.parse(fs.readFileSync(opt('sa'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + sig });
  if (!r.ok) die('could not get an access token (' + r.status + ')');
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}
async function api(url, init) {
  const r = await fetch(url, { ...(init || {}), headers: { Authorization: 'Bearer ' + (await bearer()), 'Content-Type': 'application/json', ...((init && init.headers) || {}) } });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch (e) { body = text; }
  return { ok: r.ok, status: r.status, body };
}

// ---------- Firestore REST (raw Value objects are kept as-is, so nothing is lost in conversion) ----------
const docId = (name) => name.split('/').pop();
const relPath = (name) => name.split('/documents/')[1];
async function listCollection(p) {
  const out = []; let pageToken = '';
  do {
    const r = await api(`${DOCS}/${p}?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`);
    if (!r.ok) die('list ' + p + ' failed (' + r.status + ')');
    for (const d of (r.body.documents || [])) out.push({ path: relPath(d.name), id: docId(d.name), fields: d.fields || {} });
    pageToken = r.body.nextPageToken || '';
  } while (pageToken);
  return out;
}
async function getDoc(p) {
  const r = await api(`${DOCS}/${p}`);
  if (r.status === 404) return null;
  if (!r.ok) die('get ' + p + ' failed (' + r.status + ')');
  return r.body.fields || {};
}
async function commit(writes) {
  if (!writes.length) return;
  for (let i = 0; i < writes.length; i += 400) {
    const r = await api(`${DOCS.replace(/\/documents$/, '')}/documents:commit`, { method: 'POST', body: JSON.stringify({ writes: writes.slice(i, i + 400) }) });
    if (!r.ok) die('commit failed (' + r.status + '): ' + JSON.stringify(r.body).slice(0, 300));
  }
}
const fullName = (p) => `projects/${PROJECT}/databases/(default)/documents/${p}`;
const mergeWrite = (p, fields) => ({ update: { name: fullName(p), fields }, updateMask: { fieldPaths: Object.keys(fields).map((k) => '`' + k.replace(/`/g, '\\`') + '`') } });
const deleteFieldsWrite = (p, keys) => ({ update: { name: fullName(p), fields: {} }, updateMask: { fieldPaths: keys.map((k) => '`' + k + '`') }, currentDocument: { exists: true } });
const arrayUnionWrite = (p, field, strs) => ({ transform: { document: fullName(p), fieldTransforms: [{ fieldPath: field, appendMissingElements: { values: strs.map((s) => ({ stringValue: s })) } }] } });
const sv = (v) => (v && typeof v.stringValue === 'string') ? v.stringValue : '';
const bv = (v) => !!(v && v.booleanValue === true);

// ---------- helpers ----------
const normU = (u) => String(u || '').trim().toLowerCase().replace(/^@/, '');
function normalizeContact(kind, value) {
  if (kind === 'email') { const em = String(value || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) ? em : ''; }
  let d = String(value || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? d : '';
}
const contactKey = (kind, v) => { const n = normalizeContact(kind, v); return n ? crypto.createHash('sha256').update(CONTACT_SALT + kind + '|' + n).digest('hex') : ''; };
const isRealAccount = (d) => /^sha256:[0-9a-f]{64}$/.test(sv(d.fields.passwordHash)) && normU(sv(d.fields.username) || d.id) === d.id;
const isJunk = (d) => /__dms$/.test(d.id) || (/^[A-Za-z0-9]{28}$/.test(d.id) && !sv(d.fields.username));
const writeJson = (f, obj) => { fs.writeFileSync(path.join(DIR, f), JSON.stringify(obj, null, 2), { mode: 0o600 }); };
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function backup() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const users = await listCollection('users');
  const privates = {};
  for (const u of users) { const p = await getDoc(`users/${u.id}/private/account`); if (p) privates[u.id] = p; }
  const snap = { at: new Date().toISOString(), project: PROJECT, users, privates,
    posts: await listCollection('posts'), accountCenters: await listCollection('accountCenters'),
    contactIndex: await listCollection('contactIndex'), uidIndex: await listCollection('uidIndex') };
  // Firebase Auth: every existing user (ids, providers, timestamps; hashes are kept only in the mode-600 file).
  const authUsers = []; let next = '';
  do {
    const r = await api(`${AUTH_HOST}/v1/projects/${PROJECT}/accounts:batchGet?maxResults=1000${next ? '&nextPageToken=' + encodeURIComponent(next) : ''}`);
    if (!r.ok) die('Auth export failed (' + r.status + ')');
    (r.body.users || []).forEach((u) => authUsers.push(u));
    next = r.body.nextPageToken || '';
  } while (next);
  snap.auth = authUsers;
  writeJson('backup.json', snap);
  const anonAuth = authUsers.filter((u) => !u.email && !(u.providerUserInfo || []).length).length;
  log(`backup: ${users.length} users, ${Object.keys(privates).length} private docs, ${snap.posts.length} posts, ${snap.accountCenters.length} account centers, ${snap.contactIndex.length} contact index, ${snap.uidIndex.length} uid index, ${authUsers.length} Auth users (${anonAuth} anonymous) -> ${path.join(DIR, 'backup.json')} (mode 600)`);
}

function plan() {
  const b = readJson('backup.json');
  const prev = fs.existsSync(path.join(DIR, 'plan.json')) ? readJson('plan.json') : { accounts: {} };
  const accounts = {}; const importUsers = []; const skipped = []; const junk = [];
  for (const d of b.users) {
    if (isJunk(d)) { junk.push(d.id); continue; }
    if (!isRealAccount(d)) {
      if (sv(d.fields.passwordHash) || sv(d.fields.password)) skipped.push(d.id + ' (password not sha256: needs a reset after migration)');
      continue;
    }
    const keep = prev.accounts[d.id];
    const uid = sv(d.fields.uid) || (keep && keep.uid) || ('px' + crypto.randomBytes(13).toString('hex'));
    const authEmail = sv(d.fields.authEmail) || (keep && keep.authEmail) || (d.id.replace(/[^a-z0-9_.]/g, '').slice(0, 30) + '.' + crypto.randomBytes(6).toString('hex') + '@' + AUTH_LOGIN_DOMAIN);
    accounts[d.id] = { uid, authEmail, isPrivate: bv(d.fields.isPrivate) };
    const hex = sv(d.fields.passwordHash).slice(7);
    importUsers.push({ localId: uid, email: authEmail, emailVerified: false, passwordHash: Buffer.from(hex, 'hex').toString('base64'), displayName: d.id });
  }
  writeJson('plan.json', { at: new Date().toISOString(), project: b.project, accounts, junk, skipped });
  writeJson('auth-import.json', { users: importUsers });
  const stubs = b.users.length - Object.keys(accounts).length - junk.length;
  log(`plan: ${Object.keys(accounts).length} real accounts (${Object.keys(accounts).join(', ')}), ${stubs} stub/persona docs left as they are, ${junk.length} non-account docs to archive, ${skipped.length} needing a reset.`);
  if (skipped.length) log('  needs reset: ' + skipped.map((s) => s.split(' ')[0]).join(', '));
  log(`  Auth import file: ${path.join(DIR, 'auth-import.json')} (firebase auth:import ... --hash-algo=SHA256 --rounds=1)`);
}

async function importAuth() {
  const imp = readJson('auth-import.json');
  // Skip users that already exist (idempotent).
  const todo = [];
  for (const u of imp.users.filter((x) => inScope(x.displayName))) {
    const r = await api(`${AUTH_HOST}/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', body: JSON.stringify({ localId: [u.localId] }) });
    if (!(r.ok && r.body.users && r.body.users.length)) todo.push(u);
  }
  const scoped = imp.users.filter((x) => inScope(x.displayName)).length;
  log(`import-auth${ONLY.length ? ' (only ' + ONLY.join(',') + ')' : ''}: ${scoped - todo.length} already in Firebase Auth, ${todo.length} to create`);
  if (!APPLY || !todo.length) { if (!APPLY) log('  dry run: add --apply to create them'); return; }
  const r = await api(`${AUTH_HOST}/v1/projects/${PROJECT}/accounts:batchCreate`, { method: 'POST', body: JSON.stringify({ users: todo, hashAlgorithm: 'SHA256', rounds: 1 }) });
  if (!r.ok || (r.body.error && r.body.error.length)) die('Auth import failed (' + r.status + '): ' + JSON.stringify(r.body.error || r.body).slice(0, 300));
  log(`  created ${todo.length} Auth users`);
}

async function migrate() {
  const plan = readJson('plan.json');
  const writes = []; let postsStamped = 0; let privDocs = 0; let indexEntries = 0;
  const users = await listCollection('users');
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const isPrivateAcct = (u) => !!(byId[u] && bv(byId[u].fields.isPrivate));
  for (const [u, a] of Object.entries(plan.accounts)) {
    if (!inScope(u)) continue;
    const d = byId[u]; if (!d) { log(`  ${u}: users doc missing, skipped`); continue; }
    const f = d.fields;
    if (sv(f.uid) && sv(f.uid) !== a.uid) die(`${u} already has a different uid; stop and check`);
    writes.push(mergeWrite(`users/${u}`, { uid: { stringValue: a.uid }, authEmail: { stringValue: a.authEmail } }));
    writes.push(mergeWrite(`uidIndex/${a.uid}`, { username: { stringValue: u }, updatedAt: { integerValue: String(Date.now()) } }));
    const priv = {};
    for (const k of PRIVATE_FIELDS) if (k in f) priv[k] = f[k];
    if (bv(f.isPrivate) && f.customPosts) priv.customPosts = f.customPosts;
    if (Object.keys(priv).length) { writes.push(mergeWrite(`users/${u}/private/account`, priv)); privDocs++; }
    for (const kind of ['email', 'phone']) {
      const key = contactKey(kind, sv(f[kind]));
      if (!key) continue;
      writes.push(arrayUnionWrite(`contactIndex/${key}`, 'usernames', [u]));
      writes.push(mergeWrite(`contactIndex/${key}`, { by: { stringValue: u }, updatedAt: { integerValue: String(Date.now()) } }));
      indexEntries++;
    }
    // Contact buttons: keep showing email/phone only if the account chose to show them.
    const prefs = (f.contactPrefs && f.contactPrefs.mapValue && f.contactPrefs.mapValue.fields) || {};
    const pub = {};
    if (bv(prefs.showEmail) && sv(f.email)) pub.publicEmail = f.email;
    if (bv(prefs.showPhone) && sv(f.phone)) pub.publicPhone = f.phone;
    if (Object.keys(pub).length) writes.push(mergeWrite(`users/${u}`, pub));
  }
  // Stub/persona docs that hold private fields: copy them to the private doc too (admin-only afterwards).
  for (const d of (ONLY.length ? [] : users)) {
    if (plan.accounts[d.id] || plan.junk.includes(d.id)) continue;
    const priv = {}; for (const k of PRIVATE_FIELDS) if (k in d.fields) priv[k] = d.fields[k];
    if (Object.keys(priv).length) { writes.push(mergeWrite(`users/${d.id}/private/account`, priv)); privDocs++; }
  }
  for (const p of await listCollection('posts')) {
    const author = normU(sv(p.fields.author) || sv(p.fields.username));
    if (!author || !inScope(author)) continue;
    const want = { authorPrivate: { booleanValue: isPrivateAcct(author) } };
    if (!sv(p.fields.author)) want.author = { stringValue: author };
    if (!('authorPrivate' in p.fields) || bv(p.fields.authorPrivate) !== isPrivateAcct(author) || want.author) { writes.push(mergeWrite(`posts/${p.id}`, want)); postsStamped++; }
  }
  log(`migrate${ONLY.length ? ' (only ' + ONLY.join(',') + ')' : ''}: ${Object.keys(plan.accounts).filter(inScope).length} accounts, ${privDocs} private docs, ${indexEntries} contact index entries, ${postsStamped} posts to stamp, ${writes.length} writes`);
  if (!APPLY) { log('  dry run: add --apply to write'); return; }
  await commit(writes);
  log('  applied');
}

async function verify() {
  const plan = readJson('plan.json'); const b = readJson('backup.json');
  const before = Object.fromEntries(b.users.map((u) => [u.id, u.fields]));
  const problems = []; const ok = [];
  for (const [u, a] of Object.entries(plan.accounts)) {
    if (!inScope(u)) continue;
    const cur = await getDoc(`users/${u}`);
    if (!cur) { problems.push(`${u}: users doc missing`); continue; }
    if (sv(cur.uid) !== a.uid || sv(cur.authEmail) !== a.authEmail) problems.push(`${u}: uid/authEmail not set`);
    const lk = await api(`${AUTH_HOST}/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', body: JSON.stringify({ localId: [a.uid] }) });
    if (!(lk.ok && lk.body.users && lk.body.users.length)) problems.push(`${u}: no Firebase Auth user`);
    const idx = await getDoc(`uidIndex/${a.uid}`);
    if (!idx || sv(idx.username) !== u) problems.push(`${u}: uidIndex missing`);
    const priv = (await getDoc(`users/${u}/private/account`)) || {};
    const old = before[u] || {};
    for (const k of PRIVATE_FIELDS) {
      if (!(k in old)) continue;
      if (!(k in priv)) problems.push(`${u}: private field ${k} not copied`);
    }
    for (const kind of ['email', 'phone']) {
      const val = sv((k => (k in priv ? priv[k] : old[k]))(kind));
      const key = contactKey(kind, val); if (!key) continue;
      const ci = await getDoc(`contactIndex/${key}`);
      const list = ci && ci.usernames && ci.usernames.arrayValue && ci.usernames.arrayValue.values ? ci.usernames.arrayValue.values.map(sv) : [];
      if (!list.includes(u)) problems.push(`${u}: ${kind} not in contact index`);
    }
    // Nothing else on the public doc may have been lost (Plus, likes, saves, connections, posts mirror...).
    for (const k of Object.keys(old)) {
      if (PRIVATE_FIELDS.includes(k) || CREDENTIAL_FIELDS.includes(k)) continue;
      if (!(k in cur)) problems.push(`${u}: public field ${k} disappeared`);
    }
    if (!problems.some((p) => p.startsWith(u + ':'))) ok.push(u);
  }
  const posts = await listCollection('posts');
  if (posts.length < b.posts.length) problems.push(`posts: ${b.posts.length} before, ${posts.length} now`);
  const unstamped = posts.filter((p) => inScope(normU(sv(p.fields.author) || sv(p.fields.username))) && !('authorPrivate' in p.fields)).length;
  if (unstamped) problems.push(`posts: ${unstamped} without authorPrivate`);
  writeJson(ONLY.length ? 'verify-' + ONLY.join('_') + '.json' : 'verify.json', { at: new Date().toISOString(), ok, problems });
  log(`verify${ONLY.length ? ' (only ' + ONLY.join(',') + ')' : ''}: ${ok.length}/${Object.keys(plan.accounts).filter(inScope).length} accounts OK, ${posts.length} posts (${b.posts.length} in backup), ${problems.length} problem(s)`);
  for (const p of problems) log('  - ' + p.replace(/@[^\s]+/g, '@…'));
  if (problems.length) process.exitCode = 2;
}

async function cleanup() {
  const plan = readJson('plan.json');
  const v = fs.existsSync(path.join(DIR, 'verify.json')) ? readJson('verify.json') : null;
  if (!v) die('run verify first');
  const writes = []; const archive = {};
  for (const u of v.ok) {
    const cur = await getDoc(`users/${u}`); if (!cur) continue;
    const keys = [...PRIVATE_FIELDS, ...CREDENTIAL_FIELDS].filter((k) => k in cur);
    if (plan.accounts[u].isPrivate && cur.customPosts) writes.push(mergeWrite(`users/${u}`, { customPosts: { arrayValue: {} } }));
    if (keys.length) writes.push(deleteFieldsWrite(`users/${u}`, keys));
  }
  // Stub docs keep their (now copied) private fields only in the private doc.
  const users = await listCollection('users');
  for (const d of users) {
    if (plan.accounts[d.id] || plan.junk.includes(d.id)) continue;
    const keys = PRIVATE_FIELDS.filter((k) => k in d.fields);
    if (!keys.length) continue;
    const priv = (await getDoc(`users/${d.id}/private/account`)) || {};
    if (keys.every((k) => same(priv[k], d.fields[k]))) writes.push(deleteFieldsWrite(`users/${d.id}`, keys));
  }
  const junkDeletes = [];
  if (flag('delete-junk')) {
    for (const id of plan.junk) { const f = await getDoc(`users/${id}`); if (f) { archive[id] = f; junkDeletes.push({ delete: fullName(`users/${id}`) }); } }
  }
  log(`cleanup: strip private fields + password hashes from ${writes.length} public docs; ${v.problems.length ? 'SKIPPING accounts with verify problems; ' : ''}${junkDeletes.length} non-account docs to delete${flag('delete-junk') ? '' : ' (add --delete-junk)'}`);
  if (!APPLY) { log('  dry run: add --apply to write'); return; }
  if (Object.keys(archive).length) writeJson('junk-archive.json', archive);
  await commit([...writes, ...junkDeletes]);
  log('  applied');
}

(async () => {
  const steps = { backup, plan: async () => plan(), 'import-auth': importAuth, migrate, verify, cleanup };
  if (!steps[cmd]) die('unknown step ' + cmd);
  log(`[${EMU ? 'EMULATOR' : 'PRODUCTION'} ${PROJECT}] ${cmd}${APPLY ? ' --apply' : ''}`);
  await steps[cmd]();
})().catch((e) => die(e && e.message ? e.message : String(e)));
