'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

function installMockFirestoreScript() {
  return function installMockFirestore(opts) {
    const storeKey = '__pixly_mock_fs_v1';
    const seed = (opts && opts.seed) || null;
    if (seed) {
      localStorage.setItem(storeKey, JSON.stringify(seed));
      window.__mockFsEdgeDelayMs = 0;
      window.__mockFsHold = false;
      window.__mockFsHeldResolvers = [];
    }
    const readStore = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(storeKey) || '{}');
        return {
          users: parsed.users || {},
          edges: parsed.edges || {}
        };
      } catch (e) {
        return { users: {}, edges: {} };
      }
    };
    const writeStore = (s) => {
      localStorage.setItem(storeKey, JSON.stringify(s));
    };

    const userListeners = {};
    const edgeListeners = {};
    window.__mockFsListeners = { userListeners, edgeListeners };

    const makeDocSnap = (id, data, hasPendingWrites) => ({
      id,
      exists: () => data !== null && data !== undefined,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      metadata: { hasPendingWrites: !!hasPendingWrites }
    });

    const makeQuerySnap = (mapObj) => {
      const entries = Object.entries(mapObj || {});
      return {
        size: entries.length,
        forEach(cb) {
          entries.forEach(([id, val]) => {
            cb({ id, exists: () => true, data: () => JSON.parse(JSON.stringify(val)) });
          });
        }
      };
    };

    const emitUser = (u, overrideData, hasPendingWrites) => {
      const s = readStore();
      const d = overrideData !== undefined ? overrideData : (s.users[u] || null);
      (userListeners[u] || []).forEach((cb) => {
        try { cb(makeDocSnap(u, d, hasPendingWrites)); } catch (e) {}
      });
    };

    const emitEdges = (target, overrideEdges) => {
      const s = readStore();
      const m = overrideEdges !== undefined ? overrideEdges : (s.edges[target] || {});
      (edgeListeners[target] || []).forEach((cb) => {
        try { cb(makeQuerySnap(m)); } catch (e) {}
      });
    };

    window.__mockFsEmitStaleUser = (u, data, hasPendingWrites) => emitUser(u, data, !!hasPendingWrites);
    window.__mockFsEmitStaleEdges = (target, edgesMap) => emitEdges(target, edgesMap);
    window.__mockFsRead = readStore;
    window.__mockFsSetEdgeDelay = (ms) => { window.__mockFsEdgeDelayMs = Number(ms) || 0; };
    window.__mockFsHoldGetDoc = (hold) => {
      window.__mockFsHold = !!hold;
      if (!hold && Array.isArray(window.__mockFsHeldResolvers)) {
        const q = window.__mockFsHeldResolvers.splice(0);
        q.forEach((fn) => fn());
      }
    };

    const db = { __mock: true };
    const doc = (dbArg, ...segs) => ({ path: segs.join('/'), segs });
    const collection = (dbArg, ...segs) => ({ path: segs.join('/'), segs });

    const getDoc = async (ref) => {
      if (window.__mockFsHold) {
        await new Promise((resolve) => {
          window.__mockFsHeldResolvers = window.__mockFsHeldResolvers || [];
          window.__mockFsHeldResolvers.push(resolve);
        });
      }
      const s = readStore();
      if (ref.segs.length === 2 && ref.segs[0] === 'users') {
        const u = ref.segs[1];
        return makeDocSnap(u, s.users[u] || null, false);
      }
      if (ref.segs.length === 4 && ref.segs[0] === 'users' && ref.segs[2] === 'followers') {
        const [, t, , f] = ref.segs;
        const m = (s.edges[t] || {})[f] || null;
        return makeDocSnap(f, m, false);
      }
      return makeDocSnap(ref.segs[ref.segs.length - 1], null, false);
    };

    const getDocs = async (colRef) => {
      const s = readStore();
      if (colRef.segs.length === 1 && colRef.segs[0] === 'users') {
        return makeQuerySnap(s.users);
      }
      if (colRef.segs.length === 3 && colRef.segs[0] === 'users' && colRef.segs[2] === 'followers') {
        return makeQuerySnap(s.edges[colRef.segs[1]] || {});
      }
      return makeQuerySnap({});
    };

    const setDoc = async (ref, data, options) => {
      const writeNow = () => {
        const s = readStore();
        if (ref.segs.length === 2 && ref.segs[0] === 'users') {
          const u = ref.segs[1];
          const prev = (options && options.merge && s.users[u]) ? s.users[u] : {};
          s.users[u] = Object.assign({}, prev, JSON.parse(JSON.stringify(data)));
          writeStore(s);
          if (window.__mockFsHold) {
            // Simulate Firestore local pending-writes echo before server hydration completes
            emitUser(u, JSON.parse(JSON.stringify(data)), true);
          } else {
            emitUser(u, s.users[u], false);
          }
        } else if (ref.segs.length === 4 && ref.segs[0] === 'users' && ref.segs[2] === 'followers') {
          const [, t, , f] = ref.segs;
          s.edges[t] = s.edges[t] || {};
          s.edges[t][f] = JSON.parse(JSON.stringify(data));
          writeStore(s);
          emitEdges(t, s.edges[t]);
        }
      };
      const delay = (ref.segs.length === 4 && window.__mockFsEdgeDelayMs) ? window.__mockFsEdgeDelayMs : 0;
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      writeNow();
    };

    const deleteDoc = async (ref) => {
      const delNow = () => {
        const s = readStore();
        if (ref.segs.length === 4 && ref.segs[0] === 'users' && ref.segs[2] === 'followers') {
          const [, t, , f] = ref.segs;
          if (s.edges[t]) delete s.edges[t][f];
          writeStore(s);
          emitEdges(t, s.edges[t] || {});
        }
      };
      const delay = (ref.segs.length === 4 && window.__mockFsEdgeDelayMs) ? window.__mockFsEdgeDelayMs : 0;
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      delNow();
    };

    const onSnapshot = (ref, cb) => {
      if (ref.segs.length === 2 && ref.segs[0] === 'users') {
        const u = ref.segs[1];
        userListeners[u] = userListeners[u] || [];
        userListeners[u].push(cb);
        const fireInit = () => {
          const s = readStore();
          cb(makeDocSnap(u, s.users[u] || null, false));
        };
        if (window.__mockFsHold) {
          window.__mockFsHeldResolvers = window.__mockFsHeldResolvers || [];
          window.__mockFsHeldResolvers.push(fireInit);
        } else {
          setTimeout(fireInit, 10);
        }
        return () => {
          userListeners[u] = (userListeners[u] || []).filter((x) => x !== cb);
        };
      }
      if (ref.segs.length === 3 && ref.segs[0] === 'users' && ref.segs[2] === 'followers') {
        const t = ref.segs[1];
        edgeListeners[t] = edgeListeners[t] || [];
        edgeListeners[t].push(cb);
        const s = readStore();
        setTimeout(() => cb(makeQuerySnap(s.edges[t] || {})), 10);
        return () => {
          edgeListeners[t] = (edgeListeners[t] || []).filter((x) => x !== cb);
        };
      }
      return () => {};
    };

    const runTransaction = async (dbArg, fn) => {
      const tx = {
        get: (ref) => getDoc(ref),
        set: (ref, data, opts) => { setDoc(ref, data, opts); }
      };
      return fn(tx);
    };

    window.firebase = Object.assign({}, window.firebase || {}, {
      db, doc, collection, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, runTransaction
    });
    window.firebaseReady = true;
  };
}

