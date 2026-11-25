'use strict';

/**
 * One like per person (branch grokbot/like-once).
 * Every like path: posts, notes, story likes, comment and reply likes, Explore items, built-in demo content.
 * A like is a member of a set of likers. The count is computed from that set, never "+1 / -1 on a counter".
 * In-page mock Firestore only (arrayUnion / arrayRemove are real in the mock). Never touches production.
 */

const fs = require('fs');
const path = require('path');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const wait = (page, ms) => page.waitForTimeout(ms || 150);

async function withMock(page, seed, fn) {
  await page.evaluate(() => {
    window.__loSnap = {
      posts: state.posts.slice(),
      notes: state.notes.slice(),
      explorePosts: (state.explorePosts || []).slice(),
      likedPostIds: new Set(state.likedPostIds || []),
      likedNoteIds: new Set(state.likedNoteIds || []),
      likedStoryIds: new Set(state.likedStoryIds || []),
      likedOrder: (state.likedOrder || []).slice(),
      likedNoteOrder: (state.likedNoteOrder || []).slice(),
      cu: Object.assign({}, state.currentUser),
      dir: window._exploreUserDir || null,
      activeStory: state.activeStory || null
    };
    window._exploreUserDir = null;
    window._likeIntents = new Map();
    window._likeWritesInFlight = 0;
  });
  await page.evaluate(installPixlyMockFirestore, seed || {});
  await page.evaluate(() => { state.isLoggedIn = true; window._likesHydratedFromCloud = true; window.pendingLikesSync = false; });
  try {
    await fn();
  } finally {
    await page.evaluate(uninstallPixlyMockFirestore);
    await page.evaluate(() => {
      const s = window.__loSnap;
      if (!s) return;
      state.posts = s.posts;
      state.notes = s.notes;
      state.explorePosts = s.explorePosts;
      state.likedPostIds = s.likedPostIds;
      state.likedNoteIds = s.likedNoteIds;
      state.likedStoryIds = s.likedStoryIds;
      state.likedOrder = s.likedOrder;
      state.likedNoteOrder = s.likedNoteOrder;
      state.currentUser = s.cu;
      window._exploreUserDir = s.dir;
      state.activeStory = s.activeStory;
      window._likeIntents = new Map();
      window._likeWritesInFlight = 0;
      window.pendingLikesSync = false;
      try { saveAccountLikes(normalizeUsername(s.cu.username)); } catch (e) {}
      window.__loSnap = null;
    });
  }
}

// A cloud post by another account, with a deliberately stale stored counter (likes: 7).
const cloudPost = (id) => ({ id, author: 'alice_test', authorName: 'Alice', authorAvatar: '', image: 'data:image/png;base64,AAAA', caption: 'cloud post ' + id, tags: [], likes: 7, isLiked: false, timestamp: '1 MIN AGO', comments: [] });

async function addCloudPost(page, id) {
  await page.evaluate((p) => {
    state.posts = state.posts.filter((x) => String(x.id) !== String(p.id));
    state.posts.unshift(p);
    state.likedPostIds.delete(String(p.id));
    state.likedOrder = (state.likedOrder || []).filter((x) => String(x) !== String(p.id));
  }, cloudPost(id));
}

const readDoc = (page, p) => page.evaluate((x) => (window.__pfs.docs[x] ? JSON.parse(JSON.stringify(window.__pfs.docs[x])) : null), p);
const countOf = (page, id) => page.evaluate((i) => postLikeCount(state.posts.concat(state.explorePosts || []).find((x) => String(x.id) === String(i))), id);
const rawLikes = (page, id) => page.evaluate((i) => (state.posts.find((x) => String(x.id) === String(i)) || {}).likes, id);

