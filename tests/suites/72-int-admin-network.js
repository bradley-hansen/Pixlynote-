'use strict';

/**
 * Interaction failure paths: @pixlynote admin tools. Business Verification Load/Refresh and
 * Approve / More info / Reject, Government/Organization Verification Requests Approve / Reject /
 * Refresh, and Promote Settings tiers + free list. A failed Worker call or Firestore write must
 * show an error and must not tell the admin (or the applicant) that anything was saved.
 * Worker calls are fulfilled locally; Firestore is the in-page mock.
 */

const nf = require('../helpers/net-fail');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

async function spyNotifications(page) {
  await page.evaluate(() => {
    window.__intNotifs = [];
    if (!window.__intNotifOrig) window.__intNotifOrig = window.addNotificationForUser;
    const orig = window.__intNotifOrig;
    window.addNotificationForUser = function (u, n) { window.__intNotifs.push({ u, n }); };
    try { addNotificationForUser = window.addNotificationForUser; } catch (e) {}
    window.__intRestoreNotifs = () => { window.addNotificationForUser = orig; try { addNotificationForUser = orig; } catch (e) {} window.__intNotifOrig = null; };
  });
}
const restoreNotifications = (page) => page.evaluate(() => { if (window.__intRestoreNotifs) window.__intRestoreNotifs(); });

