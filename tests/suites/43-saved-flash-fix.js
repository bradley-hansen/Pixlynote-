'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const POST_ID = '1';

function collectSavedPhotoIds(page) {
  return page.evaluate(() => {
    const root = document.getElementById('saved-grid');
    const ids = [];
    if (root) {
      root.querySelectorAll('[data-post-id]').forEach((el) => {
        const v = el.getAttribute('data-post-id');
        if (v && !ids.includes(String(v))) ids.push(String(v));
      });
    }
    return {
      ids,
      savedSet: Array.from(state.savedPostIds || []).map(String),
      filled: typeof isPostSaved === 'function' ? isPostSaved(1) : false,
      knownNordic: typeof isKnownRealAccount === 'function' ? isKnownRealAccount('nordic_trails') : null,
      seedForReal: (function () {
        const p = (state.posts || []).find((x) => String(x.id) === '1') || (typeof getPostById === 'function' ? getPostById(1) : null);
        return typeof isSeededDemoForRealAccount === 'function' ? isSeededDemoForRealAccount(p) : null;
      })()
    };
  });
}

async function openSavedTab(page, h) {
  await h.gotoMainTab(page, 'profile');
  await page.evaluate(() => {
    const btn = document.getElementById('tab-btn-saved');
    if (btn) btn.click();
    const photos = document.getElementById('saved-subtab-photos');
    if (photos) photos.click();
    if (typeof renderSaved === 'function') renderSaved();
  });
}

