#!/usr/bin/env node
'use strict';
/*
 * Phase 2 security migration. DRY RUN unless --apply. Never prints note/story bodies,
 * close-friends names, emails, phones, hashes or secrets.
 *
 *   node tools/phase2/migrate.js --emulator
 *   node tools/phase2/migrate.js --sa /path/key.json
 *
 * Copies notes, story, userStories, highlights and following from users/{u} onto
 * users/{u}/content/profile, and writes closeFriends/{owner}/members/{member}
 * edges so a viewer can check only their own membership.
 *
 *   --strip   (only with --apply) also delete those content fields from the public user doc.
 *             Default is off. Do this in a later Go after the new client is live, so a
 *             rolled-back client can still read leftover public copies.
 *
 * Does not deploy rules, does not write unless --apply, and this checkout must not
 * run --apply against production without Bradley's Go.
 */
const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const EMU = flag('emulator');
const APPLY = flag('apply');
const STRIP = flag('strip');
const PROJECT = opt('project', EMU ? 'demo-pixlynote-rules' : 'pixlynote');
const ONLY = (opt('only', '') || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const inScope = (u) => !ONLY.length || ONLY.includes(u);
const FS_HOST = EMU ? 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085') : 'https://firestore.googleapis.com';
const DOCS = `${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const CONTENT_FIELDS = ['notes', 'story', 'userStories', 'highlights', 'following'];

function die(m) { console.error(m); process.exit(1); }
function log(m) { console.log(m); }
if (!EMU && !opt('sa')) die('production needs --sa <service-account key file>; use --emulator for local runs');
if (STRIP && !APPLY) die('--strip only works with --apply');

let tokenCache = null;
async function bearer() {
  if (EMU) return 'owner';
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const sa = JSON.parse(fs.readFileSync(opt('sa'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + sig
  });
  if (!r.ok) die('could not get an access token (' + r.status + ')');
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}
async function api(url, init) {
  const r = await fetch(url, {
    ...(init || {}),
    headers: { Authorization: 'Bearer ' + (await bearer()), 'Content-Type': 'application/json', ...((init && init.headers) || {}) }
  });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch (e) { body = text; }
  return { ok: r.ok, status: r.status, body };
}
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

function fieldPresent(v) {
  if (!v) return false;
  if (v.nullValue !== undefined) return false;
  if (v.arrayValue) return (v.arrayValue.values || []).length > 0;
  if (v.mapValue) return Object.keys(v.mapValue.fields || {}).length > 0;
  if (typeof v.stringValue === 'string') return v.stringValue.length > 0;
  if (v.integerValue != null || v.doubleValue != null || v.booleanValue === true || v.booleanValue === false || v.timestampValue) return true;
  return false;
}
function arrStrings(v) {
  const vals = (v && v.arrayValue && v.arrayValue.values) || [];
  return vals.map((x) => (x && x.stringValue) || '').map((u) => u.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
}

async function main() {
  log(`[${EMU ? 'EMULATOR' : 'PRODUCTION'} ${PROJECT}] phase2 migrate${APPLY ? ' --apply' : ' (dry run)'}${STRIP ? ' --strip' : ''}`);
  const users = (await listCollection('users')).filter((d) => inScope(d.id) && !d.id.startsWith('__'));
  const lists = (await listCollection('closeFriends')).filter((d) => inScope(d.id) && !d.id.includes('/'));
  let usersScanned = 0, needContent = 0, contentAlready = 0, publicLeftover = 0;
  let listsScanned = 0, needMembers = 0, membersAlready = 0, memberDocsToWrite = 0, listsWithUsers = 0;
  const writes = [];

  for (const u of users) {
    usersScanned++;
    const present = CONTENT_FIELDS.filter((k) => fieldPresent(u.fields[k]));
    const dest = await getDoc('users/' + encodeURIComponent(u.id) + '/content/profile');
    const destPresent = dest ? CONTENT_FIELDS.filter((k) => fieldPresent(dest[k])) : [];
    if (present.length) publicLeftover++;
    if (!present.length && destPresent.length) { contentAlready++; continue; }
    if (!present.length) continue;
    const missing = present.filter((k) => destPresent.indexOf(k) === -1);
    if (!missing.length) { contentAlready++; continue; }
    needContent++;
    const fields = {};
    for (const k of present) fields[k] = u.fields[k];
    fields.migratedAt = { integerValue: String(Date.now()) };
    writes.push({ kind: 'content', user: u.id, merge: mergeWrite('users/' + u.id + '/content/profile', fields) });
    if (STRIP) writes.push({ kind: 'strip', user: u.id, merge: deleteFieldsWrite('users/' + u.id, present) });
  }

  for (const list of lists) {
    listsScanned++;
    const members = arrStrings(list.fields.users);
    if (!members.length) continue;
    listsWithUsers++;
    let have = 0, missing = 0;
    for (const m of members) {
      const edge = await getDoc('closeFriends/' + encodeURIComponent(list.id) + '/members/' + encodeURIComponent(m));
      if (edge) { have++; membersAlready++; }
      else {
        missing++;
        memberDocsToWrite++;
        writes.push({
          kind: 'member',
          owner: list.id,
          merge: mergeWrite('closeFriends/' + list.id + '/members/' + m, {
            username: { stringValue: m },
            addedAt: { integerValue: String(Date.now()) }
          })
        });
      }
    }
    if (missing) needMembers++;
  }

  log('users scanned: ' + usersScanned);
  log('users needing content copy: ' + needContent);
  log('users already migrated (content doc complete): ' + contentAlready);
  log('users still holding public leftover copies: ' + publicLeftover);
  log('close-friends lists scanned: ' + listsScanned);
  log('close-friends lists with members: ' + listsWithUsers);
  log('close-friends lists needing member edges: ' + needMembers);
  log('member edge docs already present: ' + membersAlready);
  log('member edge docs to write: ' + memberDocsToWrite);
  log('writes queued: ' + writes.length + (STRIP ? ' (includes public-field strip)' : ''));

  if (!APPLY) {
    log('dry run: add --apply to write (and --strip later, after the new client is live, to drop public leftover copies)');
    return;
  }
  await commit(writes.map((w) => w.merge));
  log('applied ' + writes.length + ' writes');
}

main().catch((e) => die(String(e && e.stack || e)));
