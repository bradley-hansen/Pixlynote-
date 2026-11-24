'use strict';
// Phase 2 migrate.js rehearsal in the local Firestore emulator. Never production. --apply only against the emulator.
const { test, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT = 'demo-pixlynote-rules';
const FS = 'http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const DOCS = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
const SCRIPT = path.join(__dirname, '..', '..', 'tools', 'phase2', 'migrate.js');
const toVal = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'object' && v ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } } : { stringValue: String(v) };
const fromVal = (v) => v == null ? undefined : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'arrayValue' in v ? (v.arrayValue.values || []).map(fromVal) : 'mapValue' in v ? Object.fromEntries(Object.entries((v.mapValue && v.mapValue.fields) || {}).map(([k, x]) => [k, fromVal(x)])) : null;

async function put(p, obj) {
  const r = await fetch(`${DOCS}/${p}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toVal(v)])) }) });
  assert.ok(r.ok, 'seed ' + p + ' ' + r.status);
}
async function get(p) {
  const r = await fetch(`${DOCS}/${p}`, { headers: { Authorization: 'Bearer owner' } });
  if (r.status === 404) return null;
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromVal(v)]));
}
const run = (...a) => execFileSync(process.execPath, [SCRIPT, ...a, '--emulator'], { encoding: 'utf8', env: process.env });

before(async () => {
  // Isolated docs only — do not wipe the whole emulator; other files in this process may have seeded accounts.
  await put('users/p2_alice', { username: 'p2_alice', notes: [{ id: 'n1', text: 'secret' }], following: ['bob'] });
  await put('users/p2_bob', { username: 'p2_bob' });
  await put('closeFriends/p2_alice', { users: ['p2_bob', 'p2_cara'] });
});

test('phase2 migrate dry-run reports content and close-friends work and writes nothing', async () => {
  const beforeContent = await get('users/p2_alice/content/profile');
  const beforeEdge = await get('closeFriends/p2_alice/members/p2_bob');
  const out = run();
  assert.match(out, /dry run/);
  assert.match(out, /users needing content copy: [1-9]/);
  assert.match(out, /close-friends lists needing member edges: [1-9]/);
  assert.strictEqual(await get('users/p2_alice/content/profile'), beforeContent);
  assert.strictEqual(await get('closeFriends/p2_alice/members/p2_bob'), beforeEdge);
  const pub = await get('users/p2_alice');
  assert.ok(pub && pub.notes && pub.notes[0].id === 'n1', 'public leftover stays during dry run');
});

test('phase2 migrate --apply copies content and member edges, and does not strip by default', async () => {
  const out = run('--apply');
  assert.match(out, /applied /);
  const content = await get('users/p2_alice/content/profile');
  assert.ok(content, 'content/profile created');
  assert.strictEqual(content.notes[0].id, 'n1');
  assert.deepStrictEqual(content.following, ['bob']);
  const bob = await get('closeFriends/p2_alice/members/p2_bob');
  const cara = await get('closeFriends/p2_alice/members/p2_cara');
  assert.strictEqual(bob && bob.username, 'p2_bob');
  assert.strictEqual(cara && cara.username, 'p2_cara');
  const pub = await get('users/p2_alice');
  assert.ok(pub.notes && pub.notes[0].id === 'n1', 'public leftover remains without --strip');
});
