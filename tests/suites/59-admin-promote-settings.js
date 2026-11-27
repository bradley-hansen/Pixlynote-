'use strict';

/**
 * Admin Promote Settings (t1044u), @pixlynote only: a read-only list of every Promote purchase, the tier editor
 * (promoteSettings/tiers, also read by the app's slider and the Worker) and the free (exempt) list
 * (promoteSettings/exempt). In-page mock Firestore only: never production, never Stripe.
 */
const fs = require('fs');
const path = require('path');
const fx = require('../helpers/showcase-promote-fixtures');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const DAY = 86400000;
const CUSTOM = [{ price: 10, hours: 24, views: 300 }, { price: 30, hours: 72, views: 2000 }, { price: 120, hours: 168, views: 8000 }, { price: 600, hours: 720, views: 60000 }];

function seedDocs(now) {
  const rec = (o) => Object.assign({ kind: 'promote', currency: 'usd', status: 'paid', livemode: false, note: '' }, o);
  return {
    'users/pixlynote': { username: 'pixlynote', uid: 'uid-admin' },
    'users/kiln_and_co': { username: 'kiln_and_co', uid: 'uid-kiln' },
    'users/morning_pour': { username: 'morning_pour', uid: 'uid-pour', isShowcase: true },
    'users/reg_personal': { username: 'reg_personal', uid: 'uid-reg' },
    'users/sunny_days': { username: 'sunny_days', uid: 'uid-sunny' },
    // running: 812 of 7,000 views, 5 days left
    'users/kiln_and_co/billing/cs_test_run': rec({ item: 'Promote post (7 days, at least 7,000 views)', itemKind: 'post', itemId: 'p_run', amountCents: 10000, tier: 'cta', targetImpressions: 7000, durationHours: 168, createdAt: now - 2 * DAY, sessionId: 'cs_test_run' }),
    'posts/p_run': { id: 'p_run', author: 'kiln_and_co', caption: 'New pottery drop', isPromoted: true, promotedUntil: now + 5 * DAY, targetImpressions: 7000, promotedImpressionsCount: 812, promotionTier: 'cta', promoteSessionId: 'cs_test_run' },
    // time is up but only 1,100 of 1,500 views: the free extension is running
    'users/sunny_days/billing/cs_test_ext': rec({ item: 'Promote post (3 days, at least 1,500 views)', itemKind: 'post', itemId: 'p_ext', amountCents: 2500, tier: 'explore', targetImpressions: 1500, createdAt: now - 4 * DAY, sessionId: 'cs_test_ext' }),
    'posts/p_ext': { id: 'p_ext', author: 'sunny_days', caption: 'Beach walk', isPromoted: true, promotedUntil: now - DAY, targetImpressions: 1500, promotedImpressionsCount: 1100, promotionTier: 'explore', promoteSessionId: 'cs_test_ext' },
    // finished note (older record without the new fields: target comes from the item text)
    'users/reg_personal/billing/cs_test_done': rec({ item: 'Promote note (24 hours, at least 250 views)', itemKind: 'note', itemId: 'n_done', amountCents: 500, createdAt: now - 10 * DAY, sessionId: 'cs_test_done' }),
    'promotions/note_n_done': { kind: 'note', noteId: 'n_done', author: 'reg_personal', text: 'Morning thoughts', isPromoted: false, promotedUntil: now - 9 * DAY, targetImpressions: 250, promotedImpressionsCount: 260, promotionTier: 'feed', promoteSessionId: 'cs_test_done' },
    // paid, but the post was deleted before payment completed (no refund)
    'users/sunny_days/billing/cs_test_ns': rec({ item: 'Promote post (24 hours, at least 250 views)', itemKind: 'post', itemId: 'p_gone', amountCents: 500, tier: 'feed', targetImpressions: 250, createdAt: now - 20 * DAY, sessionId: 'cs_test_ns', note: 'Not started: the item was deleted before payment completed' }),
    // free (exempt) promotion, $0
    'users/morning_pour/billing/free_abc123abc123abc123abc123': rec({ item: 'Promote post (3 days, at least 1,500 views)', itemKind: 'post', itemId: 'p_free', amountCents: 0, status: 'free', tier: 'explore', targetImpressions: 1500, createdAt: now - DAY, sessionId: 'free_abc123abc123abc123abc123', note: 'Free: exempt account, no charge' }),
    'posts/p_free': { id: 'p_free', author: 'morning_pour', caption: '<img src=x onerror="window.__pwn=1">', isPromoted: true, promotedUntil: now + 2 * DAY, targetImpressions: 1500, promotedImpressionsCount: 40, promotionTier: 'explore', promoteSessionId: 'free_abc123abc123abc123abc123' },
    // subscriptions are not Promote purchases
    'users/reg_personal/billing/cs_test_sub': { kind: 'subscription', item: 'Pixlynote subscription', amountCents: 499, status: 'paid', createdAt: now - DAY }
  };
}
async function startAdmin(ctx, seed) {
  const { page, h, account } = ctx;
  const port = Number(new URL(page.url()).port);
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
  await h.hideToasts(page).catch(() => {});
  await page.evaluate(installPixlyMockFirestore, seed || seedDocs(Date.now()));
}
async function withMock(page, fn) {
  try { return await fn(); } finally { await page.evaluate(uninstallPixlyMockFirestore).catch(() => {}); }
}
const writes = (page) => page.evaluate(() => window.__pfs.writes.map((w) => ({ path: w.path, kind: w.kind, data: w.data })));

