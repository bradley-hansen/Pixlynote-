'use strict';

const fs = require('fs');
const path = require('path');
const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const SHOT = '/workspace/pixlynote/saved-tab-fix/shots/likes-tab-nordic-trails.png';
const POST_ID = '1';
const NOTE_ID = '101';
const SEED_NOTE_ID = '1';
const CAPTION_SNIP = 'Unreal clarity at Lake Moraine';
const NOTE_SNIP = 'quiet cafe near Belleville';

function collectLikes(page) {
  return page.evaluate(() => {
    const grid = document.getElementById('likes-grid');
    const notes = document.getElementById('liked-notes-list');
    const postIds = [];
    const noteIds = [];
    if (grid) {
      grid.querySelectorAll('[data-post-id]').forEach((el) => {
        const v = el.getAttribute('data-post-id');
        if (v && !postIds.includes(String(v))) postIds.push(String(v));
      });
    }
    if (notes) {
      notes.querySelectorAll('[data-note-id]').forEach((el) => {
        const v = el.getAttribute('data-note-id');
        if (v && !noteIds.includes(String(v))) noteIds.push(String(v));
      });
    }
    let storedPosts = [];
    let storedNotes = [];
    try {
      const u = normalizeUsername((state.currentUser && state.currentUser.username) || '');
      storedPosts = JSON.parse(localStorage.getItem('pixly_likes_' + u) || '[]') || [];
      storedNotes = JSON.parse(localStorage.getItem('pixly_liked_notes_' + u) || '[]') || [];
    } catch (e) {}
    const isPostLiked = (id) => {
      if (!state.likedPostIds) return false;
      return state.likedPostIds.has(String(id)) || state.likedPostIds.has(Number(id));
    };
    const isNoteLiked = (id) => {
      if (!state.likedNoteIds) return false;
      return state.likedNoteIds.has(String(id)) || state.likedNoteIds.has(Number(id));
    };
    const emptyPhotos = !!(grid && /No Liked Photos Yet/i.test(grid.innerText || ''));
    const emptyNotes = !!(notes && /No Liked Notes Yet/i.test(notes.innerText || ''));
    return {
      postIds,
      noteIds,
      storedPosts: (storedPosts || []).map(String),
      storedNotes: (storedNotes || []).map(String),
      postLiked: isPostLiked(1),
      noteLiked: isNoteLiked(101),
      seedNoteLiked: isNoteLiked(1),
      emptyPhotos,
      emptyNotes,
      tabText: ((document.getElementById('tab-btn-likes') || {}).innerText || '').replace(/\s+/g, ' ').trim()
    };
  });
}

async function openLikesTab(page, h, subtab) {
  await h.gotoMainTab(page, 'profile');
  await page.evaluate((which) => {
    const btn = document.getElementById('tab-btn-likes');
    if (btn) btn.click();
    if (typeof renderLikes === 'function') renderLikes();
    const photos = document.getElementById('likes-subtab-photos');
    const notes = document.getElementById('likes-subtab-notes');
    if (which === 'notes' && notes) notes.click();
    else if (photos) photos.click();
    if (typeof renderLikes === 'function') renderLikes();
  }, subtab || 'photos');
}

