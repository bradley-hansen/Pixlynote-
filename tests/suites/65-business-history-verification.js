'use strict';

/**
 * Account Info > Business History > Verification section (branch business-history-verif-nov27).
 * Logs the Business verification application fields (old, new, when, who) in profileHistory/{u}.business under verif* keys,
 * only after the worker accepted the submit or resubmit. Documents log file name + size only; the EIN is masked to its last 4.
 * Mock Firestore + in-page fetch stubs only; never touches production.
 */

const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const VERIF_FIELDS = ['verifLegalName', 'verifDbaName', 'verifEntityType', 'verifCountry', 'verifTaxId', 'verifRegistrationNumber',
  'verifArticles', 'verifTaxLetter', 'verifAddressProof', 'verifDomainEmail', 'verifTrademark', 'verifRepName', 'verifRepTitle', 'verifPhotoId'];
const LABELS = {
  verifLegalName: 'Legal Business Name', verifDbaName: 'DBA / Trade Name', verifEntityType: 'Entity Type', verifCountry: 'Country',
  verifTaxId: 'EIN / Federal TIN', verifRegistrationNumber: 'State / Local Registration Number',
  verifArticles: 'Articles/Certificate document', verifTaxLetter: 'IRS CP 575/W-9 document',
  verifAddressProof: 'Utility bill/bank statement document', verifDomainEmail: 'Business email',
  verifTrademark: 'Trademark Registration Number', verifRepName: 'Authorized representative: Full legal name',
  verifRepTitle: 'Authorized representative: Title', verifPhotoId: 'Government-issued photo ID'
};
const COVERS = ['el:#btn-ac-info-tab-business', 'el:#ac-business-history-field', 'el:#ac-business-history-list',
  'el:#ac-info-panel-business', 'handler:renderBusinessHistoryPanel', 'handler:submitBusinessVerificationApplication', 'el:#btn-submit-business-verification'];

const FIRST = {
  legal: 'Harbor Coffee LLC', dba: 'Harbor Coffee', entity: 'llc', country: 'US', tax: '12-3456789', reg: 'SR-100',
  email: 'owner@harbor.test', trademark: 'TM-555', repName: 'Jane Q Doe', repTitle: 'Owner'
};
const FIRST_EXPECT = {
  verifLegalName: 'Harbor Coffee LLC', verifDbaName: 'Harbor Coffee', verifEntityType: 'LLC', verifCountry: 'United States',
  verifTaxId: 'XX-XXX6789', verifRegistrationNumber: 'SR-100',
  verifArticles: 'articles.pdf (2 KB)', verifTaxLetter: 'w9.pdf (4 KB)', verifAddressProof: 'utility.pdf (5 KB)',
  verifDomainEmail: 'owner@harbor.test', verifTrademark: 'TM-555', verifRepName: 'Jane Q Doe', verifRepTitle: 'Owner',
  verifPhotoId: 'id.png (3 KB)'
};

function deq(a, x, y, msg) { a.equal(JSON.stringify(x), JSON.stringify(y), msg); }

async function ensureAccount(ctx) {
  const cur = await ctx.page.evaluate(() => (state.currentUser && state.currentUser.username) || '');
  if (String(cur).toLowerCase() !== String(ctx.account.username).toLowerCase()) await ctx.h.loginAs(ctx.page, ctx.account);
}

async function clearHist(page, me) {
  await page.evaluate((me) => { try { localStorage.removeItem('pixly_business_history_' + me); } catch (e) {} window._businessHistory = null; }, me);
}

