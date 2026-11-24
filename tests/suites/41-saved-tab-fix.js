'use strict';

const fs = require('fs');
const path = require('path');
const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const SHOT = '/workspace/pixlynote/saved-tab-fix/shots/saved-tab-nordic-trails.png';
const SEED_ID = '1';
const CAPTION_SNIP = 'Unreal clarity at Lake Moraine';

function collectSavedPhotoIds(page) {
  return page.evaluate(() => {
    const root = document.getElementById('saved-grid');
    const empty = document.getElementById('saved-empty-state');
    const out = [];
    if (root) {
      root.querySelectorAll('[data-post-id], [onclick]').forEach((el) => {
        const v = el.getAttribute('data-post-id') || ((el.getAttribute('onclick') || '').match(/['"](\d+)['"]/) || [])[1];
        if (v && !out.includes(String(v))) out.push(String(v));
      });
    }
    const emptyVisible = !!(empty && !empty.classList.contains('hidden') && (out.length === 0));
    let stored = [];
    try {
      const u = normalizeUsername((state.currentUser && state.currentUser.username) || '');
      const key = (typeof getAccountStorageKey === 'function') ? getAccountStorageKey('pixly_saved', u) : ('pixly_saved_' + u);
      stored = JSON.parse(localStorage.getItem(key) || '[]') || [];
    } catch (e) { stored = []; }
    return {
      ids: out,
      emptyVisible: emptyVisible,
      savedSet: Array.from(state.savedPostIds || []).map(String),
      stored: (stored || []).map(String),
      filled: typeof isPostSaved === 'function' ? isPostSaved(1) : false,
      html: ((root && root.innerHTML) || '').slice(0, 400)
    };
  });
}

async function openSavedTab(page, h) {
  await h.gotoMainTab(page, 'profile');
  await page.evaluate(() => {
    const btn = document.getElementById('tab-btn-saved');
    if (btn) btn.click();
    if (typeof switchProfileTab === 'function') {
      try { switchProfileTab('saved'); } catch (e) {}
    }
    const photos = document.getElementById('saved-subtab-photos');
    if (photos) photos.click();
    if (typeof renderSaved === 'function') renderSaved();
  });
}

module.exports = {
  name: 'Saved tab feed-post fix',
  tests: [
    {
      name: 'Saved tab: Unit: a saved nordic_trails seed post appears in Saved; real-account seeds stay hidden; unsave removes it',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#saved-grid', 'el:#saved-empty-state', 'el:#tab-btn-saved', 'handler:toggleSavePost', 'handler:renderSaved', 'window.toggleSavePost', 'window.renderSaved', 'window.isPostSaved'],
      async run(ctx) {
        const { page, a, h } = ctx;
        await openSavedTab(page, h);
        const unit = await page.evaluate(() => {
          if (!state.savedPostIds) state.savedPostIds = new Set();
          state.savedPostIds = new Set();
          const me = normalizeUsername((state.currentUser && state.currentUser.username) || '');
          const fakeMine = {
            id: 5,
            isSeed: true,
            author: me || 'bradley_hansen',
            caption: 'Should stay hidden',
            image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
          };
          state.posts = (state.posts || []).filter((p) => String(p.id) !== '5');
          state.posts.push(fakeMine);
          if (typeof toggleSavePost === 'function') {
            toggleSavePost(1);
            toggleSavePost(5);
          }
          const grid = document.getElementById('saved-grid');
          const ids = [];
          if (grid) {
            grid.querySelectorAll('[data-post-id]').forEach((el) => ids.push(String(el.getAttribute('data-post-id'))));
          }
          const nordic = (state.posts || []).find((p) => String(p.id) === '1' && p.author === 'nordic_trails')
            || (typeof getPostById === 'function' ? getPostById(1) : null);
          return {
            ids,
            html: ((grid && grid.innerHTML) || '').slice(0, 800),
            author: nordic && nordic.author,
            caption: nordic && nordic.caption,
            isSeedFn: typeof isSeededDemoContent === 'function' && isSeededDemoContent(nordic),
            isRealFn: typeof isSeededDemoForRealAccount === 'function' && isSeededDemoForRealAccount(nordic),
            filled: typeof isPostSaved === 'function' ? { one: isPostSaved(1), five: isPostSaved(5) } : null
          };
        });
        a.ok(unit.author === 'nordic_trails', 'Post 1 is the nordic_trails Lake Moraine seed: ' + JSON.stringify({ author: unit.author, caption: unit.caption }));
        a.ok(unit.caption && unit.caption.indexOf(CAPTION_SNIP) !== -1, 'Post 1 caption is Lake Moraine');
        a.ok(unit.isSeedFn, 'Post 1 is classified as seeded demo content');
        a.ok(!unit.isRealFn, 'Post 1 is not a seed attributed to a real account, so it can appear in Saved');
        a.ok(unit.ids.includes(SEED_ID), 'Saved grid includes nordic_trails post id 1: ' + JSON.stringify(unit.ids));
        a.ok(!unit.ids.includes('5'), 'Saved grid hides a seed post attributed to the signed-in account: ' + JSON.stringify(unit.ids));
        a.ok(unit.filled && unit.filled.one, 'Bookmark state is saved for post 1');

        const afterUnsave = await page.evaluate(() => {
          if (typeof toggleSavePost === 'function') toggleSavePost(1);
          if (typeof renderSaved === 'function') renderSaved();
          const ids = [];
          const grid = document.getElementById('saved-grid');
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => ids.push(String(el.getAttribute('data-post-id'))));
          return { ids, filled: typeof isPostSaved === 'function' ? isPostSaved(1) : false };
        });
        a.ok(!afterUnsave.ids.includes(SEED_ID), 'Unsaving removes post 1 from the Saved grid: ' + JSON.stringify(afterUnsave.ids));
        a.ok(!afterUnsave.filled, 'Unsaving clears the bookmark state for post 1');
      }
    },
    {
      name: 'Saved tab: E2E: saving the nordic_trails feed post shows it in Saved, survives reload and refresh, and unsaving removes it',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#saved-grid', 'el:#saved-empty-state', 'el:#tab-btn-saved', 'el:#saved-subtab-photos', 'el:#saved-container', 'nav:profile:saved', 'handler:toggleSavePost', 'handler:renderSaved', 'handler:persistState', 'handler:loadPersistedState', 'handler:applyPullRefreshData', 'window.toggleSavePost', 'window.renderSaved', 'window.applyPullRefreshData'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
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
        a.ok(before.filled, 'Feed bookmark is filled for post 1');
        a.ok(before.ids.includes(SEED_ID), 'Saved tab shows the nordic_trails post after saving: ' + JSON.stringify(before));
        a.ok(!before.emptyVisible, 'Saved empty state is hidden when a post is saved');
        a.ok(before.stored.includes(SEED_ID) || before.savedSet.includes(SEED_ID), 'Saved id 1 is persisted locally: ' + JSON.stringify(before.stored));

        if (account.key === 'personal') {
          const tile = page.locator('#saved-grid [data-post-id="1"]').first();
          await tile.waitFor({ state: 'visible', timeout: 10000 });
          fs.mkdirSync(path.dirname(SHOT), { recursive: true });
          await page.screenshot({ path: SHOT, fullPage: false });
          a.ok(fs.existsSync(SHOT) && fs.statSync(SHOT).size > 1000, 'Mobile screenshot of the Saved tab was saved');
        }

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        await openSavedTab(page, h);
        const afterReload = await collectSavedPhotoIds(page);
        a.ok(afterReload.filled, 'Bookmark stays filled after hard reload');
        a.ok(afterReload.ids.includes(SEED_ID), 'Saved tab still shows post 1 after hard reload: ' + JSON.stringify(afterReload));

        await page.evaluate(async () => {
          if (typeof applyPullRefreshData === 'function') await applyPullRefreshData();
          if (typeof renderSaved === 'function') renderSaved();
        });
        const afterRefresh = await collectSavedPhotoIds(page);
        a.ok(afterRefresh.filled, 'Bookmark stays filled after refresh');
        a.ok(afterRefresh.ids.includes(SEED_ID), 'Saved tab still shows post 1 after refresh: ' + JSON.stringify(afterRefresh));

        await page.evaluate(() => {
          if (typeof toggleSavePost === 'function') toggleSavePost(1);
          if (typeof persistState === 'function') persistState();
          if (typeof renderSaved === 'function') renderSaved();
        });
        const afterUnsave = await collectSavedPhotoIds(page);
        a.ok(!afterUnsave.filled, 'Unsaving clears the filled bookmark');
        a.ok(!afterUnsave.ids.includes(SEED_ID), 'Unsaving removes the post from the Saved tab: ' + JSON.stringify(afterUnsave));
      }
    }
  ]
};
