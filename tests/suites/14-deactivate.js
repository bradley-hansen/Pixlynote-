'use strict';

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

module.exports = {
  name: 'Deactivate account',
  tests: [
    {
      name: 'Deactivate: personal account schedules a 30-day deletion, appears on the @pixlynote Pending Deactivations card, cancel clears it, and an expired window calls the stubbed purge',
      accounts: ['personal'],
      covers: [
        'el:#btn-ac-deactivate-account',
        'el:#btn-confirm-deactivate',
        'el:#btn-cancel-deactivate',
        'el:#modal-deactivate-confirm',
        'el:#btn-ac-open-your-account',
        'el:#modal-account-center',
        'handler:handleDrawerAccountCenterClick',
        'el:#pending-deactivations-count',
        'el:#drawer-pending-deactivations-list',
        'el:#metric-total-users'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const target = account.username; // reg_personal
        const THIRTY = WINDOW_MS;

        try {
          await h.installAppStubs(page);
          await page.evaluate(() => { window.__pixlyDeleteCalls = []; });

          // --- 1. Open Account Center > Your account > Deactivate ---
          await h.openOwnerMenu(page);
          await page.evaluate(() => {
            if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
            const m = document.getElementById('modal-account-center');
            if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
            if (typeof setAccountCenterView === 'function') setAccountCenterView('yourAccount');
          });
          await page.waitForTimeout(150);
          const acOpen = await page.evaluate(() => {
            const m = document.getElementById('modal-account-center');
            const btn = document.getElementById('btn-ac-deactivate-account');
            const your = document.getElementById('ac-view-your-account');
            return {
              modal: !!(m && !m.classList.contains('hidden')),
              view: !!(your && !your.classList.contains('hidden')),
              btn: !!btn
            };
          });
          a.ok(acOpen.modal && acOpen.btn, 'Account Center Your account view shows Deactivate: ' + JSON.stringify(acOpen));

          await page.evaluate(() => {
            const btn = document.getElementById('btn-ac-deactivate-account');
            if (btn) btn.click();
            else if (typeof openDeactivateConfirmModal === 'function') openDeactivateConfirmModal();
          });
          await page.waitForTimeout(150);
          const confirmUi = await page.evaluate(() => {
            const m = document.getElementById('modal-deactivate-confirm');
            const cs = m ? getComputedStyle(m) : {};
            const handle = (document.getElementById('deactivate-confirm-handle') || {}).textContent || '';
            const confirm = document.getElementById('btn-confirm-deactivate');
            const cancel = document.getElementById('btn-cancel-deactivate');
            return {
              open: !!(m && !m.classList.contains('hidden') && cs.display !== 'none'),
              handle,
              hasConfirm: !!confirm,
              hasCancel: !!cancel
            };
          });
          a.ok(confirmUi.open, 'Deactivate confirm modal opens');
          a.ok(confirmUi.handle.includes('@' + target), 'Confirm modal shows the username: ' + confirmUi.handle);
          a.ok(confirmUi.hasConfirm && confirmUi.hasCancel, 'Confirm and Cancel buttons are present');

          const before = Date.now();
          await page.evaluate(() => {
            const btn = document.getElementById('btn-confirm-deactivate');
            if (btn) btn.click();
          });
          await page.waitForFunction(() => {
            const rec = (typeof getDeactivationRecord === 'function') && getDeactivationRecord('reg_personal');
            const loggedOut = !(window.state && state.isLoggedIn);
            return !!(rec && rec.deactivated) || loggedOut;
          }, null, { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(200);

          const rec = await page.evaluate((u) => {
            const r = (typeof getDeactivationRecord === 'function') ? getDeactivationRecord(u) : null;
            let map = {};
            try { map = JSON.parse(localStorage.getItem('pixly_deactivated_accounts') || '{}'); } catch (e) {}
            return {
              rec: r,
              mapHas: !!(map && map[u] && map[u].deactivated),
              loggedIn: !!(state && state.isLoggedIn),
              windowMs: (typeof PIXLY_DEACTIVATION_WINDOW_MS === 'number') ? PIXLY_DEACTIVATION_WINDOW_MS : null
            };
          }, target);
          a.ok(rec.rec && rec.rec.deactivated, 'Deactivation record exists: ' + JSON.stringify(rec.rec));
          a.ok(rec.mapHas, 'Record is stored in pixly_deactivated_accounts');
          const scheduled = Number(rec.rec && rec.rec.scheduledDeletionAt);
          const expected = before + (rec.windowMs || THIRTY);
          a.ok(Number.isFinite(scheduled) && Math.abs(scheduled - expected) < 15000, 'Deletion is scheduled ~30 days out (got ' + scheduled + ', expected ~' + expected + ')');
          a.ok(!rec.loggedIn, 'User is logged out after confirming deactivation');

          // --- 2. @pixlynote Pending Deactivations card shows the account ---
          await h.loginAs(page, h.ACCOUNTS.pixlynote);
          await h.installAppStubs(page);
          await h.openOwnerMenu(page);
          await page.evaluate(async () => {
            if (typeof refreshPendingDeactivations === 'function') await refreshPendingDeactivations(true);
            if (typeof refreshDrawerUserMetrics === 'function') await refreshDrawerUserMetrics(true);
          });
          await page.waitForTimeout(200);

          const pending = await page.evaluate((u) => {
            const count = (document.getElementById('pending-deactivations-count') || {}).textContent || '';
            const list = (document.getElementById('drawer-pending-deactivations-list') || {}).innerText || '';
            const card = document.getElementById('drawer-pixlynote-deactivations');
            const rec = (typeof getDeactivationRecord === 'function') ? getDeactivationRecord(u) : null;
            return {
              count: parseInt(String(count).replace(/[^\d]/g, ''), 10),
              list: list.replace(/\s+/g, ' ').trim(),
              cardVisible: !!(card && !card.classList.contains('hidden')),
              stillDeactivated: !!(rec && rec.deactivated)
            };
          }, target);
          a.ok(pending.cardVisible, 'Pending Deactivations card is visible for @pixlynote');
          a.ok(pending.stillDeactivated, 'The deactivation record is still present (was not auto-cancelled)');
          a.equal(pending.count, 1, 'Pending count is 1, got ' + pending.count + ' list=' + pending.list);
          a.ok(pending.list.toLowerCase().includes(target.toLowerCase()), 'Card lists the deactivated username: ' + pending.list);

          // --- 3. Metrics include the fake fixture accounts ---
          const metrics = await page.evaluate(() => {
            const total = parseInt(String((document.getElementById('metric-total-users') || {}).textContent || '').replace(/[^\d]/g, ''), 10);
            const personal = parseInt(String((document.getElementById('metric-personal-users') || {}).textContent || '').replace(/[^\d]/g, ''), 10);
            const business = parseInt(String((document.getElementById('metric-business-users') || {}).textContent || '').replace(/[^\d]/g, ''), 10);
            const list = (document.getElementById('drawer-metrics-accounts-list') || {}).innerText || '';
            return { total, personal, business, list: list.replace(/\s+/g, ' ') };
          });
          a.ok(metrics.total >= 4, 'Metrics total includes the fake accounts (total=' + metrics.total + ')');
          a.ok(metrics.personal >= 2, 'Metrics personal count includes fake personal accounts: ' + metrics.personal);
          a.ok(metrics.business >= 2, 'Metrics business count includes @pixlynote and the fake business account: ' + metrics.business);
          a.ok(/@reg_personal/.test(metrics.list), 'Metrics list includes @reg_personal');
          a.ok(/@reg_business/.test(metrics.list), 'Metrics list includes @reg_business');
          a.ok(/@reg_empty/.test(metrics.list), 'Metrics list includes @reg_empty');
          a.ok(/@pixlynote/.test(metrics.list), 'Metrics list includes @pixlynote');

          // --- 4. cancelAccountDeactivation clears the card ---
          const cancelled = await page.evaluate((u) => {
            const ok = (typeof cancelAccountDeactivation === 'function') ? cancelAccountDeactivation(u) : false;
            return ok;
          }, target);
          a.ok(cancelled, 'cancelAccountDeactivation reports it cleared a record');
          await page.evaluate(async () => {
            if (typeof refreshPendingDeactivations === 'function') await refreshPendingDeactivations(true);
          });
          await page.waitForTimeout(150);
          const afterCancel = await page.evaluate((u) => {
            const count = parseInt(String((document.getElementById('pending-deactivations-count') || {}).textContent || '').replace(/[^\d]/g, ''), 10);
            const list = (document.getElementById('drawer-pending-deactivations-list') || {}).innerText || '';
            const rec = (typeof getDeactivationRecord === 'function') ? getDeactivationRecord(u) : null;
            return { count, list: list.replace(/\s+/g, ' ').trim(), rec };
          }, target);
          a.ok(!afterCancel.rec || !afterCancel.rec.deactivated, 'Record is cleared');
          a.equal(afterCancel.count, 0, 'Pending count is back to 0, list=' + afterCancel.list);
          a.ok(!afterCancel.list.toLowerCase().includes(target.toLowerCase()) || /no pending/i.test(afterCancel.list), 'Username is gone from the card: ' + afterCancel.list);

          // --- 5. An expired window calls the stubbed purge ---
          await page.evaluate(() => { window.__pixlyDeleteCalls = []; });
          await page.evaluate(() => {
            const u = 'reg_expired';
            const now = Date.now();
            const rec = {
              username: u,
              fullName: 'Reg Expired',
              accountType: 'personal',
              deactivated: true,
              deactivatedAt: now - (31 * 24 * 60 * 60 * 1000),
              scheduledDeletionAt: now - 1000
            };
            let map = {};
            try { map = JSON.parse(localStorage.getItem('pixly_deactivated_accounts') || '{}'); } catch (e) {}
            map[u] = rec;
            localStorage.setItem('pixly_deactivated_accounts', JSON.stringify(map));
            localStorage.setItem('pixly_account_' + u, JSON.stringify(rec));
            window._pixlyAccounts = window._pixlyAccounts || {};
            window._pixlyAccounts[u] = rec;
          });
          await page.evaluate(async () => {
            if (typeof refreshPendingDeactivations === 'function') await refreshPendingDeactivations(true);
          });
          await page.waitForTimeout(200);
          const purged = await page.evaluate(() => ({
            calls: window.__pixlyDeleteCalls || [],
            count: parseInt(String((document.getElementById('pending-deactivations-count') || {}).textContent || '').replace(/[^\d]/g, ''), 10),
            list: ((document.getElementById('drawer-pending-deactivations-list') || {}).innerText || '')
          }));
          a.ok(purged.calls.map(String).some((x) => x.toLowerCase() === 'reg_expired'), 'Expired window called stubbed permanentlyDeleteAccount: ' + JSON.stringify(purged.calls));
          a.ok(!/reg_expired/i.test(purged.list), 'Expired account is not left in the pending list: ' + purged.list.replace(/\s+/g, ' '));
        } finally {
          // Restore the personal session so later tests on this page still run.
          try {
            await page.evaluate(() => {
              if (typeof cancelAccountDeactivation === 'function') cancelAccountDeactivation('reg_personal');
              if (typeof cancelAccountDeactivation === 'function') cancelAccountDeactivation('reg_expired');
            });
          } catch (e) {}
          await h.loginAs(page, account);
          await h.installAppStubs(page);
        }
      }
    }
  ]
};
