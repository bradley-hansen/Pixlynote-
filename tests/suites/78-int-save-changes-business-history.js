'use strict';

/**
 * Edit Profile Save Changes and the Business History tab, driven by real taps on the Save Changes
 * button, for success AND failure. Firestore is the in-page mock (tests/helpers/mock-firestore.js);
 * nothing reaches production.
 */

const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const START = {
  dbaName: 'Start DBA', businessIndustry: 'retail', businessStreet: '1 Start St', businessCity: 'Startville',
  businessState: 'NY', businessPostal: '10001', businessAddressVisibility: 'city_state', businessHours: 'Mon 9-5',
  businessSupportEmail: 'start@example.test'
};

async function sandbox(page, h, me, fn) {
  await page.evaluate((start) => {
    window.__ssSnap = { cu: JSON.parse(JSON.stringify(state.currentUser || {})), toast: window.showToast };
    state.currentUser.accountType = 'business';
    Object.assign(state.currentUser, start, { businessIndustryOther: '' });
    window.__ssToasts = [];
    const orig = window.showToast;
    window.showToast = function (m) { window.__ssToasts.push(String(m || '')); try { return orig.apply(this, arguments); } catch (e) {} };
    try { localStorage.removeItem('pixly_business_history_' + normalizeUsername(state.currentUser.username)); } catch (e) {}
    window._businessHistory = null;
  }, START);
  await page.evaluate(installPixlyMockFirestore, { ['users/' + me]: Object.assign({ username: me, accountType: 'business' }, START) });
  try { await fn(); } finally {
    await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
    await page.evaluate((me) => {
      const s = window.__ssSnap; if (!s) return;
      Object.keys(state.currentUser).forEach((k) => { if (!(k in s.cu)) delete state.currentUser[k]; });
      Object.assign(state.currentUser, s.cu);
      window.showToast = s.toast;
      window._lastLocalProfileWriteTs = 0;
      try { localStorage.removeItem('pixly_business_history_' + me); } catch (e) {}
      window._businessHistory = null;
      try { if (typeof saveUserProfile === 'function') saveUserProfile(); } catch (e) {}
      try { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); } catch (e) {}
      try { if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal(); } catch (e) {}
    }, me).catch(() => {});
  }
}

