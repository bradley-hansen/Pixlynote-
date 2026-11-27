'use strict';

/**
 * Writes the interaction inventory: every interactive item in index.html (tests/lib/inventory.js),
 * the suite tests that cover it, whether it can reach the network (tests/tools/network-map.js,
 * a heuristic), and the failure-path test for each network-backed action.
 *
 *   node tests/tools/interaction-inventory.js [out.md]
 */

const fs = require('fs');
const path = require('path');
const { buildInventory } = require('../lib/inventory');
const { buildNetworkMap } = require('./network-map');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'interaction-inventory.md');
const NEW_PREFIX = /^7[0-5]-int-/;

// Network-backed actions and the tests that prove the UI never shows success when the call fails.
const FAILURE_PATHS = [
  ['Business verification Send code', 'Worker /email', '70 (xfail BUG-1)'],
  ['Business verification Resend', 'Worker /email', '70 (xfail BUG-2)'],
  ['Business verification Verify email', 'Worker /verify-email-code', '70'],
  ['Business verification Submit', 'Worker /business-verification/submit', '70'],
  ['Business verification status refresh', 'Worker /business-verification/status', '70'],
  ['Gov/Org Send code, Resend', 'Worker /send-email-code', '70'],
  ['Gov/Org Verify email', 'Worker /verify-email-code', '70'],
  ['Gov/Org Submit request', 'Firestore verificationRequests', '70 (xfail BUG-3)'],
  ['Organization EIN check', 'Worker /ein-lookup', '70'],
  ['Sign-up Send/Resend email code', 'Worker', '71'],
  ['Sign-up Verify email', 'Worker', '71'],
  ['Sign-up Send/Resend phone code', 'Worker', '71'],
  ['Sign-up Verify phone', 'Worker', '71'],
  ['Create account', 'Firebase Auth createUser', '75'],
  ['Log in (migrated account)', 'Firebase Auth signIn', '50 (unit: wrong password, network, mismatch)'],
  ['Forgot password Send Reset Code', 'Worker', '71'],
  ['Forgot password Reset (code check)', 'Worker', '71'],
  ['Forgot password Reset (Auth account)', 'Worker /auth/reset-password', '71'],
  ['Update password (Account Center)', 'Firebase Auth reauth/updatePassword', '75'],
  ['Edit Profile Send code', 'Worker', '03'],
  ['Edit Profile uniqueness check', 'Firestore read', '03'],
  ['Edit Profile Verify email/phone', 'Worker', '71'],
  ['Edit Profile Resend email/phone', 'Worker', '71'],
  ['Admin Business Verification Load/Refresh', 'Worker /admin/business-verification', '17 (401), 72'],
  ['Admin Business Verification Approve/More info/Reject', 'Worker decision', '72'],
  ['Admin Verification Requests Approve/Reject', 'Firestore', '72 (xfail BUG-4)'],
  ['Admin Verification Requests Refresh', 'Firestore read', '72 (xfail BUG-5)'],
  ['Admin Promote Settings save tiers, free list add/remove', 'Firestore', '72, 59 (plan_changed)'],
  ['Suggest with Gemini (captions)', 'Worker AI', '73'],
  ['Pixlynote AI chat Send', 'Worker AI', '73, 24/38 (offline mode)'],
  ['Promote checkout', 'Worker Stripe session', '73, 57'],
  ['Promoted Insights stats', 'Worker', '73'],
  ['Cancel Membership', 'Worker cancel', '73, 34 (unsupported)'],
  ['Stripe return / subscription sync', 'Worker', '32'],
  ['Billing history', 'Worker', '58'],
  ['Feedback send (with/without AI)', 'Worker /email', '28, 29, 52-feedback-ai'],
  ['Data export', 'Worker/Storage', '46'],
  ['Private account toggle', 'Firestore', '45'],
  ['Connect request send / approve', 'Firestore', '45'],
  ['Cancel connect request', 'Firestore delete', '74'],
  ['Decline connect request', 'Firestore delete', '74'],
  ['Like (offline then online)', 'Firestore', '52-like-once'],
  ['Privileged Access actions while read-only', 'Firestore', '56'],
  ['Camera permission', 'getUserMedia', '54'],
  ['Photo editor Puppy ears', 'face library load', '55']
];

