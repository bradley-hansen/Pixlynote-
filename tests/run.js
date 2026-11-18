#!/usr/bin/env node
'use strict';

/**
 * Pixlynote regression runner.
 *
 *   npm test
 *
 * Auto-loads every file in tests/suites/, then generates one named test
 * per interactive element from tests/lib/inventory.js so coverage fails
 * if a new control ships without a test. See tests/README.md.
 */

const fs = require('fs');
const path = require('path');
const h = require('./helpers/harness');
const { buildInventory } = require('./lib/inventory');
const { makeAssert } = require('./lib/assert');
const interactions = require('./lib/interactions');

const ROOT = path.resolve(__dirname, '..');
const SUITES_DIR = path.join(__dirname, 'suites');
const RESULTS_DIR = path.join(__dirname, 'results');
const INDEX = path.join(ROOT, 'index.html');

function loadSuites() {
  return fs.readdirSync(SUITES_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => {
      const mod = require(path.join(SUITES_DIR, f));
      if (!mod || !Array.isArray(mod.tests)) throw new Error('Suite ' + f + ' must export { name, tests }');
      return { file: f, name: mod.name || f, tests: mod.tests };
    });
}

function expandTests(suites, inventory) {
  const tests = [];
  for (const suite of suites) {
    for (const t of suite.tests) {
      const accounts = t.accounts || ['personal'];
      tests.push({
        suite: suite.name,
        file: suite.file,
        name: t.name,
        accounts,
        covers: t.covers || [],
        run: t.run
      });
    }
  }
  // One named test per inventory item — this is the coverage net.
  for (const item of inventory) {
    const kind = interactions.classify(item);
    tests.push({
      suite: 'Interaction coverage',
      file: 'inventory',
      name: 'Interaction: ' + (item.name || item.key) + ' [' + item.key + ']',
      accounts: kind === 'signed-out' ? ['signed-out'] : ['personal'],
      covers: [item.key],
      inventoryItem: item,
      async run(ctx) {
        const { page, a } = ctx;
        const errsBefore = (page._errors || []).length;
        await interactions.reveal(page, h, item);
        const result = await interactions.exercise(page, h, item);
        a.ok(result && result.result, 'exercised ' + item.key + ': ' + JSON.stringify(result));
        const newErrs = (page._errors || []).slice(errsBefore).filter((e) => !/firebase blocked/i.test(e));
        a.ok(newErrs.length === 0, 'no page errors after ' + item.key + ': ' + newErrs.join(' | '));
      }
    });
  }
  return tests;
}

function normalizeAccountList(accounts) {
  if (!accounts || accounts.includes('all')) return h.ALL_ACCOUNT_KEYS;
  return accounts;
}