const snapshot = (page, me) => page.evaluate((me) => ({
  cloudDba: ((window.__pfs && window.__pfs.docs['users/' + me]) || {}).dbaName,
  shownDba: state.currentUser.dbaName,
  formOpen: (() => { const m = document.getElementById('modal-edit-profile'); return !!(m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none'); })(),
  history: (typeof getLocalBusinessHistory === 'function' ? (getLocalBusinessHistory(me).dbaName || []) : []).map((e) => ({ from: e.from, to: e.to })),
  toasts: (window.__ssToasts || []).slice()
}), me);

async function tapSave(page) {
  await page.click('#btn-save-edit-profile', { timeout: 5000 });
  await page.waitForTimeout(500);
}

module.exports = {
  name: 'Interaction: Save Changes and Business History by taps',
  tests: [
    {
      name: 'Save Changes by tap (business): a good save writes the new DBA to the cloud, says saved, and Business History shows the change once',
      accounts: ['business'],
      covers: ['el:#btn-save-edit-profile', 'listener:#edit-profile-form:submit', 'el:#edit-profile-dba-name', 'el:#btn-ac-info-tab-business', 'el:#ac-business-history-list'],
      async run({ page, h, a, account }) {
        const me = account.username;
        await sandbox(page, h, me, async () => {
          await h.openEditProfile(page);
          await page.fill('#edit-profile-dba-name', 'Tapped DBA');
          await tapSave(page);
          const r = await snapshot(page, me);
          a.equal(r.cloudDba, 'Tapped DBA', 'The cloud has the new DBA');
          a.ok(r.toasts.some((t) => /updated successfully|saved!/i.test(t)), 'Says saved: ' + JSON.stringify(r.toasts));
          a.equal(JSON.stringify(r.history), JSON.stringify([{ from: 'Start DBA', to: 'Tapped DBA' }]), 'Business History has exactly one DBA entry');
          await page.evaluate(() => { openAccountCenterModal(); setAccountCenterView('accountInfo'); });
          await page.waitForTimeout(150);
          await page.click('#btn-ac-info-tab-business');
          // The tab loads its list asynchronously, so wait for the entry instead of a fixed pause.
          await page.waitForFunction(() => document.querySelectorAll('#ac-business-history-list .ac-business-history-entry').length > 0, null, { timeout: 5000 }).catch(() => {});
          const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#ac-business-history-list .ac-business-history-entry')).map((x) => x.textContent.replace(/\s+/g, ' ')));
          a.ok(rows.length === 1 && /Start DBA/.test(rows[0]) && /Tapped DBA/.test(rows[0]), 'The tab shows the one change: ' + JSON.stringify(rows));
        });
      }
    },
    {
      name: 'Save Changes by tap (business): when the cloud save fails, the form stays open with the edits and the profile keeps the saved values',
      accounts: ['business'],
      covers: ['el:#btn-save-edit-profile', 'listener:#edit-profile-form:submit'],
      async run({ page, h, a, account }) {
        const me = account.username;
        await sandbox(page, h, me, async () => {
          await h.openEditProfile(page);
          await page.fill('#edit-profile-dba-name', 'Unsaved DBA');
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          await tapSave(page);
          const r = await snapshot(page, me);
          await page.evaluate(() => { window.__pfs.failWrites = false; });
          if (!r.toasts.some((t) => /couldn't save your profile changes/i.test(t))) throw new Error('PRECONDITION (not the bug): no failure toast: ' + JSON.stringify(r));
          a.equal(r.cloudDba, 'Start DBA', 'The cloud kept the old DBA');
          a.ok(!r.toasts.some((t) => /updated successfully|saved!/i.test(t)), 'Never says saved');
          a.equal(r.history.length, 0, 'Business History logs nothing');
          a.ok(r.formOpen, 'The form is open for a retry');
          a.equal(await page.inputValue('#edit-profile-dba-name'), 'Unsaved DBA', 'The form still holds the edit');
          a.equal(r.shownDba, 'Start DBA', 'The profile does not show the unsaved DBA');
          a.ok(r.toasts.some((t) => /couldn't save your profile changes/i.test(t)), 'An error toast is shown');
        });
      }
    },
    {
      name: 'Save Changes by tap (business): after a failed save, saving again stores the DBA and Business History records the change once',
      accounts: ['business'],
      covers: ['el:#btn-save-edit-profile', 'el:#ac-business-history-list'],
      async run({ page, h, a, account }) {
        const me = account.username;
        await sandbox(page, h, me, async () => {
          await h.openEditProfile(page);
          await page.fill('#edit-profile-dba-name', 'Retry DBA');
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          await tapSave(page);
          await page.evaluate(() => { window.__pfs.failWrites = false; window.__ssToasts = []; });
          // The form is still open with the edit: just tap Save Changes again (no reopening, no retyping).
          if ((await page.inputValue('#edit-profile-dba-name')) !== 'Retry DBA') throw new Error('The form did not keep the edit after the failed save');
          await tapSave(page);
          const r = await snapshot(page, me);
          if (r.cloudDba !== 'Retry DBA') throw new Error('PRECONDITION (not the bug): the retry did not save: ' + JSON.stringify(r));
          a.ok(r.toasts.some((t) => /updated successfully|saved!/i.test(t)), 'The retry says saved');
          a.equal(JSON.stringify(r.history), JSON.stringify([{ from: 'Start DBA', to: 'Retry DBA' }]), 'Business History records Start DBA -> Retry DBA once');
        });
      }
    }
  ]
};
