'use strict';

/**
 * Business public-name vs Display Name: no first-paint flash of fullName
 * while dbaName may still be loading; Explore/search/feed/new posts use
 * publicProfileDisplayName; Edit Profile changes persist after reload.
 */

const DISPLAY = 'Harbor Display Name';
const DBA = 'Harbor Coffee';
const USER = 'harbor_coffee_dba';
const EMAIL = 'harbor.dba@example.test';
const PHONE = '5555550188';

function bizRecord(extra) {
  return Object.assign({
    username: USER,
    fullName: DISPLAY,
    email: EMAIL,
    phone: PHONE,
    accountType: 'business',
    bio: 'Small-batch coffee in Galloway',
    link: 'https://example.test/harbor'
  }, extra || {});
}

async function writeAccountRecord(page, rec) {
  await page.evaluate((rec) => {
    const key = String(rec.username || '').toLowerCase();
    const accts = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
    accts[key] = rec;
    try { localStorage.setItem('pixly_accounts', JSON.stringify(accts)); } catch (e) {}
    try { localStorage.setItem('pixly_account_' + key, JSON.stringify(rec)); } catch (e) {}
    window._pixlyAccounts = window._pixlyAccounts || {};
    window._pixlyAccounts[key] = rec;
  }, rec);
}

async function markCloudPending(page) {
  await page.evaluate(() => {
    window.firebaseReady = true;
    window.firebase = Object.assign({}, window.firebase || {}, {
      db: {},
      doc: function () { return { path: 'users/pending' }; },
      getDoc: function () { return new Promise(function () { /* pending hydrate */ }); },
      onSnapshot: function () { return function () {}; }
    });
  });
}

async function loginBiz(page, rec) {
  await page.evaluate((rec) => {
    const authView = document.getElementById('auth-view');
    const mainView = document.getElementById('main-view');
    if (authView) { authView.classList.add('hidden'); authView.style.display = 'none'; }
    if (mainView) { mainView.classList.remove('hidden'); mainView.style.display = 'flex'; }
    try {
      localStorage.setItem('pixly_is_logged_in', '1');
      localStorage.setItem('pixly_active_username', rec.username);
    } catch (e) {}
    if (typeof performLogin === 'function') {
      performLogin(rec.username, rec.fullName, rec.email, null, rec.phone, rec.accountType);
    }
    if (typeof switchMainTab === 'function') switchMainTab('profile');
    if (typeof renderProfile === 'function') renderProfile();
  }, rec);
}

async function profileName(page) {
  return page.evaluate(() => {
    const el = document.getElementById('profile-full-name');
    return el ? String(el.textContent || '').trim() : '';
  });
}