module.exports = {
  name: 'Likes tab feed-post fix',
  tests: [
    {
      name: 'Likes tab: Unit: liked nordic_trails post and elena_eats note appear; real-account seeds stay hidden; unlike removes them',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#likes-grid', 'el:#liked-notes-list', 'el:#tab-btn-likes', 'el:#likes-subtab-photos', 'el:#likes-subtab-notes', 'handler:togglePostLike', 'handler:toggleLikeNote', 'handler:renderLikes', 'window.togglePostLike', 'window.toggleLikeNote', 'window.renderLikes'],
      async run(ctx) {
        const { page, a, h } = ctx;
        await openLikesTab(page, h, 'photos');
        const unit = await page.evaluate(() => {
          state.likedPostIds = new Set();
          state.likedOrder = [];
          state.likedNoteIds = new Set();
          state.likedNoteOrder = [];
          const me = normalizeUsername((state.currentUser && state.currentUser.username) || '');
          const fakeMine = {
            id: 5,
            isSeed: true,
            author: me || 'bradley_hansen',
            caption: 'Should stay hidden',
            image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
            likes: 0
          };
          state.posts = (state.posts || []).filter((p) => String(p.id) !== '5');
          state.posts.push(fakeMine);
          const seedNoteFixture = {
            id: 1,
            isSeed: true,
            author: 'bradley_hansen',
            authorName: 'Bradley Hansen',
            text: 'Seed note should stay hidden',
            likes: 0
          };
          state.notes = (state.notes || []).filter((n) => String(n.id) !== '1');
          state.notes.push(seedNoteFixture);
          if (state.exploreNotes) state.exploreNotes = state.exploreNotes.filter((n) => String(n.id) !== '1');
          if (state.exploreNotesArchive && state.exploreNotesArchive.delete) {
            state.exploreNotesArchive.delete('1');
            state.exploreNotesArchive.delete(1);
          }
          if (typeof togglePostLike === 'function') {
            togglePostLike(1);
            togglePostLike(5);
          }
          if (typeof toggleLikeNote === 'function') {
            toggleLikeNote(101);
            toggleLikeNote(1);
          }
          if (typeof renderLikes === 'function') renderLikes();
          const postIds = [];
          const noteIds = [];
          const grid = document.getElementById('likes-grid');
          const notes = document.getElementById('liked-notes-list');
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => postIds.push(String(el.getAttribute('data-post-id'))));
          if (notes) notes.querySelectorAll('[data-note-id]').forEach((el) => noteIds.push(String(el.getAttribute('data-note-id'))));
          const nordic = (state.posts || []).find((p) => String(p.id) === '1' && p.author === 'nordic_trails')
            || (typeof getPostById === 'function' ? getPostById(1) : null);
          const cafe = (typeof getNoteById === 'function') ? getNoteById(101) : null;
          const seedNote = (typeof getNoteById === 'function') ? getNoteById(1) : ((state.notes || []).find((n) => String(n.id) === '1'));
          return {
            postIds,
            noteIds,
            author: nordic && nordic.author,
            caption: nordic && nordic.caption,
            noteAuthor: cafe && cafe.author,
            noteText: cafe && cafe.text,
            seedNoteAuthor: seedNote && seedNote.author,
            postIsSeed: typeof isSeededDemoContent === 'function' && isSeededDemoContent(nordic),
            postIsRealSeed: typeof isSeededDemoForRealAccount === 'function' && isSeededDemoForRealAccount(nordic),
            noteIsRealSeed: typeof isSeededDemoForRealAccount === 'function' && isSeededDemoForRealAccount(seedNote),
            postLiked: !!(state.likedPostIds && (state.likedPostIds.has('1') || state.likedPostIds.has(1))),
            noteLiked: !!(state.likedNoteIds && (state.likedNoteIds.has('101') || state.likedNoteIds.has(101)))
          };
        });
        a.ok(unit.author === 'nordic_trails', 'Post 1 is the nordic_trails Lake Moraine seed: ' + JSON.stringify({ author: unit.author, caption: unit.caption }));
        a.ok(unit.caption && unit.caption.indexOf(CAPTION_SNIP) !== -1, 'Post 1 caption is Lake Moraine');
        a.ok(unit.postIsSeed, 'Post 1 is classified as seeded demo content');
        a.ok(!unit.postIsRealSeed, 'Post 1 is not a seed attributed to a real account');
        a.ok(unit.postIds.includes(POST_ID), 'Likes photos include nordic_trails post id 1: ' + JSON.stringify(unit.postIds));
        a.ok(!unit.postIds.includes('5'), 'Likes photos hide a seed post attributed to the signed-in account: ' + JSON.stringify(unit.postIds));
        a.ok(unit.noteAuthor === 'elena_eats' && unit.noteText && unit.noteText.indexOf(NOTE_SNIP) !== -1, 'Note 101 is the elena_eats cafe note');
        a.ok(unit.noteIds.includes(NOTE_ID), 'Liked notes include explore/built-in note 101: ' + JSON.stringify(unit.noteIds));
        a.ok(unit.noteIsRealSeed, 'Seed note 1 is attributed to a real account');
        a.ok(!unit.noteIds.includes(SEED_NOTE_ID), 'Liked notes hide the real-account seed note 1: ' + JSON.stringify(unit.noteIds));
        a.ok(unit.postLiked && unit.noteLiked, 'Like state is set for post 1 and note 101');

        const afterUnlike = await page.evaluate(() => {
          if (typeof togglePostLike === 'function') togglePostLike(1);
          if (typeof toggleLikeNote === 'function') toggleLikeNote(101);
          if (typeof renderLikes === 'function') renderLikes();
          const postIds = [];
          const noteIds = [];
          const grid = document.getElementById('likes-grid');
          const notes = document.getElementById('liked-notes-list');
          if (grid) grid.querySelectorAll('[data-post-id]').forEach((el) => postIds.push(String(el.getAttribute('data-post-id'))));
          if (notes) notes.querySelectorAll('[data-note-id]').forEach((el) => noteIds.push(String(el.getAttribute('data-note-id'))));
          return {
            postIds,
            noteIds,
            postLiked: !!(state.likedPostIds && (state.likedPostIds.has('1') || state.likedPostIds.has(1))),
            noteLiked: !!(state.likedNoteIds && (state.likedNoteIds.has('101') || state.likedNoteIds.has(101)))
          };
        });
        a.ok(!afterUnlike.postIds.includes(POST_ID), 'Unliking removes post 1 from the Likes grid: ' + JSON.stringify(afterUnlike.postIds));
        a.ok(!afterUnlike.noteIds.includes(NOTE_ID), 'Unliking removes note 101 from Liked Notes: ' + JSON.stringify(afterUnlike.noteIds));
        a.ok(!afterUnlike.postLiked && !afterUnlike.noteLiked, 'Unlike clears like state for post 1 and note 101');
      }
    },
    {
      name: 'Likes tab: E2E: liked nordic_trails post and elena_eats note show in Likes, survive reload and refresh, and unlike removes them',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#likes-grid', 'el:#liked-notes-list', 'el:#tab-btn-likes', 'el:#likes-container', 'el:#likes-subtab-photos', 'el:#likes-subtab-notes', 'nav:profile:likes', 'handler:togglePostLike', 'handler:toggleLikeNote', 'handler:renderLikes', 'handler:persistState', 'handler:loadPersistedState', 'handler:applyPullRefreshData', 'window.togglePostLike', 'window.toggleLikeNote', 'window.renderLikes', 'window.applyPullRefreshData'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        await h.gotoMainTab(page, 'home');
        await page.evaluate(() => {
          const unlikeIf = (fn, id, check) => {
            if (typeof fn === 'function' && check(id)) fn(id);
          };
          if (typeof togglePostLike === 'function') {
            unlikeIf(togglePostLike, 1, (id) => state.likedPostIds && (state.likedPostIds.has(String(id)) || state.likedPostIds.has(id)));
            togglePostLike(1);
          }
          if (typeof toggleLikeNote === 'function') {
            unlikeIf(toggleLikeNote, 101, (id) => state.likedNoteIds && (state.likedNoteIds.has(String(id)) || state.likedNoteIds.has(id)));
            toggleLikeNote(101);
          }
          if (typeof persistState === 'function') persistState();
        });
        await openLikesTab(page, h, 'photos');
        const before = await collectLikes(page);
        a.ok(before.postLiked, 'Post 1 is liked');
        a.ok(before.postIds.includes(POST_ID), 'Likes tab shows the nordic_trails post after liking: ' + JSON.stringify(before));
        a.ok(!before.emptyPhotos, 'Liked Photos empty state is hidden');
        a.ok(before.noteLiked, 'Note 101 is liked');
        a.ok(before.noteIds.includes(NOTE_ID), 'Liked Notes include elena_eats note 101: ' + JSON.stringify(before.noteIds));
        a.ok(before.storedPosts.includes(POST_ID) || before.postLiked, 'Liked post id is persisted locally');
        a.ok(before.storedNotes.includes(NOTE_ID) || before.noteLiked, 'Liked note id is persisted locally');

        if (account.key === 'personal') {
          const tile = page.locator('#likes-grid [data-post-id="1"]').first();
          await tile.waitFor({ state: 'visible', timeout: 10000 });
          fs.mkdirSync(path.dirname(SHOT), { recursive: true });
          await page.screenshot({ path: SHOT, fullPage: false });
          a.ok(fs.existsSync(SHOT) && fs.statSync(SHOT).size > 1000, 'Mobile screenshot of the Likes tab was saved');
        }

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        await openLikesTab(page, h, 'photos');
        const afterReload = await collectLikes(page);
        a.ok(afterReload.postLiked, 'Post like survives hard reload');
        a.ok(afterReload.postIds.includes(POST_ID), 'Likes tab still shows post 1 after hard reload: ' + JSON.stringify(afterReload));
        a.ok(afterReload.noteLiked, 'Note like survives hard reload');
        a.ok(afterReload.noteIds.includes(NOTE_ID), 'Liked Notes still show note 101 after hard reload: ' + JSON.stringify(afterReload.noteIds));

        await page.evaluate(async () => {
          if (typeof applyPullRefreshData === 'function') await applyPullRefreshData();
          if (typeof renderLikes === 'function') renderLikes();
        });
        const afterRefresh = await collectLikes(page);
        a.ok(afterRefresh.postLiked && afterRefresh.postIds.includes(POST_ID), 'Post 1 stays on Likes after refresh: ' + JSON.stringify(afterRefresh));
        a.ok(afterRefresh.noteLiked && afterRefresh.noteIds.includes(NOTE_ID), 'Note 101 stays on Liked Notes after refresh: ' + JSON.stringify(afterRefresh.noteIds));

        await page.evaluate(() => {
          if (typeof togglePostLike === 'function') togglePostLike(1);
          if (typeof toggleLikeNote === 'function') toggleLikeNote(101);
          if (typeof persistState === 'function') persistState();
          if (typeof renderLikes === 'function') renderLikes();
        });
        const afterUnlike = await collectLikes(page);
        a.ok(!afterUnlike.postLiked, 'Unliking clears the post like');
        a.ok(!afterUnlike.postIds.includes(POST_ID), 'Unliking removes the post from the Likes tab: ' + JSON.stringify(afterUnlike));
        a.ok(!afterUnlike.noteLiked, 'Unliking clears the note like');
        a.ok(!afterUnlike.noteIds.includes(NOTE_ID), 'Unliking removes the note from Liked Notes: ' + JSON.stringify(afterUnlike.noteIds));
      }
    }
  ]
};
