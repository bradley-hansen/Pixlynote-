'use strict';

/**
 * End-to-end UI tests for Edit Profile all-or-nothing saves across ALL account
 * types (personal, business, empty, pixlynote, Plus, Business Plus, Government,
 * Organization) and @pixlynote Admin Tools (Metrics, Pending Deactivations,
 * Gov/Org Verifications, Business Verifications, Privileged Access).
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'E2E All Account Types and Admin Tools',
  tests: [
    {
      name: 'E2E Edit Profile all-or-nothing save preserves profile and badge state across every account type',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#edit-profile-form',
        'el:#edit-profile-name',
        'el:#edit-profile-bio',
        'el:#edit-profile-link',
        'el:#btn-save-edit-profile',
        'handler:validateEditProfileForm'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        // Test Edit Profile save on the base account AND with Plus / Gov / Org badge state intact
        const scenarios = [
          { label: 'base', patch: {} },
          {
            label: account.accountType === 'business' ? 'business-plus-org' : 'personal-plus-gov',
            patch: account.accountType === 'business'
              ? { isBusinessPlus: true, businessVerificationStatus: 'approved', verificationType: 'organization', verificationStatus: 'approved', verificationBadgeColor: 'teal', verificationCategoryName: 'Test Org' }
              : { isPlus: true, isVerified: true, verificationType: 'government', verificationStatus: 'approved', verificationBadgeColor: 'navy', verificationCategoryName: 'Test Agency' }
          }
        ];

        for (const sc of scenarios) {
          await page.evaluate((patch) => {
            Object.assign(state.currentUser, patch || {});
            if (typeof renderProfile === 'function') renderProfile();
          }, sc.patch);

          await h.openEditProfile(page);
          const bio = 'All-account bio (' + account.key + '/' + sc.label + ')';
          const link = 'example.test/' + account.key + '-' + sc.label;
          await page.fill('#edit-profile-bio', bio);
          await page.fill('#edit-profile-link', link);
          if (account.accountType === 'business') {
            await page.evaluate(() => {
              const bizTab = document.getElementById('btn-edit-account-business');
              if (bizTab) bizTab.click();
            });
            await page.waitForTimeout(80);
            if (await h.isVisible(page, '#edit-profile-dba-name')) {
              await page.fill('#edit-profile-dba-name', 'All-Acct DBA ' + account.key);
            }
          }

          await page.evaluate(() => {
            const form = document.getElementById('edit-profile-form');
            if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
            else document.getElementById('btn-save-edit-profile')?.click();
          });
          await page.waitForTimeout(250);

          const saved = await page.evaluate(() => ({
            bio: state.currentUser.bio,
            link: state.currentUser.link,
            isPlus: !!state.currentUser.isPlus,
            isBusinessPlus: !!state.currentUser.isBusinessPlus,
            verType: state.currentUser.verificationType || '',
            verStatus: state.currentUser.verificationStatus || '',
            dbaName: state.currentUser.dbaName || ''
          }));

          a.equal(saved.bio, bio, account.key + ' ' + sc.label + ': bio persisted');
          a.equal(saved.link, 'https://' + link, account.key + ' ' + sc.label + ': link normalized & persisted');
          if (sc.patch.verificationType) {
            a.equal(saved.verType, sc.patch.verificationType, account.key + ' ' + sc.label + ': official verificationType preserved on Edit Profile save');
            a.equal(saved.verStatus, 'approved', account.key + ' ' + sc.label + ': verificationStatus preserved');
          }
          if (sc.patch.isBusinessPlus) a.ok(saved.isBusinessPlus, account.key + ': Business Plus preserved');
          if (sc.patch.isPlus) a.ok(saved.isPlus, account.key + ': Plus preserved');
        }

        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    },

    {
      name: 'E2E Admin Tools: @pixlynote metrics, pending deactivations, verification panels, and Privileged Access invite/revoke',
      accounts: ['pixlynote'],
      covers: [
        'el:#drawer-pixlynote-metrics',
        'el:#drawer-pixlynote-pending',
        'el:#drawer-pixlynote-verifications',
        'el:#drawer-pixlynote-business-verifications',
        'el:#btn-ac-tab-privileged-access',
        'el:#ac-priv-username-input',
        'el:#ac-priv-user-list',
        'el:#ac-priv-selected-chip',
        'el:#ac-priv-invite-picker',
        'el:#btn-ac-grant-privileged',
        'handler:toggleDrawerUserMetricsList',
        'handler:grantPrivilegedAccessToUser',
        'handler:revokePrivilegedAccess',
        'handler:filterPrivilegedInviteUsers',
        'handler:selectPrivilegedInviteUser',
        'handler:clearPrivilegedInviteUser'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);

        await h.openOwnerMenu(page);
        const adminVis = await page.evaluate(() => ({
          metrics: !document.getElementById('drawer-pixlynote-metrics')?.classList.contains('hidden'),
          pending: !document.getElementById('drawer-pixlynote-pending')?.classList.contains('hidden'),
          ver: !document.getElementById('drawer-pixlynote-verifications')?.classList.contains('hidden'),
          bizVer: !document.getElementById('drawer-pixlynote-business-verifications')?.classList.contains('hidden')
        }));
        a.ok(adminVis.metrics && adminVis.pending && adminVis.ver && adminVis.bizVer, 'All 4 @pixlynote admin drawer panels are visible');

        // Expand user metrics list
        await page.evaluate(() => { if (typeof toggleDrawerUserMetricsList === 'function') toggleDrawerUserMetricsList(); });
        await page.waitForTimeout(120);
        const metricsListOpen = await page.evaluate(() => !document.getElementById('drawer-user-metrics-list')?.classList.contains('hidden'));
        a.ok(metricsListOpen, 'User metrics list expands for @pixlynote');

        // Privileged Access invite + revoke in Account Center
        await page.evaluate(() => {
          if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
          if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
        });
        await page.waitForTimeout(250);
        await page.click('#btn-ac-open-your-account');
        await page.waitForTimeout(100);
        await page.click('#btn-ac-tab-privileged-access');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#ac-view-privileged-access'), 'Privileged Access view opens');

        await page.evaluate(() => {
          const users = (window._exploreUserDir && window._exploreUserDir.users) || new Map();
          users.set('reg_personal', { username: 'reg_personal', fullName: 'Reg Personal', avatar: '', accountType: 'personal' });
          window._exploreUserDir = Object.assign({}, window._exploreUserDir || {}, { users: users, at: Date.now() });
        });
        await page.fill('#ac-priv-username-input', 'reg_personal');
        await page.waitForTimeout(120);
        const pickVisible = await page.evaluate(() => {
          const list = document.getElementById('ac-priv-user-list');
          const row = list && list.querySelector('.ac-priv-user-row[data-username="reg_personal"]');
          return !!(list && !list.classList.contains('hidden') && row && (row.innerText || '').includes('Reg Personal') && (row.innerText || '').includes('@reg_personal'));
        });
        a.ok(pickVisible, 'Invite picklist shows Reg Personal and @reg_personal');
        await page.click('#ac-priv-user-list .ac-priv-user-row[data-username="reg_personal"]');
        await page.waitForTimeout(80);
        const grantEnabled = await page.evaluate(() => {
          const btn = document.getElementById('btn-ac-grant-privileged');
          return !!(btn && !btn.disabled);
        });
        a.ok(grantEnabled, 'Invite is enabled only after picking a real user');
        await page.click('#btn-ac-grant-privileged');
        await page.waitForTimeout(150);
        const grantedText = await page.evaluate(() => (document.getElementById('ac-privileged-granted-list') || {}).innerText || '');
        a.ok(grantedText.includes('@reg_personal'), 'Privileged Access invite appears in Granted list');

        // Revoke invite
        await page.evaluate(() => {
          const btn = document.querySelector('#ac-privileged-granted-list .ac-priv-revoke-btn[data-username="reg_personal"]');
          if (btn) btn.click();
        });
        await page.waitForTimeout(150);
        const afterRevoke = await page.evaluate(() => (document.getElementById('ac-privileged-granted-list') || {}).innerText || '');
        a.ok(!afterRevoke.includes('@reg_personal'), 'Revoking removes @reg_personal from Granted list');

        await page.click('#btn-close-account-center');
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    }
  ]
};
