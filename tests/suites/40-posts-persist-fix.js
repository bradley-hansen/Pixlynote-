'use strict';

/**
 * Custom posts, Connections, and phone must survive hard reload, Firestore
 * hydration, and pull-to-refresh. An empty cloud snapshot or a refresh that
 * runs persist/login before local data is loaded must not paint 0 POSTS / 0
 * CONNECTIONS or blank a stored phone.
 */

const AV = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PHONE = '+1 (202) 555-0187';
const POST_A = 1795000000001;
const POST_B = 1795000000002;

function samplePosts(username) {
  return [
    { id: POST_A, author: username, authorName: 'Persist One', caption: 'Persist post one', image: AV, likes: 0, comments: [], tags: [], timestamp: 'JUST NOW', location: '' },
    { id: POST_B, author: username, authorName: 'Persist Two', caption: 'Persist post two', image: AV, likes: 0, comments: [], tags: [], timestamp: 'JUST NOW', location: '' }
  ];
}

function hasFixtureIds(got) {
  const ids = (got || []).map((x) => Number(x));
  return ids.includes(POST_A) && ids.includes(POST_B);
}

function stampAll(page, posts, phone, follower) {
  return page.evaluate((payload) => {
    const u = state.currentUser;
    const name = normalizeUsername(u.username);
    window._pixlyCustomPostsHydratedFor = name;
    payload.posts.forEach((p) => {
      if (!state.posts.some((e) => String(e.id) === String(p.id))) state.posts.unshift(p);
    });
    u.phone = payload.phone;
    u.email = u.email || 'persist@example.test';
    if (typeof persistState === 'function') persistState();
    if (payload.follower) {
      localStorage.setItem('pixly_followers_' + name, JSON.stringify([payload.follower]));
      localStorage.setItem('pixly_followers_cloud_' + name, '1');
      if (typeof applyFollowersCloudSnapshot === 'function') {
        applyFollowersCloudSnapshot(name, [payload.follower], { fromCache: false });
      } else if (state.currentUser) {
        state.currentUser.followersCount = '1';
      }
    }
    if (!Array.isArray(state.following) || state.following.filter((f) => f && f.isFollowing).length < 2) {
      state.following = [
        { username: 'elena_eats', fullName: 'Elena', isFollowing: true },
        { username: 'gemini.bughunter', fullName: 'Gemini', isFollowing: true }
      ];
    }
    if (typeof renderProfile === 'function') renderProfile();
  }, { posts, phone, follower });
}

function snapshotAll() {
  return `(function () {
    const u = state.currentUser || {};
    const name = normalizeUsername(u.username || '');
    const mine = (state.posts || []).filter((p) => normalizeUsername(p.author) === name && Number(p.id) > 1000);
    const key = (typeof getAccountStorageKey === 'function') ? getAccountStorageKey('pixly_custom_posts', name) : ('pixly_custom_posts_' + name);
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) { stored = []; }
    let followers = [];
    try { followers = JSON.parse(localStorage.getItem('pixly_followers_' + name) || '[]') || []; } catch (e) { followers = []; }
    const vis = (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      return !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
    };
    const connected = (typeof getFollowingDisplayCount === 'function')
      ? getFollowingDisplayCount()
      : (state.following || []).filter((f) => f && f.isFollowing !== false).length;
    const connections = (typeof getFollowersDisplayCount === 'function')
      ? getFollowersDisplayCount()
      : followers.length;
    return {
      isLoggedIn: !!state.isLoggedIn,
      username: name,
      phone: u.phone || '',
      ids: mine.map((p) => p.id).sort(),
      storedIds: (Array.isArray(stored) ? stored : []).map((p) => p.id).sort(),
      connections,
      connected,
      followerNames: (Array.isArray(followers) ? followers : []).map((f) => f && f.username).filter(Boolean).sort(),
      postCountEl: (document.getElementById('profile-post-count') || {}).textContent || '',
      connectionsEl: (document.getElementById('profile-followers-count') || {}).textContent || '',
      connectedEl: (document.getElementById('profile-following-count') || {}).textContent || '',
      splash: vis('splash-container') && vis('auth-view'),
      main: vis('main-view')
    };
  })()`;
}

const follower = { username: 'gemini.bughunter', fullName: 'Gemini Bughunter', id: 1795363495991 };

