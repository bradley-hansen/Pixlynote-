'use strict';

/**
 * Always-full story bar.
 * Order: own bubble, connections with unviewed live stories, other public users with unviewed live stories,
 * viewed stories (both groups), then no-story filler. Filler only appears while the bar is under
 * STORY_BAR_MIN_BUBBLES. Fake directory data is injected in the page; nothing is written to Firestore.
 */

const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const TINY_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Runs in the page. spec: { following: [u], users: [{ username, story, closeFriends, isPrivate, deactivated, lastUpdated, noStoryInDir }], blocks, mutes, viewed: [u], cfMembers: {author: [users]} }
function setupBar(spec) {
  const me = normalizeUsername(state.currentUser.username);
  if (!window.__sbfSnap) window.__sbfSnap = {
    dir: window._exploreUserDir,
    following: state.following,
    stories: state.stories,
    blocks: (typeof _privacyLists !== 'undefined') ? (_privacyLists.blocks || []).slice() : [],
    mutes: (typeof _privacyLists !== 'undefined') ? (_privacyLists.mutes || []).slice() : [],
    content: window._storyFillContent,
    count: window._storyFillHydrateCount,
    seed: window._storyFillSeed
  };
  window._storyFillContent = {};
  window._storyFillHydrateCount = 0;
  window._storyFillSeed = spec.seed || 'test-seed';
  const now = Date.now();
  const mkStory = (u, i, extra) => Object.assign({ id: u + '-s' + i, image: spec.img, caption: u + ' story', timestamp: now - 600000 - i * 1000, time: '10m ago', audience: 'everyone' }, extra || {});
  state.following = (spec.following || []).map((u, i) => ({ id: 900 + i, username: u, fullName: u, isFollowing: true, explicit: true, followedAt: now }));
  const m = new Map();
  (spec.users || []).forEach((x) => {
    const stories = (x.story && !x.noStoryInDir) ? [mkStory(x.username, 1, x.closeFriends ? { audience: 'closeFriends' } : {})] : [];
    m.set(x.username, {
      username: x.username, fullName: x.username, avatar: spec.img, accountType: 'personal',
      isPrivate: x.isPrivate === true, deactivated: x.deactivated === true,
      userStories: stories, story: stories.length ? stories[0] : null,
      lastUpdated: x.lastUpdated || 0, following: [], likedPostIds: [], likedNoteIds: [], deletedNoteIds: new Set(), followersCount: 0, followingCount: 0
    });
  });
  window._exploreUserDir = { at: now, users: m, notes: [], posts: [] };
  ensurePrivacyListsLoaded();
  _privacyLists.blocks = (spec.blocks || []).slice();
  _privacyLists.mutes = (spec.mutes || []).slice();
  Object.keys(spec.cfMembers || {}).forEach((author) => seedPeerCloseFriends(author, spec.cfMembers[author]));
  try { localStorage.removeItem('pixly_viewed_stories_' + storyViewerKey()); } catch (e) {}
  (spec.viewed || []).forEach((u) => markStoryViewed({ id: u + '-s1', author: u, username: u }));
  return me;
}

function teardownBar() {
  const s = window.__sbfSnap;
  if (!s) return;
  window._exploreUserDir = s.dir;
  state.following = s.following;
  state.stories = s.stories;
  if (typeof _privacyLists !== 'undefined') { _privacyLists.blocks = s.blocks; _privacyLists.mutes = s.mutes; }
  window._storyFillContent = s.content || {};
  window._storyFillHydrateCount = s.count || 0;
  window._storyFillSeed = s.seed;
  try { localStorage.removeItem('pixly_viewed_stories_' + storyViewerKey()); } catch (e) {}
  window.__sbfSnap = null;
  try { renderStories(); } catch (e) {}
}

function readBar() {
  return Array.from(document.querySelectorAll('#stories-container .story-trigger')).map((el) => ({
    user: (el.getAttribute('data-story-user') || '').replace(/^@/, '').toLowerCase(),
    kind: el.getAttribute('data-story-kind'),
    ring: ((el.querySelector('[data-story-ring]') || {}).getAttribute('data-story-ring') || '')
  }));
}