module.exports = {
  name: 'Like once per person',
  tests: [
    {
      name: 'Like once: double-tap on a post adds exactly 1, even when the tap lands several times in one frame',
      accounts: ['personal'],
      covers: ['window.toggleLikeNote'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me }, 'posts/lo-1': cloudPost('lo-1') }, async () => {
          await addCloudPost(page, 'lo-1');
          // the double-tap-on-photo handler uses forceState=true: any number of taps still means "liked once"
          await page.evaluate(() => { togglePostLike('lo-1', true); togglePostLike('lo-1', true); togglePostLike('lo-1', true); });
          await wait(page);
          a.equal(await countOf(page, 'lo-1'), 1, 'three forced taps = 1 like (stale stored counter of 7 is ignored)');
          const u = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(u.likedPostIds), JSON.stringify(['lo-1']), 'my like set has the post once: ' + JSON.stringify(u.likedPostIds));
          const p = await readDoc(page, 'posts/lo-1');
          a.equal(JSON.stringify(p.likedBy), JSON.stringify([me]), 'post likedBy has me once: ' + JSON.stringify(p.likedBy));
          a.equal(p.likes, 7, 'no code writes the post counter');
          // the heart button toggles: a quick double click is like then unlike
          await page.evaluate(() => { togglePostLike('lo-1'); togglePostLike('lo-1'); });
          await wait(page);
          a.equal(await countOf(page, 'lo-1'), 1, 'double click on the heart button: like then unlike then... net unchanged (still liked)');
          const u2 = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(u2.likedPostIds), JSON.stringify(['lo-1']), 'still one entry after the double click');
        });
      }
    },
    {
      name: 'Like once: a burst of toggles ends in the state shown on screen, with one stored entry and never a negative count',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me }, 'posts/lo-2': cloudPost('lo-2') }, async () => {
          await addCloudPost(page, 'lo-2');
          const seen = await page.evaluate(() => {
            const counts = [];
            for (let i = 0; i < 9; i++) { togglePostLike('lo-2'); counts.push(postLikeCount(state.posts.find((x) => String(x.id) === 'lo-2'))); }
            return counts;
          });
          a.ok(seen.every((n) => n >= 0 && n <= 1), 'counts stay between 0 and 1: ' + JSON.stringify(seen));
          a.equal(seen[8], 1, 'nine toggles = liked');
          await wait(page, 250);
          const u = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(u.likedPostIds), JSON.stringify(['lo-2']), 'stored like set matches the screen: ' + JSON.stringify(u.likedPostIds));
          const p = await readDoc(page, 'posts/lo-2');
          a.equal(JSON.stringify(p.likedBy), JSON.stringify([me]), 'post likedBy matches the screen');
          await page.evaluate(() => { togglePostLike('lo-2'); });
          await wait(page);
          const u3 = await readDoc(page, 'users/' + me);
          const p3 = await readDoc(page, 'posts/lo-2');
          a.equal(JSON.stringify(u3.likedPostIds), '[]', 'unlike removes exactly my entry');
          a.equal(JSON.stringify(p3.likedBy), '[]', 'unlike removes exactly my name from likedBy');
          a.equal(await countOf(page, 'lo-2'), 0, 'back to zero, not -1');
        });
      }
    },
    {
      name: 'Like once: the count comes from the set of likers, so a reload, a stale counter, or a duplicate id cannot change it',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me }, 'posts/lo-3': Object.assign(cloudPost('lo-3'), { likedBy: ['bob_test', 'carol_test'] }) }, async () => {
          await addCloudPost(page, 'lo-3');
          await page.evaluate(() => { state.posts.find((x) => String(x.id) === 'lo-3').likedBy = ['bob_test', 'carol_test', 'bob_test']; });
          a.equal(await countOf(page, 'lo-3'), 2, 'two people liked it (bob listed twice counts once)');
          // reload: cloud says I already liked it, and lists the id twice
          await page.evaluate(() => { applyLikesFromRemote(['lo-3', 'lo-3']); });
          a.equal(await countOf(page, 'lo-3'), 3, 'bob + carol + me = 3 after a reload that lists my like twice');
          await page.evaluate(() => { applyLikesFromRemote(['lo-3']); applyLikesFromRemote(['lo-3']); });
          a.equal(await countOf(page, 'lo-3'), 3, 'applying the same cloud likes again changes nothing');
          // unlike after the reload: removes exactly 1 (the old counter bug gave 8 -> 6 or 2 -> 1 depending on timing)
          await page.evaluate(() => { togglePostLike('lo-3'); });
          a.equal(await countOf(page, 'lo-3'), 2, 'unlike after a reload removes exactly 1');
          await page.evaluate(() => { togglePostLike('lo-3'); });
          a.equal(await countOf(page, 'lo-3'), 3, 'like again adds exactly 1');
          // my own copy of likedBy may list me while my like set does not: my like set is the truth
          await page.evaluate(() => { togglePostLike('lo-3'); state.posts.find((x) => String(x.id) === 'lo-3').likedBy.push('REGME'.length ? normalizeUsername(state.currentUser.username) : ''); });
          a.equal(await countOf(page, 'lo-3'), 2, 'a stale "me" in likedBy never counts when I have unliked');
        });
      }
    },
    {
      name: 'Like once: two tabs - a stale tab liking another post never erases or repeats the first tab\'s like',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me, likedPostIds: ['tab-a-post'] }, 'posts/lo-4': cloudPost('lo-4'), 'posts/tab-a-post': cloudPost('tab-a-post') }, async () => {
          await addCloudPost(page, 'lo-4');
          // this tab does not know about 'tab-a-post' (the other tab liked it)
          await page.evaluate(() => { togglePostLike('lo-4'); });
          await wait(page, 250);
          let u = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(u.likedPostIds.slice().sort()), JSON.stringify(['lo-4', 'tab-a-post']), 'both tabs\' likes are kept: ' + JSON.stringify(u.likedPostIds));
          // both tabs like the same post at the same moment: still one entry
          await page.evaluate(async () => {
            const fb = window.firebase;
            await fb.setDoc(fb.doc(fb.db, 'users', normalizeUsername(state.currentUser.username)), { likedPostIds: fb.arrayUnion('lo-4') }, { merge: true });
            await fb.updateDoc(fb.doc(fb.db, 'posts', 'lo-4'), { likedBy: fb.arrayUnion(normalizeUsername(state.currentUser.username)) });
          });
          await wait(page);
          u = await readDoc(page, 'users/' + me);
          const p = await readDoc(page, 'posts/lo-4');
          a.equal(u.likedPostIds.filter((x) => x === 'lo-4').length, 1, 'one entry for lo-4 after both tabs liked it');
          a.equal(p.likedBy.filter((x) => x === me).length, 1, 'one likedBy entry after both tabs liked it');
          // an unrelated save (the full sync) no longer writes whole like arrays that could undo the other tab
          await page.evaluate(() => { window.__pfs.writes.length = 0; });
          await page.evaluate(async () => { await syncAllLikesToFirestore(); });
          await wait(page);
          const writes = await page.evaluate(() => window.__pfs.writes.filter((w) => /^users\//.test(w.path)).map((w) => Object.keys(w.data || {})));
          a.ok(writes.length > 0 && writes.every((ks) => !ks.includes('likedPostIds') && !ks.includes('likedNoteIds') && !ks.includes('likedStoryIds')), 'full sync does not rewrite like sets: ' + JSON.stringify(writes));
        });
      }
    },
    {
      name: 'Like once: switching accounts keeps each person\'s like separate and counts each person once',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me }, 'users/other_acct': { username: 'other_acct' }, 'posts/lo-5': cloudPost('lo-5') }, async () => {
          await addCloudPost(page, 'lo-5');
          await page.evaluate(() => { togglePostLike('lo-5'); });
          a.equal(await countOf(page, 'lo-5'), 1, 'first account liked');
          await wait(page);
          // switch to another account on the same browser
          const switched = await page.evaluate(() => {
            const first = normalizeUsername(state.currentUser.username);
            saveAccountLikes(first);
            state.currentUser = Object.assign({}, state.currentUser, { username: 'other_acct' });
            loadAccountLikes('other_acct');
            syncLikedStateToPosts();
            const p = state.posts.find((x) => String(x.id) === 'lo-5');
            // the directory (every account's like set) knows the first account liked it
            window._exploreUserDir = { at: Date.now(), users: new Map(), notes: [], likesByPost: new Map([['lo-5', new Set([first])]]), likesByNote: new Map() };
            return { liked: state.likedPostIds.has('lo-5'), count: postLikeCount(p) };
          });
          a.equal(switched.liked, false, 'the second account has not liked it');
          a.equal(switched.count, 1, 'count still 1 (first account only)');
          await page.evaluate(() => { togglePostLike('lo-5'); });
          a.equal(await countOf(page, 'lo-5'), 2, 'second account adds exactly 1');
          await page.evaluate(() => { togglePostLike('lo-5'); togglePostLike('lo-5'); togglePostLike('lo-5'); });
          a.equal(await countOf(page, 'lo-5'), 1, 'second account unlikes: back to 1, first account\'s like untouched');
          await wait(page, 250);
          const u1 = await readDoc(page, 'users/' + me);
          const u2 = await readDoc(page, 'users/other_acct');
          a.equal(JSON.stringify(u1.likedPostIds), JSON.stringify(['lo-5']), 'first account\'s stored like is untouched');
          a.ok(!u2.likedPostIds || u2.likedPostIds.length === 0, 'second account\'s like set is empty after the unlike: ' + JSON.stringify(u2.likedPostIds));
          const post = await readDoc(page, 'posts/lo-5');
          a.equal(JSON.stringify(post.likedBy), JSON.stringify([me]), 'post likedBy lists the first account only');
        });
      }
    },
    {
      name: 'Like once: a like made while offline is written once when the cloud answers, and a tap made offline wins over the cloud copy',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me, likedPostIds: ['old-1', 'old-2'] }, 'posts/lo-6': cloudPost('lo-6') }, async () => {
          await addCloudPost(page, 'lo-6');
          await addCloudPost(page, 'old-1');
          await addCloudPost(page, 'old-2');
          await page.evaluate(() => {
            window.firebaseReady = false;      // offline / Firebase still loading
            state.likedPostIds = new Set(['old-2']);
            state.likedOrder = ['old-2'];
            togglePostLike('lo-6');            // liked offline
            togglePostLike('old-2');           // unliked offline
          });
          await wait(page);
          const none = await page.evaluate(() => window.__pfs.writes.length);
          a.equal(none, 0, 'nothing is written while offline');
          await page.evaluate(() => { window.firebaseReady = true; applyLikesFromRemote(['old-1', 'old-2']); });
          await wait(page, 300);
          const s = await page.evaluate(() => Array.from(state.likedPostIds).map(String).sort());
          a.equal(JSON.stringify(s), JSON.stringify(['lo-6', 'old-1']), 'offline like kept, offline unlike respected: ' + JSON.stringify(s));
          const u = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(u.likedPostIds.slice().sort()), JSON.stringify(['lo-6', 'old-1']), 'cloud matches after the flush: ' + JSON.stringify(u.likedPostIds));
        });
      }
    },
    {
      name: 'Like once: built-in demo posts and notes add exactly 1 on like and remove exactly 1 on unlike, including after a reload',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {}, async () => {
          const r = await page.evaluate(() => {
            const out = {};
            const post = state.posts.find((x) => x.isSeed && String(x.id) === '1');
            const base = post._likeBase;
            state.likedPostIds.delete('1');
            syncLikedStateToPosts();
            out.base = base;
            out.start = postLikeCount(post);
            togglePostLike('1'); out.liked = post.likes;
            togglePostLike('1'); out.unliked = post.likes;
            // reload: the like is remembered, the demo post is rebuilt with its fixed starting number
            state.likedPostIds.add('1');
            post.likes = base;
            syncLikedStateToPosts();
            out.afterReload = post.likes;
            togglePostLike('1'); out.unlikedAfterReload = post.likes;
            const note = state.notes.find((n) => n.isSeed);
            if (note) {
              const nbase = note._likeBase;
              state.likedNoteIds.delete(note.id); state.likedNoteIds.delete(String(note.id));
              syncLikedStateToPosts();
              out.nstart = noteLikeCount(note); out.nbase = nbase;
              toggleLikeNote(note.id); out.nliked = note.likes;
              toggleLikeNote(note.id); out.nunliked = note.likes;
              toggleLikeNote(note.id); toggleLikeNote(note.id); toggleLikeNote(note.id);
              out.nrapid = note.likes;
              toggleLikeNote(note.id);
            }
            return out;
          });
          a.equal(r.start, r.base, 'start at the demo number');
          a.equal(r.liked, r.base + 1, 'like adds exactly 1: ' + JSON.stringify(r));
          a.equal(r.unliked, r.base, 'unlike removes exactly 1');
          a.equal(r.afterReload, r.base + 1, 'after a reload the remembered like is counted once');
          a.equal(r.unlikedAfterReload, r.base, 'unlike after a reload removes exactly 1 (it used to leave base - 1)');
          if (r.nbase !== undefined) {
            a.equal(r.nstart, r.nbase, 'demo note starts at its number');
            a.equal(r.nliked, r.nbase + 1, 'demo note like adds 1');
            a.equal(r.nunliked, r.nbase, 'demo note unlike removes 1');
            a.equal(r.nrapid, r.nbase + 1, 'three quick taps on a demo note = liked once');
          }
        });
      }
    },
    {
      name: 'Like once: notes - heart on the card and heart in the modal share one set, a double tap never double-counts, and unlike does not come back',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        const note = { id: 'lo-note-1', author: 'alice_test', authorName: 'Alice', authorAvatar: '', text: 'a note by someone else', time: '1m ago', likes: 9, isLiked: false, comments: [], likedBy: [] };
        await withMock(page, { ['users/' + me]: { username: me }, 'users/alice_test': { username: 'alice_test' } }, async () => {
          await page.evaluate((n) => {
            state.exploreNotesArchive = state.exploreNotesArchive || new Map();
            state.exploreNotesArchive.set(String(n.id), n);
            state.likedNoteIds.delete(n.id); state.likedNoteIds.delete(String(n.id));
            window.__loNote = n;
          }, note);
          const r = await page.evaluate(() => {
            const n = window.__loNote;
            const o = {};
            window.__pfs.writes.length = 0;
            toggleLikeNote(n.id); toggleLikeNote(n.id); toggleLikeNote(n.id);   // 3 quick taps on the card
            o.afterCard = noteLikeCount(n);
            state.currentModalNoteId = n.id;
            handleNoteModalLikeToggle(); handleNoteModalLikeToggle();            // 2 quick taps in the modal: net unchanged
            o.afterModal = noteLikeCount(n);
            o.likedBy = n.likedBy.slice();
            o.likedSet = Array.from(state.likedNoteIds).map(String);
            return o;
          });
          a.equal(r.afterCard, 1, 'three taps = liked once (the stored counter of 9 is ignored)');
          a.equal(r.afterModal, 1, 'card + modal share one set: two modal taps keep it at 1');
          a.equal(JSON.stringify(r.likedBy), JSON.stringify([me]), 'note likedBy never lists me twice');
          a.equal(r.likedSet.filter((x) => x === 'lo-note-1').length, 1, 'like set has the note once');
          await wait(page, 300);
          const u = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(u.likedNoteIds), JSON.stringify(['lo-note-1']), 'stored note likes: ' + JSON.stringify(u.likedNoteIds));
          const author = await readDoc(page, 'users/alice_test');
          a.ok(!author.notes && !author.likedBy, 'the note author\'s doc is not rewritten (that old +1 write is gone)');
          // unlike: the note's old likedBy list that still names me must not turn the like back on
          const r2 = await page.evaluate(() => {
            const n = window.__loNote;
            toggleLikeNote(n.id);
            n.likedBy = [normalizeUsername(state.currentUser.username)];   // stale copy from an old device
            openNoteDetailModal(n.id);
            return { liked: state.likedNoteIds.has(String(n.id)), count: noteLikeCount(n), shown: document.getElementById('note-modal-likes-count').textContent };
          });
          a.equal(r2.liked, false, 'opening the note does not re-like it');
          a.equal(r2.count, 0, 'count is 0, not -1 and not 1');
          a.equal(r2.shown, '0', 'modal shows 0');
          await page.evaluate(() => { closeNoteDetailModal(); });
        });
      }
    },
    {
      name: 'Like once: story likes - rapid taps are written one at a time and the owner\'s liker list holds me at most once',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me }, 'users/alice_test': { username: 'alice_test', storyLikes: { st1: ['bob_test'] } } }, async () => {
          await page.evaluate(() => {
            state.likedStoryIds = new Set();
            state.activeStory = { id: 'st1', username: 'alice_test', isUser: false, image: 'x', isLiked: false, comments: [] };
            window.__pfs.writes.length = 0;
            const btn = document.getElementById('btn-story-send-heart');
            btn.click(); btn.click(); btn.click();      // like, unlike, like
          });
          await wait(page, 350);
          let owner = await readDoc(page, 'users/alice_test');
          let mine = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(owner.storyLikes.st1.slice().sort()), JSON.stringify(['bob_test', me].sort()), 'owner list = bob + me once: ' + JSON.stringify(owner.storyLikes));
          a.equal(JSON.stringify(mine.likedStoryIds), JSON.stringify(['story_st1']), 'my story like set has it once');
          const shown = await page.evaluate(() => state.activeStory.isLiked);
          a.equal(shown, true, 'heart shows liked');
          await page.evaluate(() => { const b = document.getElementById('btn-story-send-heart'); b.click(); b.click(); });   // unlike, like
          await wait(page, 350);
          owner = await readDoc(page, 'users/alice_test');
          a.equal(owner.storyLikes.st1.filter((u) => u === me).length, 1, 'still once after unlike + like');
          await page.evaluate(() => { document.getElementById('btn-story-send-heart').click(); });  // unlike
          await wait(page, 350);
          owner = await readDoc(page, 'users/alice_test');
          mine = await readDoc(page, 'users/' + me);
          a.equal(JSON.stringify(owner.storyLikes.st1), JSON.stringify(['bob_test']), 'unlike removes only me, bob stays: ' + JSON.stringify(owner.storyLikes));
          a.equal(JSON.stringify(mine.likedStoryIds), '[]', 'my story like set is empty');
          const writesOfOwner = await page.evaluate(() => window.__pfs.writes.filter((w) => w.path === 'users/alice_test').length);
          a.ok(writesOfOwner >= 1, 'owner doc was written with array operations, not a read-modify-write');
          a.equal(await page.evaluate(() => state.likedStoryIds.size), 0, 'no negative or leftover state');
        });
      }
    },
    {
      name: 'Like once: comment and reply likes are sets of people - duplicates collapse, one tap adds or removes exactly me',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, {}, async () => {
          const r = await page.evaluate(() => {
            const me = normalizeUsername(state.currentUser.username);
            const post = { id: 'lo-c1', author: 'alice_test', authorName: 'Alice', authorAvatar: '', image: 'data:image/png;base64,AAAA', caption: 'c', tags: [], likes: 0, isLiked: false, timestamp: 'now',
              comments: [{ id: 1, user: 'bob_test', text: 'top', likedBy: ['carol_test', 'carol_test', me, me], replies: [{ id: 2, user: 'carol_test', text: 'reply', likedBy: ['bob_test', 'bob_test'] }] }] };
            state.posts.unshift(post);
            const c = () => post.comments[0];
            const o = {};
            o.countStart = likedByCount(c().likedBy);              // carol + me = 2 even though 4 entries
            toggleLikePostComment('lo-c1', 1);                      // I unlike: removes every copy of me
            o.afterUnlike = likedByCount(c().likedBy);
            o.listAfterUnlike = c().likedBy.slice();
            toggleLikePostComment('lo-c1', 1);                      // like again: adds me once
            o.afterLike = likedByCount(c().likedBy);
            o.meCopies = c().likedBy.filter((u) => u === me).length;
            toggleLikePostComment('lo-c1', 1); toggleLikePostComment('lo-c1', 1);   // double tap = net unchanged
            o.afterDouble = likedByCount(c().likedBy);
            toggleLikePostComment('lo-c1', 1, 2); o.replyLike = likedByCount(c().replies[0].likedBy);
            toggleLikePostComment('lo-c1', 1, 2); o.replyUnlike = likedByCount(c().replies[0].likedBy);
            // the same on a note
            const note = { id: 'lo-nc', author: 'alice_test', authorName: 'A', authorAvatar: '', text: 'n', time: 'now', likes: 0, comments: [{ id: 5, user: 'bob_test', text: 'x', likedBy: [me, me, me] }] };
            state.exploreNotesArchive = state.exploreNotesArchive || new Map();
            state.exploreNotesArchive.set('lo-nc', note);
            o.noteStart = likedByCount(note.comments[0].likedBy);
            toggleLikeNoteComment('lo-nc', 5); o.noteAfterUnlike = likedByCount(note.comments[0].likedBy);
            toggleLikeNoteComment('lo-nc', 5); o.noteAfterLike = likedByCount(note.comments[0].likedBy);
            state.posts = state.posts.filter((p) => p !== post);
            return o;
          });
          a.equal(r.countStart, 2, 'duplicates in likedBy count once: ' + JSON.stringify(r));
          a.equal(r.afterUnlike, 1, 'unlike removes me (carol stays)');
          a.equal(JSON.stringify(r.listAfterUnlike), JSON.stringify(['carol_test']), 'no leftover copies of me');
          a.equal(r.afterLike, 2, 'like adds exactly 1');
          a.equal(r.meCopies, 1, 'I am in the list once');
          a.equal(r.afterDouble, 2, 'double tap is net unchanged');
          a.equal(r.replyLike, 2, 'reply: bob once + me');
          a.equal(r.replyUnlike, 1, 'reply unlike removes exactly me');
          a.equal(r.noteStart, 1, 'note comment: me listed three times counts once');
          a.equal(r.noteAfterUnlike, 0, 'note comment unlike removes every copy');
          a.equal(r.noteAfterLike, 1, 'note comment like adds exactly 1');
        });
      }
    },
    {
      name: 'Like once: Explore - a post or note counts each person once across the user directory, likedBy and my own like',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, {}, async () => {
          const r = await page.evaluate(() => {
            const me = normalizeUsername(state.currentUser.username);
            const post = { id: 'lo-e1', author: 'alice_test', likes: 99, likedBy: ['bob_test', 'dora_test'] };
            const note = { id: 'lo-e2', author: 'alice_test', likes: 99, likedBy: ['bob_test'] };
            window._exploreUserDir = { at: Date.now(), users: new Map(), notes: [], likesByPost: new Map([['lo-e1', new Set(['bob_test', 'carol_test', me])]]), likesByNote: new Map([['lo-e2', new Set(['bob_test'])]]) };
            const o = {};
            // bob is in both the directory and likedBy: once. I am in the directory but have not liked it here: not counted by the directory copy.
            o.p0 = likeCountFor('post', post);
            state.likedPostIds.add('lo-e1'); o.p1 = likeCountFor('post', post);
            state.likedPostIds.delete('lo-e1');
            o.n0 = likeCountFor('note', note);
            state.likedNoteIds.add('lo-e2'); o.n1 = likeCountFor('note', note);
            state.likedNoteIds.delete('lo-e2');
            return o;
          });
          a.equal(r.p0, 3, 'bob + dora + carol = 3 (the directory copy of me is replaced by my live state): ' + JSON.stringify(r));
          a.equal(r.p1, 4, 'plus me = 4');
          a.equal(r.n0, 1, 'note: bob once');
          a.equal(r.n1, 2, 'note: plus me');
        });
      }
    },
    {
      name: 'Like once: likers arrive from the posts collection (unique names), the older customPosts mirror cannot change them, and saving a post never writes a counter or wipes likedBy',
      accounts: ['personal'],
      async run({ page, a, account }) {
        const me = account.username;
        await withMock(page, { ['users/' + me]: { username: me }, 'posts/lo-7': Object.assign(cloudPost('lo-7'), { author: account.username, likedBy: ['bob_test', 'carol_test', 'bob_test'] }) }, async () => {
          const r = await page.evaluate(async () => {
            const me = normalizeUsername(state.currentUser.username);
            const mine = { id: 'lo-7', author: me, authorName: 'Me', authorAvatar: '', image: 'data:image/png;base64,AAAA', caption: 'mine', tags: [], likes: 0, isLiked: false, timestamp: 'now', comments: [] };
            state.posts = state.posts.filter((x) => String(x.id) !== 'lo-7'); state.posts.unshift(mine);
            applyCustomPostsFromRemote([{ id: 'lo-7', author: me, likedBy: ['bob_test', 'carol_test', 'bob_test'], caption: 'mine', tags: [], comments: [] }], { fromPostDocs: true });
            const o = { fromDocs: postLikeCount(mine), list: mine.likedBy.slice() };
            applyCustomPostsFromRemote([{ id: 'lo-7', author: me, likedBy: [], caption: 'mine', tags: [], comments: [] }]);   // old mirror, no flag
            o.afterMirror = postLikeCount(mine);
            // the author re-saves the post (caption edit): the stored doc must keep likedBy and get no likes counter
            window.__pfs.writes.length = 0;
            await persistPostToFirebase(mine);
            o.saved = JSON.parse(JSON.stringify(window.__pfs.docs['posts/lo-7']));
            o.written = window.__pfs.writes.filter((w) => w.path === 'posts/lo-7').map((w) => Object.keys(w.data));
            return o;
          });
          a.equal(r.fromDocs, 2, 'bob (listed twice) + carol = 2: ' + JSON.stringify(r));
          a.equal(JSON.stringify(r.list), JSON.stringify(['bob_test', 'carol_test']), 'list collapsed to unique names');
          a.equal(r.afterMirror, 2, 'the customPosts mirror cannot change the likers');
          a.equal(JSON.stringify(r.saved.likedBy), JSON.stringify(['bob_test', 'carol_test', 'bob_test']), 'a re-save leaves the stored likedBy alone');
          a.ok(r.written.every((ks) => !ks.includes('likes') && !ks.includes('likedBy')), 'a re-save writes neither a likes counter nor likedBy: ' + JSON.stringify(r.written));
          a.equal(r.saved.likes, 7, 'the old stored counter is left as it was (nothing reads it any more)');
        });
      }
    },
    {
      name: 'Like once: no code path adds or subtracts 1 from a stored like counter (static audit of index.html)',
      accounts: ['personal'],
      async run({ a }) {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
        const bad = [];
        src.split('\n').forEach((line, i) => {
          const t = line.trim();
          if (/^\/\//.test(t) || /^\*/.test(t)) return;
          // x.likes = ... +/- 1   |   x.likes++ / --   |   likes += / -=
          if (/\.likes\s*=[^=][^;]*[+-]\s*1\b/.test(t) && !/baseLikes/.test(t)) bad.push((i + 1) + ': ' + t.slice(0, 120));
          if (/\.likes\s*(\+\+|--|\+=|-=)/.test(t)) bad.push((i + 1) + ': ' + t.slice(0, 120));
          if (/\bincrement\([^)]*\)/.test(t) && /likes/i.test(t)) bad.push((i + 1) + ': ' + t.slice(0, 120));
        });
        a.ok(bad.length === 0, 'counter arithmetic on likes found: ' + bad.join(' | '));
        // like arrays are never rewritten wholesale by the shared sync
        const m = src.match(/async function syncAllLikesToFirestore\(\)[\s\S]*?\n    \}\n/);
        a.ok(m && !/likedPostIds:|likedNoteIds:|likedStoryIds:/.test(m[0].replace(/\/\/.*$/gm, '')), 'syncAllLikesToFirestore does not write like arrays');
      }
    }
  ]
};
