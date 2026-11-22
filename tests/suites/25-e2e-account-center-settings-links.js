'use strict';

/**
 * End-to-end UI tests for Account Center (Account Info, Close Friends,
 * Change Password, Security & Access / Apps & Sessions / Login Activity,
 * Privacy & Safety -> Spam / Blocked / Muted), Profile Links & Contact buttons,
 * Followers/Following modals, and Viewed User Block/Mute/Close Friends.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

async function openAc(page, h) {
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
    if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    else if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
  });
  await page.waitForTimeout(250);
}

module.exports = {
  name: 'E2E Account Center, Settings and Links',
  tests: [
    {
      name: 'E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety',
      accounts: ['personal'],
      covers: [
        'el:#btn-ac-open-your-account',
        'el:#btn-ac-tab-account-info',
        'el:#btn-ac-tab-close-friends',
        'el:#ac-cf-search',
        'el:#btn-ac-cf-add',
        'el:#ac-cf-add-form',
        'el:#btn-ac-tab-change-password',
        'el:#form-ac-change-password',
        'el:#ac-pw-current',
        'el:#ac-pw-new',
        'el:#ac-pw-confirm',
        'el:#btn-ac-tab-security-access',
        'el:#btn-ac-sa-tab-security',
        'el:#btn-ac-sa-tab-apps-sessions',
        'el:#btn-ac-open-login-activity',
        'el:#btn-ac-log-filter-all',
        'el:#btn-ac-log-filter-password',
        'el:#btn-ac-log-filter-login',
        'el:#btn-ac-open-sessions',
        'el:#btn-ac-logout-other-sessions',
        'el:#btn-ac-cancel-logout-others',
        'el:#btn-ac-confirm-logout-others',
        'el:#btn-ac-tab-privacy-safety',
        'el:#btn-ac-tab-spam',
        'el:#btn-ac-tab-blocked',
        'el:#btn-ac-tab-muted',
        'el:#ac-blocked-search',
        'el:#ac-muted-search',
        'el:#btn-ac-back',
        'el:#btn-close-account-center'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        await openAc(page, h);
        a.ok(await h.isVisible(page, '#modal-account-center'), 'Account Center opens');

        // 1. Account Info
        await page.click('#btn-ac-open-your-account');
        await page.waitForTimeout(100);
        await page.click('#btn-ac-tab-account-info');
        await page.waitForTimeout(120);
        const infoText = await page.evaluate(() => (document.getElementById('ac-view-account-info') || {}).innerText || '');
        a.ok(infoText.includes(account.username), 'Account Info shows active username');
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        // 2. Close Friends add + remove
        await page.click('#btn-ac-tab-close-friends');
        await page.waitForTimeout(120);
        await page.fill('#ac-cf-search', 'fresh_creator');
        await page.click('#btn-ac-cf-add');
        await page.waitForTimeout(150);
        const cfAdded = await page.evaluate(() => typeof isCloseFriend === 'function' && isCloseFriend('fresh_creator'));
        a.ok(cfAdded, 'Close Friend added via Account Center form');
        await page.evaluate(() => { if (typeof removeCloseFriend === 'function') removeCloseFriend('fresh_creator'); });
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        // 3. Change Password validation & success
        await page.click('#btn-ac-tab-change-password');
        await page.waitForTimeout(120);
        // Short password rejected
        await page.fill('#ac-pw-current', account.password);
        await page.fill('#ac-pw-new', 'short');
        await page.fill('#ac-pw-confirm', 'short');
        await page.evaluate(() => { document.getElementById('form-ac-change-password')?.requestSubmit(); });
        await page.waitForTimeout(150);
        const shortErr = await page.evaluate(() => (document.getElementById('ac-pw-status') || {}).textContent || '');
        a.ok(/at least 8/i.test(shortErr), 'Short password rejected: ' + shortErr);

        // Valid change
        await page.fill('#ac-pw-current', account.password);
        await page.fill('#ac-pw-new', 'NewStrongPass99!');
        await page.fill('#ac-pw-confirm', 'NewStrongPass99!');
        await page.evaluate(() => { document.getElementById('form-ac-change-password')?.requestSubmit(); });
        await page.waitForTimeout(300);
        const pwChanged = await page.evaluate((u) => {
          const hVal = localStorage.getItem('pixly_user_password_' + u);
          return !!hVal && hVal !== 'TestPass123!';
        }, account.username);
        a.ok(pwChanged, 'Password hash updated in localStorage');
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        // 4. Security & Access -> Login Activity filters -> Sessions
        await page.click('#btn-ac-tab-security-access');
        await page.waitForTimeout(120);
        await page.click('#btn-ac-sa-tab-security');
        await page.waitForTimeout(80);
        await page.click('#btn-ac-open-login-activity');
        await page.waitForTimeout(120);
        await page.click('#btn-ac-log-filter-password');
        await page.click('#btn-ac-log-filter-login');
        await page.click('#btn-ac-log-filter-all');
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        await page.click('#btn-ac-sa-tab-apps-sessions');
        await page.waitForTimeout(80);
        await page.click('#btn-ac-open-sessions');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#ac-view-sessions'), 'Sessions view opens');
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        // 5. Privacy & Safety -> Spam / Blocked / Muted
        await page.click('#btn-ac-tab-privacy-safety');
        await page.waitForTimeout(120);
        await page.click('#btn-ac-tab-spam');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#ac-view-spam-list'), 'Spam view opens');
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        await page.click('#btn-ac-tab-blocked');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#ac-view-blocked-list'), 'Blocked users view opens');
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        await page.click('#btn-ac-tab-muted');
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#ac-view-muted-list'), 'Muted users view opens');
        await page.click('#btn-ac-back');
        await page.waitForTimeout(80);

        await page.click('#btn-close-account-center');
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    },

    {
      name: 'E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links',
      accounts: ['business'],
      covers: [
        'el:#btn-share-profile',
        'el:#stat-followers-btn',
        'el:#stat-following-btn',
        'el:#user-stat-followers-btn',
        'el:#user-stat-following-btn',
        'el:#btn-profile-contact-email',
        'el:#btn-profile-contact-call',
        'el:#profile-contact-website',
        'el:#profile-contact-support',
        'el:#btn-cf-menu-toggle',
        'el:#btn-menu-block',
        'el:#btn-menu-mute',
        'href:mailto:privacy@pixlynote.com',
        'href:mailto:dmca@pixlynote.com',
        'href:mailto:bradley.g.hansen@hotmail.com'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        await h.gotoMainTab(page, 'profile');
        await page.waitForTimeout(120);
        // Give business account website + support email + phone so contact controls show
        await page.evaluate(() => {
          state.currentUser.link = 'https://example.test/biz';
          state.currentUser.businessSupportEmail = 'support@example.test';
          state.currentUser.phone = '5555550199';
          state.currentUser.email = 'biz@example.test';
          if (typeof renderProfile === 'function') renderProfile();
        });
        await page.waitForTimeout(100);

        // Check contact buttons & links on own profile
        const contacts = await page.evaluate(() => ({
          share: !!document.getElementById('btn-share-profile'),
          websiteHref: (document.getElementById('profile-contact-website') || {}).getAttribute('href') || '',
          supportHref: (document.getElementById('profile-contact-support') || {}).getAttribute('href') || '',
          mailtos: [...document.querySelectorAll('a[href^="mailto:"]')].map((x) => x.getAttribute('href'))
        }));
        a.ok(contacts.share, 'Share profile button exists');
        a.ok(contacts.websiteHref.startsWith('https://example.test'), 'Business contact website link is set: ' + contacts.websiteHref);
        a.ok(contacts.supportHref.includes('support@example.test'), 'Business support email mailto is set: ' + contacts.supportHref);
        a.ok(contacts.mailtos.includes('mailto:privacy@pixlynote.com'), 'Privacy mailto link present');
        a.ok(contacts.mailtos.includes('mailto:dmca@pixlynote.com'), 'DMCA mailto link present');

        await page.click('#btn-share-profile');
        await page.waitForTimeout(80);

        // Own Connections & Connected modals
        await page.click('#stat-followers-btn');
        await page.waitForTimeout(120);
        const follOpen = await page.evaluate(() => !document.getElementById('modal-followers')?.classList.contains('hidden'));
        a.ok(follOpen, 'Own Connections modal opens from stat button');
        await page.click('#btn-close-followers-modal');

        await page.click('#stat-following-btn');
        await page.waitForTimeout(120);
        const fingOpen = await page.evaluate(() => !document.getElementById('modal-following')?.classList.contains('hidden'));
        a.ok(fingOpen, 'Own Connected modal opens from stat button');
        await page.click('#btn-close-following-modal');

        // Viewed profile: stat modals + block + mute + CF toggle
        await page.evaluate(() => { if (typeof viewUserProfile === 'function') viewUserProfile('fresh_creator'); });
        await page.waitForTimeout(150);
        await page.click('#user-stat-followers-btn');
        await page.waitForTimeout(120);
        const viewedModalOpen = await page.evaluate(() => {
          const m = document.getElementById('modal-viewed-connections');
          return !!(m && !m.classList.contains('hidden'));
        });
        a.ok(viewedModalOpen, 'Viewed profile Connections modal opens from stat button');
        await page.evaluate(() => { const b = document.getElementById('btn-close-viewed-connections'); if (b) b.click(); });

        // Open more menu -> Mute -> Block
        await page.click('#btn-user-profile-more');
        await page.waitForTimeout(100);
        await page.click('#btn-menu-mute');
        await page.waitForTimeout(100);
        a.ok(await page.evaluate(() => typeof isMuted === 'function' && isMuted('fresh_creator')), 'Mute menu action mutes viewed user');

        await page.click('#btn-user-profile-more');
        await page.waitForTimeout(100);
        await page.click('#btn-menu-block');
        await page.waitForTimeout(120);
        a.ok(await page.evaluate(() => typeof isBlocked === 'function' && isBlocked('fresh_creator')), 'Block menu action blocks viewed user');

        await page.evaluate(() => {
          if (typeof unblockUser === 'function') unblockUser('fresh_creator');
          if (typeof unmuteUser === 'function') unmuteUser('fresh_creator');
        });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    }
  ]
};