module.exports = {
  name: 'Business display name',
  tests: [
    {
      name: 'biz-display: Unit: publicProfileDisplayName never returns Display Name while a business DBA is pending',
      accounts: ['personal'],
      covers: [
        'handler:publicProfileDisplayName',
        'handler:isBusinessDisplayNamePending',
        'handler:isDbaNameSettled',
        'handler:isBusinessProfileUser',
        'handler:currentPublicAuthorName',
        'handler:sessionAccountSnapshot'
      ],
      async run(ctx) {
        const { page, a } = ctx;
        const got = await page.evaluate(() => {
          const fns = {
            publicProfileDisplayName: typeof publicProfileDisplayName === 'function',
            isBusinessDisplayNamePending: typeof isBusinessDisplayNamePending === 'function',
            isDbaNameSettled: typeof isDbaNameSettled === 'function',
            isBusinessProfileUser: typeof isBusinessProfileUser === 'function',
            currentPublicAuthorName: typeof currentPublicAuthorName === 'function',
            sessionAccountSnapshot: typeof sessionAccountSnapshot === 'function'
          };
          const pending = { username: 'harbor_coffee_dba', fullName: 'Harbor Display Name', accountType: 'business' };
          const withDba = { username: 'harbor_coffee_dba', fullName: 'Harbor Display Name', dbaName: 'Harbor Coffee', accountType: 'business' };
          const settledEmpty = { username: 'harbor_coffee_dba', fullName: 'Harbor Display Name', dbaName: '', accountType: 'business', _loadedProfileFields: { dbaName: true } };
          const personal = { username: 'reg_personal', fullName: 'Reg Personal', accountType: 'personal' };
          const personalWithDbaLeak = { username: 'reg_personal', fullName: 'Reg Personal', dbaName: '', accountType: 'personal' };
          const snapPending = sessionAccountSnapshot(pending);
          const snapReady = sessionAccountSnapshot(withDba);
          return {
            fns,
            pendingName: publicProfileDisplayName(pending),
            pendingFlag: isBusinessDisplayNamePending(pending),
            pendingSettled: isDbaNameSettled(pending),
            isBiz: isBusinessProfileUser(pending),
            dbaName: publicProfileDisplayName(withDba),
            settledEmptyName: publicProfileDisplayName(settledEmpty),
            personalName: publicProfileDisplayName(personal),
            personalNoDba: publicProfileDisplayName(personalWithDbaLeak),
            snapPendingHasDba: Object.prototype.hasOwnProperty.call(snapPending, 'dbaName'),
            snapReadyDba: snapReady.dbaName
          };
        });
        a.ok(got.fns.publicProfileDisplayName, 'publicProfileDisplayName is exported');
        a.ok(got.fns.isBusinessDisplayNamePending, 'isBusinessDisplayNamePending is exported');
        a.ok(got.fns.sessionAccountSnapshot, 'sessionAccountSnapshot is exported');
        a.ok(got.isBiz, 'A business accountType is treated as a business profile');
        a.equal(got.pendingName, '', 'Pending business public name is blank, not Display Name');
        a.ok(got.pendingFlag, 'A business without dbaName is pending');
        a.ok(!got.pendingSettled, 'A slim record without dbaName is not settled');
        a.equal(got.dbaName, DBA, 'A business with a DBA publishes the DBA, not Display Name');
        a.equal(got.settledEmptyName, DISPLAY, 'A settled business with no DBA may fall back to Display Name');
        a.equal(got.personalName, 'Reg Personal', 'A personal account publishes fullName');
        a.equal(got.personalNoDba, 'Reg Personal', 'A personal account with an empty dbaName still publishes fullName');
        a.ok(!got.snapPendingHasDba, 'sessionAccountSnapshot omits dbaName until it is known');
        a.equal(got.snapReadyDba, DBA, 'sessionAccountSnapshot stores dbaName when it is known');
      }
    },

    {
      name: 'biz-display: E2E: slim session without dbaName never paints Display Name on first profile render, then shows DBA after hydrate',
      accounts: ['personal'],
      covers: [
        'el:#profile-full-name',
        'handler:performLogin',
        'handler:renderProfile',
        'handler:publicProfileDisplayName',
        'handler:settleLocalBusinessDisplayName',
        'handler:settleBusinessDisplayNameAfterRemote',
        'handler:applyActiveUserDocData'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        const slim = bizRecord(); // no dbaName
        const full = bizRecord({ dbaName: DBA });
        await writeAccountRecord(page, slim);
        await markCloudPending(page);
        await page.evaluate(() => {
          window.__nameLineSeen = [];
          const el = document.getElementById('profile-full-name');
          const record = function () {
            if (!el) return;
            window.__nameLineSeen.push(String(el.textContent || ''));
          };
          if (typeof renderProfile === 'function') {
            const orig = renderProfile;
            renderProfile = function () {
              const ret = orig.apply(this, arguments);
              record();
              return ret;
            };
            try { window.renderProfile = renderProfile; } catch (e) {}
          }
          if (el) {
            const obs = new MutationObserver(record);
            obs.observe(el, { childList: true, characterData: true, subtree: true });
            window.__nameLineObs = obs;
          }
        });
        await loginBiz(page, slim);
        const first = await page.evaluate((display) => {
          const seen = (window.__nameLineSeen || []).map((t) => String(t || '').trim());
          return {
            seen,
            flashed: seen.some((t) => t === display),
            current: (document.getElementById('profile-full-name') && document.getElementById('profile-full-name').textContent || '').trim(),
            pending: typeof isBusinessDisplayNamePending === 'function' && isBusinessDisplayNamePending(state.currentUser),
            dba: state.currentUser && state.currentUser.dbaName
          };
        }, DISPLAY);
        a.ok(!first.flashed, 'First paints never showed Display Name ' + DISPLAY + '; seen=' + JSON.stringify(first.seen));
        a.ok(first.current !== DISPLAY, 'The name line is not Display Name after slim-session login: "' + first.current + '"');
        a.ok(first.pending || first.current === '' || first.current === USER, 'Slim-session first paint stays pending or blank, not the Display Name');

        await page.evaluate((full) => {
          const u = (typeof normalizeUsername === 'function') ? normalizeUsername(full.username) : full.username;
          if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(u, full, false);
          else {
            if (typeof mergeStoredProfileFields === 'function') mergeStoredProfileFields(state.currentUser, full);
            if (typeof settleBusinessDisplayNameAfterRemote === 'function') settleBusinessDisplayNameAfterRemote(state.currentUser, full);
          }
          if (typeof renderProfile === 'function') renderProfile();
        }, full);
        await page.waitForTimeout(80);
        const after = await page.evaluate((display) => {
          const seen = (window.__nameLineSeen || []).map((t) => String(t || '').trim());
          return {
            seen,
            flashed: seen.some((t) => t === display),
            current: (document.getElementById('profile-full-name') && document.getElementById('profile-full-name').textContent || '').trim(),
            dba: state.currentUser && state.currentUser.dbaName,
            publicName: typeof publicProfileDisplayName === 'function' ? publicProfileDisplayName(state.currentUser) : ''
          };
        }, DISPLAY);
        a.ok(!after.flashed, 'Hydrate still never painted Display Name; seen=' + JSON.stringify(after.seen));
        a.equal(after.current, DBA, 'After hydrate the own-profile name line shows the DBA');
        a.equal(after.publicName, DBA, 'publicProfileDisplayName returns the DBA after hydrate');
        a.equal(after.dba, DBA, 'currentUser.dbaName is the DBA after hydrate');
      }
    },

    {
      name: 'biz-display: E2E: own profile, viewed profile, Explore/search, and a new post show DBA when Display Name differs',
      accounts: ['personal'],
      covers: [
        'el:#profile-full-name',
        'el:#user-profile-fullname',
        'el:#explore-search-input',
        'el:#explore-creators-container',
        'el:#btn-submit-post',
        'handler:publicProfileDisplayName',
        'handler:currentPublicAuthorName',
        'handler:renderExplore',
        'handler:viewUserProfile',
        'handler:handleCreatePostAction'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        const full = bizRecord({ dbaName: DBA });
        await writeAccountRecord(page, full);
        await loginBiz(page, full);
        await h.hideToasts(page);
        const own = await profileName(page);
        a.equal(own, DBA, 'Own profile name line shows the DBA, not Display Name');
        a.ok(own !== DISPLAY, 'Own profile name line is not the Display Name');

        const author = await page.evaluate(() => (typeof currentPublicAuthorName === 'function') ? currentPublicAuthorName() : '');
        a.equal(author, DBA, 'currentPublicAuthorName returns the DBA for a new post');

        await page.evaluate((img) => {
          state.selectedCreateImage = img;
          if (typeof openCreatePostModal === 'function') openCreatePostModal('post');
        }, h.tinyPng());
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const inp = document.getElementById('create-caption-input');
          if (inp) {
            inp.value = 'Harbor latte art';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        await page.evaluate(() => {
          if (typeof handleCreatePostAction === 'function') handleCreatePostAction();
          else document.getElementById('btn-submit-post')?.click();
        });
        await page.waitForTimeout(300);
        const post = await page.evaluate((user) => {
          const posts = (state.posts || []).filter((p) => String(p.author || '').toLowerCase() === user);
          const last = posts[posts.length - 1] || null;
          return last ? { authorName: last.authorName, caption: last.caption, author: last.author } : null;
        }, USER);
        a.ok(post, 'A new post was created');
        a.equal(post.authorName, DBA, 'The new post is stamped with the DBA, not Display Name');

        // Viewed profile + Explore from a personal account
        await h.loginAs(page, h.ACCOUNTS.personal);
        await writeAccountRecord(page, full);
        await page.evaluate((full) => {
          const key = full.username.toLowerCase();
          window._pixlyAccounts = window._pixlyAccounts || {};
          window._pixlyAccounts[key] = full;
          if (typeof CREATOR_DETAILS !== 'undefined') {
            CREATOR_DETAILS[key] = Object.assign({}, CREATOR_DETAILS[key] || {}, full);
          }
          const dir = (window._exploreUserDir && window._exploreUserDir.users) || new Map();
          dir.set(key, Object.assign({
            username: key,
            bio: full.bio,
            avatar: '',
            category: 'Coffee',
            followersCount: 12,
            followingCount: 3
          }, full));
          window._exploreUserDir = { users: dir, notes: (window._exploreUserDir && window._exploreUserDir.notes) || new Map() };
        }, full);

        await page.evaluate((u) => {
          if (typeof viewUserProfile === 'function') viewUserProfile(u);
        }, USER);
        await page.waitForTimeout(150);
        const viewed = await page.evaluate(() => {
          const el = document.getElementById('user-profile-fullname');
          return el ? String(el.textContent || '').trim() : '';
        });
        a.equal(viewed, DBA, 'Viewed profile shows the DBA, not Display Name');
        a.ok(viewed !== DISPLAY, 'Viewed profile is not the Display Name');

        await page.evaluate(() => {
          if (typeof closeUserProfile === 'function') closeUserProfile();
          const modal = document.getElementById('modal-user-profile');
          if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
        });
        await h.gotoMainTab(page, 'explore');
        await page.evaluate(() => {
          if (typeof renderExplore === 'function') renderExplore('');
        });
        await page.waitForTimeout(80);
        const discover = await page.evaluate(({ user, dba, display }) => {
          const box = document.getElementById('explore-creators-container');
          const html = box ? box.innerHTML : '';
          const text = box ? (box.innerText || box.textContent || '') : '';
          const card = box && box.querySelector('[data-username="' + user + '"]');
          return {
            hasDba: text.indexOf(dba) !== -1 || html.indexOf(dba) !== -1,
            hasDisplay: !!(card && (card.innerText || '').indexOf(display) !== -1),
            cardText: card ? String(card.innerText || '').replace(/\s+/g, ' ').trim() : '',
            visible: !!(box && !box.classList.contains('hidden'))
          };
        }, { user: USER, dba: DBA, display: DISPLAY });
        a.ok(discover.hasDba, 'Explore shows the DBA on the directory card: ' + discover.cardText);
        a.ok(!discover.hasDisplay, 'Explore card does not show Display Name: ' + discover.cardText);

        await page.fill('#explore-search-input', DBA);
        await page.evaluate(() => {
          const inp = document.getElementById('explore-search-input');
          if (inp) inp.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof renderExplore === 'function') renderExplore((document.getElementById('explore-search-input') || {}).value || '');
        });
        await page.waitForTimeout(80);
        const search = await page.evaluate(({ user, dba, display }) => {
          const box = document.getElementById('explore-creators-container');
          const card = box && box.querySelector('[data-username="' + user + '"]');
          const text = card ? String(card.innerText || '').replace(/\s+/g, ' ').trim() : '';
          return {
            found: !!card,
            text,
            hasDba: text.indexOf(dba) !== -1,
            hasDisplay: text.indexOf(display) !== -1
          };
        }, { user: USER, dba: DBA, display: DISPLAY });
        a.ok(search.found, 'Search for the DBA finds the business account');
        a.ok(search.hasDba, 'Search results show the DBA: ' + search.text);
        a.ok(!search.hasDisplay, 'Search results do not show Display Name: ' + search.text);

        await page.fill('#explore-search-input', USER);
        await page.evaluate(() => {
          if (typeof renderExplore === 'function') renderExplore((document.getElementById('explore-search-input') || {}).value || '');
        });
        const searchUser = await page.evaluate(({ user, dba, display }) => {
          const box = document.getElementById('explore-creators-container');
          const card = box && box.querySelector('[data-username="' + user + '"]');
          const text = card ? String(card.innerText || '').replace(/\s+/g, ' ').trim() : '';
          return { found: !!card, text, hasDba: text.indexOf(dba) !== -1, hasDisplay: text.indexOf(display) !== -1 };
        }, { user: USER, dba: DBA, display: DISPLAY });
        a.ok(searchUser.found, 'Search by username still finds the business account');
        a.ok(searchUser.hasDba, 'Username search shows the DBA');
        a.ok(!searchUser.hasDisplay, 'Username search does not show Display Name');
      }
    },

    {
      name: 'biz-display: E2E: Edit Profile changes to Display Name and DBA persist after reload',
      accounts: ['business'],
      covers: [
        'el:#edit-profile-name',
        'el:#edit-profile-dba-name',
        'el:#btn-save-edit-profile',
        'el:#profile-full-name',
        'handler:openEditProfileModal'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = new URL(page.url()).port;
        const newDisplay = 'Edited Harbor Display';
        const newDba = 'Edited Harbor DBA';
        // Start from a fresh load so earlier business-account tests cannot leave
        // Edit Profile on a hidden tab or under a stuck overlay.
        await h.loadApp(page, { port: Number(port) });
        await h.loginAs(page, account);
        await h.closeOverlays(page);
        await h.openEditProfile(page);
        await page.evaluate(() => {
          const modal = document.getElementById('modal-edit-profile');
          if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
          window._editingAccountType = 'business';
          const bizTab = document.getElementById('btn-edit-account-business');
          if (bizTab) bizTab.click();
          const name = document.getElementById('edit-profile-name');
          const dba = document.getElementById('edit-profile-dba-name');
          const biz = document.getElementById('edit-profile-business-fields');
          if (biz) { biz.classList.remove('hidden'); biz.style.display = ''; }
          if (name) { name.classList.remove('hidden'); name.style.display = ''; name.disabled = false; }
          if (dba) { dba.classList.remove('hidden'); dba.style.display = ''; dba.disabled = false; }
        });
        a.ok(await h.isVisible(page, '#modal-edit-profile'), 'Edit Profile opens');
        await page.waitForSelector('#edit-profile-name', { state: 'visible', timeout: 10000 });
        await page.waitForSelector('#edit-profile-dba-name', { state: 'visible', timeout: 10000 });
        await page.fill('#edit-profile-name', newDisplay);
        await page.fill('#edit-profile-dba-name', newDba);
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const saved = await page.evaluate(() => {
          const u = state.currentUser || {};
          const key = String(u.username || '').toLowerCase();
          let rec = null;
          try { rec = JSON.parse(localStorage.getItem('pixly_account_' + key) || 'null'); } catch (e) {}
          return {
            fullName: u.fullName,
            dbaName: u.dbaName,
            recFull: rec && rec.fullName,
            recDba: rec && rec.dbaName,
            store: {
              account: localStorage.getItem('pixly_account_' + key),
              accounts: localStorage.getItem('pixly_accounts'),
              user: localStorage.getItem('pixlynote_user') || localStorage.getItem('pixlynote_user_' + key)
            }
          };
        });
        a.equal(saved.fullName, newDisplay, 'Display Name was saved in memory');
        a.equal(saved.dbaName, newDba, 'DBA was saved in memory');
        a.equal(saved.recDba, newDba, 'DBA was saved to the local account record');
        a.equal(saved.recFull, newDisplay, 'Display Name was saved to the local account record');
        const nameAfterSave = await profileName(page);
        a.equal(nameAfterSave, newDba, 'The profile name line shows the new DBA after save');

        const bag = await page.evaluate(() => {
          const out = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (/pixly_account|pixly_accounts|pixlynote_user|pixly_is_logged_in|pixly_active_username|pixly_user_password/.test(k)) {
              out[k] = localStorage.getItem(k);
            }
          }
          return out;
        });

        await page.goto('http://127.0.0.1:' + port + '/index.html?cb=' + Date.now(), {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        await page.evaluate((bag) => {
          Object.keys(bag || {}).forEach((k) => {
            try { localStorage.setItem(k, bag[k]); } catch (e) {}
          });
        }, bag);
        await page.evaluate((account) => {
          const authView = document.getElementById('auth-view');
          const mainView = document.getElementById('main-view');
          if (authView) { authView.classList.add('hidden'); authView.style.display = 'none'; }
          if (mainView) { mainView.classList.remove('hidden'); mainView.style.display = 'flex'; }
          if (typeof performLogin === 'function') {
            performLogin(account.username, account.fullName, account.email, null, account.phone, account.accountType);
          }
          if (typeof switchMainTab === 'function') switchMainTab('profile');
          if (typeof renderProfile === 'function') renderProfile();
        }, account);
        await h.hideToasts(page);
        const afterReload = await page.evaluate(() => ({
          name: (document.getElementById('profile-full-name') && document.getElementById('profile-full-name').textContent || '').trim(),
          fullName: state.currentUser && state.currentUser.fullName,
          dbaName: state.currentUser && state.currentUser.dbaName
        }));
        a.equal(afterReload.dbaName, newDba, 'DBA is still on currentUser after reload');
        a.equal(afterReload.fullName, newDisplay, 'Display Name is still on currentUser after reload');
        a.equal(afterReload.name, newDba, 'The profile name line still shows the DBA after reload');

        await h.openEditProfile(page);
        const form = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          dba: ((document.getElementById('edit-profile-dba-name') || {}).value || '')
        }));
        a.equal(form.name, newDisplay, 'Edit Profile still shows the saved Display Name after reload');
        a.equal(form.dba, newDba, 'Edit Profile still shows the saved DBA after reload');
      }
    },

    {
      name: 'biz-display: E2E: a personal account still shows fullName on the profile name line',
      accounts: ['personal'],
      covers: ['el:#profile-full-name', 'handler:publicProfileDisplayName', 'handler:renderProfile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.gotoMainTab(page, 'profile');
        if (typeof page.evaluate === 'function') {
          await page.evaluate(() => { if (typeof renderProfile === 'function') renderProfile(); });
        }
        const name = await profileName(page);
        a.equal(name, account.fullName, 'Personal profile name line shows fullName');
        const pub = await page.evaluate(() => (typeof publicProfileDisplayName === 'function') ? publicProfileDisplayName(state.currentUser) : '');
        a.equal(pub, account.fullName, 'publicProfileDisplayName for a personal account is fullName');
        a.ok(name !== DBA && name !== DISPLAY, 'Personal name line is not a business DBA or a business Display Name');
      }
    }
  ]
};