async function mobile(page, h) {
  await page.setViewportSize({ width: 390, height: 844 });
  await h.gotoMainTab(page, 'feed');
}

async function render(page, spec) {
  await page.evaluate(setupBar, Object.assign({ img: TINY_IMG }, spec));
  await page.evaluate(() => renderStories());
  return page.evaluate(readBar);
}

const pub = (n, story) => ({ username: n, story: !!story });

module.exports = {
  name: 'Always-full story bar',
  tests: [
    {
      name: 'Story bar fill: order is own, unviewed connections, unviewed public users, viewed, then filler; exclusions hold',
      accounts: ['personal'],
      covers: ['el:#stories-container', 'handler:storyBarDiscoverEntries', 'handler:buildDiscoverStoryEntries', 'handler:storyFillCandidates', 'handler:sortFeedStoriesByViewed'],
      async run({ page, h, a, account }) {
        await mobile(page, h);
        try {
          const users = [
            pub('conn_a', true), pub('conn_b', true), pub('conn_quiet', false),
            pub('disc_a', true), pub('disc_b', true),
            { username: 'cf_member', story: true, closeFriends: true },
            { username: 'cf_outsider', story: true, closeFriends: true },
            { username: 'priv_story', story: true, isPrivate: true },
            { username: 'priv_quiet', story: false, isPrivate: true },
            pub('blocked_story', true), pub('muted_story', true),
            { username: 'deact_story', story: true, deactivated: true },
            { username: 'deact_quiet', story: false, deactivated: true },
            pub(account.username, true),
            pub('pixai', false),
            pub('q1'), pub('q2'), pub('q3'), pub('q4'), pub('q5'), pub('q6'), pub('q7'), pub('q8')
          ];
          const bar = await render(page, {
            following: ['conn_a', 'conn_b', 'conn_quiet'],
            users, blocks: ['blocked_story'], mutes: ['muted_story'],
            viewed: ['conn_b', 'disc_b'],
            cfMembers: { cf_member: [account.username], cf_outsider: ['someone_else'] }
          });
          const names = bar.map((x) => x.user);
          const min = await page.evaluate(() => STORY_BAR_MIN_BUBBLES);
          a.equal(bar.length, min, 'bar is filled to the minimum: ' + JSON.stringify(bar));
          a.equal(bar[0].kind, 'own', 'own bubble is far left');
          a.equal(bar.filter((x) => x.kind !== 'own' && (x.user === account.username || x.user === 'your story')).length, 0, 'viewer is not in the bar a second time: ' + JSON.stringify(names));
          a.equal(bar.filter((x) => x.kind === 'own').length, 1, 'exactly one own bubble');
          // group order: connection unviewed < discover unviewed < viewed < filler
          const kinds = bar.map((x) => x.kind + ':' + x.ring);
          const firstOf = (pred) => bar.findIndex(pred);
          const lastOf = (pred) => { let r = -1; bar.forEach((x, i) => { if (pred(x)) r = i; }); return r; };
          const connUnv = bar.filter((x) => x.kind === 'connected' && x.ring === 'unviewed').map((x) => x.user);
          a.equal(JSON.stringify(connUnv), JSON.stringify(['conn_a']), 'unviewed connection shown: ' + JSON.stringify(kinds));
          const discUnv = bar.filter((x) => x.kind === 'discover' && x.ring === 'unviewed').map((x) => x.user).sort();
          a.equal(JSON.stringify(discUnv), JSON.stringify(['cf_member', 'disc_a']), 'unviewed public users with live stories (incl. close-friends story I am a member of): ' + JSON.stringify(bar));
          a.ok(lastOf((x) => x.kind === 'connected' && x.ring === 'unviewed') < firstOf((x) => x.kind === 'discover' && x.ring === 'unviewed'), 'unviewed connections come before unviewed public users');
          const viewed = bar.filter((x) => x.ring === 'viewed').map((x) => x.user).sort();
          a.equal(JSON.stringify(viewed), JSON.stringify(['conn_b', 'disc_b']), 'viewed stories from both groups: ' + JSON.stringify(bar));
          a.ok(lastOf((x) => x.kind === 'discover' && x.ring === 'unviewed') < firstOf((x) => x.ring === 'viewed'), 'unviewed discover before viewed');
          const fills = bar.filter((x) => x.kind === 'fill');
          a.equal(fills.length, 2, 'two no-story fillers complete the bar: ' + JSON.stringify(bar));
          a.ok(firstOf((x) => x.kind === 'fill') > lastOf((x) => x.ring === 'viewed'), 'filler is after viewed stories');
          a.ok(fills.every((x) => x.ring === 'none'), 'filler has no ring');
          ['conn_quiet', 'priv_story', 'priv_quiet', 'blocked_story', 'muted_story', 'deact_story', 'deact_quiet', 'pixai'].forEach((n) => {
            a.ok(!names.includes(n), n + ' must not be in the bar: ' + JSON.stringify(names));
          });
          // cf_outsider is a public account whose only story is Close Friends: never as a story bubble
          const cfo = bar.find((x) => x.user === 'cf_outsider');
          a.ok(!cfo || cfo.kind === 'fill', 'close-friends-only story is never shown to a non-member');
          a.ok(!names.includes('conn_quiet'), 'a connection without a live story never appears as filler');
          a.ok(!names.some((n) => ['elena_eats', 'city_vibe', 'marcus_pups', 'arch_digest', 'wander_tropics'].includes(n)), 'no seed demo accounts');
        } finally {
          await page.evaluate(teardownBar);
        }
      }
    },
    {
      name: 'Story bar fill: the minimum is a constant, own bubble counts, and random users drop off as connections post',
      accounts: ['personal'],
      covers: ['el:#stories-container'],
      async run({ page, h, a }) {
        await mobile(page, h);
        const MIN = await page.evaluate(() => STORY_BAR_MIN_BUBBLES);
        a.equal(MIN, 8, 'minimum is 8');
        try {
          const strangers = []; for (let i = 0; i < 20; i++) strangers.push(pub('stranger_' + i, i % 2 === 0));
          const conns = (n) => { const l = []; for (let i = 0; i < n; i++) l.push('c' + i); return l; };
          const connUsers = (n) => conns(n).map((u) => pub(u, true));
          const counts = [];
          for (const n of [0, 3, 6, 7, 9]) {
            const bar = await render(page, { following: conns(n), users: connUsers(n).concat(strangers) });
            counts.push({ n, total: bar.length, connected: bar.filter((x) => x.kind === 'connected').length, extra: bar.filter((x) => x.kind === 'discover' || x.kind === 'fill').length });
          }
          a.equal(JSON.stringify(counts.map((c) => c.total)), JSON.stringify([8, 8, 8, 8, 10]), 'bar stays at 8 until connections alone exceed it: ' + JSON.stringify(counts));
          a.equal(JSON.stringify(counts.map((c) => c.extra)), JSON.stringify([7, 4, 1, 0, 0]), 'random users drop off as connections grow: ' + JSON.stringify(counts));
          // live stories are preferred: 10 strangers have stories, need is 7 -> no filler at all
          const bar0 = await render(page, { following: [], users: strangers });
          a.equal(bar0.filter((x) => x.kind === 'fill').length, 0, 'enough live stories means no no-story filler: ' + JSON.stringify(bar0));
          a.equal(bar0.filter((x) => x.kind === 'discover').length, 7, 'live public stories fill the bar');
          // only 2 live, rest filler
          const few = [pub('live_1', true), pub('live_2', true)].concat(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'].map((n) => pub(n)));
          const bar1 = await render(page, { following: [], users: few });
          a.equal(bar1.filter((x) => x.kind === 'discover').length, 2, 'both live stories shown');
          a.equal(bar1.filter((x) => x.kind === 'fill').length, 5, 'filler covers the rest');
          a.ok(bar1.findIndex((x) => x.kind === 'fill') > bar1.map((x) => x.kind).lastIndexOf('discover'), 'filler after live stories');
          // fewer candidates than slots: show what exists
          const tiny = await render(page, { following: [], users: [pub('only_one')] });
          a.equal(tiny.length, 2, 'bar is own + the one candidate, no padding with invented users: ' + JSON.stringify(tiny));
        } finally {
          await page.evaluate(teardownBar);
        }
      }
    },
    {
      name: 'Story bar fill: choice is stable across re-renders and viewing a story keeps it in the bar',
      accounts: ['personal'],
      covers: ['el:#stories-container'],
      async run({ page, h, a }) {
        await mobile(page, h);
        try {
          const users = []; for (let i = 0; i < 15; i++) users.push(pub('u' + i, i < 4));
          const first = await render(page, { following: [], users });
          await page.evaluate(() => { renderStories(); renderStories(); });
          const again = await page.evaluate(readBar);
          a.equal(JSON.stringify(again), JSON.stringify(first), 'same bubbles in the same order on re-render');
          const someLive = first.find((x) => x.kind === 'discover');
          await page.evaluate((u) => { markStoryViewed({ id: u + '-s1', author: u, username: u }); renderStories(); }, someLive.user);
          const after = await page.evaluate(readBar);
          const moved = after.find((x) => x.user === someLive.user);
          a.ok(moved && moved.ring === 'viewed', 'viewed story stays in the bar with a gray ring: ' + JSON.stringify(after));
          a.equal(after.length, first.length, 'bar size unchanged');
        } finally {
          await page.evaluate(teardownBar);
        }
      }
    },
    {
      name: 'Story bar fill: tapping filler opens the profile; tapping a public live story opens the viewer with viewer controls',
      accounts: ['personal'],
      covers: ['el:#stories-container', 'handler:openStoryViewer'],
      async run({ page, h, a }) {
        await mobile(page, h);
        try {
          const users = [pub('live_pub', true), pub('quiet_pub')];
          const bar = await render(page, { following: [], users });
          a.ok(bar.some((x) => x.user === 'live_pub' && x.kind === 'discover'), 'live public user in bar');
          await page.click('#stories-container .story-trigger[data-story-user="live_pub"]');
          await page.waitForSelector('#modal-story-viewer:not(.hidden)', { timeout: 4000 });
          const sv = await page.evaluate(() => ({
            user: document.getElementById('story-viewer-username').textContent.trim(),
            viewerControls: !document.getElementById('story-viewer-controls').classList.contains('hidden'),
            ownerControls: !document.getElementById('story-owner-controls').classList.contains('hidden')
          }));
          a.equal(sv.user, 'live_pub', 'viewer shows that user');
          a.ok(sv.viewerControls && !sv.ownerControls, 'viewer (not owner) controls');
          await page.click('#btn-close-story');
          await page.waitForTimeout(100);
          const afterClose = await page.evaluate(readBar);
          a.equal((afterClose.find((x) => x.user === 'live_pub') || {}).ring, 'viewed', 'ring turns gray after viewing');
          await page.click('#stories-container .story-trigger[data-story-user="quiet_pub"]');
          await page.waitForTimeout(300);
          const prof = await page.evaluate(() => ({
            viewer: !document.getElementById('modal-story-viewer').classList.contains('hidden'),
            viewed: state.viewedCreator && state.viewedCreator.username,
            tab: state.activeTab
          }));
          a.ok(!prof.viewer, 'no story viewer for filler');
          a.equal(String(prof.viewed || '').toLowerCase(), 'quiet_pub', 'profile of the filler user opened: ' + JSON.stringify(prof));
        } finally {
          await page.evaluate(() => { try { if (typeof closeUserProfileModal === 'function') closeUserProfileModal(); } catch (e) {} });
          await h.gotoMainTab(page, 'feed');
          await page.evaluate(teardownBar);
        }
      }
    },
    {
      name: 'Story bar fill: only cloud data is used for other people (no device copies, no demo stories)',
      accounts: ['personal'],
      covers: ['handler:collectActiveStoriesForUser'],
      async run({ page, h, a }) {
        await mobile(page, h);
        try {
          await page.evaluate((img) => {
            localStorage.setItem('pixly_user_stories_local_only', JSON.stringify([{ id: 'lo-1', image: img, timestamp: Date.now() - 60000 }]));
          }, TINY_IMG);
          const bar = await render(page, { following: [], users: [pub('local_only'), pub('elena_eats'), pub('plain')] });
          const lo = bar.find((x) => x.user === 'local_only');
          a.ok(lo && lo.kind === 'fill', 'a story saved on this device for another account is not shown as theirs: ' + JSON.stringify(bar));
          a.ok(!bar.some((x) => x.user === 'elena_eats'), 'seed demo account is not used');
          const direct = await page.evaluate(() => ({
            remoteOnly: collectActiveStoriesForUser('local_only', { remoteOnly: true }).length,
            normal: collectActiveStoriesForUser('local_only').length
          }));
          a.equal(direct.remoteOnly, 0, 'remoteOnly ignores the device copy');
          a.equal(direct.normal, 1, 'default behavior for connections is unchanged');
        } finally {
          await page.evaluate(() => localStorage.removeItem('pixly_user_stories_local_only'));
          await page.evaluate(teardownBar);
        }
      }
    },
    {
      name: 'Story bar fill: stories that live in users/{u}/content/profile are read for a few recent accounts; denied or empty reads fall back to filler without errors or writes',
      accounts: ['personal'],
      covers: ['handler:hydrateStoryFillCandidates'],
      async run({ page, h, a }) {
        await mobile(page, h);
        const now = Date.now();
        const story = (u) => ({ id: u + '-c1', image: TINY_IMG, caption: 'from content doc', timestamp: now - 300000, audience: 'everyone' });
        const errsBefore = page._errors.length;
        try {
          await page.evaluate(installPixlyMockFirestore, {
            'users/h_story/content/profile': { userStories: [story('h_story')] },
            'users/h_empty/content/profile': { notes: [] },
            'users/h_old/content/profile': { userStories: [story('h_old')] }
          });
          await page.evaluate(() => {
            window.__sbfReads = [];
            const raw = window.firebase.getDoc;
            window.firebase.getDoc = async (r) => {
              window.__sbfReads.push(r.path);
              if (r.path === 'users/h_denied/content/profile') throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
              return raw(r);
            };
          });
          const recent = now - 3600000, old = now - 3 * 86400000;
          const users = [
            { username: 'h_story', lastUpdated: recent, noStoryInDir: true, story: false },
            { username: 'h_denied', lastUpdated: recent },
            { username: 'h_empty', lastUpdated: recent },
            { username: 'h_old', lastUpdated: old },
            { username: 'h_never' }
          ];
          await page.evaluate(setupBar, { img: TINY_IMG, following: [], users });
          await page.evaluate(() => renderStories());
          await page.waitForFunction(() => (window._storyFillContent || {}).h_story, null, { timeout: 5000 });
          await page.waitForTimeout(200);
          const bar = await page.evaluate(readBar);
          const hs = bar.find((x) => x.user === 'h_story');
          a.ok(hs && hs.kind === 'discover' && hs.ring === 'unviewed', 'story from the content doc shows as a live public story: ' + JSON.stringify(bar));
          ['h_denied', 'h_empty', 'h_old', 'h_never'].forEach((u) => {
            const x = bar.find((b) => b.user === u);
            a.ok(x && x.kind === 'fill', u + ' stays a no-story filler: ' + JSON.stringify(bar));
          });
          const reads = await page.evaluate(() => window.__sbfReads.slice());
          a.ok(reads.includes('users/h_story/content/profile') && reads.includes('users/h_denied/content/profile'), 'recent accounts were read: ' + JSON.stringify(reads));
          a.ok(!reads.includes('users/h_old/content/profile') && !reads.includes('users/h_never/content/profile'), 'stale accounts are not read: ' + JSON.stringify(reads));
          a.ok(reads.length <= 10, 'bounded reads: ' + reads.length);
          // repeated renders do not re-read
          await page.evaluate(() => { renderStories(); renderStories(); });
          await page.waitForTimeout(200);
          const reads2 = await page.evaluate(() => window.__sbfReads.length);
          a.equal(reads2, reads.length, 'no repeated reads on re-render');
          const writes = await page.evaluate(() => window.__pfs.writes.length);
          a.equal(writes, 0, 'no Firestore writes');
          a.equal(page._errors.length, errsBefore, 'no page errors: ' + page._errors.slice(errsBefore).join(' | '));
        } finally {
          await page.evaluate(teardownBar);
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
        }
      }
    },
    {
      name: 'Story bar fill: first paint before Firebase is ready still fills the bar once the user directory arrives',
      accounts: ['personal'],
      covers: ['el:#stories-container', 'handler:loadExploreUserDirectory', 'handler:ensureConnectionsDirectory', 'handler:whenFirebaseReady'],
      async run({ page, h, a, account }) {
        await mobile(page, h);
        const now = Date.now();
        const story = (u) => ({ id: u + '-s1', image: TINY_IMG, caption: u, timestamp: now - 120000, audience: 'everyone' });
        const seed = {};
        const names = ['maya_hikes', 'seoul_bites', 'cali_coastline', 'hallstatt_lake', 'user_8wz2f', 'quiet_one', 'quiet_two', 'quiet_three'];
        names.forEach((u) => {
          seed['users/' + u] = {
            username: u, fullName: u, avatar: TINY_IMG, isPrivate: false, deactivated: false,
            userStories: (u === 'maya_hikes' || u === 'seoul_bites') ? [story(u)] : [],
            lastUpdated: now - 60000
          };
        });
        try {
          await page.evaluate(installPixlyMockFirestore, seed);
          const first = await page.evaluate(() => {
            if (!window.__sbfSnap) window.__sbfSnap = {
              dir: window._exploreUserDir, following: state.following, stories: state.stories,
              content: window._storyFillContent, count: window._storyFillHydrateCount, seed: window._storyFillSeed
            };
            window._storyFillSeed = 'first-load';
            window._storyFillContent = {};
            window._storyFillHydrateCount = 0;
            state.following = [];
            window._exploreUserDir = null;
            window._exploreUserDirPromise = null;
            window._exploreUserDirLastFail = 0;
            window._exploreUserDirWaitingForFirebase = null;
            // Same order as a real cold start: the story bar paints while the Firebase CDN import is still in flight.
            window.firebaseReady = false;
            renderStories();
            return Array.from(document.querySelectorAll('#stories-container .story-trigger')).map((el) => ({
              user: (el.getAttribute('data-story-user') || '').replace(/^@/, '').toLowerCase(),
              kind: el.getAttribute('data-story-kind')
            }));
          });
          a.ok(first.length === 1 && first[0].kind === 'own', 'first paint is only the owner bubble, as on a phone before Firebase is ready: ' + JSON.stringify(first));

          // Firebase finishes loading. Do not call renderStories here — the bar has to fill on its own.
          await page.evaluate(() => {
            const rawGetDocs = window.firebase.getDocs;
            window.firebase.getDocs = async (q) => {
              await new Promise((r) => setTimeout(r, 80));
              return rawGetDocs(q);
            };
            window.firebaseReady = true;
            const q = window._onFirebaseReadyQueue || [];
            window._onFirebaseReadyQueue = [];
            q.forEach((fn) => { try { fn(); } catch (e) {} });
          });
          await page.waitForFunction(() => {
            const n = document.querySelectorAll('#stories-container .story-trigger').length;
            return n >= (window.STORY_BAR_MIN_BUBBLES || 8);
          }, null, { timeout: 5000 });
          const bar = await page.evaluate(readBar);
          const namesOnBar = bar.map((x) => x.user);
          a.equal(bar.length, 8, 'bar fills to the minimum once the late directory arrives: ' + JSON.stringify(bar));
          a.equal(bar[0].kind, 'own', 'own bubble stays first');
          a.ok(namesOnBar.includes('maya_hikes') && namesOnBar.includes('seoul_bites'), 'live public stories appear: ' + JSON.stringify(namesOnBar));
          a.ok(bar.some((x) => x.kind === 'fill'), 'no-story filler is used to complete the bar');
          a.equal(bar.filter((x) => x.kind !== 'own' && x.user === account.username).length, 0, 'viewer is not used as filler: ' + JSON.stringify(bar));
        } finally {
          await page.evaluate(teardownBar);
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
        }
      }
    }
  ]
};