async function pollNoFlicker(page, checkFn, samples = 6, intervalMs = 90) {
  const seen = [];
  for (let i = 0; i < samples; i++) {
    seen.push(await page.evaluate(checkFn));
    if (i < samples - 1) await page.waitForTimeout(intervalMs);
  }
  return seen;
}

module.exports = {
  name: 'Follow & Connections persistence',
  tests: [
    {
      name: 'UI follow/unfollow sticks across stale snapshots, reload, both profile modals, and seed creators',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#btn-user-profile-follow',
        'el:#user-stat-followers-btn',
        'el:#stat-following-btn',
        'el:#modal-following',
        'handler:toggleFollowCreator',
        'handler:applyLocalFollowToggle',
        'handler:applyFollowingFromRemote',
        'handler:writeFollowEdgeToCloud'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const me = account.username.toLowerCase();
        const installFn = installMockFirestoreScript();

        // Install mock Firestore with elena_eats (seed/discover creator) and real_creator
        await page.evaluate(installFn, {
          seed: {
            users: {
              [me]: { username: me, fullName: account.fullName, following: [] },
              elena_eats: { notifications: [], lastUpdated: 1000 },
              real_creator: { username: 'real_creator', fullName: 'Real Creator', bio: 'Real user bio', following: [], lastUpdated: 2000 }
            },
            edges: { elena_eats: {}, real_creator: {}, [me]: {} }
          }
        });

        // Clear any harness-seeded following / prior-suite account switch so we start cleanly as account
        await page.evaluate((acc) => {
          const u = acc.username.toLowerCase();
          state.following = [];
          localStorage.setItem('pixly_following_' + u, '[]');
          window._exploreUserDir = null;
          window._followingHydratedFor = null;
          window._pendingFollowingSync = null;
          window._localFollowOverrides = {};
          window._explicitUnfollowTargets = {};
          window._pendingEdgeWrites = {};
          window._lastLocalFollowingWriteTs = 0;
          window._lastLocalFollowingWriteUser = '';
          window.closeAllFirestoreListeners && window.closeAllFirestoreListeners();
          if (typeof performLogin === 'function') {
            performLogin(acc.username, acc.fullName, acc.email, null, acc.phone, acc.accountType);
          }
        }, account);
        await page.waitForTimeout(150);

        // Make edge writes slow (300ms) to expose any flicker / optimistic race
        await page.evaluate(() => window.__mockFsSetEdgeDelay(300));

        // 1. Go to Explore, load directory, and click @elena_eats in Creators to Discover
        await h.gotoMainTab(page, 'explore');
        await page.evaluate(async () => {
          if (typeof loadExploreUserDirectory === 'function') await loadExploreUserDirectory(true);
          if (typeof renderExplore === 'function') renderExplore();
        });
        await page.waitForSelector('.explore-account-card[data-username="elena_eats"]', { timeout: 5000 });
        await page.click('.explore-account-card[data-username="elena_eats"]');
        await page.waitForSelector('#btn-user-profile-follow', { timeout: 5000 });
        await page.waitForTimeout(80);

        const initialBtn = await page.textContent('#user-profile-follow-text');
        a.ok(initialBtn.trim() === 'Connect', 'elena_eats initially shows Connect, got ' + initialBtn);

        // Click Connect on @elena_eats via real UI
        await page.click('#btn-user-profile-follow');

        // Immediately inject stale/empty user doc & empty edge snapshots while edge write is in flight
        await page.evaluate((u) => {
          window.__mockFsEmitStaleUser(u, { username: u, following: [] }, false);
          window.__mockFsEmitStaleEdges('elena_eats', {});
        }, me);

        // Poll for zero flicker across 6 samples
        const elenaSamples = await pollNoFlicker(page, () => ({
          btn: (document.getElementById('user-profile-follow-text') || {}).textContent.trim(),
          conns: (document.getElementById('user-profile-followers-count') || {}).textContent.trim()
        }), 6, 80);
        a.ok(elenaSamples.every((s) => s.btn === 'Connected' && s.conns === '1'),
          'elena_eats follow never flickered across stale snapshots: ' + JSON.stringify(elenaSamples));

        // Open elena_eats Connections sheet via UI click and verify @me (You)
        await page.click('#user-stat-followers-btn');
        await page.waitForSelector('#modal-viewed-connections', { state: 'visible', timeout: 5000 });
        const elenaSheet = await page.textContent('#viewed-connections-list');
        a.ok(elenaSheet.includes('@' + me) && elenaSheet.includes('You'),
          'elena_eats Connections sheet lists @' + me + ' (You): ' + elenaSheet);
        await page.click('#btn-close-viewed-connections');

        // 2. Now open real_creator from Explore and follow via real UI
        await h.gotoMainTab(page, 'explore');
        await page.waitForSelector('.explore-account-card[data-username="real_creator"]', { timeout: 5000 });
        await page.click('.explore-account-card[data-username="real_creator"]');
        await page.waitForTimeout(80);
        await page.click('#btn-user-profile-follow');
        await page.evaluate((u) => {
          window.__mockFsEmitStaleUser(u, { username: u, following: [] }, false);
          window.__mockFsEmitStaleEdges('real_creator', {});
        }, me);
        const realSamples = await pollNoFlicker(page, () => ({
          btn: (document.getElementById('user-profile-follow-text') || {}).textContent.trim(),
          conns: (document.getElementById('user-profile-followers-count') || {}).textContent.trim()
        }), 6, 80);
        a.ok(realSamples.every((s) => s.btn === 'Connected' && s.conns === '1'),
          'real_creator follow never flickered: ' + JSON.stringify(realSamples));

        // Check own Profile Connected count & Connected modal
        await h.gotoMainTab(page, 'profile');
        await page.waitForTimeout(100);
        const ownConnectedCount = (await page.textContent('#profile-following-count')).trim();
        a.ok(ownConnectedCount === '2', 'Own profile Connected count is 2, got ' + ownConnectedCount);
        await page.click('#stat-following-btn');
        await page.waitForSelector('#modal-following', { state: 'visible', timeout: 5000 });
        const ownConnectedList = await page.textContent('#following-list-container');
        a.ok(ownConnectedList.includes('elena_eats') && ownConnectedList.includes('real_creator'),
          'Own Connected modal lists both elena_eats and real_creator: ' + ownConnectedList);
        await page.click('#btn-close-following-modal');

        // Verify mock Firestore actually wrote both edges and users/{me}.following
        const dbAfterFollow = await page.evaluate(() => window.__mockFsRead());
        a.ok(dbAfterFollow.edges.elena_eats && dbAfterFollow.edges.elena_eats[me],
          'Edge users/elena_eats/followers/' + me + ' exists in Firestore');
        a.ok(dbAfterFollow.edges.real_creator && dbAfterFollow.edges.real_creator[me],
          'Edge users/real_creator/followers/' + me + ' exists in Firestore');

        // 3. Reload the page and re-attach the same mock Firestore (without resetting its storage!)
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === "function" && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        await page.evaluate(installFn, { seed: null });
        await page.evaluate((acc) => {
          window._exploreUserDir = null;
          window._followingHydratedFor = null;
          if (typeof performLogin === 'function') {
            performLogin(acc.username, acc.fullName, acc.email, null, acc.phone, acc.accountType);
          }
        }, account);
        await page.waitForTimeout(200);

        await h.gotoMainTab(page, 'profile');
        const reloadedConnectedCount = (await page.textContent('#profile-following-count')).trim();
        a.ok(reloadedConnectedCount === '2', 'After reload, own Connected count stays 2, got ' + reloadedConnectedCount);
        await page.click('#stat-following-btn');
        await page.waitForSelector('#modal-following', { state: 'visible', timeout: 5000 });
        const reloadedModal = await page.textContent('#following-list-container');
        a.ok(reloadedModal.includes('elena_eats') && reloadedModal.includes('real_creator'),
          'After reload, own Connected modal keeps both elena_eats and real_creator');
        await page.click('#btn-close-following-modal');

        // Reopen both profiles after reload
        await h.gotoMainTab(page, 'explore');
        await page.evaluate(async () => {
          if (typeof loadExploreUserDirectory === 'function') await loadExploreUserDirectory(true);
          if (typeof renderExplore === 'function') renderExplore();
        });
        await page.click('.explore-account-card[data-username="elena_eats"]');
        await page.waitForTimeout(100);
        a.ok((await page.textContent('#user-profile-follow-text')).trim() === 'Connected',
          'Reopened elena_eats after reload shows Connected');
        a.ok((await page.textContent('#user-profile-followers-count')).trim() === '1',
          'Reopened elena_eats after reload shows 1 Connection');

        await h.gotoMainTab(page, 'explore');
        await page.click('.explore-account-card[data-username="real_creator"]');
        await page.waitForTimeout(100);
        a.ok((await page.textContent('#user-profile-follow-text')).trim() === 'Connected',
          'Reopened real_creator after reload shows Connected');
        a.ok((await page.textContent('#user-profile-followers-count')).trim() === '1',
          'Reopened real_creator after reload shows 1 Connection');

        // 4. Unfollow both via real UI with stale snapshot race & flicker polling
        await page.evaluate(() => window.__mockFsSetEdgeDelay(250));
        await page.click('#btn-user-profile-follow'); // opens disconnect confirm for real_creator
        await page.waitForSelector('#menu-disconnect-confirm:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-disconnect-confirm');
        await page.evaluate((u) => {
          window.__mockFsEmitStaleUser(u, { username: u, following: [
            { username: 'elena_eats', isFollowing: true, explicit: true },
            { username: 'real_creator', isFollowing: true, explicit: true }
          ] }, false);
          window.__mockFsEmitStaleEdges('real_creator', { [u]: { username: u, followedAt: 100 } });
        }, me);
        const unfollowRealSamples = await pollNoFlicker(page, () => ({
          btn: (document.getElementById('user-profile-follow-text') || {}).textContent.trim(),
          conns: (document.getElementById('user-profile-followers-count') || {}).textContent.trim()
        }), 6, 80);
        a.ok(unfollowRealSamples.every((s) => s.btn === 'Connect' && s.conns === '0'),
          'real_creator unfollow never flickered back: ' + JSON.stringify(unfollowRealSamples));

        await h.gotoMainTab(page, 'explore');
        await page.click('.explore-account-card[data-username="elena_eats"]');
        await page.waitForTimeout(100);
        await page.click('#btn-user-profile-follow'); // opens disconnect confirm for elena_eats
        await page.waitForSelector('#menu-disconnect-confirm:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-disconnect-confirm');
        await page.evaluate((u) => {
          window.__mockFsEmitStaleUser(u, { username: u, following: [
            { username: 'elena_eats', isFollowing: true, explicit: true }
          ] }, false);
          window.__mockFsEmitStaleEdges('elena_eats', { [u]: { username: u, followedAt: 100 } });
        }, me);
        const unfollowElenaSamples = await pollNoFlicker(page, () => ({
          btn: (document.getElementById('user-profile-follow-text') || {}).textContent.trim(),
          conns: (document.getElementById('user-profile-followers-count') || {}).textContent.trim()
        }), 6, 80);
        a.ok(unfollowElenaSamples.every((s) => s.btn === 'Connect' && s.conns === '0'),
          'elena_eats unfollow never flickered back: ' + JSON.stringify(unfollowElenaSamples));

        // Reload and verify unfollows persisted
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === "function" && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        await page.evaluate(installFn, { seed: null });
        await page.evaluate((acc) => {
          window._exploreUserDir = null;
          window._followingHydratedFor = null;
          if (typeof performLogin === 'function') {
            performLogin(acc.username, acc.fullName, acc.email, null, acc.phone, acc.accountType);
          }
        }, account);
        await page.waitForTimeout(200);

        await h.gotoMainTab(page, 'profile');
        a.ok((await page.textContent('#profile-following-count')).trim() === '0',
          'After unfollow + reload, own Connected count is 0');
        await h.gotoMainTab(page, 'explore');
        await page.evaluate(async () => {
          if (typeof loadExploreUserDirectory === 'function') await loadExploreUserDirectory(true);
          if (typeof renderExplore === 'function') renderExplore();
        });
        await page.click('.explore-account-card[data-username="elena_eats"]');
        await page.waitForTimeout(80);
        a.ok((await page.textContent('#user-profile-follow-text')).trim() === 'Connect' &&
             (await page.textContent('#user-profile-followers-count')).trim() === '0',
          'After unfollow + reload, elena_eats shows Connect and 0 Connections');
        await page.evaluate(() => window.__mockFsSetEdgeDelay(0));
      }
    },
    {
      name: 'Fresh login before hydration unions local follow with cloud list & writes edge immediately (and never deletes edges without explicit unfollow)',
      accounts: ['personal'],
      covers: ['handler:applyFollowingFromRemote', 'handler:flushPendingFollowEdges', 'handler:syncFollowerDocsFromFollowing'],
      async run(ctx) {
        const { page, h, a } = ctx;
        const installFn = installMockFirestoreScript();

        // Install mock Firestore for bradley_hansen with existing cloud follow cloud_friend, and hold getDoc pending
        await page.evaluate(installFn, {
          seed: {
            users: {
              bradley_hansen: {
                username: 'bradley_hansen',
                fullName: 'Bradley Hansen',
                following: [{ id: 100, username: 'cloud_friend', fullName: 'Cloud Friend', isFollowing: true, explicit: true, followedAt: 1000 }]
              },
              elena_eats: { notifications: [] },
              cloud_friend: { username: 'cloud_friend', fullName: 'Cloud Friend', following: [] }
            },
            edges: { elena_eats: {}, cloud_friend: { bradley_hansen: { username: 'bradley_hansen', followedAt: 1000 } } }
          }
        });

        await page.evaluate(() => {
          localStorage.removeItem('pixly_following_bradley_hansen');
          window._followingHydratedFor = null;
          window._pendingFollowingSync = null;
          window._localFollowOverrides = {};
          window._explicitUnfollowTargets = {};
          window._pendingEdgeWrites = {};
          window._lastLocalFollowingWriteTs = 0;
          window._lastLocalFollowingWriteUser = '';
          window.__mockFsSetEdgeDelay(0);
          window.closeAllFirestoreListeners && window.closeAllFirestoreListeners();
          window.__mockFsHoldGetDoc(true);
          if (typeof performLogin === 'function') {
            performLogin('bradley_hansen', 'Bradley Hansen', 'bradley.g.hansen@hotmail.com', null, '+1 (609) 289-6702', 'personal');
          }
        });
        await page.waitForTimeout(100);

        // Follow elena_eats BEFORE hydration resolves!
        await page.evaluate(() => { if (typeof viewUserProfile === 'function') viewUserProfile('elena_eats'); });
        await page.waitForSelector('#btn-user-profile-follow', { timeout: 5000 });
        await page.click('#btn-user-profile-follow');

        const preHydrationState = await page.evaluate(() => ({
          pending: window._pendingFollowingSync, hydrated: window._followingHydratedFor, cur: state.currentUser && state.currentUser.username,
          btn: (document.getElementById('user-profile-follow-text') || {}).textContent.trim(),
          db: window.__mockFsRead()
        }));
        a.ok(preHydrationState.pending === 'bradley_hansen', 'Pre-hydration follow marks _pendingFollowingSync: ' + JSON.stringify({ pending: preHydrationState.pending, hydrated: preHydrationState.hydrated, cur: preHydrationState.cur, btn: preHydrationState.btn }));
        a.ok(preHydrationState.btn === 'Connected', 'Pre-hydration button shows Connected immediately');
        a.ok(Boolean(preHydrationState.db.edges.elena_eats && preHydrationState.db.edges.elena_eats.bradley_hansen),
          'Edge users/elena_eats/followers/bradley_hansen was written immediately even before hydration finished');

        // Now resolve cloud hydration (cloud_friend in Firestore must union with elena_eats, NOT overwrite!)
        await page.evaluate(() => window.__mockFsHoldGetDoc(false));
        await page.waitForTimeout(250);

        const postHydration = await page.evaluate(() => ({
          btn: (document.getElementById('user-profile-follow-text') || {}).textContent.trim(),
          conns: (document.getElementById('user-profile-followers-count') || {}).textContent.trim(),
          following: (state.following || []).filter((f) => f && f.isFollowing !== false).map((f) => f.username),
          db: window.__mockFsRead()
        }));
        a.ok(postHydration.btn === 'Connected' && postHydration.conns === '1',
          'After hydration resolves, elena_eats stays Connected with 1 Connection: ' + JSON.stringify(postHydration));
        a.ok(postHydration.following.includes('elena_eats') && postHydration.following.includes('cloud_friend'),
          'Union keeps both cloud_friend and elena_eats: ' + JSON.stringify(postHydration.following));
        a.ok((postHydration.db.users.bradley_hansen.following || []).some((f) => f.username === 'elena_eats' && f.isFollowing !== false),
          'Flushed union to users/bradley_hansen.following in Firestore');

        // Verify persistState() without explicit unfollow NEVER deletes cloud_friend edge
        await page.evaluate(() => {
          state.following = [];
          if (typeof persistState === 'function') persistState();
        });
        await page.waitForTimeout(100);
        const afterNonExplicit = await page.evaluate(() => window.__mockFsRead());
        a.ok(Boolean(afterNonExplicit.edges.cloud_friend && afterNonExplicit.edges.cloud_friend.bradley_hansen),
          'No edge deletion occurred without an explicit unfollow');

        // Restore clean reg_personal page state for subsequent coverage tests
        await page.evaluate(() => localStorage.removeItem('__pixly_mock_fs_v1'));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
        await h.installAppStubs(page);
        await h.loginAs(page, h.ACCOUNTS.personal);
      }
    }
  ]
};
