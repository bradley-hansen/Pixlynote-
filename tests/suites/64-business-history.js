'use strict';

/**
 * Account Info > Business History (branch business-history-nov27).
 * The tab sits to the right of Profile History, only on Business accounts (and @pixlynote). It lists changes to the
 * Edit profile business fields (not Website, which Profile History already tracks) saved with Save Changes.
 * Entries live in profileHistory/{u}.business and are written only after the profile save succeeds.
 * Uses an in-page mock Firestore for the cloud paths; never touches production.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const BIZ_FIELDS = ['dbaName', 'businessIndustry', 'businessStreet', 'businessCity', 'businessState',
  'businessPostal', 'businessAddressVisibility', 'businessHours', 'businessSupportEmail'];
const LABELS = {
  dbaName: 'DBA / Trade Name', businessIndustry: 'Industry / Category', businessStreet: 'Street address',
  businessCity: 'City', businessState: 'State', businessPostal: 'ZIP', businessAddressVisibility: 'Address visibility',
  businessHours: 'Hours of operation', businessSupportEmail: 'Support email'
};
const BIZ_COVERS = [
  'el:#btn-ac-info-tab-business', 'el:#ac-business-history-field', 'el:#ac-business-history-list',
  'el:#ac-info-panel-business', 'el:#ac-info-tab-row',
  'handler:setAccountInfoTab', 'handler:renderBusinessHistoryPanel'
];

function deq(a, x, y, msg) { a.equal(JSON.stringify(x), JSON.stringify(y), msg); }

async function clearBizHistory(page, me) {
  await page.evaluate((me) => {
    try { localStorage.removeItem('pixly_business_history_' + me); } catch (e) {}
    window._businessHistory = null;
  }, me);
}

// Snapshot the account's business fields and restore them after the test so later suites see it unchanged.
async function withBizSandbox(page, me, seed, fn) {
  await page.evaluate(() => {
    window.__bhSnap = { cu: JSON.parse(JSON.stringify(state.currentUser || {})), toast: window.showToast };
    state.currentUser.accountType = 'business';
    window.__bhToasts = [];
    const orig = window.showToast;
    window.showToast = function (m) { window.__bhToasts.push(String(m || '')); try { return orig.apply(this, arguments); } catch (e) {} };
  });
  if (seed) {
    await page.evaluate(installPixlyMockFirestore, seed);
  }
  try {
    await fn();
  } finally {
    if (seed) await page.evaluate(uninstallPixlyMockFirestore);
    await page.evaluate(() => {
      const s = window.__bhSnap; if (!s) return;
      Object.keys(state.currentUser).forEach((k) => { if (!(k in s.cu)) delete state.currentUser[k]; });
      Object.assign(state.currentUser, s.cu);
      window.showToast = s.toast;
      window._lastLocalProfileWriteTs = 0;
      try { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); } catch (e) {}
      try { if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal(); } catch (e) {}
    });
    await clearBizHistory(page, me);
  }
}

async function openAccountInfo(page, h) {
  await h.closeOverlays(page);
  await page.evaluate(() => {
    if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
    if (typeof setAccountCenterView === 'function') setAccountCenterView('accountInfo');
  });
  await page.waitForTimeout(120);
}

async function readPanel(page) {
  return page.evaluate(() => {
    const list = document.getElementById('ac-business-history-list');
    const panel = document.getElementById('ac-info-panel-business');
    const rows = Array.from(list.querySelectorAll('.ac-business-history-entry')).map((r) => ({
      field: r.getAttribute('data-field'),
      label: r.querySelector('.ac-business-history-field').textContent,
      from: r.querySelector('.ac-business-history-from').textContent,
      to: r.querySelector('.ac-business-history-to').textContent,
      at: Number(r.querySelector('.ac-business-history-at').getAttribute('data-at')),
      when: r.querySelector('.ac-business-history-at').textContent
    }));
    return {
      panelShown: !!panel && !panel.classList.contains('hidden') && panel.offsetParent !== null,
      empty: (document.getElementById('ac-business-history-empty') || {}).textContent || '',
      rows
    };
  });
}

async function fillBusinessFields(page, v) {
  await page.fill('#edit-profile-dba-name', v.dbaName);
  await page.selectOption('#edit-profile-business-industry', v.businessIndustry);
  await page.fill('#edit-profile-business-street', v.businessStreet);
  await page.fill('#edit-profile-business-city', v.businessCity);
  await page.fill('#edit-profile-business-state', v.businessState);
  await page.fill('#edit-profile-business-postal', v.businessPostal);
  await page.selectOption('#edit-profile-address-visibility', v.businessAddressVisibility);
  await page.fill('#edit-profile-business-hours', v.businessHours);
  await page.fill('#edit-profile-support-email', v.businessSupportEmail);
}

async function submitEditProfile(page) {
  await page.evaluate(() => {
    const form = document.getElementById('edit-profile-form');
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    else document.getElementById('btn-save-edit-profile')?.click();
  });
}

const START = {
  dbaName: 'Start DBA', businessIndustry: 'retail', businessStreet: '1 Start St', businessCity: 'Startville',
  businessState: 'NY', businessPostal: '10001', businessAddressVisibility: 'city_state', businessHours: 'Mon 9-5',
  businessSupportEmail: 'start@example.test'
};
const NEXT = {
  dbaName: 'Next DBA', businessIndustry: 'software_tech', businessStreet: '2 Next Ave', businessCity: 'Nexton',
  businessState: 'NJ', businessPostal: '08205', businessAddressVisibility: 'full', businessHours: 'Tue-Sat 10-6',
  businessSupportEmail: 'next@example.test'
};

async function setStartFields(page) {
  await page.evaluate((start) => { Object.assign(state.currentUser, start, { businessIndustryOther: '' }); }, START);
}

function userSeed(me, extra) {
  return Object.assign({ ['users/' + me]: Object.assign({ username: me, accountType: 'business' }, START) }, extra || {});
}

// Earlier suites share this page and can leave it signed in as another account (e.g. @pixlynote after a switch);
// put the fixture account back before each Business History test.
async function ensureAccount(ctx) {
  const cur = await ctx.page.evaluate(() => (state.currentUser && state.currentUser.username) || '');
  if (String(cur).toLowerCase() !== String(ctx.account.username).toLowerCase()) await ctx.h.loginAs(ctx.page, ctx.account);
}

const TESTS = [
    {
      name: 'Business History: the tab sits right of Profile History on Business accounts and is hidden on personal accounts',
      accounts: ALL_ACCOUNT_KEYS,
      covers: BIZ_COVERS,
      async run({ page, h, a, account }) {
        const prevType = await page.evaluate((t) => { const p = state.currentUser.accountType; state.currentUser.accountType = t; return p; }, account.accountType);
        try {
        await openAccountInfo(page, h);
        const r = await page.evaluate(() => {
          const row = document.getElementById('ac-info-tab-row');
          const btns = Array.from(row.querySelectorAll('button')).filter((b) => !b.classList.contains('hidden'));
          const biz = document.getElementById('btn-ac-info-tab-business');
          setAccountInfoTab('business');
          const afterBizTab = {
            businessPanelShown: !document.getElementById('ac-info-panel-business').classList.contains('hidden'),
            detailsSelected: document.getElementById('btn-ac-info-tab-details').getAttribute('aria-selected')
          };
          return {
            who: (state.currentUser.username || '') + '/' + (state.currentUser.accountType || ''),
            labels: btns.map((b) => b.textContent.trim()),
            bizHidden: biz.classList.contains('hidden') || biz.offsetParent === null,
            cols4: row.classList.contains('grid-cols-4'),
            afterBizTab
          };
        });
        const isBiz = account.accountType === 'business';
        if (isBiz) {
          deq(a, r.labels, ['Details', 'Contact Preferences', 'Profile History', 'Business History'], 'Business History is right of Profile History');
          a.equal(r.bizHidden, false, 'tab shown on a Business account');
          a.equal(r.cols4, true, 'tab row uses four columns');
          a.equal(r.afterBizTab.businessPanelShown, true, 'tapping the tab opens the Business History panel');
        } else {
          deq(a, r.labels, ['Details', 'Contact Preferences', 'Profile History'], 'no Business History on a personal account (' + r.who + ')');
          a.equal(r.bizHidden, true, 'tab hidden on a personal account');
          a.equal(r.cols4, false, 'tab row keeps three columns');
          a.equal(r.afterBizTab.businessPanelShown, false, 'forcing the business tab never opens the panel on a personal account');
          a.equal(r.afterBizTab.detailsSelected, 'true', 'falls back to Details');
        }
        // Switching the same session between account types updates the row the next time Account Info opens.
        const flip = await page.evaluate((isBiz) => {
          if (normalizeUsername(state.currentUser.username) === 'pixlynote') return null;
          state.currentUser.accountType = isBiz ? 'personal' : 'business';
          setAccountCenterView('accountInfo');
          const b = document.getElementById('btn-ac-info-tab-business');
          return { shown: !b.classList.contains('hidden') };
        }, isBiz);
        if (flip) a.equal(flip.shown, !isBiz, 'tab follows the account type when it changes');
        } finally {
          await page.evaluate((p) => { state.currentUser.accountType = p; try { closeAccountCenterModal(); } catch (e) {} }, prevType);
        }
      }
    },
    {
      name: 'Business History: tapping the tab opens it with the empty state "No business changes yet"',
      accounts: ['business', 'pixlynote'],
      covers: BIZ_COVERS,
      async run({ page, h, a, account }) {
        await clearBizHistory(page, account.username);
        await openAccountInfo(page, h);
        await page.click('#btn-ac-info-tab-business');
        await page.waitForTimeout(60);
        const r = await readPanel(page);
        const sel = await page.evaluate(() => ({
          selected: document.getElementById('btn-ac-info-tab-business').getAttribute('aria-selected'),
          historyHidden: document.getElementById('ac-info-panel-history').classList.contains('hidden'),
          opts: Array.from(document.getElementById('ac-business-history-field').options).map((o) => o.textContent.trim())
        }));
        a.equal(r.panelShown, true, 'panel visible');
        a.equal(sel.selected, 'true', 'tab marked selected');
        a.equal(sel.historyHidden, true, 'Profile History panel hidden');
        a.equal(r.rows.length, 0, 'no rows');
        a.equal(r.empty, 'No business changes yet', 'empty state text');
        deq(a, sel.opts.slice(0, 2 + BIZ_FIELDS.length), ['All changes', 'Business detail changes'].concat(BIZ_FIELDS.map((k) => LABELS[k])), 'Show list covers every business field and not Website');
        a.equal(sel.opts[2 + BIZ_FIELDS.length], 'Verification changes', 'Show list has a Verification section after the business fields');
        // Every filter shows the empty state too.
        for (const k of BIZ_FIELDS) {
          await page.selectOption('#ac-business-history-field', k);
          const e = await readPanel(page);
          a.equal(e.empty, 'No business changes yet', 'empty state for ' + k);
        }
        await page.selectOption('#ac-business-history-field', 'all');
        await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} });
      }
    },
    {
      name: 'Business History: Save Changes logs every business field change (old, new, when, who) to the cloud and the tab',
      accounts: ['business'],
      covers: BIZ_COVERS.concat(['el:#btn-save-edit-profile', 'el:#edit-profile-dba-name', 'el:#edit-profile-business-industry',
        'el:#edit-profile-business-street', 'el:#edit-profile-business-city', 'el:#edit-profile-business-state',
        'el:#edit-profile-business-postal', 'el:#edit-profile-address-visibility', 'el:#edit-profile-business-hours',
        'el:#edit-profile-support-email']),
      async run({ page, h, a, account }) {
        const me = account.username;
        await clearBizHistory(page, me);
        const seed = userSeed(me, { ['profileHistory/' + me]: { username: me, updatedAt: 1, fields: { bio: [{ from: 'a', to: 'b', at: 1 }] } } });
        await withBizSandbox(page, me, seed, async () => {
          await setStartFields(page);
          await h.openEditProfile(page);
          await fillBusinessFields(page, NEXT);
          await page.fill('#edit-profile-link', 'example.test/bh-' + Date.now());
          const t0 = Date.now();
          await submitEditProfile(page);
          await page.waitForTimeout(300);
          const cloud = await page.evaluate((me) => window.__pfs.docs['profileHistory/' + me], me);
          const toasts = await page.evaluate(() => window.__bhToasts.slice());
          a.ok(toasts.some((t) => /Profile updated successfully|saved/i.test(t)), 'success toast after the save went through: ' + JSON.stringify(toasts));
          const diag = await page.evaluate(() => ({ who: state.currentUser.username + '/' + state.currentUser.accountType, err: Array.from(document.querySelectorAll('#modal-edit-profile [id$="-error"], #modal-edit-profile .text-rose-600')).filter((e) => e.offsetParent && e.textContent.trim()).map((e) => e.id + ':' + e.textContent.trim()), modalOpen: !!document.getElementById('modal-edit-profile') && !document.getElementById('modal-edit-profile').classList.contains('hidden'), editing: window._editingAccountType }));
          a.ok(cloud && cloud.business, 'business history written to profileHistory/' + me + ' ' + JSON.stringify({ toasts, diag }));
          a.ok(cloud && cloud.fields && Array.isArray(cloud.fields.bio) && cloud.fields.bio.length >= 1, 'existing Profile History entries kept');
          a.ok(cloud && !('website' in (cloud.business || {})) && !('link' in (cloud.business || {})), 'Website is not logged in Business History');
          const expectFrom = { businessIndustry: 'Retail', businessAddressVisibility: 'City & state only' };
          const expectTo = { businessIndustry: 'Software & Tech', businessAddressVisibility: 'Full address' };
          for (const k of BIZ_FIELDS) {
            const list = (cloud && cloud.business && cloud.business[k]) || [];
            a.equal(list.length, 1, k + ' logged once');
            const e = list[0] || {};
            a.equal(e.from, expectFrom[k] || START[k], k + ' old value');
            a.equal(e.to, expectTo[k] || NEXT[k], k + ' new value');
            a.ok(e.at >= t0 && e.at <= Date.now(), k + ' has a timestamp');
            a.equal(e.by, me, k + ' records who made it');
            a.ok(!e.delegatedBy, k + ' not stamped as a delegate when the owner saves');
          }

          await openAccountInfo(page, h);
          await page.click('#btn-ac-info-tab-business');
          await page.waitForTimeout(60);
          const r = await readPanel(page);
          a.equal(r.rows.length, BIZ_FIELDS.length, 'one row per changed field');
          deq(a, r.rows.map((x) => x.label).sort(), BIZ_FIELDS.map((k) => LABELS[k]).sort(), 'every field label listed');
          const dba = r.rows.find((x) => x.field === 'dbaName');
          a.equal(dba.from + '>' + dba.to, 'Start DBA>Next DBA', 'row shows old → new');
          a.ok(/\d{1,2}:\d{2}/.test(dba.when) && /\d{4}/.test(dba.when) && dba.when.indexOf('by @' + me) !== -1, 'row shows date, time and who: ' + dba.when);
          for (const k of BIZ_FIELDS) {
            await page.selectOption('#ac-business-history-field', k);
            const one = await readPanel(page);
            a.equal(one.rows.length, 1, 'filter ' + k + ' shows its one change');
            a.equal(one.rows[0] && one.rows[0].field, k, 'filter ' + k + ' shows only that field');
          }
          await page.selectOption('#ac-business-history-field', 'all');
          // A second save changing one field adds a newer entry on top.
          await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} });
          await h.openEditProfile(page);
          await page.fill('#edit-profile-business-city', 'Third City');
          await submitEditProfile(page);
          await page.waitForTimeout(300);
          const cloud2 = await page.evaluate((me) => window.__pfs.docs['profileHistory/' + me], me);
          a.equal(cloud2.business.businessCity.length, 2, 'second city change appended');
          a.equal(cloud2.business.businessCity[0].to, 'Third City', 'newest first');
          a.equal(cloud2.business.dbaName.length, 1, 'unchanged fields not logged again');
        });
      }
    },
    {
      name: 'Business History: a failed save logs nothing and never shows a success toast',
      accounts: ['business'],
      covers: BIZ_COVERS.concat(['el:#btn-save-edit-profile']),
      async run({ page, h, a, account }) {
        const me = account.username;
        await clearBizHistory(page, me);
        await withBizSandbox(page, me, userSeed(me), async () => {
          await setStartFields(page);
          await h.openEditProfile(page);
          await page.fill('#edit-profile-dba-name', 'Should Not Log');
          await page.evaluate(() => { window.__pfs.failWrites = true; window.__bhToasts = []; });
          await submitEditProfile(page);
          await page.waitForTimeout(300);
          const r = await page.evaluate((me) => ({
            cloud: window.__pfs.docs['profileHistory/' + me] || null,
            local: (typeof getLocalBusinessHistory === 'function') ? getLocalBusinessHistory(me) : null,
            toasts: window.__bhToasts.slice()
          }), me);
          a.equal(r.cloud, null, 'nothing written to the cloud');
          a.equal(r.local.dbaName.length, 0, 'nothing logged locally');
          a.ok(!r.toasts.some((t) => /updated successfully|saved!/i.test(t)), 'no false success toast: ' + JSON.stringify(r.toasts));
          a.ok(r.toasts.some((t) => /Couldn't save your profile changes/i.test(t)), 'clear error toast shown');
          await page.evaluate(() => { window.__pfs.failWrites = false; });
          await openAccountInfo(page, h);
          await page.click('#btn-ac-info-tab-business');
          await page.waitForTimeout(60);
          const p = await readPanel(page);
          a.equal(p.rows.length, 0, 'tab still empty after the failed save');
          a.equal(p.empty, 'No business changes yet', 'empty state after the failed save');
        });
      }
    },
    {
      name: 'Business History: a save with no business changes or one blocked by validation logs nothing',
      accounts: ['business'],
      covers: BIZ_COVERS.concat(['el:#btn-save-edit-profile', 'el:#edit-profile-support-email']),
      async run({ page, h, a, account }) {
        const me = account.username;
        await clearBizHistory(page, me);
        await withBizSandbox(page, me, userSeed(me), async () => {
          await setStartFields(page);
          await h.openEditProfile(page);
          await submitEditProfile(page);
          await page.waitForTimeout(250);
          let r = await page.evaluate((me) => ({ cloud: window.__pfs.docs['profileHistory/' + me] || null, local: getLocalBusinessHistory(me) }), me);
          a.equal(r.cloud, null, 'unchanged save writes no business history');
          a.ok(Object.values(r.local).every((l) => l.length === 0), 'unchanged save logs nothing locally');

          await h.openEditProfile(page);
          await page.fill('#edit-profile-dba-name', 'Blocked DBA');
          await page.fill('#edit-profile-support-email', 'not-an-email');
          await page.evaluate(() => { window.__bhToasts = []; });
          await submitEditProfile(page);
          await page.waitForTimeout(250);
          r = await page.evaluate((me) => ({ cloud: window.__pfs.docs['profileHistory/' + me] || null, local: getLocalBusinessHistory(me), toasts: window.__bhToasts.slice(), dba: state.currentUser.dbaName }), me);
          a.equal(r.cloud, null, 'invalid support email: nothing written');
          a.equal(r.local.dbaName.length, 0, 'invalid support email: nothing logged');
          a.equal(r.dba, 'Start DBA', 'invalid save did not change the DBA');
          a.ok(!r.toasts.some((t) => /updated successfully/i.test(t)), 'no success toast for a blocked save');
        });
      }
    },
    {
      name: 'Business History: local-only save (no cloud) still logs, delegate saves are stamped, and Profile History writes keep the entries',
      accounts: ['business'],
      covers: BIZ_COVERS.concat(['handler:recordBusinessHistory', 'handler:diffBusinessForHistory', 'handler:businessHistoryActor']),
      async run({ page, h, a, account }) {
        const me = account.username;
        await clearBizHistory(page, me);
        await withBizSandbox(page, me, null, async () => {
          await setStartFields(page);
          await h.openEditProfile(page);
          await page.fill('#edit-profile-business-hours', 'Local Hours');
          await submitEditProfile(page);
          await page.waitForTimeout(250);
          const local = await page.evaluate((me) => getLocalBusinessHistory(me).businessHours, me);
          a.equal(local.length, 1, 'save without the cloud still logs locally');
          a.equal(local[0].to, 'Local Hours', 'local entry value');
        });
        await clearBizHistory(page, me);
        await withBizSandbox(page, me, userSeed(me), async () => {
          const r = await page.evaluate(async (me) => {
            const orig = window.privilegedDelegateStamp;
            window.privilegedDelegateStamp = () => ({ delegatedBy: 'helper_del' });
            const actor = businessHistoryActor(me);
            window.privilegedDelegateStamp = orig;
            const ch = diffBusinessForHistory({ dbaName: 'A' }, { dbaName: 'B' }, actor);
            await recordBusinessHistory(me, ch);
            await recordProfileHistory(me, [{ field: 'bio', from: 'x', to: 'y', at: Date.now() }]);
            setAccountCenterView && openAccountCenterModal();
            setAccountCenterView('accountInfo');
            setAccountInfoTab('business');
            const row = document.querySelector('#ac-business-history-list .ac-business-history-entry .ac-business-history-at');
            return { actor, doc: window.__pfs.docs['profileHistory/' + me], when: row ? row.textContent : '' };
          }, me);
          deq(a, r.actor, { by: 'helper_del', delegatedBy: 'helper_del' }, 'delegate session stamps the delegate');
          a.equal(r.doc.business.dbaName[0].delegatedBy, 'helper_del', 'cloud entry carries the delegate stamp');
          a.ok(r.doc.fields && r.doc.fields.bio && r.doc.fields.bio.length === 1, 'Profile History entry written');
          a.equal(r.doc.business.dbaName.length, 1, 'Profile History write kept the business entries');
          a.ok(r.when.indexOf('by @helper_del (delegate)') !== -1, 'row shows the delegate: ' + r.when);
        });
      }
    },
    {
      name: 'Business History: the four-tab row fits a 360px phone without clipping labels',
      accounts: ['business'],
      covers: BIZ_COVERS,
      async run({ page, h, a }) {
        const vp = page.viewportSize();
        await page.setViewportSize({ width: 360, height: 740 });
        try {
          await openAccountInfo(page, h);
          await page.click('#btn-ac-info-tab-business');
          await page.waitForTimeout(80);
          const r = await page.evaluate(() => {
            const row = document.getElementById('ac-info-tab-row');
            const rr = row.getBoundingClientRect();
            const btns = Array.from(row.querySelectorAll('button')).filter((b) => !b.classList.contains('hidden'));
            return {
              rowRight: rr.right, vw: window.innerWidth, rowOverflow: row.scrollWidth - row.clientWidth,
              btns: btns.map((b) => { const r2 = b.getBoundingClientRect(); return { t: b.textContent.trim(), over: b.scrollWidth - b.clientWidth, right: r2.right, h: r2.height }; })
            };
          });
          a.equal(r.btns.length, 4, 'four tabs');
          a.ok(r.rowRight <= r.vw + 0.5, 'tab row inside the screen');
          a.ok(r.rowOverflow <= 1, 'tab row does not overflow');
          r.btns.forEach((b) => {
            a.ok(b.over <= 1, b.t + ' label not clipped');
            a.ok(b.right <= r.rowRight + 0.5, b.t + ' inside the row');
          });
        } finally {
          await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} });
          if (vp) await page.setViewportSize(vp);
        }
      }
    }
];

module.exports = {
  name: 'Business History',
  tests: TESTS.map((t) => Object.assign({}, t, { async run(ctx) { await ensureAccount(ctx); return t.run(ctx); } }))
};