// Sandbox: mock Firestore, success/failure toast capture, restore currentUser and the real fetch afterwards.
async function sandbox(page, me, fn) {
  await page.evaluate(() => {
    window.__bvSnap = { cu: JSON.parse(JSON.stringify(state.currentUser || {})), fetch: window.fetch };
    state.currentUser.accountType = 'business';
  });
  await page.evaluate(installPixlyMockFirestore, { ['users/' + me]: { username: me, accountType: 'business' } });
  try { await fn(); } finally {
    await page.evaluate(uninstallPixlyMockFirestore);
    await page.evaluate(() => {
      const s = window.__bvSnap; if (!s) return;
      Object.keys(state.currentUser).forEach((k) => { if (!(k in s.cu)) delete state.currentUser[k]; });
      Object.assign(state.currentUser, s.cu);
      window.fetch = s.fetch;
      try { if (typeof closeBusinessVerificationModal === 'function') closeBusinessVerificationModal(); } catch (e) {}
      try { if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal(); } catch (e) {}
    });
    await clearHist(page, me);
  }
}

// Fill the real application form. docs: which files to attach (name, bytes, type).
async function fillForm(page, v, docs) {
  await page.evaluate(({ v, docs }) => {
    if (typeof openBusinessVerificationModal === 'function') openBusinessVerificationModal();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('bizver-legal-name', v.legal); set('bizver-dba-name', v.dba); set('bizver-entity-type', v.entity); set('bizver-country', v.country);
    set('bizver-tax-id', v.tax); set('bizver-registration-number', v.reg); set('bizver-domain-email', v.email);
    set('bizver-trademark', v.trademark); set('bizver-rep-name', v.repName); set('bizver-rep-title', v.repTitle);
    const attach = (id, d) => {
      const dt = new DataTransfer();
      if (d) dt.items.add(new File([new Uint8Array(d.bytes)], d.name, { type: d.type }));
      document.getElementById(id).files = dt.files;
    };
    attach('bizver-file-articles', docs.articles); attach('bizver-file-tax-letter', docs.taxLetter);
    attach('bizver-file-address-proof', docs.addressProof); attach('bizver-file-photo-id', docs.photoId);
  }, { v, docs });
}
const ALL_DOCS = {
  articles: { name: 'articles.pdf', bytes: 2048, type: 'application/pdf' },
  taxLetter: { name: 'w9.pdf', bytes: 4096, type: 'application/pdf' },
  addressProof: { name: 'utility.pdf', bytes: 5120, type: 'application/pdf' },
  photoId: { name: 'id.png', bytes: 3072, type: 'image/png' }
};
const REQUIRED_DOCS = { articles: ALL_DOCS.articles, photoId: ALL_DOCS.photoId };

async function submit(page) {
  const r = await page.evaluate(async () => {
    const ok = await submitBusinessVerificationApplication();
    const st = document.getElementById('business-verification-form-status');
    return { ok, status: st ? st.textContent : '', statusClass: st ? st.className : '', statusHidden: st ? st.classList.contains('hidden') : true };
  });
  await page.waitForTimeout(400);
  return r;
}

const readCloud = (page, me) => page.evaluate((me) => window.__pfs.docs['profileHistory/' + me] || null, me);
const readLocal = (page, me) => page.evaluate((me) => getLocalBusinessHistory(me), me);
const verifEntries = (obj) => VERIF_FIELDS.reduce((n, k) => n + (((obj || {})[k]) || []).length, 0);

async function openPanel(page, h, filter) {
  await h.closeOverlays(page);
  await page.evaluate(() => { openAccountCenterModal(); setAccountCenterView('accountInfo'); setAccountInfoTab('business'); });
  await page.waitForTimeout(120);
  if (filter) await page.selectOption('#ac-business-history-field', filter);
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#ac-business-history-list .ac-business-history-entry')).map((r) => ({
      field: r.getAttribute('data-field'), section: r.getAttribute('data-section'),
      label: r.querySelector('.ac-business-history-field').textContent,
      from: r.querySelector('.ac-business-history-from').textContent, to: r.querySelector('.ac-business-history-to').textContent,
      when: r.querySelector('.ac-business-history-at').textContent
    }));
    return { rows, empty: (document.getElementById('ac-business-history-empty') || {}).textContent || '' };
  });
}