module.exports = {
  name: 'Saved tab flash fix',
  tests: [
    {
      name: 'Saved flash: Unit: directory cache and stale snapshots cannot hide a saved nordic_trails post',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#saved-grid', 'el:#tab-btn-saved', 'handler:toggleSavePost', 'handler:renderSaved', 'handler:applySavedFromRemote', 'window.toggleSavePost', 'window.renderSaved', 'window.applySavedFromRemote', 'window.isKnownRealAccount', 'window.isSeededDemoForRealAccount'],
      async run(ctx) {
        const { page, a, h } = ctx;
        await openSavedTab(page, h);
        const unit = await page.evaluate(() => {
          state.savedPostIds = new Set();
          if (typeof toggleSavePost === 'function') toggleSavePost(1);
          if (typeof renderSaved === 'function') renderSaved();
          const beforeIds = [];
          const grid = document.getElementById('saved-grid');
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => beforeIds.push(String(el.getAttribute('data-post-id'))));

          // Async explore-directory hydration: cache nordic_trails as if users/* was fetched.
          window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
          window._remoteUserProfilesCache.nordic_trails = { username: 'nordic_trails', fullName: 'Freja Hansen' };
          if (typeof renderSaved === 'function') renderSaved();
          const afterCacheIds = [];
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => afterCacheIds.push(String(el.getAttribute('data-post-id'))));
          const p = (state.posts || []).find((x) => String(x.id) === '1') || (typeof getPostById === 'function' ? getPostById(1) : null);

          // Stale/empty cloud snapshot arriving immediately after the local save.
          const appliedEmpty = (typeof applySavedFromRemote === 'function') ? applySavedFromRemote([], []) : 'missing';
          const afterEmpty = [];
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => afterEmpty.push(String(el.getAttribute('data-post-id'))));

          // A later snapshot that still lists the saved id, after the cache is warm.
          const appliedKeep = (typeof applySavedFromRemote === 'function') ? applySavedFromRemote(['1'], []) : 'missing';
          const afterKeep = [];
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => afterKeep.push(String(el.getAttribute('data-post-id'))));

          return {
            beforeIds,
            afterCacheIds,
            afterEmpty,
            afterKeep,
            appliedEmpty,
            appliedKeep,
            knownNordic: typeof isKnownRealAccount === 'function' ? isKnownRealAccount('nordic_trails') : null,
            seedForReal: typeof isSeededDemoForRealAccount === 'function' ? isSeededDemoForRealAccount(p) : null,
            filled: typeof isPostSaved === 'function' ? isPostSaved(1) : false,
            savedSet: Array.from(state.savedPostIds || []).map(String)
          };
        });
        a.ok(unit.beforeIds.includes(POST_ID), 'Saved grid shows post 1 before the directory snapshot: ' + JSON.stringify(unit.beforeIds));
        a.ok(unit.knownNordic === false, 'nordic_trails stays not a known-real account after users-directory cache: ' + JSON.stringify(unit.knownNordic));
        a.ok(unit.seedForReal === false, 'The Lake Moraine post is not treated as a real-account seed after cache: ' + JSON.stringify(unit.seedForReal));
        a.ok(unit.afterCacheIds.includes(POST_ID), 'Saved photo remains after the directory cache snapshot: ' + JSON.stringify(unit.afterCacheIds));
        a.ok(unit.appliedEmpty === false, 'A stale empty snapshot is ignored while the local save is recent');
        a.ok(unit.afterEmpty.includes(POST_ID) && unit.filled, 'Stale empty snapshot does not wipe the saved post: ' + JSON.stringify(unit));
        a.ok(unit.afterKeep.includes(POST_ID), 'A later snapshot that still lists id 1 keeps the tile: ' + JSON.stringify(unit.afterKeep));

        const afterUnlike = await page.evaluate(() => {
          if (typeof toggleSavePost === 'function') toggleSavePost(1);
          if (typeof renderSaved === 'function') renderSaved();
          const ids = [];
          const grid = document.getElementById('saved-grid');
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => ids.push(String(el.getAttribute('data-post-id'))));
          return { ids, filled: typeof isPostSaved === 'function' ? isPostSaved(1) : false };
        });
        a.ok(!afterUnlike.ids.includes(POST_ID) && !afterUnlike.filled, 'Unsaving still removes the post: ' + JSON.stringify(afterUnlike));
      }
    },
    {
      name: 'Saved flash: E2E: saved nordic_trails photo survives async directory and snapshot, and unsaving removes it',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#saved-grid', 'el:#saved-empty-state', 'el:#tab-btn-saved', 'el:#saved-subtab-photos', 'nav:profile:saved', 'handler:toggleSavePost', 'handler:renderSaved', 'handler:applySavedFromRemote', 'handler:applyPullRefreshData', 'window.toggleSavePost', 'window.renderSaved', 'window.applySavedFromRemote', 'window.applyPullRefreshData'],
      async run(ctx) {
        const { page, a, h } = ctx;
        await h.gotoMainTab(page, 'home');
        await page.evaluate(() => {
          if (typeof toggleSavePost === 'function') {
            if (typeof isPostSaved === 'function' && isPostSaved(1)) toggleSavePost(1);
            toggleSavePost(1);
          }
          if (typeof persistState === 'function') persistState();
        });
        await openSavedTab(page, h);
        const before = await collectSavedPhotoIds(page);
        a.ok(before.ids.includes(POST_ID), 'Saved tab shows the nordic_trails post: ' + JSON.stringify(before));

        // Asynchronous snapshots: users-directory cache, then a stale empty doc, then refresh.
        const afterAsync = await page.evaluate(async () => {
          await Promise.resolve();
          window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
          window._remoteUserProfilesCache.nordic_trails = { username: 'nordic_trails', fullName: 'Freja Hansen' };
          if (typeof renderSaved === 'function') renderSaved();
          const afterCache = [];
          const grid = document.getElementById('saved-grid');
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => afterCache.push(String(el.getAttribute('data-post-id'))));
          await new Promise((resolve) => setTimeout(resolve, 20));
          const skipped = (typeof applySavedFromRemote === 'function') ? applySavedFromRemote([], undefined) : false;
          if (typeof applyPullRefreshData === 'function') await applyPullRefreshData();
          if (typeof renderSaved === 'function') renderSaved();
          const afterRefresh = [];
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => afterRefresh.push(String(el.getAttribute('data-post-id'))));
          return {
            afterCache,
            afterRefresh,
            skipped,
            filled: typeof isPostSaved === 'function' ? isPostSaved(1) : false,
            knownNordic: typeof isKnownRealAccount === 'function' ? isKnownRealAccount('nordic_trails') : null
          };
        });
        a.ok(afterAsync.afterCache.includes(POST_ID), 'Tile survives the async users-directory cache: ' + JSON.stringify(afterAsync.afterCache));
        a.ok(afterAsync.skipped === false, 'Recent local save blocks a stale empty snapshot');
        a.ok(afterAsync.filled && afterAsync.afterRefresh.includes(POST_ID), 'Tile survives pull-to-refresh after those snapshots: ' + JSON.stringify(afterAsync));
        a.ok(afterAsync.knownNordic === false, 'Directory cache still does not mark nordic_trails as a real account');

        await page.evaluate(() => {
          if (typeof toggleSavePost === 'function') toggleSavePost(1);
          if (typeof persistState === 'function') persistState();
          if (typeof renderSaved === 'function') renderSaved();
        });
        const afterUnsave = await collectSavedPhotoIds(page);
        a.ok(!afterUnsave.filled && !afterUnsave.ids.includes(POST_ID), 'Unsaving removes the post after the snapshot sequence: ' + JSON.stringify(afterUnsave));
      }
    }
  ]
};
