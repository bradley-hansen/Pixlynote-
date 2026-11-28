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
const NEW_PREFIX = /^7[0-9]-int-/;
const LAST_RUN = path.join(ROOT, 'tests', 'results', 'last-run.json');

// Network-backed actions and the tests that prove the UI never shows success when the call fails.
const FAILURE_PATHS = [
  ['Business verification Send code', 'Worker /email', '70, 64, 65 (fixed on main cb4c915)'],
  ['Business verification Resend', 'Worker /email', '70, 64, 65 (fixed on main cb4c915)'],
  ['Business verification Verify email', 'Worker /verify-email-code', '70'],
  ['Business verification Submit', 'Worker /business-verification/submit', '70'],
  ['Business verification status refresh', 'Worker /business-verification/status', '70'],
  ['Gov/Org end to end by taps (open, fill, Send code, Resend, wrong/right code, EIN, Submit, close)', 'Worker /email, /email/signup-verify, /business-verification/ein-check; Firestore', '76 (personal + business, both types)'],
  ['Gov/Org Send code, Resend', 'Worker /email (type signup_code)', '70, 76 (403, 500, 429, bad gateway, offline; double tap)'],
  ['Gov/Org Verify email', 'Worker /email/signup-verify', '70, 76'],
  ['Gov/Org form validation', 'none (blocked before any call)', '16, 76'],
  ['Gov/Org Submit request', 'Firestore verificationRequests + users', '70, 76 (xfail BUG-3, BUG-6)'],
  ['Organization EIN check', 'Worker /business-verification/ein-check', '70, 76'],
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
  const run = fs.existsSync(LAST_RUN) ? JSON.parse(fs.readFileSync(LAST_RUN, 'utf8')) : null;
  const results = (run && run.results) || [];
  // name (without " [@account]") -> list of results
  const baseName = (n) => String(n).replace(/ \[@[^\]]+\]$/, '');
  const resultsByName = new Map();
  results.forEach((r) => {
    const b = baseName(r.name);
    if (!resultsByName.has(b)) resultsByName.set(b, []);
    resultsByName.get(b).push(r);
  });
  const fileByTest = new Map();
  const coverBy = new Map(); // key -> Set(test name)
  const bugs = [];
  let newTests = 0;
  for (const s of loadSuites()) {
    for (const t of s.tests) {
      fileByTest.set(t.name, s.file.replace(/\.js$/, ''));
      if (NEW_PREFIX.test(s.file)) newTests++;
      if (t.knownBug) bugs.push({ file: s.file, name: t.name, bug: t.knownBug });
      (t.covers || []).forEach((k) => {
        if (!coverBy.has(k)) coverBy.set(k, new Set());
        coverBy.get(k).add(t.name);
      });
    }
  }
  // Listener keys that fired during a named (non-sweep) test.
  const firedBy = new Map();
  results.forEach((r) => {
    if (r.sweep) return;
    (r.fired || []).forEach((k) => {
      if (!firedBy.has(k)) firedBy.set(k, new Set());
      firedBy.get(k).add(baseName(r.name));
    });
  });
  const isNew = (name) => NEW_PREFIX.test((fileByTest.get(name) || '') + '.js');
  const resultOf = (names) => {
    let pass = 0; let fail = 0; let xfail = 0; let notRun = 0;
    names.forEach((n) => {
      const rs = resultsByName.get(n) || [];
      if (!rs.length) { notRun++; return; }
      rs.forEach((r) => { if (!r.ok) fail++; else if (r.xfail) xfail++; else pass++; });
    });
    if (fail) return 'FAIL';
    if (xfail && !pass) return 'XFAIL (known bug)';
    if (xfail) return 'PASS + XFAIL (known bug)';
    if (pass) return 'PASS';
    return run ? 'not run' : 'no run yet';
  };
  const kinds = {};
  let declaredBefore = 0; let firedBefore = 0; let after = 0; let netCount = 0;
  const counts = { PASS: 0, FAIL: 0, XFAIL: 0, other: 0 };
  const rows = inventory.map((item) => {
    const kind = item.key.split(':')[0];
    kinds[kind] = (kinds[kind] || 0) + 1;
    const declared = [...(coverBy.get(item.key) || [])];
    const fired = [...(firedBy.get(item.key) || [])].filter((n) => !declared.includes(n));
    const oldDeclared = declared.filter((n) => !isNew(n));
    const oldFired = fired.filter((n) => !isNew(n));
    if (oldDeclared.length) declaredBefore++;
    else if (oldFired.length) firedBefore++;
    const all = declared.concat(fired);
    if (all.length) after++;
    const n = net.forItem(item);
    if (n.kinds.length) netCount++;
    const res = all.length ? resultOf(all) : 'sweep only';
    if (/^PASS/.test(res)) counts.PASS++; else if (res === 'FAIL') counts.FAIL++; else if (/XFAIL/.test(res)) counts.XFAIL++; else counts.other++;
    const show = (list, tag) => list.slice(0, 3).map((x) => (isNew(x) ? 'NEW ' : '') + x + (tag || '')).concat(list.length > 3 ? ['(+' + (list.length - 3) + ' more)'] : []);
    const names = show(declared).concat(show(fired, ' (taps it)'));
    let status = 'sweep only';
    if (all.length) status = oldDeclared.length ? 'covered before' : (oldFired.length ? 'tapped before, mapped now' : 'NEW test');
    return { key: item.key, kind, status, names, res, net: n.kinds.join(', ') };
  });
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const out = [];
  out.push('# Pixlynote interaction inventory', '');
  out.push('Generated by `node tests/tools/interaction-inventory.js` on branch interaction-tests-nov27 (' + new Date().toISOString().slice(0, 10) + ')' + (run ? ', results from the run at ' + run.when + ' (' + run.passed + '/' + run.total + ' passed).' : '.'), '');
  out.push('## Totals', '');
  out.push('- Interactive items in index.html: **' + inventory.length + '** (' + Object.entries(kinds).map(([k, v]) => k + ' ' + v).join(', ') + ')');
  out.push('- Every item also gets an automatic "Interaction: …" sweep test (it opens, taps and checks for page errors). The table below only counts behavioural tests.');
  out.push('- Covered by a named behavioural test before this branch (declared): **' + declaredBefore + '**');
  out.push('- Tapped by an existing behavioural test but never mapped (found by the listener fire audit): **' + firedBefore + '**');
  out.push('- Covered by a named behavioural test now: **' + after + '** of ' + inventory.length);
  out.push('- Item results: PASS ' + counts.PASS + ', FAIL ' + counts.FAIL + ', XFAIL (known bug) ' + counts.XFAIL + ', other ' + counts.other);
  out.push('- Items that can reach the network (Worker, Firestore write or Firebase Auth, heuristic depth 1): **' + netCount + '**');
  out.push('- New named tests on this branch (suites 70-79): **' + newTests + '**', '');
  out.push('## Known bugs found (tests marked knownBug, reported as XFAIL; not fixed on this branch)', '');
  bugs.forEach((b) => out.push('- `' + b.file + '`: ' + b.name + '  \n  ' + b.bug));
  out.push('', '## Network-backed actions and their failure-path tests', '');
  out.push('| Action | Call | Failure-path test (suite) |', '|---|---|---|');
  FAILURE_PATHS.forEach((r) => out.push('| ' + r.map(esc).join(' | ') + ' |'));
  out.push('', 'Not treated as bugs: many list edits (associates, privileged grants list, contact prefs, privacy lists) save locally first and write to Firestore fire-and-forget. That is the app\'s local-first design, so a failed write there is not surfaced.', '');
  out.push('## Every item', '');
  out.push('Status: covered before = an existing suite declared it; tapped before, mapped now = an existing test fires its listener (listener fire audit); NEW test = only the new suites; sweep only = auto sweep only. "NEW" marks a test added on this branch.', '');
  out.push('| Element | Kind | Status | Test name(s) | Result | Network |', '|---|---|---|---|---|---|');
  rows.forEach((r) => out.push('| `' + esc(r.key) + '` | ' + r.kind + ' | ' + r.status + ' | ' + esc(r.names.join('; ')) + ' | ' + r.res + ' | ' + esc(r.net) + ' |'));
  fs.writeFileSync(OUT, out.join('\n') + '\n');
  console.log(JSON.stringify({ out: OUT, items: inventory.length, declaredBefore, firedBefore, after, sweepOnly: inventory.length - after, counts, netCount, newTests, bugs: bugs.length, sweepOnlyKeys: rows.filter((r) => r.status === 'sweep only').map((r) => r.key) }));
}

main();