function loadSuites() {
  const dir = path.join(__dirname, '..', 'suites');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => {
    const mod = require(path.join(dir, f));
    return { file: f, tests: mod.tests || [] };
  });
}

function main() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inventory = buildInventory(html);
  const net = buildNetworkMap(html);
  const coverBy = new Map();
  const bugs = [];
  let newTests = 0;
  for (const s of loadSuites()) {
    for (const t of s.tests) {
      if (NEW_PREFIX.test(s.file)) newTests++;
      if (t.knownBug) bugs.push({ file: s.file, name: t.name, bug: t.knownBug });
      (t.covers || []).forEach((k) => {
        if (!coverBy.has(k)) coverBy.set(k, new Set());
        coverBy.get(k).add(s.file.replace(/\.js$/, ''));
      });
    }
  }
  const kinds = {};
  let before = 0; let after = 0; let netCount = 0;
  const rows = inventory.map((item) => {
    const kind = item.key.split(':')[0];
    kinds[kind] = (kinds[kind] || 0) + 1;
    const files = [...(coverBy.get(item.key) || [])].sort();
    const old = files.filter((f) => !NEW_PREFIX.test(f));
    if (old.length) before++;
    if (files.length) after++;
    const n = net.forItem(item);
    if (n.kinds.length) netCount++;
    const status = files.length ? (old.length ? (old.length === files.length ? 'covered' : 'covered + new') : 'NEW') : 'sweep only';
    return { key: item.key, kind, status, files, net: n.kinds.join(', ') };
  });
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const out = [];
  out.push('# Pixlynote interaction inventory', '');
  out.push('Generated by `node tests/tools/interaction-inventory.js` on branch interaction-tests-nov27 (' + new Date().toISOString().slice(0, 10) + ').', '');
  out.push('## Totals', '');
  out.push('- Interactive items: **' + inventory.length + '** (' + Object.entries(kinds).map(([k, v]) => k + ' ' + v).join(', ') + ')');
  out.push('- Every item also gets an automatic "Interaction: …" sweep test (it opens, taps and checks for page errors).');
  out.push('- Covered by a behavioural suite test before this branch: **' + before + '** (the other ' + (inventory.length - before) + ' had the sweep only).');
  out.push('- Covered by a behavioural suite test now: **' + after + '**.');
  out.push('- Items that can reach the network (Worker, Firestore write or Firebase Auth, heuristic depth 1): **' + netCount + '**.');
  out.push('- New named tests on this branch (suites 70-75): **' + newTests + '**.', '');
  out.push('## Known bugs found (tests marked knownBug, reported as XFAIL)', '');
  bugs.forEach((b) => out.push('- `' + b.file + '`: ' + b.name + '  \n  ' + b.bug));
  out.push('', '## Network-backed actions and their failure-path tests', '');
  out.push('| Action | Call | Failure-path test (suite) |', '|---|---|---|');
  FAILURE_PATHS.forEach((r) => out.push('| ' + r.map(esc).join(' | ') + ' |'));
  out.push('', 'Not treated as bugs: many list edits (associates, privileged grants list, contact prefs, privacy lists) save locally first and write to Firestore fire-and-forget. That is the app\'s local-first design, so a failed write there is not surfaced.', '');
  out.push('## Every item', '');
  out.push('Status: covered = existing suites; NEW = only the new suites; covered + new = both; sweep only = auto sweep test only.', '');
  out.push('| Key | Kind | Status | Suites | Network |', '|---|---|---|---|---|');
  rows.forEach((r) => out.push('| `' + esc(r.key) + '` | ' + r.kind + ' | ' + r.status + ' | ' + esc(r.files.join(', ')) + ' | ' + esc(r.net) + ' |'));
  fs.writeFileSync(OUT, out.join('\n') + '\n');
  console.log(JSON.stringify({ out: OUT, items: inventory.length, before, after, netCount, newTests, bugs: bugs.length }));
}

main();
