'use strict';

/**
 * Combined release-1124 interaction gaps:
 * Beta header with Privacy and safety / Download your data,
 * private-account gating on Saved and Likes (with the saved-flash directory cache),
 * and data export of an isPrivate profile plus Profile status history.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function openYourAccount(page, h) {
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
    if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    else if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof setAccountCenterView === 'function') setAccountCenterView('yourAccount'); });
  try { await page.click('#btn-ac-open-your-account', { timeout: 1000 }); } catch (e) {}
  await page.waitForTimeout(80);
}

async function openPrivacySafety(page, h) {
  await openYourAccount(page, h);
  await page.evaluate(() => { if (typeof setAccountCenterView === 'function') setAccountCenterView('privacySafety'); });
  await page.waitForTimeout(80);
}

module.exports = {
  name: 'Release 1124 interactions',
  tests: [
    {
      name: 'Beta header stays under the wordmark while Your Account shows Privacy and safety plus Download your data',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#nav-beta-pill',
        'el:#btn-ac-tab-privacy-safety',
        'el:#ac-private-account-row',
        'el:#btn-ac-private-account-toggle',
        'el:#btn-ac-download-data'
      ],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        const header = await page.evaluate(() => {
          const pill = document.getElementById('nav-beta-pill');
          const brand = document.getElementById('nav-brand-btn');
          const wordmark = brand && brand.querySelector('.brand-font');
          const pr = pill ? pill.getBoundingClientRect() : null;
          const wr = wordmark ? wordmark.getBoundingClientRect() : null;
          const text = (pill && (pill.textContent || '').replace(/\s+/g, ' ').trim()) || '';
          const underWordmark = !!(pr && wr &&
            pr.top >= wr.bottom - 4 &&
            pr.bottom > wr.bottom &&
            pr.left < wr.right &&
            pr.right > wr.left);
          return {
            pillPresent: !!pill,
            pillText: text,
            pillVisible: !!(pill && pr && pr.width > 0 && pr.height > 0),
            underWordmark
          };
        });
        a.ok(header.pillPresent, '#nav-beta-pill is in the header');
        a.ok(/beta/i.test(header.pillText), 'Beta label text is present: ' + header.pillText);
        a.ok(header.pillVisible, 'Beta label is visible at 390x844');
        a.ok(header.underWordmark, 'Beta label sits with / under the wordmark lockup');

        await openYourAccount(page, h);
        const list = await page.evaluate(() => {
          const tab = document.getElementById('btn-ac-tab-privacy-safety');
          const download = document.getElementById('btn-ac-download-data');
          const label = document.getElementById('ac-data-export-label');
          const modal = document.getElementById('modal-account-center') || document.getElementById('account-center-modal');
          const visible = (el) => !!(el && !el.closest('.hidden') && !el.classList.contains('hidden'));
          return {
            privacyTab: !!(tab && /privacy and safety/i.test((tab.textContent || '').replace(/\s+/g, ' '))),
            privacyTabVisible: visible(tab),
            downloadPresent: !!download,
            downloadVisible: visible(download),
            downloadText: ((label && label.textContent) || (download && download.textContent) || '').replace(/\s+/g, ' ').trim(),
            betaStillVisible: (function () {
              const pill = document.getElementById('nav-beta-pill');
              const r = pill && pill.getBoundingClientRect();
              return !!(pill && r && r.width > 0 && r.height > 0);
            })()
          };
        });
        a.ok(list.privacyTab, 'Your Account lists Privacy and safety');
        a.ok(list.privacyTabVisible, 'Privacy and safety row is visible on the Account Center list');
        a.ok(list.downloadPresent, 'Download your data control is in the DOM');
        a.ok(list.downloadVisible, 'Download your data is visible on the Your Account list');
        a.ok(/download your data/i.test(list.downloadText), 'Download your data label: ' + list.downloadText);

        await page.evaluate(() => { if (typeof setAccountCenterView === 'function') setAccountCenterView('privacySafety'); });
        await page.waitForTimeout(80);
        const privacy = await page.evaluate(() => {
          const view = document.getElementById('ac-view-privacy-safety');
          const row = document.getElementById('ac-private-account-row');
          const toggle = document.getElementById('btn-ac-private-account-toggle');
          const first = view && view.firstElementChild;
          const pill = document.getElementById('nav-beta-pill');
          const pr = pill && pill.getBoundingClientRect();
          return {
            viewOpen: !!(view && !view.classList.contains('hidden')),
            firstIsToggleRow: !!(first && (first.id === 'ac-private-account-row' || (row && first.contains(row)) || (toggle && first.contains(toggle)))),
            togglePresent: !!toggle,
            betaStillVisible: !!(pill && pr && pr.width > 0 && pr.height > 0)
          };
        });
        a.ok(privacy.viewOpen, 'Privacy and safety sub-view is open');
        a.ok(privacy.togglePresent, 'Private account toggle is present');
        a.ok(privacy.firstIsToggleRow, 'Private account toggle sits at the top of Privacy and safety');
        a.ok(privacy.betaStillVisible, 'Beta label remains visible with the Privacy panel open');
      }
    },
    {
      name: 'Private accounts stay hidden in Saved/Likes while directory-cached seed posts still stay visible',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['fn:canSeeAudienceContent', 'fn:isPrivacyLockedFor', 'fn:isKnownRealAccount', 'fn:renderSaved', 'fn:renderLikes'],
      async run({ page, a }) {
        const r = await page.evaluate((tinyPng) => {
          const me = (state.currentUser && state.currentUser.username) || '';
          const listOf = (v) => Array.isArray(v) ? v.slice() : [];
          const snap = {
            posts: listOf(state.posts),
            explore: listOf(state.explorePosts),
            archive: listOf(state.explorePostsArchive),
            hadArchive: Array.isArray(state.explorePostsArchive),
            saved: Array.from(state.savedPostIds || []),
            liked: Array.from(state.likedPostIds || []),
            privacy: Object.assign({}, window._acctPrivacy || {}),
            cache: Object.assign({}, window._remoteUserProfilesCache || {})
          };

          window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
          window._remoteUserProfilesCache.nordic_trails = { username: 'nordic_trails', fullName: 'Nordic Trails', isPrivate: false };

          const privPost = {
            id: 'rel1124-priv-post',
            author: 'rel1124_private',
            authorName: 'Private Creator',
            image: tinyPng,
            caption: 'private creator photo',
            likes: 0,
            comments: [],
            authorPrivate: true,
            isSeed: false
          };
          const ownPost = {
            id: 'rel1124-own-priv',
            author: me,
            authorName: (state.currentUser && state.currentUser.fullName) || me,
            image: tinyPng,
            caption: 'my private photo',
            likes: 0,
            comments: [],
            authorPrivate: true,
            isSeed: false
          };
          state.posts = (state.posts || []).filter((p) => p && p.id !== privPost.id && p.id !== ownPost.id);
          state.posts.unshift(privPost, ownPost);
          if (Array.isArray(state.explorePostsArchive)) {
            if (!state.explorePostsArchive.some((p) => String(p.id) === 'rel1124-priv-post')) state.explorePostsArchive.unshift(privPost);
            if (!state.explorePostsArchive.some((p) => String(p.id) === 'rel1124-own-priv')) state.explorePostsArchive.unshift(ownPost);
          }

          window._acctPrivacy = window._acctPrivacy || {};
          window._acctPrivacy.rel1124_private = true;
          window._acctPrivacy[me] = true;
          state.currentUser.isPrivate = true;

          const addId = (bag, id) => {
            if (!bag) return;
            if (typeof bag.add === 'function') bag.add(id);
            else if (Array.isArray(bag) && bag.indexOf(id) === -1) bag.push(id);
          };
          addId(state.savedPostIds, '1');
          addId(state.savedPostIds, 'rel1124-priv-post');
          addId(state.savedPostIds, 'rel1124-own-priv');
          addId(state.likedPostIds, '1');
          addId(state.likedPostIds, 'rel1124-priv-post');
          addId(state.likedPostIds, 'rel1124-own-priv');

          if (typeof renderSaved === 'function') renderSaved();
          if (typeof renderLikes === 'function') renderLikes();

          const has = (sel, id) => !!document.querySelector(sel + ' [data-post-id="' + id + '"]');
          const seed = (typeof getPostById === 'function' ? getPostById(1) : null) || (state.posts || []).find((p) => String(p.id) === '1');

          const out = {
            knownNordic: typeof isKnownRealAccount === 'function' ? isKnownRealAccount('nordic_trails') : null,
            seedHiddenAsReal: typeof isSeededDemoForRealAccount === 'function' ? isSeededDemoForRealAccount(seed) : null,
            canSeePriv: typeof canSeeAudienceContent === 'function' ? canSeeAudienceContent(privPost) : null,
            canSeeOwn: typeof canSeeAudienceContent === 'function' ? canSeeAudienceContent(ownPost) : null,
            canSeeSeed: seed && typeof canSeeAudienceContent === 'function' ? canSeeAudienceContent(seed) : null,
            savedPriv: has('#saved-grid', 'rel1124-priv-post'),
            likesPriv: has('#likes-grid', 'rel1124-priv-post'),
            savedOwn: has('#saved-grid', 'rel1124-own-priv'),
            likesOwn: has('#likes-grid', 'rel1124-own-priv'),
            savedSeed: has('#saved-grid', '1'),
            likesSeed: has('#likes-grid', '1')
          };

          // Restore
          state.posts = snap.posts;
          state.explorePosts = snap.explore;
          if (snap.hadArchive) state.explorePostsArchive = snap.archive;
          if (state.savedPostIds && typeof state.savedPostIds.clear === 'function') {
            state.savedPostIds.clear();
            snap.saved.forEach((id) => state.savedPostIds.add(id));
          } else state.savedPostIds = snap.saved;
          if (state.likedPostIds && typeof state.likedPostIds.clear === 'function') {
            state.likedPostIds.clear();
            snap.liked.forEach((id) => state.likedPostIds.add(id));
          } else state.likedPostIds = snap.liked;
          window._acctPrivacy = snap.privacy;
          window._remoteUserProfilesCache = snap.cache;
          try { if (typeof renderSaved === 'function') renderSaved(); } catch (e) {}
          try { if (typeof renderLikes === 'function') renderLikes(); } catch (e) {}
          return out;
        }, TINY_PNG);

        a.equal(r.knownNordic, false, 'directory cache still does not make nordic_trails a known real account');
        a.equal(r.seedHiddenAsReal, false, 'Lake Moraine seed is not hidden as a real-account demo');
        a.equal(r.canSeePriv, false, 'unapproved viewer cannot see a private creator post');
        a.equal(r.canSeeOwn, true, 'owner can still see their own private post');
        a.equal(r.canSeeSeed, true, 'public seed post remains visible');
        a.equal(r.savedPriv, false, 'Saved tab hides an unapproved private-account post');
        a.equal(r.likesPriv, false, 'Likes tab hides an unapproved private-account post');
        a.equal(r.savedOwn, true, "Saved tab still shows the owner's own private post");
        a.equal(r.likesOwn, true, "Likes tab still shows the owner's own private post");
        a.equal(r.savedSeed, true, 'Saved tab still shows the directory-cached Lake Moraine post');
        a.equal(r.likesSeed, true, 'Likes tab still shows the directory-cached Lake Moraine post');
      }
    },
    {
      name: 'Data export of a private account includes isPrivate and Profile status history',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['fn:collectSignedInUserExportRecords', 'fn:recordProfileHistory', 'fn:setAccountPrivacy'],
      async run({ page, a }) {
        const r = await page.evaluate(async () => {
          const u = state.currentUser.username;
          const prevPriv = state.currentUser.isPrivate === true;
          const prevHist = window._profileHistory ? JSON.parse(JSON.stringify(window._profileHistory)) : null;
          let prevLocal = null;
          try { prevLocal = localStorage.getItem('pixly_profile_history_' + u); } catch (e) {}

          state.currentUser.isPrivate = true;
          if (typeof setLocalProfileHistory === 'function') {
            setLocalProfileHistory(u, {});
          } else {
            window._profileHistory = { user: u, fields: {}, loaded: true };
          }
          if (typeof recordProfileHistory === 'function') {
            await recordProfileHistory(u, [{ field: 'status', from: 'Public', to: 'Private', at: 1700000000000 }]);
          } else {
            window._profileHistory = {
              user: u,
              fields: { status: [{ from: 'Public', to: 'Private', at: 1700000000000 }] }
            };
          }

          const records = await collectSignedInUserExportRecords();
          const hist = records.profileHistory || {};
          const status = hist.status || (hist.fields && hist.fields.status) || [];
          const first = Array.isArray(status) ? status[0] : null;

          const out = {
            isPrivate: records.profile && records.profile.isPrivate === true,
            hasStatus: Array.isArray(status) && status.length >= 1,
            from: first && first.from,
            to: first && first.to,
            username: records.profile && records.profile.username
          };

          state.currentUser.isPrivate = prevPriv;
          if (prevHist) window._profileHistory = prevHist;
          else window._profileHistory = null;
          try {
            if (prevLocal == null) localStorage.removeItem('pixly_profile_history_' + u);
            else localStorage.setItem('pixly_profile_history_' + u, prevLocal);
          } catch (e) {}
          return out;
        });

        a.equal(r.username !== '', true, 'export is for the signed-in user');
        a.equal(r.isPrivate, true, 'user-data profile.isPrivate is true for a private account');
        a.ok(r.hasStatus, 'export includes Profile status history');
        a.equal(r.from, 'Public', 'status history records the previous Public state');
        a.equal(r.to, 'Private', 'status history records the change to Private');
      }
    }
  ]
};