async function adminToken(page) {
  await page.evaluate(() => {
    const t = document.getElementById('business-verification-admin-token');
    if (t) { t.value = 'test-admin-token'; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}

module.exports = {
  name: 'Interaction failure paths: admin tools',
  tests: [
    {
      name: 'Admin Business Verification Load and Refresh: 500, bad gateway and offline say Could not load and never show a Refreshed time',
      accounts: ['pixlynote'],
      covers: ['el:#btn-load-business-verifications', 'el:#btn-refresh-business-verifications', 'handler:refreshBusinessVerificationAdmin', 'el:#business-verification-admin-token', 'el:#drawer-business-verification-list', 'el:#business-verification-admin-refreshed', 'el:#business-verification-admin-count'],
      async run({ page, h, a }) {
        await h.openOwnerMenu(page);
        await adminToken(page);
        for (const btn of ['btn-load-business-verifications', 'btn-refresh-business-verifications']) {
          for (const mode of ['http500', 'badJson', 'network']) {
            await page.evaluate(() => {
              const s = document.getElementById('business-verification-admin-refreshed'); if (s) { s.textContent = ''; s.classList.add('hidden'); }
              const c = document.getElementById('business-verification-admin-count'); if (c) c.textContent = '7';
            });
            // Load/Refresh also asks the no-token pending-count route. That number is the honest
            // green count (all pending apps) even when the tokened list fails; a failed list must
            // not invent a 0 or a Refreshed time, and must not leave a stale number.
            await nf.withWorker(page, '/business-verification/pending-count', { status: 200, body: { ok: true, pending: 4 } }, async () => {
              await nf.withWorker(page, '/business-verification/admin/list', mode, async (r) => {
                await page.evaluate((id) => { const b = document.getElementById(id); if (b) b.disabled = false; }, btn);
                await nf.tap(page, btn, 300);
                a.equal(r.calls.length, 1, btn + ' ' + mode + ': one list request');
              });
            });
            await page.waitForFunction(() => (document.getElementById('business-verification-admin-count') || {}).textContent === '4', null, { timeout: 3000 });
            const ui = await page.evaluate(() => ({
              list: (document.getElementById('drawer-business-verification-list').textContent || '').trim(),
              stamp: (document.getElementById('business-verification-admin-refreshed').textContent || '').trim(),
              count: (document.getElementById('business-verification-admin-count').textContent || '').trim(),
              spinning: !!document.querySelector('#btn-refresh-business-verifications svg.animate-spin')
            }));
            a.ok(/could not load applications/i.test(ui.list), btn + ' ' + mode + ': says Could not load applications, got "' + ui.list + '"');
            a.ok(!/refreshed/i.test(ui.stamp), btn + ' ' + mode + ': no Refreshed time after a failure');
            a.equal(ui.count, '4', btn + ' ' + mode + ': the green count is the pending-count result, not a leftover or a fake 0 from the failed list');
            a.ok(!ui.spinning, btn + ' ' + mode + ': the refresh icon stops spinning');
          }
        }
      }
    },
    {
      name: 'Admin Business Verification Approve, More Info Needed and Reject: a failed decision says Decision was not saved and never notifies the applicant',
      accounts: ['pixlynote'],
      covers: ['handler:decideBusinessVerification', 'handler:promptBusinessVerificationMoreInfo', 'handler:promptBusinessVerificationReject', 'handler:notifyBusinessVerificationApplicant'],
      async run({ page, h, a }) {
        await h.openOwnerMenu(page);
        await adminToken(page);
        const toasts = await nf.captureToasts(page);
        await spyNotifications(page);
        try {
          await nf.withWorker(page, '/business-verification/admin/list', { status: 200, body: { ok: true, applications: [{ username: 'acme_co', status: 'pending', dbaName: 'Acme Co' }] } }, async () => {
            await nf.tap(page, 'btn-refresh-business-verifications', 300);
          });
          const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('[data-bizver-admin-user="acme_co"] button')).map((b) => b.textContent.trim()));
          a.ok(buttons.join('|') === 'Approve|More Info Needed|Reject', 'The application row has Approve, More Info Needed and Reject: ' + buttons.join('|'));
          await page.evaluate(() => { window.__intPrompt = window.prompt; window.prompt = () => 'Please upload a clearer ID'; });
          const fails = ['http500', { status: 401, body: { error: 'unauthorized' } }, { status: 200, body: { ok: false } }, 'badJson', 'network'];
          for (const label of ['Approve', 'More Info Needed', 'Reject']) {
            for (const mode of fails) {
              await page.evaluate(() => { window.__intToasts = []; window.__intNotifs = []; });
              await nf.withWorker(page, '/business-verification/admin/decision', mode, async (r) => {
                await page.evaluate((label) => {
                  const b = Array.from(document.querySelectorAll('[data-bizver-admin-user="acme_co"] button')).find((x) => x.textContent.trim() === label);
                  if (b) b.click();
                }, label);
                await page.waitForTimeout(300);
                a.equal(r.calls.length, 1, label + ': one decision request');
              });
              const t = await toasts.read();
              const n = await page.evaluate(() => window.__intNotifs.slice());
              const ml = label + ' ' + (typeof mode === 'string' ? mode : JSON.stringify(mode.body));
              a.ok(t.some((m) => /decision was not saved/i.test(m)), ml + ': toast says Decision was not saved: ' + JSON.stringify(t));
              a.equal(n.length, 0, ml + ': the applicant is not notified');
            }
          }
          await page.evaluate(() => { window.__intToasts = []; window.__intNotifs = []; });
          await nf.withWorker(page, '/business-verification/admin/decision', { status: 200, body: { ok: true, status: 'approved', username: 'acme_co' } }, async () => {
            await nf.withWorker(page, '/business-verification/admin/list', { status: 200, body: { ok: true, applications: [] } }, async () => {
              await page.evaluate(() => decideBusinessVerification('acme_co', 'approve', ''));
              await page.waitForTimeout(250);
            });
          });
          const n = await page.evaluate(() => window.__intNotifs.slice());
          a.ok(n.length === 1 && n[0].u === 'acme_co' && /approved/i.test(n[0].n.text), 'A saved approval notifies the applicant once');
        } finally {
          await page.evaluate(() => { if (window.__intPrompt) window.prompt = window.__intPrompt; });
          await restoreNotifications(page);
          await toasts.restore();
        }
      }
    },
    {
      name: 'Admin Verification Requests Approve and Reject: a successful write updates the request and notifies the requester',
      accounts: ['pixlynote'],
      covers: ['handler:approveVerificationRequest', 'handler:rejectVerificationRequest', 'el:#drawer-verification-requests-list'],
      async run({ page, a }) {
        await page.evaluate(installPixlyMockFirestore, {
          'verificationRequests/gov_ok': { username: 'gov_ok', type: 'government', entityName: 'City of Galloway', status: 'pending', requestedAt: Date.now() },
          'verificationRequests/org_ok': { username: 'org_ok', type: 'organization', entityName: 'Harbor Civic League', status: 'pending', requestedAt: Date.now() }
        });
        await spyNotifications(page);
        try {
          await page.evaluate(() => refreshVerificationRequests(true));
          await page.evaluate(() => approveVerificationRequest('gov_ok'));
          await page.evaluate(() => rejectVerificationRequest('org_ok'));
          const r = await page.evaluate(() => ({ docs: window.__pfs.docs, n: window.__intNotifs.map((x) => x.u + ':' + x.n.type) }));
          a.equal(r.docs['verificationRequests/gov_ok'].status, 'approved', 'Approve writes status approved');
          a.equal(r.docs['verificationRequests/org_ok'].status, 'rejected', 'Reject writes status rejected');
          a.ok(r.n.includes('gov_ok:verification_approved') && r.n.includes('org_ok:verification_rejected'), 'Both requesters are notified: ' + r.n.join(','));
        } finally {
          await restoreNotifications(page);
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
          await page.evaluate(() => { if (window._verificationRequests) { delete window._verificationRequests.gov_ok; delete window._verificationRequests.org_ok; } });
        }
      }
    },
    {
      name: 'Admin Verification Requests Approve and Reject: when the Firestore write fails, the admin is not told it worked and the requester is not notified',
      accounts: ['pixlynote'],
      covers: ['handler:approveVerificationRequest', 'handler:rejectVerificationRequest', 'handler:notifyVerificationDecision'],
      async run({ page, a }) {
        await page.evaluate(installPixlyMockFirestore, {
          'verificationRequests/gov_fail': { username: 'gov_fail', type: 'government', entityName: 'City of Galloway', status: 'pending', requestedAt: Date.now() }
        });
        const toasts = await nf.captureToasts(page);
        await spyNotifications(page);
        try {
          await page.evaluate(() => refreshVerificationRequests(false));
          await page.evaluate(() => { window.__pfs.failWrites = true; window.__intToasts = []; window.__intNotifs = []; });
          await page.evaluate(() => approveVerificationRequest('gov_fail'));
          await page.evaluate(() => rejectVerificationRequest('gov_fail'));
          const t = await toasts.read();
          const n = await page.evaluate(() => window.__intNotifs.slice());
          a.equal(await page.evaluate(() => window.__pfs.docs['verificationRequests/gov_fail'].status), 'pending', 'The stored request is still pending (the write failed)');
          a.ok(!t.some((m) => /^approved|^rejected/i.test(m)), 'No Approved/Rejected toast after a failed write: ' + JSON.stringify(t));
          a.ok(t.some((m) => /couldn.t approve/i.test(m)) && t.some((m) => /couldn.t reject/i.test(m)), 'Error toasts for both: ' + JSON.stringify(t));
          a.ok(await page.evaluate(() => window._verificationRequests.gov_fail && window._verificationRequests.gov_fail.status === 'pending'), 'The request is still pending in the admin list data');
          await page.evaluate(() => refreshVerificationRequests(false));
          a.ok(await page.evaluate(() => /@gov_fail/.test((document.getElementById('drawer-verification-requests-list') || {}).textContent || '')), 'The row is still in the Verification Requests list');
          a.equal(n.length, 0, 'The requester is not notified of a decision that was not saved');
        } finally {
          await page.evaluate(() => { if (window.__pfs) window.__pfs.failWrites = false; });
          await restoreNotifications(page);
          await toasts.restore();
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
          await page.evaluate(() => { if (window._verificationRequests) delete window._verificationRequests.gov_fail; });
        }
      }
    },
    {
      name: 'Admin Verification Requests Refresh: a failed cloud load must not show a fresh Refreshed time',
      accounts: ['pixlynote'],
      covers: ['el:#btn-refresh-verification-requests', 'handler:refreshVerificationRequests', 'el:#verification-requests-refreshed'],
      async run({ page, h, a }) {
        await h.openOwnerMenu(page);
        await page.evaluate(installPixlyMockFirestore, {});
        try {
          await page.evaluate(() => {
            window.firebase.getDocs = async () => { throw new Error('mock read failure'); };
            const s = document.getElementById('verification-requests-refreshed'); if (s) { s.textContent = ''; s.classList.add('hidden'); }
          });
          await nf.tap(page, 'btn-refresh-verification-requests', 400);
          const ui = await page.evaluate(() => ({
            stamp: ((document.getElementById('verification-requests-refreshed') || {}).textContent || '').trim(),
            list: ((document.getElementById('drawer-verification-requests-list') || {}).textContent || '').trim(),
            spinning: !!document.querySelector('#btn-refresh-verification-requests svg.animate-spin')
          }));
          a.ok(!ui.spinning, 'The refresh icon stops spinning');
          a.ok(!/refreshed/i.test(ui.stamp), 'No Refreshed time after a failed load, got "' + ui.stamp + '"');
          a.ok(/could not|couldn.t|try again|offline/i.test(ui.list), 'The list says it could not load, got "' + ui.list + '"');
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
        }
      }
    },
    {
      name: 'Admin Promote Settings Save tiers and free list Add/Remove: a failed Firestore write says Nothing changed and keeps the old values',
      accounts: ['pixlynote'],
      covers: ['el:#btn-admin-promote-tiers-save', 'el:#btn-admin-promote-exempt-add', 'handler:saveAdminPromoteTiers', 'handler:addAdminPromoteExempt', 'handler:removeAdminPromoteExempt', 'el:#admin-promote-tiers-msg', 'el:#admin-promote-exempt-msg'],
      async run({ page, h, a }) {
        await page.evaluate(installPixlyMockFirestore, {
          'users/pixlynote': { username: 'pixlynote', uid: 'uid-admin' },
          'users/sunny_days': { username: 'sunny_days', uid: 'uid-sunny' },
          'promoteSettings/exempt': { usernames: ['kiln_and_co'], updatedAt: 1, updatedBy: 'pixlynote' }
        });
        try {
          await h.openOwnerMenu(page);
          await nf.tap(page, 'btn-drawer-admin-promote-tiers', 250);
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          // Start from valid approved tiers so only the failed write can stop the save (earlier tests may leave edits behind).
          const approved = [[5, 24, 250], [25, 72, 1500], [100, 168, 7000], [500, 720, 50000]];
          for (let i = 0; i < approved.length; i++) {
            await nf.setValue(page, 'admin-promote-tier-' + i + '-price', String(approved[i][0]));
            await nf.setValue(page, 'admin-promote-tier-' + i + '-hours', String(approved[i][1]));
            await nf.setValue(page, 'admin-promote-tier-' + i + '-views', String(approved[i][2]));
          }
          await nf.setValue(page, 'admin-promote-tier-0-price', '6');
          await nf.tap(page, 'btn-admin-promote-tiers-save', 250);
          const t = await page.evaluate(() => ({ msg: document.getElementById('admin-promote-tiers-msg').textContent, plan: promotePlan(5) && promotePlan(5).targetImpressions, saved: !!window.__pfs.docs['promoteSettings/tiers'], btn: document.getElementById('btn-admin-promote-tiers-save').disabled }));
          a.ok(/couldn.t save/i.test(t.msg) && /nothing changed/i.test(t.msg), 'Tiers: says Couldn\u2019t save. Nothing changed: ' + t.msg);
          a.ok(!/saved\./i.test(t.msg), 'Tiers: never says Saved');
          a.ok(!t.saved && t.plan === 250, 'Tiers: nothing stored and the app keeps pricing with the old tiers');
          a.ok(!t.btn, 'Tiers: Save is enabled again');

          await nf.tap(page, 'btn-drawer-admin-promote-exempt', 250);
          await nf.setValue(page, 'admin-promote-exempt-input', 'sunny_days');
          await nf.tap(page, 'btn-admin-promote-exempt-add', 250);
          const add = await page.evaluate(() => ({ msg: document.getElementById('admin-promote-exempt-msg').textContent, rows: Array.from(document.querySelectorAll('#admin-promote-exempt-list .admin-promote-exempt-row')).map((r) => r.getAttribute('data-username')), stored: window.__pfs.docs['promoteSettings/exempt'].usernames.join() }));
          a.ok(/nothing changed/i.test(add.msg) && !/now promotes for free/i.test(add.msg), 'Free list add: says Nothing changed: ' + add.msg);
          a.ok(add.rows.join() === 'kiln_and_co' && add.stored === 'kiln_and_co', 'Free list add: the list on screen and in storage is unchanged');

          await page.evaluate(() => { const b = document.querySelector('#admin-promote-exempt-list .btn-admin-promote-exempt-remove[data-username="kiln_and_co"]'); if (b) b.click(); });
          await page.waitForTimeout(250);
          const rm = await page.evaluate(() => ({ msg: document.getElementById('admin-promote-exempt-msg').textContent, rows: Array.from(document.querySelectorAll('#admin-promote-exempt-list .admin-promote-exempt-row')).map((r) => r.getAttribute('data-username')) }));
          a.ok(/nothing changed/i.test(rm.msg) && !/removed/i.test(rm.msg), 'Free list remove: says Nothing changed: ' + rm.msg);
          a.ok(rm.rows.join() === 'kiln_and_co', 'Free list remove: the account stays on the list');
        } finally {
          await page.evaluate(() => { if (window.__pfs) window.__pfs.failWrites = false; try { applyPromoteTiers(null); } catch (e) {} });
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
        }
      }
    }
  ]
};