const TESTS = [
  {
    name: 'Business History Verification: the Show filter has a Verification section with every application field and its own empty state',
    accounts: ['business'],
    covers: COVERS,
    async run({ page, h, a, account }) {
      await clearHist(page, account.username);
      await h.closeOverlays(page);
      await page.evaluate(() => { openAccountCenterModal(); setAccountCenterView('accountInfo'); setAccountInfoTab('business'); });
      const o = await page.evaluate(() => {
        const sel = document.getElementById('ac-business-history-field');
        const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => ({ label: g.label, opts: Array.from(g.querySelectorAll('option')).map((x) => [x.value, x.textContent.trim()]) }));
        return { first: sel.options[0].textContent.trim(), groups };
      });
      a.equal(o.first, 'All changes', 'first option shows everything');
      a.equal(o.groups.length, 2, 'two sections: Business details and Verification');
      a.equal(o.groups[1].label, 'Verification', 'Verification section');
      a.equal(o.groups[1].opts[0][1], 'Verification changes', 'Verification changes option');
      deq(a, o.groups[1].opts.slice(1).map((x) => x[0]), VERIF_FIELDS, 'one option per application field, in form order');
      a.equal(o.groups[1].opts.length, 15, 'Verification changes + 14 per-field options');
      for (const [val] of o.groups[1].opts) {
        await page.selectOption('#ac-business-history-field', val);
        const e = await page.evaluate(() => (document.getElementById('ac-business-history-empty') || {}).textContent || '');
        a.equal(e, 'No verification changes yet', 'empty state for ' + val);
      }
      await page.selectOption('#ac-business-history-field', 'business');
      a.equal(await page.evaluate(() => document.getElementById('ac-business-history-empty').textContent), 'No business changes yet', 'business filter keeps its own empty state');
      await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} });
    }
  },
  {
    name: 'Business History Verification: a successful submit logs all 14 fields (old, new, when, who), masks the EIN, and stores documents as name + size only',
    accounts: ['business'],
    covers: COVERS,
    async run({ page, h, a, account }) {
      const me = account.username;
      await clearHist(page, me);
      await sandbox(page, me, async () => {
        await page.evaluate(() => { state.currentUser.dbaName = ''; });
        await fillForm(page, FIRST, ALL_DOCS);
        const t0 = Date.now();
        const r = await submit(page);
        a.equal(r.ok, true, 'submit succeeded');
        a.ok(/Application submitted/i.test(r.status) && /emerald/.test(r.statusClass), 'success message shown: ' + r.status);
        const cloud = await readCloud(page, me);
        a.ok(cloud && cloud.business, 'history written to profileHistory/' + me);
        a.equal(verifEntries(cloud.business), 14, 'one entry per field');
        for (const k of VERIF_FIELDS) {
          const e = (cloud.business[k] || [])[0] || {};
          a.equal(e.from, '', k + ' old value is empty on the first submit');
          a.equal(e.to, FIRST_EXPECT[k], k + ' new value');
          a.ok(e.at >= t0 && e.at <= Date.now(), k + ' has a timestamp');
          a.equal(e.by, me, k + ' records who');
        }
        const histKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /history|verif/i.test(k)).map((k) => k + '=' + localStorage.getItem(k)));
        const raw = JSON.stringify(cloud) + JSON.stringify(histKeys);
        a.ok(raw.indexOf('12-3456789') < 0 && raw.indexOf('123456789') < 0, 'the full EIN is never stored (cloud or device history)');
        a.ok(raw.indexOf('JVBER') < 0 && raw.indexOf('data:') < 0 && raw.indexOf('base64') < 0, 'no document contents stored');
        const biz = VERIF_FIELDS.filter((k) => !(k in cloud.business)).length;
        a.equal(biz, 0, 'all verification keys present in the same business map');

        const all = await openPanel(page, h, 'verification');
        a.equal(all.rows.length, 14, 'Verification changes lists 14 rows');
        a.ok(all.rows.every((x) => x.section === 'verification' && x.label.indexOf('Verification · ') === 0), 'rows are labeled as verification');
        const ein = all.rows.find((x) => x.field === 'verifTaxId');
        a.equal(ein.to, 'XX-XXX6789', 'EIN shown as last 4 only');
        a.equal(ein.from, '(empty)', 'old value shown as (empty)');
        a.ok(/\d{1,2}:\d{2}/.test(ein.when) && ein.when.indexOf('by @' + me) >= 0, 'date, time and who shown: ' + ein.when);
        for (const k of VERIF_FIELDS) {
          const one = await openPanel(page, h, k);
          a.equal(one.rows.length, 1, 'filter ' + k + ' shows one change');
          a.equal(one.rows[0].field, k, 'filter ' + k + ' shows only that field');
          a.equal(one.rows[0].to, FIRST_EXPECT[k], 'filter ' + k + ' shows the new value');
        }
        const everything = await openPanel(page, h, 'all');
        a.equal(everything.rows.length, 14, 'All changes includes verification rows');
        const bizOnly = await openPanel(page, h, 'business');
        a.equal(bizOnly.rows.length, 0, 'business detail filter excludes verification rows');
      });
    }
  },
  {
    name: 'Business History Verification: a resubmit logs only what changed, skips optional documents that were not re-attached, and keeps the old entries',
    accounts: ['business'],
    covers: COVERS,
    async run({ page, h, a, account }) {
      const me = account.username;
      await clearHist(page, me);
      await sandbox(page, me, async () => {
        await page.evaluate(() => { state.currentUser.dbaName = ''; });
        await fillForm(page, FIRST, ALL_DOCS);
        a.equal((await submit(page)).ok, true, 'first submit');
        await page.waitForTimeout(30);
        // Resubmit: new legal name, new representative title, new articles file; same everything else; EIN same last 4.
        await fillForm(page, Object.assign({}, FIRST, { legal: 'Harbor Coffee Holdings LLC', repTitle: 'CEO', tax: '99-9996789' }),
          { articles: { name: 'articles-v2.pdf', bytes: 6144, type: 'application/pdf' }, photoId: ALL_DOCS.photoId });
        const r = await submit(page);
        a.equal(r.ok, true, 'resubmit succeeded');
        const cloud = await readCloud(page, me);
        const b = cloud.business;
        a.equal(b.verifLegalName.length, 2, 'legal name has two entries');
        a.equal(b.verifLegalName[0].from + '>' + b.verifLegalName[0].to, 'Harbor Coffee LLC>Harbor Coffee Holdings LLC', 'legal name old to new, newest first');
        a.equal(b.verifRepTitle[0].from + '>' + b.verifRepTitle[0].to, 'Owner>CEO', 'title old to new');
        a.equal(b.verifArticles[0].from + '>' + b.verifArticles[0].to, 'articles.pdf (2 KB)>articles-v2.pdf (6 KB)', 'document old to new, name and size only');
        ['verifDbaName', 'verifEntityType', 'verifCountry', 'verifRegistrationNumber', 'verifDomainEmail', 'verifTrademark', 'verifRepName', 'verifPhotoId', 'verifTaxId'].forEach((k) => {
          a.equal(b[k].length, 1, k + ' unchanged, not logged again');
        });
        ['verifTaxLetter', 'verifAddressProof'].forEach((k) => a.equal(b[k].length, 1, k + ' not re-attached, no false removal logged'));
        // Changing the country and entity type logs their labels.
        await fillForm(page, Object.assign({}, FIRST, { legal: 'Harbor Coffee Holdings LLC', repTitle: 'CEO', entity: 'corporation', country: 'CA', tax: '', reg: '' }), REQUIRED_DOCS);
        a.equal((await submit(page)).ok, true, 'third submit');
        const c2 = (await readCloud(page, me)).business;
        a.equal(c2.verifEntityType[0].from + '>' + c2.verifEntityType[0].to, 'LLC>Corporation', 'entity type label change');
        a.equal(c2.verifCountry[0].from + '>' + c2.verifCountry[0].to, 'United States>Canada', 'country label change');
        a.equal(c2.verifTaxId[0].to, '', 'clearing the optional EIN is logged as empty');
        a.equal(c2.verifRegistrationNumber[0].to, '', 'clearing the registration number is logged as empty');
        const other = await readLocal(page, me);
        a.equal(other.verifLegalName.length, 2, 'this device shows the same history');
      });
    }
  },
  {
    name: 'Business History Verification: a failed submit (worker error, rejected response, network failure, validation) logs nothing and never shows success',
    accounts: ['business'],
    covers: COVERS,
    async run({ page, h, a, account }) {
      const me = account.username;
      await clearHist(page, me);
      await sandbox(page, me, async () => {
        const cases = [
          { name: 'worker says not ok', fetch: "async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'submit_failed' }) })" },
          { name: 'HTTP 500', fetch: "async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })" },
          { name: 'storage not configured', fetch: "async () => ({ ok: false, status: 503, json: async () => ({ error: 'storage_not_configured' }) })" },
          { name: 'network failure', fetch: "async () => { throw new Error('offline'); }" }
        ];
        for (const c of cases) {
          await fillForm(page, FIRST, ALL_DOCS);
          await page.evaluate((src) => { window.fetch = eval('(' + src + ')'); }, c.fetch);
          const r = await submit(page);
          a.equal(r.ok, false, c.name + ': submit returns false');
          a.ok(!/Application submitted/i.test(r.status) && /rose/.test(r.statusClass) && r.status.length > 5, c.name + ': error shown, not success: ' + r.status);
          a.equal(await readCloud(page, me), null, c.name + ': nothing written to the cloud');
          const local = await readLocal(page, me);
          a.equal(verifEntries(local), 0, c.name + ': nothing logged on this device');
        }
        await page.evaluate(() => { window.fetch = window.__bvSnap.fetch; });
        // Client-side validation failures: nothing is sent and nothing is logged.
        const bad = [
          { name: 'missing legal name', v: Object.assign({}, FIRST, { legal: '' }), docs: ALL_DOCS },
          { name: 'bad US EIN', v: Object.assign({}, FIRST, { tax: '12-345' }), docs: ALL_DOCS },
          { name: 'missing representative title', v: Object.assign({}, FIRST, { repTitle: '' }), docs: ALL_DOCS },
          { name: 'missing articles', v: FIRST, docs: { photoId: ALL_DOCS.photoId } },
          { name: 'missing photo ID', v: FIRST, docs: { articles: ALL_DOCS.articles } },
          { name: 'file over 10 MB', v: FIRST, docs: { articles: { name: 'big.pdf', bytes: 10 * 1024 * 1024 + 1, type: 'application/pdf' }, photoId: ALL_DOCS.photoId } }
        ];
        for (const c of bad) {
          await fillForm(page, c.v, c.docs);
          const r = await submit(page);
          a.equal(r.ok, false, c.name + ': submit returns false');
          a.ok(!/Application submitted/i.test(r.status) && /rose/.test(r.statusClass), c.name + ': error shown: ' + r.status);
          a.equal(await readCloud(page, me), null, c.name + ': nothing written');
          a.equal(verifEntries(await readLocal(page, me)), 0, c.name + ': nothing logged');
        }
        // The tab stays empty after all the failures.
        const p = await openPanel(page, h, 'verification');
        a.equal(p.rows.length, 0, 'Verification section still empty');
        a.equal(p.empty, 'No verification changes yet', 'empty state after failures');
      });
    }
  },
  {
    name: 'Business History Verification: a failed history write never turns an accepted submit into a failure or false error',
    accounts: ['business'],
    covers: COVERS,
    async run({ page, a, account }) {
      const me = account.username;
      await clearHist(page, me);
      await sandbox(page, me, async () => {
        await fillForm(page, FIRST, ALL_DOCS);
        await page.evaluate(() => { window.__pfs.failWrites = true; });
        const r = await submit(page);
        a.equal(r.ok, true, 'the accepted application still reports success');
        a.ok(/Application submitted/i.test(r.status), 'success message kept: ' + r.status);
        await page.evaluate(() => { window.__pfs.failWrites = false; });
        a.equal(await readCloud(page, me), null, 'nothing reached the cloud history');
      });
    }
  },
  {
    name: 'Business History Verification: a personal account cannot submit, logs nothing, and the section is not reachable',
    accounts: ['personal'],
    covers: COVERS,
    async run({ page, a, account }) {
      const me = account.username;
      await clearHist(page, me);
      await page.evaluate(() => { window.__bvSnapP = JSON.parse(JSON.stringify(state.currentUser)); });
      await page.evaluate(installPixlyMockFirestore, {});
      try {
        await fillForm(page, FIRST, ALL_DOCS);
        const r = await submit(page);
        a.equal(r.ok, false, 'submit refused on a personal account');
        a.ok(!/Application submitted/i.test(r.status), 'no success message: ' + r.status);
        a.equal(await readCloud(page, me), null, 'nothing written');
        const tab = await page.evaluate(() => {
          openAccountCenterModal(); setAccountCenterView('accountInfo'); setAccountInfoTab('business');
          const b = document.getElementById('btn-ac-info-tab-business');
          return { hidden: b.classList.contains('hidden') || b.offsetParent === null, panel: !document.getElementById('ac-info-panel-business').classList.contains('hidden') };
        });
        a.equal(tab.hidden, true, 'Business History tab hidden');
        a.equal(tab.panel, false, 'panel not opened');
      } finally {
        await page.evaluate(uninstallPixlyMockFirestore);
        await page.evaluate(() => { try { closeBusinessVerificationModal(); } catch (e) {} try { closeAccountCenterModal(); } catch (e) {} });
      }
    }
  },
  {
    name: 'Business History Verification: long values wrap and the Show filter fits a 360px phone',
    accounts: ['business'],
    covers: COVERS,
    async run({ page, h, a, account }) {
      const me = account.username;
      await clearHist(page, me);
      const vp = page.viewportSize();
      await page.setViewportSize({ width: 360, height: 740 });
      try {
        await sandbox(page, me, async () => {
          await fillForm(page, Object.assign({}, FIRST, { legal: 'A Very Long Legal Business Name That Keeps Going And Going Holdings International LLC', email: 'a.really.long.address.for.the.business@subdomain.example-company.test' }),
            { articles: { name: 'a-very-long-document-file-name-for-the-articles-of-organization-final-v3.pdf', bytes: 2048, type: 'application/pdf' }, photoId: ALL_DOCS.photoId });
          a.equal((await submit(page)).ok, true, 'submit');
          await openPanel(page, h, 'verification');
          const r = await page.evaluate(() => {
            const list = document.getElementById('ac-business-history-list');
            const sel = document.getElementById('ac-business-history-field');
            const lr = list.getBoundingClientRect(), sr = sel.getBoundingClientRect();
            const rows = Array.from(list.querySelectorAll('.ac-business-history-entry'));
            return { vw: window.innerWidth, listRight: lr.right, selRight: sr.right, over: list.scrollWidth - list.clientWidth, rowOver: rows.map((x) => x.scrollWidth - x.clientWidth).filter((n) => n > 1).length, n: rows.length };
          });
          a.equal(r.n, 12, 'rows rendered (the two optional documents were not attached)');
          a.ok(r.listRight <= r.vw + 0.5 && r.selRight <= r.vw + 0.5, 'list and filter inside the screen');
          a.ok(r.over <= 1 && r.rowOver === 0, 'long values wrap instead of overflowing');
        });
      } finally {
        if (vp) await page.setViewportSize(vp);
      }
    }
  }
];

module.exports = {
  name: 'Business History Verification',
  tests: TESTS.map((t) => Object.assign({}, t, { async run(ctx) { await ensureAccount(ctx); return t.run(ctx); } }))
};