module.exports = {
  name: 'Admin Promote Settings',
  tests: [
    {
      name: 'Promote Settings card is in the @pixlynote admin tools only, next to the user metrics',
      accounts: ['personal', 'business', 'pixlynote'],
      covers: ['el:#drawer-pixlynote-promote-settings', 'handler:isPromoteAdmin'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await h.openOwnerMenu(page);
        const r = await page.evaluate(() => {
          const card = document.getElementById('drawer-pixlynote-promote-settings');
          const metrics = document.getElementById('drawer-pixlynote-metrics');
          return { visible: !!card && !card.classList.contains('hidden'), afterMetrics: !!(metrics && card && metrics.nextElementSibling === card),
            opened: openAdminPromoteSettings('purchases'), modalHidden: document.getElementById('modal-admin-promote').classList.contains('hidden'),
            metricsStill: !!document.getElementById('metric-total-users') && !!document.getElementById('drawer-pixlynote-deactivations') && !!document.getElementById('drawer-pixlynote-verifications') };
        });
        a.ok(r.afterMetrics, 'The card sits right under the User Base Metrics card');
        a.ok(r.metricsStill, 'Existing admin tools are all still there');
        if (account.username === 'pixlynote') {
          a.ok(r.visible, '@pixlynote sees Promote Settings');
          a.ok(r.opened === true && !r.modalHidden, '@pixlynote can open it');
          await page.evaluate(() => closeAdminPromoteSettings());
        } else {
          a.ok(!r.visible, 'Other accounts never see Promote Settings');
          a.ok(r.opened === false && r.modalHidden, 'Other accounts cannot open it, even by calling the function');
        }
      }
    },
    {
      name: 'Purchases: every Promote purchase with buyer, item, tier, amount, date, status, views delivered vs guaranteed and free extension; filters; read-only',
      accounts: ['pixlynote'],
      covers: ['el:#btn-drawer-admin-promote-purchases', 'el:#modal-admin-promote', 'el:#btn-close-admin-promote', 'el:#btn-admin-promote-tab-purchases',
        'el:#admin-promote-view-purchases', 'el:#admin-promote-filter', 'el:#admin-promote-state-filter', 'el:#btn-admin-promote-refresh',
        'el:#admin-promote-summary', 'el:#admin-promote-status', 'el:#admin-promote-purchases-list', 'listener:#modal-admin-promote:click',
        'handler:openAdminPromoteSettings', 'handler:closeAdminPromoteSettings', 'handler:switchAdminPromoteTab', 'handler:loadAdminPromotePurchases',
        'handler:paintAdminPromotePurchases', 'handler:adminPromoteRowModel'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await startAdmin(ctx);
        await withMock(page, async () => {
          await h.openOwnerMenu(page);
          await page.click('#btn-drawer-admin-promote-purchases');
          await page.waitForFunction(() => document.querySelectorAll('#admin-promote-purchases-list .admin-promote-row').length === 5, null, { timeout: 5000 });
          const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#admin-promote-purchases-list .admin-promote-row')).map((el) => ({
            id: el.getAttribute('data-billing-id'), state: el.getAttribute('data-state'), pay: el.getAttribute('data-pay'),
            user: el.querySelector('.ap-user').textContent, item: el.querySelector('.ap-item').textContent, tier: el.querySelector('.ap-tier').textContent,
            amount: el.querySelector('.ap-amount').textContent, date: el.querySelector('.ap-date').textContent, payText: el.querySelector('.ap-pay').textContent,
            stateText: el.querySelector('.ap-state').textContent, views: el.querySelector('.ap-views').textContent, ext: el.querySelector('.ap-ext').textContent
          })));
          const by = Object.fromEntries(rows.map((r) => [r.id, r]));
          a.ok(rows.length === 5 && !by.cs_test_sub, 'All 5 Promote purchases are listed; subscriptions are not');
          a.ok(rows[0].id.startsWith('free_') && rows[4].id === 'cs_test_ns', 'Newest first');
          const run = by.cs_test_run;
          a.ok(run.user === '@kiln_and_co' && /Post p_run/.test(run.item) && /New pottery drop/.test(run.item), 'Shows who bought and which post');
          a.ok(run.tier === 'Explore + link button' && run.amount === '$100.00' && run.payText === 'Paid', 'Shows tier, amount and payment status');
          a.ok(/^[A-Z][a-z]{2} \d{1,2}, \d{4}/.test(run.date) && /Test mode/.test(run.date), 'Shows the date (and Test mode)');
          a.ok(run.state === 'running' && run.views === '812 / 7,000 views' && run.ext === 'Free extension: no', 'Running: delivered vs guaranteed views');
          const ext = by.cs_test_ext;
          a.ok(ext.state === 'extension' && ext.stateText === 'Free extension running' && ext.ext === 'Free extension: yes' && ext.views === '1,100 / 1,500 views', 'Time is up but views are short: the free extension is running');
          const done = by.cs_test_done;
          a.ok(done.state === 'completed' && /Note n_done/.test(done.item) && done.views === '260 / 250 views' && done.tier === 'Main feed', 'Completed note (older record: tier and target still shown)');
          const ns = by.cs_test_ns;
          a.ok(ns.state === 'not_started' && ns.payText === 'Paid' && ns.views === '\u2014 / 250 views', 'Paid but not started is shown as Not started (nothing refunded)');
          const fr = by[rows[0].id];
          a.ok(fr.pay === 'free' && fr.payText === 'Free' && fr.amount === '$0.00' && fr.user === '@morning_pour', 'Free (exempt) promotions show as Free, $0');
          const x = await page.evaluate(() => ({ img: !!document.querySelector('#admin-promote-purchases-list img'), pwn: !!window.__pwn }));
          a.ok(!x.img && !x.pwn, 'Captions are escaped');
          const sum = await page.evaluate(() => document.getElementById('admin-promote-summary').textContent);
          a.ok(/5 purchases/.test(sum) && /\$135\.00 paid/.test(sum) && /2 running/.test(sum) && /1 on free extension/.test(sum), 'Summary: count, paid total, running, on free extension (' + sum + ')');

          await page.fill('#admin-promote-filter', '@sunny');
          let n = await page.evaluate(() => document.querySelectorAll('#admin-promote-purchases-list .admin-promote-row').length);
          a.ok(n === 2, 'Search by @user');
          await page.fill('#admin-promote-filter', 'pottery');
          n = await page.evaluate(() => document.querySelectorAll('#admin-promote-purchases-list .admin-promote-row').length);
          a.ok(n === 1, 'Search by caption');
          await page.fill('#admin-promote-filter', '');
          for (const [v, want] of [['running', 2], ['extension', 1], ['completed', 1], ['not_started', 1], ['free', 1], ['all', 5]]) {
            await page.selectOption('#admin-promote-state-filter', v);
            n = await page.evaluate(() => document.querySelectorAll('#admin-promote-purchases-list .admin-promote-row').length);
            a.ok(n === want, 'Status filter ' + v + ' shows ' + want);
          }
          await page.fill('#admin-promote-filter', 'zzz-nothing');
          a.ok(/No purchases match/.test(await page.evaluate(() => document.getElementById('admin-promote-status').textContent)), 'Empty filter result says so');
          await page.fill('#admin-promote-filter', '');

          await page.evaluate(() => { window.__pfs.docs['posts/p_run'].promotedImpressionsCount = 900; });
          await page.click('#btn-admin-promote-refresh');
          await page.waitForFunction(() => /900 \/ 7,000/.test(document.getElementById('admin-promote-purchases-list').textContent), null, { timeout: 4000 });
          a.ok(true, 'Refresh reloads live view counts');
          a.ok((await writes(page)).length === 0, 'The purchases list never writes anything');

          await page.evaluate(() => { const f = window.firebase.getDocs; window.firebase.getDocs = async () => { throw new Error('denied'); }; window.__restoreGetDocs = () => { window.firebase.getDocs = f; }; });
          await page.click('#btn-admin-promote-refresh');
          await page.waitForTimeout(150);
          a.ok(/Couldn.t load purchases/.test(await page.evaluate(() => document.getElementById('admin-promote-status').textContent)), 'A read error shows a retry message');
          await page.evaluate(() => window.__restoreGetDocs());

          await page.click('#btn-close-admin-promote');
          a.ok(await page.evaluate(() => document.getElementById('modal-admin-promote').classList.contains('hidden')), 'Close hides it');
          await page.evaluate(() => openAdminPromoteSettings('purchases'));
          await page.mouse.click(5, 5);
          a.ok(await page.evaluate(() => document.getElementById('modal-admin-promote').classList.contains('hidden')), 'Tapping outside closes it');
        });
      }
    },
    {
      name: 'Tiers: admin edits price, duration and guaranteed views; invalid values cannot be saved; the app slider uses the saved tiers',
      accounts: ['pixlynote'],
      covers: ['el:#btn-drawer-admin-promote-tiers', 'el:#btn-admin-promote-tab-tiers', 'el:#admin-promote-view-tiers', 'el:#admin-promote-tier-rows',
        'el:#admin-promote-tier-0-price', 'el:#admin-promote-tier-0-hours', 'el:#admin-promote-tier-0-views',
        'el:#admin-promote-tier-1-price', 'el:#admin-promote-tier-1-hours', 'el:#admin-promote-tier-1-views',
        'el:#admin-promote-tier-2-price', 'el:#admin-promote-tier-2-hours', 'el:#admin-promote-tier-2-views',
        'el:#admin-promote-tier-3-price', 'el:#admin-promote-tier-3-hours', 'el:#admin-promote-tier-3-views',
        'el:#admin-promote-tier-0-preview', 'el:#admin-promote-tier-1-preview', 'el:#admin-promote-tier-2-preview', 'el:#admin-promote-tier-3-preview',
        'el:#admin-promote-tiers-placement', 'el:#admin-promote-tiers-msg', 'el:#btn-admin-promote-tiers-reset', 'el:#btn-admin-promote-tiers-save',
        'el:#admin-promote-tiers-source', 'handler:loadAdminPromoteTiers', 'handler:previewAdminPromoteTiers', 'handler:saveAdminPromoteTiers',
        'handler:resetAdminPromoteTiers', 'handler:promoteTierProblem', 'handler:loadPromoteTiers', 'handler:applyPromoteTiers', 'handler:promoteNormalizeTiers'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await startAdmin(ctx);
        await withMock(page, async () => {
          await h.openOwnerMenu(page);
          await page.click('#btn-drawer-admin-promote-tiers');
          await page.waitForTimeout(200);
          const vals = () => page.evaluate(() => [0, 1, 2, 3].map((i) => ['price', 'hours', 'views'].map((f) => Number(document.getElementById('admin-promote-tier-' + i + '-' + f).value))));
          a.ok(JSON.stringify(await vals()) === JSON.stringify([[5, 24, 250], [25, 72, 1500], [100, 168, 7000], [500, 720, 50000]]), 'With no saved tiers the editor shows the defaults');
          a.ok(/defaults/.test(await page.evaluate(() => document.getElementById('admin-promote-tiers-source').textContent)), 'Says it is using the defaults');
          const pv = await page.evaluate(() => [0, 1, 2, 3].map((i) => document.getElementById('admin-promote-tier-' + i + '-preview').textContent));
          a.ok(/\$5 · 24 hours · at least 250 views · Main feed rotation/.test(pv[0]) && /\$100 · 7 days · at least 7,000 views/.test(pv[2]) && /button to your link/.test(pv[2]), 'Each tier shows a plain preview');
          a.ok(/Explore from \$25 · link button from \$100/.test(await page.evaluate(() => document.getElementById('admin-promote-tiers-placement').textContent)), 'Placement thresholds follow the tiers');

          // invalid inputs
          for (const [sel, v, re] of [['#admin-promote-tier-1-price', '5', /higher than Tier 1/], ['#admin-promote-tier-2-hours', '50', /whole days/], ['#admin-promote-tier-0-views', '260', /steps of 50/], ['#admin-promote-tier-3-price', '', /whole numbers/]]) {
            const old = await page.inputValue(sel);
            await page.fill(sel, v);
            const st = await page.evaluate(() => ({ msg: document.getElementById('admin-promote-tiers-msg').textContent, dis: document.getElementById('btn-admin-promote-tiers-save').disabled }));
            a.ok(re.test(st.msg) && st.dis, 'Invalid value (' + sel + '=' + v + ') is explained and Save is disabled');
            const saved = await page.evaluate(() => saveAdminPromoteTiers());
            a.ok(saved === false, 'Save refuses invalid tiers');
            await page.fill(sel, old);
          }
          a.ok((await writes(page)).length === 0, 'Nothing was written for invalid values');

          // valid edit
          const ids = ['price', 'hours', 'views'];
          for (let i = 0; i < 4; i++) for (const f of ids) await page.fill('#admin-promote-tier-' + i + '-' + f, String(CUSTOM[i][f]));
          await page.click('#btn-admin-promote-tiers-save');
          await page.waitForTimeout(150);
          const w = (await writes(page)).filter((x) => x.path === 'promoteSettings/tiers');
          a.ok(w.length === 1 && JSON.stringify(w[0].data.tiers) === JSON.stringify(CUSTOM) && w[0].data.updatedBy === 'pixlynote' && Object.keys(w[0].data).sort().join() === 'tiers,updatedAt,updatedBy', 'Saves exactly {tiers, updatedAt, updatedBy} to promoteSettings/tiers');
          a.ok(/Saved/.test(await page.evaluate(() => document.getElementById('admin-promote-tiers-msg').textContent)), 'Confirms the save');
          const plan = await page.evaluate(() => [10, 30, 120, 600, 5, 601].map((x) => promotePlan(x)));
          a.ok(plan[0].targetImpressions === 300 && plan[1].tier === 'explore' && plan[2].tier === 'cta' && plan[3].durationHours === 720 && plan[4] === null && plan[5] === null, 'The app now prices with the saved tiers');

          await page.click('#btn-admin-promote-tiers-reset');
          a.ok(JSON.stringify(await vals()) === JSON.stringify([[5, 24, 250], [25, 72, 1500], [100, 168, 7000], [500, 720, 50000]]), 'Fill in defaults puts the defaults back in the form');
          a.ok((await writes(page)).length === 1, '... without saving until Save is tapped');

          // reload from the store
          await page.evaluate(() => { window.__pfs.docs['promoteSettings/tiers'] = { tiers: [{ price: 7, hours: 36, views: 400 }, { price: 30, hours: 72, views: 2000 }, { price: 120, hours: 168, views: 8000 }, { price: 600, hours: 720, views: 60000 }] }; });
          await page.click('#btn-admin-promote-tab-purchases');
          await page.click('#btn-admin-promote-tab-tiers');
          await page.waitForTimeout(150);
          a.ok((await vals())[0].join() === '7,36,400' && /saved tiers/.test(await page.evaluate(() => document.getElementById('admin-promote-tiers-source').textContent)), 'Opening Tiers reloads the saved values');
          const ro = await page.evaluate(async () => {
            const prev = window.privilegedActionBlocked;
            window.privilegedActionBlocked = () => true;
            try { return await saveAdminPromoteTiers(); } finally { window.privilegedActionBlocked = prev; }
          });
          a.ok(ro === false, 'A read-only (privileged) session cannot save');
          await page.evaluate(() => { applyPromoteTiers(null); });
        });
      }
    },
    {
      name: 'Free list: admin adds and removes accounts that promote for free; unknown accounts are refused',
      accounts: ['pixlynote'],
      covers: ['el:#btn-drawer-admin-promote-exempt', 'el:#btn-admin-promote-tab-exempt', 'el:#admin-promote-view-exempt', 'el:#admin-promote-exempt-input',
        'el:#btn-admin-promote-exempt-add', 'el:#admin-promote-exempt-msg', 'el:#admin-promote-exempt-list', 'listener:#admin-promote-exempt-list:click',
        'listener:#admin-promote-exempt-input:keydown', 'handler:loadAdminPromoteExempt', 'handler:addAdminPromoteExempt', 'handler:removeAdminPromoteExempt'],
      async run(ctx) {
        const { page, h, a } = ctx;
        const seed = Object.assign(seedDocs(Date.now()), { 'promoteSettings/exempt': { usernames: ['kiln_and_co'], updatedAt: 1, updatedBy: 'pixlynote' } });
        await startAdmin(ctx, seed);
        await withMock(page, async () => {
          await h.openOwnerMenu(page);
          await page.click('#btn-drawer-admin-promote-exempt');
          await page.waitForTimeout(200);
          const list = () => page.evaluate(() => Array.from(document.querySelectorAll('#admin-promote-exempt-list .admin-promote-exempt-row')).map((r) => r.getAttribute('data-username')));
          const msg = () => page.evaluate(() => document.getElementById('admin-promote-exempt-msg').textContent);
          a.ok((await list()).join() === 'kiln_and_co', 'Shows the saved free list');
          await page.fill('#admin-promote-exempt-input', '@Sunny_Days');
          await page.click('#btn-admin-promote-exempt-add');
          await page.waitForTimeout(150);
          a.ok((await list()).join() === 'kiln_and_co,sunny_days' && /now promotes for free/.test(await msg()), 'Adds an account (case and @ ignored)');
          let w = (await writes(page)).filter((x) => x.path === 'promoteSettings/exempt');
          a.ok(w.length === 1 && w[0].data.usernames.join() === 'kiln_and_co,sunny_days' && Object.keys(w[0].data).sort().join() === 'updatedAt,updatedBy,usernames', 'Saves {usernames, updatedAt, updatedBy}');
          a.ok(await page.inputValue('#admin-promote-exempt-input') === '', 'Clears the box after adding');
          await page.fill('#admin-promote-exempt-input', 'nobody_here');
          await page.press('#admin-promote-exempt-input', 'Enter');
          await page.waitForTimeout(150);
          a.ok(/No account @nobody_here/.test(await msg()), 'Enter adds too; an unknown account is refused');
          await page.fill('#admin-promote-exempt-input', 'kiln_and_co');
          await page.click('#btn-admin-promote-exempt-add');
          a.ok(/already on the free list/.test(await msg()), 'Duplicates are refused');
          await page.fill('#admin-promote-exempt-input', 'x');
          await page.click('#btn-admin-promote-exempt-add');
          a.ok(/Enter a username/.test(await msg()), 'Bad usernames are refused');
          a.ok((await writes(page)).filter((x) => x.path === 'promoteSettings/exempt').length === 1, 'Refused adds write nothing');
          await page.click('#admin-promote-exempt-list .btn-admin-promote-exempt-remove[data-username="kiln_and_co"]');
          await page.waitForTimeout(150);
          a.ok((await list()).join() === 'sunny_days' && /removed/.test(await msg()), 'Remove takes an account off the list');
          w = (await writes(page)).filter((x) => x.path === 'promoteSettings/exempt');
          a.ok(w.length === 2 && w[1].data.usernames.join() === 'sunny_days', 'Removal is saved');
          await page.click('#admin-promote-exempt-list .btn-admin-promote-exempt-remove[data-username="sunny_days"]');
          await page.waitForTimeout(150);
          a.ok(/No free accounts/.test(await page.evaluate(() => document.getElementById('admin-promote-exempt-list').textContent)), 'Empty list says everyone pays through Stripe');
        });
      }
    },
    {
      name: 'Non-admin accounts cannot read or change Promote Settings from the app',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, a } = ctx;
        await startAdmin(ctx);
        await withMock(page, async () => {
          // Clear the mock write log, then check Promote Settings writes in the same evaluate.
          // Background session writes after login can land in __pfs.writes and made the old
          // "all writes" check flake; this test only cares that the admin tools wrote nothing.
          const r = await page.evaluate(async () => {
            if (window.__pfs) window.__pfs.writes = [];
            document.getElementById('admin-promote-exempt-input').value = 'reg_personal';
            for (let i = 0; i < 4; i++) document.getElementById('admin-promote-tier-' + i + '-price').value = String(i + 1);
            const add = await addAdminPromoteExempt();
            const save = await saveAdminPromoteTiers();
            const rows = await loadAdminPromotePurchases(true);
            const ex = await loadAdminPromoteExempt();
            const tab = switchAdminPromoteTab('tiers');
            const settingsWrites = (window.__pfs && window.__pfs.writes || []).filter((w) => String(w.path || '').indexOf('promoteSettings') === 0);
            return { add: add, save: save, rows: rows, ex: ex, tab: tab, settingsWrites: settingsWrites };
          });
          a.ok(r.add === false && r.save === false && r.rows.length === 0 && r.ex.length === 0 && r.tab === false, 'Every admin action refuses');
          a.ok(r.settingsWrites.length === 0, 'Nothing was written');
        });
      }
    },
    {
      name: 'Promote slider follows the saved tiers; free-list accounts skip checkout; a price change is caught before paying',
      accounts: ['personal'],
      covers: ['el:#promote-amount-min', 'el:#promote-amount-max'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await fx.seedShowcaseAndPromos(page, { promoteOwn: false });
        await h.hideToasts(page).catch(() => {});
        await page.evaluate(installPixlyMockFirestore, { 'promoteSettings/tiers': { tiers: CUSTOM, updatedAt: 1, updatedBy: 'pixlynote' } });
        await withMock(page, async () => {
          const ui = await page.evaluate(async () => {
            await loadPromoteTiers(true);
            openPromoteModal('post', 3002);
            const s = document.getElementById('promote-amount-slider');
            const t = (id) => (document.getElementById(id) || {}).textContent;
            return { min: s.min, max: s.max, val: s.value, lo: t('promote-amount-min'), hi: t('promote-amount-max'),
              presets: Array.from(document.querySelectorAll('.btn-promote-preset')).map((b) => b.getAttribute('data-amount') + '=' + b.textContent),
              views: t('promote-views'), dur: t('promote-duration'), lock: t('promote-cta-locked') };
          });
          a.ok(ui.min === '10' && ui.max === '600' && ui.lo === '$10' && ui.hi === '$600', 'Slider range comes from the saved tiers');
          a.ok(ui.presets.join() === '10=$10,30=$30,120=$120,600=$600', 'Quick amounts are the four tier prices');
          a.ok(ui.val === '30' && ui.views === 'At least 2,000 views' && ui.dur === '3 days', 'Opens on Tier 2 with its views and duration');
          a.ok(/\$120 and up/.test(ui.lock), 'The link-button note follows Tier 3');
          await page.click('#btn-promote-preset-100');
          a.ok(await page.evaluate(() => document.getElementById('promote-views').textContent) === 'At least 8,000 views', 'Preset buttons use the new prices');

          let reply = { ok: true, free: true, plan: { amount: 30, durationHours: 72, targetImpressions: 2000, tier: 'explore' } };
          const calls = [];
          await page.route(/\/promote\/checkout/, async (route) => {
            calls.push(JSON.parse(route.request().postData() || '{}'));
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply), headers: { 'Access-Control-Allow-Origin': '*' } });
          });
          await page.evaluate(() => {
            window.__pixlyNav = [];
            window.__pixlyPromoteIdToken = async () => 'test-id-token-not-real-0123456789';
            window.__pixlyPromoteNavigate = (u) => window.__pixlyNav.push(u);
            window.__toasts = []; const st = window.showToast; window.showToast = (m) => { window.__toasts.push(m); };
            window.__restoreToast = () => { window.showToast = st; };
            setPromoteAmount(30);
          });
          await page.click('#btn-promote-checkout');
          await page.waitForTimeout(300);
          const free = await page.evaluate(() => ({ nav: window.__pixlyNav.length, hidden: document.getElementById('modal-promote').classList.contains('hidden'), toasts: window.__toasts.slice() }));
          a.ok(calls.length === 1 && calls[0].amount === 30 && calls[0].expect && calls[0].expect.durationHours === 72 && calls[0].expect.targetImpressions === 2000, 'Checkout sends the amount and the plan it showed');
          a.ok(free.nav === 0 && free.hidden && free.toasts.some((m) => /No charge/.test(m)), 'Free-list account: no Stripe page, the promotion starts, says no charge');

          reply = { ok: false, error: 'plan_changed', plan: { amount: 30, durationHours: 96, targetImpressions: 2500, tier: 'explore' } };
          await page.evaluate(() => { openPromoteModal('post', 3002); setPromoteAmount(30); });
          await page.click('#btn-promote-checkout');
          await page.waitForTimeout(300);
          const ch = await page.evaluate(() => ({ nav: window.__pixlyNav.length, err: document.getElementById('promote-error').textContent, open: !document.getElementById('modal-promote').classList.contains('hidden') }));
          a.ok(ch.nav === 0 && ch.open && /Prices were just updated/.test(ch.err) && /weren.t charged/.test(ch.err), 'If the tiers changed, nothing is charged and the person is told');
          await page.evaluate(() => { window.__restoreToast(); closePromoteModal(); });
          await page.unroute(/\/promote\/checkout/);

          const bad = await page.evaluate(async () => {
            window.__pfs.docs['promoteSettings/tiers'] = { tiers: [{ price: 50, hours: 24, views: 250 }] };
            await loadPromoteTiers(true);
            const p = promotePlan(5);
            return p && p.targetImpressions === 250 && promoteAnchors()[3][0] === 500;
          });
          a.ok(bad, 'An invalid saved config falls back to the defaults');
          const gone = await page.evaluate(async () => { delete window.__pfs.docs['promoteSettings/tiers']; await loadPromoteTiers(true); return promotePlan(25).targetImpressions; });
          a.ok(gone === 1500, 'No saved config: defaults');
        });
      }
    },
    {
      name: 'Source checks: rules lock Promote Settings to @pixlynote; no refunds; the admin tools never write billing records',
      accounts: ['signed-out'],
      covers: [],
      async run(ctx) {
        const { a } = ctx;
        const root = path.join(__dirname, '..', '..');
        const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
        a.ok(/match \/promoteSettings\/tiers \{\s*allow read: if true;\s*allow create, update: if isAdmin\(\) && promoteTiersOk\(request\.resource\.data\);\s*allow delete: if isAdmin\(\);/.test(rules), 'Tiers: public read, admin-only validated write');
        a.ok(/match \/promoteSettings\/exempt \{\s*allow read, delete: if isAdmin\(\);/.test(rules), 'Free list: admin only');
        a.ok(/match \/\{path=\*\*\}\/billing\/\{recordId\} \{\s*allow read: if isAdmin\(\);\s*\}/.test(rules), 'Admin may list all billing records, read only');
        a.ok(/!\(collection in \['posts', 'users', 'promoteSettings'\]\)/.test(rules), 'The admin catch-all cannot bypass the tier validation');
        const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        a.ok(!/(setDoc|updateDoc|addDoc|deleteDoc)\([^;]*['"]billing['"]/.test(src), 'The app never writes billing records');
        a.ok(!/\/v1\/refunds|promoteRefund/.test(src), 'No refund code in the app');
        const patch = fs.readFileSync(path.join(root, 'tools', 'promote', 'patch_worker.py'), 'utf8');
        a.ok(/promoteLoadAnchors\(env\)/.test(patch) && /promoteIsExempt\(env, username\)/.test(patch), 'The Worker reads the tiers and the free list server-side');
        a.ok(!/"refunds"|\/v1\/refunds|promoteRefund/.test(patch), 'The Worker never refunds');
      }
    }
  ]
};