async function main() {
  const listOnly = process.argv.includes('--list');
  const grepArg = process.argv.find((a) => a.startsWith('--grep='));
  const grep = grepArg ? grepArg.slice('--grep='.length) : (process.argv.includes('--grep') ? process.argv[process.argv.indexOf('--grep') + 1] : '');
  const html = fs.readFileSync(INDEX, 'utf8');
  const inventory = buildInventory(html);
  const suites = loadSuites();
  const tests = expandTests(suites, inventory);

  if (listOnly) {
    console.log('Inventory items:', inventory.length);
    console.log('Suites:', suites.map((s) => s.name + ' (' + s.tests.length + ')').join(', '));
    console.log('Named tests (before account expansion):', tests.length);
    let expanded = 0;
    tests.forEach((t) => { expanded += normalizeAccountList(t.accounts).length; });
    console.log('Named tests (after account expansion):', expanded);
    return;
  }

  const session = await h.launchSession({ port: Number(process.env.REGRESSION_PORT || 8091) });
  const results = [];
  const covered = new Set();
  const attempted = new Set();

  async function runOne(test, accountKey, page) {
    const account = accountKey === 'signed-out' ? { key: 'signed-out', username: '', fullName: '' } : h.ACCOUNTS[accountKey];
    const name = accountKey === 'signed-out' || (test.accounts || []).length <= 1
      ? test.name
      : test.name + ' [@' + account.username + ']';
    const started = Date.now();
    (test.covers || []).forEach((k) => attempted.add(k));
    if (test.inventoryItem) attempted.add(test.inventoryItem.key);
    if (grep && !name.includes(grep) && !(test.name && test.name.includes(grep))) {
      return;
    }
    try {
      await test.run({ page, h, a: makeAssert(), account, accountKey, inventory });
      (test.covers || []).forEach((k) => covered.add(k));
      if (test.inventoryItem) covered.add(test.inventoryItem.key);
      const rec = { name, suite: test.suite, account: accountKey, ok: true, ms: Date.now() - started };
      results.push(rec);
      console.log('PASS  ' + name);
    } catch (err) {
      const rec = { name, suite: test.suite, account: accountKey, ok: false, ms: Date.now() - started, error: String(err && err.stack || err).split('\n').slice(0, 6).join('\n') };
      results.push(rec);
      console.log('FAIL  ' + name);
      console.log('      ' + String(err && err.message || err));
    }
  }

  try {
    // Signed-out page
    const soPage = await h.newPage(session);
    await h.loadApp(soPage, session);
    for (const test of tests) {
      if (!normalizeAccountList(test.accounts).includes('signed-out')) continue;
      await runOne(test, 'signed-out', soPage);
      // Login tests may enter the app; restore a clean signed-out page for the next case.
      const loggedIn = await soPage.evaluate(() => !!(window.state && state.isLoggedIn && document.getElementById('main-view') && getComputedStyle(document.getElementById('main-view')).display !== 'none')).catch(() => false);
      if (loggedIn) {
        await h.loadApp(soPage, session);
      }
    }
    await soPage.context().close();

    // Signed-in pages, one per account. Reload once per account.
    // Deep tests run on every account they name. Inventory sweep runs on personal
    // (and on other accounts only when the test lists them).
    for (const key of h.ALL_ACCOUNT_KEYS) {
      const page = await h.newPage(session);
      await h.loadApp(page, session);
      await h.loginAs(page, h.ACCOUNTS[key]);
      for (const test of tests) {
        const accs = normalizeAccountList(test.accounts);
        if (!accs.includes(key)) continue;
        try { await h.closeOverlays(page); await h.installAppStubs(page); } catch (e) {}
        await runOne(test, key, page);
      }
      await page.context().close();
    }
  } finally {
    // Coverage check as its own named test
    const missing = inventory.map((i) => i.key).filter((k) => !attempted.has(k));
    const uncoveredPass = inventory.map((i) => i.key).filter((k) => attempted.has(k) && !covered.has(k));
    const covName = 'Coverage: every interactive element in index.html has a test';
    if (missing.length === 0) {
      results.push({ name: covName, suite: 'Coverage', account: 'all', ok: true, ms: 0 });
      console.log('PASS  ' + covName + ' (' + inventory.length + ' items)');
    } else {
      results.push({
        name: covName,
        suite: 'Coverage',
        account: 'all',
        ok: false,
        ms: 0,
        error: 'No test covers: ' + missing.join(', ')
      });
      console.log('FAIL  ' + covName);
      console.log('      Missing ' + missing.length + ' items: ' + missing.slice(0, 40).join(', ') + (missing.length > 40 ? '…' : ''));
    }

    // Firestore write guard
    const writes = session.writeLog || [];
    const writeName = 'Safety: no production Firestore writes';
    if (writes.length === 0) {
      results.push({ name: writeName, suite: 'Coverage', account: 'all', ok: true, ms: 0 });
      console.log('PASS  ' + writeName);
    } else {
      results.push({ name: writeName, suite: 'Coverage', account: 'all', ok: false, ms: 0, error: JSON.stringify(writes.slice(0, 5)) });
      console.log('FAIL  ' + writeName);
    }

    await session.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(passed + '/' + results.length + ' passed');
  if (failed.length) {
    console.log('Failures:');
    failed.forEach((f) => console.log(' - ' + f.name + ': ' + (f.error || '').split('\n')[0]));
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, 'last-run.json'), JSON.stringify({
    when: new Date().toISOString(),
    inventory: inventory.length,
    total: results.length,
    passed,
    failed: failed.map((f) => ({ name: f.name, error: f.error })),
    uncoveredAttempted: inventory.filter((i) => attempted.has(i.key) && !covered.has(i.key)).map((i) => i.key)
  }, null, 2));

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