module.exports = {
  name: 'Posts, connections, and phone persist through reload and refresh',
  tests: [
    {
      name: 'Posts persist: Unit: persistState does not overwrite stored custom posts with an empty array before hydration',
      accounts: ['personal'],
      covers: ['handler:persistState', 'handler:loadPersistedState'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const posts = samplePosts(account.username);
        const unit = await page.evaluate((payload) => {
          const u = normalizeUsername(payload.username || state.currentUser.username);
          const key = getAccountStorageKey('pixly_custom_posts', u);
          localStorage.setItem(key, JSON.stringify(payload.list));
          window._pixlyCustomPostsHydratedFor = 'other_account';
          state.posts = (state.posts || []).filter((p) => Number(p.id) <= 1000);
          persistState();
          const stored = JSON.parse(localStorage.getItem(key) || '[]');
          window._pixlyCustomPostsHydratedFor = u;
          return {
            ids: (Array.isArray(stored) ? stored : []).map((p) => p.id).sort(),
            len: Array.isArray(stored) ? stored.length : -1
          };
        }, { list: posts, username: account.username });
        a.equal(unit.len, 2, 'Stored custom posts were not replaced with an empty array: ' + JSON.stringify(unit));
        a.equal(JSON.stringify(unit.ids), JSON.stringify([POST_A, POST_B]), 'Both stored post ids remain');
      }
    },
    {
      name: 'Posts persist: Unit: an empty followers snapshot does not wipe a local Connections list',
      accounts: ['personal'],
      covers: ['handler:applyFollowersCloudSnapshot', 'handler:getFollowersDisplayCount'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const unit = await page.evaluate((payload) => {
          const u = normalizeUsername(payload.username);
          localStorage.setItem('pixly_followers_' + u, JSON.stringify([payload.follower]));
          localStorage.setItem('pixly_followers_cloud_' + u, '1');
          const emptyCache = applyFollowersCloudSnapshot(u, [], { fromCache: true });
          const afterCache = JSON.parse(localStorage.getItem('pixly_followers_' + u) || '[]');
          const emptyServer = applyFollowersCloudSnapshot(u, [], { fromCache: false });
          const afterServer = JSON.parse(localStorage.getItem('pixly_followers_' + u) || '[]');
          const restored = applyFollowersCloudSnapshot(u, [payload.follower], { fromCache: false });
          return {
            emptyCache,
            afterCacheLen: afterCache.length,
            afterCacheName: afterCache[0] && afterCache[0].username,
            emptyServer,
            afterServerLen: afterServer.length,
            restored: restored.count,
            display: getFollowersDisplayCount()
          };
        }, { username: account.username, follower });
        a.equal(unit.afterCacheLen, 1, 'Cached empty snapshot kept the local follower: ' + JSON.stringify(unit));
        a.equal(unit.afterCacheName, 'gemini.bughunter', 'Kept follower username');
        a.ok(unit.emptyCache && unit.emptyCache.keptLocal, 'Cache miss is reported as keptLocal');
        a.equal(unit.afterServerLen, 1, 'An empty server snapshot does not wipe a non-empty Connections list: ' + JSON.stringify(unit));
        a.ok(unit.display >= 1, 'Connections count stays at least 1');
      }
    },
    {
      name: 'Posts persist: E2E: custom posts, Connections, Connected, and phone survive a hard reload (personal)',
      accounts: ['personal'],
      covers: ['handler:performLogin', 'handler:persistState', 'handler:loadPersistedState', 'el:#profile-post-count', 'el:#profile-followers-count', 'el:#profile-following-count', 'el:#edit-profile-phone', 'el:#main-view'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const posts = samplePosts(account.username);
        await stampAll(page, posts, PHONE, follower);
        const before = await page.evaluate(snapshotAll());
        a.equal(before.isLoggedIn, true, 'Signed in before reload');
        a.ok(hasFixtureIds(before.ids), 'Both fixture posts are in memory before reload: ' + JSON.stringify(before));
        a.equal(before.phone, PHONE, 'Phone is stamped before reload');
        a.ok(before.connections >= 1, 'Connections is at least 1 before reload');
        a.ok(before.connected >= 1, 'Connected is at least 1 before reload');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        const after = await page.evaluate(snapshotAll());
        a.equal(after.isLoggedIn, true, 'Session survives hard reload: ' + JSON.stringify(after));
        a.equal(after.splash, false, 'Hard reload does not return to Join Pixlynote');
        a.ok(hasFixtureIds(after.ids), 'Both custom posts survive hard reload: ' + JSON.stringify(after));
        a.ok(Number(after.postCountEl) >= 2, 'Profile Posts count stays at least 2 after hard reload: ' + after.postCountEl);
        a.equal(after.phone, PHONE, 'Phone survives hard reload: ' + JSON.stringify(after));
        a.ok(after.connections >= 1, 'Connections survive hard reload: ' + JSON.stringify(after));
        a.ok(after.connected >= 1, 'Connected survives hard reload (does not drop to 0): ' + JSON.stringify(after));
      }
    },
    {
      name: 'Posts persist: E2E: custom posts survive a hard reload (business)',
      accounts: ['business'],
      covers: ['handler:performLogin', 'handler:persistState', 'handler:loadPersistedState', 'el:#profile-post-count'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const posts = samplePosts(account.username);
        await stampAll(page, posts, PHONE, follower);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        const after = await page.evaluate(snapshotAll());
        a.equal(after.isLoggedIn, true, 'Business session survives hard reload: ' + JSON.stringify(after));
        a.ok(hasFixtureIds(after.ids), 'Business custom posts survive hard reload: ' + JSON.stringify(after));
        a.ok(Number(after.postCountEl) >= 2, 'Business Posts count stays at least 2: ' + after.postCountEl);
        a.equal(after.phone, PHONE, 'Business phone survives hard reload');
      }
    },
    {
      name: 'Posts persist: E2E: pull-to-refresh and hydration keep posts, Connections, and phone',
      accounts: ['personal'],
      covers: ['handler:applyPullRefreshData', 'handler:triggerRefreshRoutine', 'handler:applyFollowersCloudSnapshot', 'handler:hydrateOwnPostsFromCollection', 'handler:applyActiveUserDocData', 'el:#profile-post-count', 'el:#profile-followers-count'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const posts = samplePosts(account.username);
        await stampAll(page, posts, PHONE, follower);
        const before = await page.evaluate(snapshotAll());
        a.ok(hasFixtureIds(before.ids), 'Stamped posts before refresh');
        a.equal(before.phone, PHONE, 'Stamped phone before refresh');
        a.ok(before.connections >= 1, 'Stamped Connections before refresh');

        // Simulate a late empty hydration + the pull-to-refresh path that used
        // to paint 0 POSTS / 0 CONNECTIONS.
        const after = await page.evaluate(async (payload) => {
          const u = normalizeUsername(state.currentUser.username);
          if (typeof applyFollowersCloudSnapshot === 'function') {
            applyFollowersCloudSnapshot(u, [], { fromCache: true });
          }
          if (typeof applyActiveUserDocData === 'function') {
            applyActiveUserDocData(u, {
              username: u,
              phone: '',
              email: '',
              customPosts: [],
              deletedPostIds: [],
              following: state.following
            }, false);
          }
          if (typeof applyCustomPostsFromRemote === 'function') applyCustomPostsFromRemote([]);
          if (typeof applyPullRefreshData === 'function') await applyPullRefreshData();
          else if (typeof triggerRefreshRoutine === 'function') triggerRefreshRoutine();
          const snap = (function () {
            const name = normalizeUsername((state.currentUser && state.currentUser.username) || '');
            const mine = (state.posts || []).filter((p) => normalizeUsername(p.author) === name && Number(p.id) > 1000);
            let followers = [];
            try { followers = JSON.parse(localStorage.getItem('pixly_followers_' + name) || '[]') || []; } catch (e) { followers = []; }
            return {
              ids: mine.map((p) => p.id).sort(),
              phone: (state.currentUser && state.currentUser.phone) || '',
              connections: (typeof getFollowersDisplayCount === 'function') ? getFollowersDisplayCount() : followers.length,
              connected: (typeof getFollowingDisplayCount === 'function') ? getFollowingDisplayCount() : 0,
              postCountEl: (document.getElementById('profile-post-count') || {}).textContent || '',
              connectionsEl: (document.getElementById('profile-followers-count') || {}).textContent || ''
            };
          })();
          return snap;
        }, { posts, follower });

        a.ok(hasFixtureIds(after.ids), 'Refresh/hydration kept both posts: ' + JSON.stringify(after));
        a.ok(Number(after.postCountEl) >= 2, 'Posts count stays at least 2 after refresh: ' + after.postCountEl);
        a.equal(after.phone, PHONE, 'Refresh/hydration does not blank the phone: ' + JSON.stringify(after));
        a.ok(after.connections >= 1, 'Refresh/hydration does not zero Connections: ' + JSON.stringify(after));
        a.ok(after.connected >= 1, 'Refresh keeps Connected (does not drop to 0): ' + JSON.stringify(after));
      }
    }
  ]
};
