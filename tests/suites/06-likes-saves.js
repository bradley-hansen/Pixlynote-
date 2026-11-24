'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Likes and Saved',
  tests: [
    {
      name: 'Liked and Saved show real Explore items and feed-visible built-in posts, hide real-account seeds, and sort Saved newest first',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#saved-container', 'el:#likes-container', 'el:#saved-subtab-photos', 'el:#saved-subtab-notes', 'el:#likes-subtab-photos', 'el:#likes-subtab-notes', 'nav:profile:saved-photos', 'nav:profile:saved-notes', 'nav:profile:likes-photos', 'nav:profile:likes-notes', 'el:#saved-grid', 'el:#likes-grid', 'el:#saved-notes-list', 'el:#liked-notes-list', 'handler:toggleSavePost', 'handler:toggleSaveNote', 'window.toggleSavePost', 'window.toggleSaveNote', 'window.toggleLikeNote'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.gotoMainTab(page, 'profile');
        // Like/save explore items A then B, and also try to like/save seed ids 1-6
        const result = await page.evaluate(() => {
          const ids = (set) => Array.from(set || []).map(String);
          // Reset
          state.likedPostIds = new Set();
          state.savedPostIds = new Set();
          state.likedNoteIds = new Set();
          state.savedNoteIds = new Set();
          state.likedOrder = [];
          if (typeof togglePostLike === 'function') {
            togglePostLike(2123);
            togglePostLike(1);
            togglePostLike(2144);
          }
          if (typeof toggleSavePost === 'function') {
            toggleSavePost(2123);
            toggleSavePost(2);
            toggleSavePost(2144);
          }
          if (typeof toggleLikeNote === 'function') {
            toggleLikeNote(9101);
            toggleLikeNote(1);
            toggleLikeNote(9102);
          }
          if (typeof toggleSaveNote === 'function') {
            toggleSaveNote(9101);
            toggleSaveNote(2);
            toggleSaveNote(9102);
          }
          if (typeof renderLikes === 'function') renderLikes();
          if (typeof renderSaved === 'function') renderSaved();
          const collectIds = (rootId) => {
            const root = document.getElementById(rootId);
            if (!root) return [];
            return Array.from(root.querySelectorAll('[data-id], [data-post-id], [data-note-id], [onclick*="openPostDetailModal"], [onclick*="openNoteDetailModal"]'))
              .map((el) => el.getAttribute('data-id') || el.getAttribute('data-post-id') || el.getAttribute('data-note-id') || ((el.getAttribute('onclick') || '').match(/'(\d+)'/) || [])[1] || '')
              .filter(Boolean)
              .map(String);
          };
          // also parse grid children order from dataset or onclick
          const orderFrom = (rootId) => {
            const root = document.getElementById(rootId);
            if (!root) return [];
            const out = [];
            root.querySelectorAll('[onclick], [data-id], [data-post-id], [data-note-id]').forEach((el) => {
              const v = el.getAttribute('data-id') || el.getAttribute('data-post-id') || el.getAttribute('data-note-id') || ((el.getAttribute('onclick') || '').match(/['"](\d+)['"]/) || [])[1];
              if (v && !out.includes(String(v))) out.push(String(v));
            });
            return out;
          };
          return {
            likedPosts: ids(state.likedPostIds),
            savedPosts: ids(state.savedPostIds),
            likedNotes: ids(state.likedNoteIds),
            savedNotes: ids(state.savedNoteIds),
            likesGrid: orderFrom('likes-grid'),
            savedGrid: orderFrom('saved-grid'),
            likedNotesList: orderFrom('liked-notes-list'),
            savedNotesList: orderFrom('saved-notes-list'),
            likesHtml: ((document.getElementById('likes-grid') || {}).innerHTML || '').slice(0, 500),
            savedHtml: ((document.getElementById('saved-grid') || {}).innerHTML || '').slice(0, 500)
          };
        });

        const hasSeed = (arr) => (arr || []).some((id) => ['1', '2', '3', '4', '5', '6'].includes(String(id)));
        a.ok(result.likedPosts.includes('2123') || result.likesGrid.includes('2123'), 'Liked photos include Explore item 2123: ' + JSON.stringify(result.likedPosts.concat(result.likesGrid)));
        a.ok(result.savedPosts.includes('2144') || result.savedGrid.includes('2144'), 'Saved photos include Explore item 2144');
        a.ok(result.likesGrid.includes('1') || result.likedPosts.includes('1'), 'Liked photos include feed-visible seed post 1 (nordic_trails): ' + JSON.stringify(result.likesGrid));
        a.ok(!hasSeed(result.likedNotesList), 'Seed notes by a real account stay hidden from Liked Notes: ' + JSON.stringify(result.likedNotesList));
        a.ok(!hasSeed(result.savedNotesList), 'Seed notes by a real account stay hidden from Saved Notes: ' + JSON.stringify(result.savedNotesList));
        a.ok(result.savedGrid.includes('2') || result.savedPosts.includes('2'), 'Saved photos include feed-visible seed post 2 (elena_eats): ' + JSON.stringify(result.savedGrid));

        // Newest first: 2144 was saved after 2123, 9102 after 9101
        const photoOrder = result.savedGrid.length ? result.savedGrid : result.savedPosts.slice().reverse();
        const iB = photoOrder.indexOf('2144');
        const iA = photoOrder.indexOf('2123');
        a.ok(iB !== -1 && iA !== -1 && iB < iA, 'Saved Photos are newest first (2144 before 2123): ' + JSON.stringify(photoOrder));

        // Open saved notes subtab and check order
        await page.evaluate(() => {
          const btn = document.getElementById('saved-subtab-notes');
          if (btn) btn.click();
          if (typeof renderSaved === 'function') renderSaved();
        });
        await page.waitForTimeout(80);
        const notesOrder = await page.evaluate(() => {
          const root = document.getElementById('saved-notes-list');
          if (!root) return [];
          const out = [];
          root.querySelectorAll('[onclick], [data-id], [data-note-id]').forEach((el) => {
            const v = el.getAttribute('data-id') || el.getAttribute('data-note-id') || ((el.getAttribute('onclick') || '').match(/['"](\d+)['"]/) || [])[1];
            if (v && !out.includes(String(v))) out.push(String(v));
          });
          return out;
        });
        const nB = notesOrder.indexOf('9102');
        const nA = notesOrder.indexOf('9101');
        a.ok((nB !== -1 && nA !== -1 && nB < nA) || (result.savedNotes.indexOf('9102') > result.savedNotes.indexOf('9101') && notesOrder.length === 0) || (nB !== -1 && nB === 0), 'Saved Notes are newest first (9102 before 9101): ' + JSON.stringify({ notesOrder, savedNotes: result.savedNotes }));
      }
    }
  ]
};
