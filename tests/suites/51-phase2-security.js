'use strict';

/**
 * Phase 2 security (branch grokbot/phase2-security): content lives under users/{u}/content/profile,
 * close-friends member edges, owners cannot write isPlus / isVerified, Stripe flags go through the Worker.
 * In-page mock Firestore only. Never touches production.
 */

const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

async function setup(page, seed) {
  await page.evaluate(() => {
    window.__p2Snap = {
      cu: Object.assign({}, state.currentUser),
      authU: window._pixlyAuthUsername || '',
      lists: window._privacyLists ? JSON.parse(JSON.stringify(window._privacyLists)) : null,
      peerKeys: window._peerCloseFriends ? JSON.parse(JSON.stringify(window._peerCloseFriends)) : {}
    };
  });
  await page.evaluate(installPixlyMockFirestore, seed || {});
  await page.evaluate(() => {
    const fb = window.firebase;
    delete fb.__pixlyGuarded; delete fb.__raw;
    window.installPixlyDataGuard(fb);
  });
}
async function teardown(page) {
  await page.evaluate(uninstallPixlyMockFirestore);
  await page.evaluate(() => {
    const s = window.__p2Snap; if (!s) return;
    state.currentUser = s.cu;
    window._pixlyAuthUsername = s.authU;
    if (s.lists && window._privacyLists) {
      Object.keys(window._privacyLists).forEach(function (k) { delete window._privacyLists[k]; });
      Object.assign(window._privacyLists, s.lists);
    }
    if (window._peerCloseFriends) {
      Object.keys(window._peerCloseFriends).forEach(function (k) { delete window._peerCloseFriends[k]; });
      Object.assign(window._peerCloseFriends, s.peerKeys || {});
    }
    window.__p2Snap = null;
    window.__syncCalls = null;
    if (window.__origFetch) { window.fetch = window.__origFetch; window.__origFetch = null; }
  });
}
async function withMock(page, seed, fn) { await setup(page, seed); try { await fn(); } finally { await teardown(page); } }
const tick = (page, ms) => page.waitForTimeout(ms || 120);

module.exports = {
  name: 'Phase 2 security',
  tests: [
    {
      name: 'Phase 2: Unit: notes, stories, highlights and following write to content/profile, not the public user doc',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, { 'users/reg_personal': { username: 'reg_personal', fullName: 'Reg' } }, async () => {
          await page.evaluate(async () => {
            await window.firebase.setDoc(window.firebase.doc(window.firebase.db, 'users', 'reg_personal'), {
              fullName: 'Reg P',
              notes: [{ id: 'n1', text: 'hello' }],
              story: { img: 's.jpg' },
              userStories: [{ id: 's1' }],
              highlights: [{ id: 'h1' }],
              following: ['alice']
            }, { merge: true });
          });
          await tick(page);
          const r = await page.evaluate(() => ({
            pub: window.__pfs.docs['users/reg_personal'],
            content: window.__pfs.docs['users/reg_personal/content/profile']
          }));
          a.equal(r.pub.fullName, 'Reg P', 'public field written');
          for (const k of ['notes', 'story', 'userStories', 'highlights', 'following']) {
            a.ok(!(k in (r.pub || {})), k + ' not left on the public doc');
            a.ok(r.content && r.content[k] != null, k + ' written to content/profile');
          }
          a.equal(r.content.notes[0].id, 'n1', 'note body copied to content doc');
          a.equal(r.content.following[0], 'alice', 'following copied to content doc');
        });
      }
    },
    {
      name: 'Phase 2: Unit: reading a user doc merges content/profile over leftover public copies',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'users/alice': { username: 'alice', isPrivate: false, notes: [{ id: 'old' }], following: ['stale'] },
          'users/alice/content/profile': { notes: [{ id: 'new' }], following: ['fresh'] }
        }, async () => {
          const r = await page.evaluate(async () => {
            const snap = await window.firebase.getDoc(window.firebase.doc(window.firebase.db, 'users', 'alice'));
            return snap && snap.data();
          });
          a.equal(r.notes[0].id, 'new', 'content doc wins over leftover public notes');
          a.equal(r.following[0], 'fresh', 'content doc wins over leftover public following');
          a.equal(r.username, 'alice', 'public fields still present');
        });
      }
    },
    {
      name: 'Phase 2: Unit: an owner cannot write isPlus or isVerified; @pixlynote still can',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'users/reg_personal': { username: 'reg_personal', isPlus: false, isVerified: false },
          'users/alice': { username: 'alice', isPlus: false }
        }, async () => {
          await page.evaluate(async () => {
            await window.firebase.setDoc(window.firebase.doc(window.firebase.db, 'users', 'reg_personal'), {
              fullName: 'Reg',
              isPlus: true,
              isVerified: true,
              isBusinessPlus: true,
              subscriptionStatus: 'active'
            }, { merge: true });
          });
          await tick(page);
          const owner = await page.evaluate(() => window.__pfs.docs['users/reg_personal']);
          a.equal(owner.isPlus, false, 'owner isPlus not written');
          a.equal(owner.isVerified, false, 'owner isVerified not written');
          a.ok(owner.subscriptionStatus !== 'active', 'owner subscriptionStatus not written');
          a.equal(owner.fullName, 'Reg', 'non-privilege fields still write');

          const admin = await page.evaluate(async () => {
            const prev = window._pixlyAuthUsername;
            window._pixlyAuthUsername = 'pixlynote';
            state.currentUser = Object.assign({}, state.currentUser, { username: 'pixlynote' });
            await window.firebase.setDoc(window.firebase.doc(window.firebase.db, 'users', 'alice'), { isPlus: true, isVerified: true }, { merge: true });
            window._pixlyAuthUsername = prev;
            return window.__pfs.docs['users/alice'];
          });
          a.equal(admin.isPlus, true, 'admin can still set isPlus');
          a.equal(admin.isVerified, true, 'admin can still set isVerified');
        });
      }
    },
    {
      name: 'Phase 2: Unit: close-friends persist writes member edges; a peer fetch reads only your own edge',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'users/reg_personal': { username: 'reg_personal' },
          'closeFriends/alice': { users: ['reg_personal', 'secret_friend'] },
          'closeFriends/alice/members/reg_personal': { username: 'reg_personal' }
        }, async () => {
          await page.evaluate(async () => {
            window._privacyLists.closeFriends = [];
            window._privacyLists._prevCloseFriends = [];
            window._privacyLists.loaded = true;
            window._privacyLists.owner = 'reg_personal';
            window.addCloseFriend('bob');
            window.addCloseFriend('cara');
          });
          await tick(page);
          const docs = await page.evaluate(() => ({
            list: window.__pfs.docs['closeFriends/reg_personal'],
            bob: window.__pfs.docs['closeFriends/reg_personal/members/bob'],
            cara: window.__pfs.docs['closeFriends/reg_personal/members/cara'],
            writes: window.__pfs.writes.map((w) => w.path)
          }));
          a.ok(docs.list && docs.list.users && docs.list.users.indexOf('bob') !== -1, 'owner list still saved');
          a.ok(docs.bob && docs.bob.username === 'bob', 'member edge for bob');
          a.ok(docs.cara && docs.cara.username === 'cara', 'member edge for cara');

          const peer = await page.evaluate(async () => {
            const peers = window._peerCloseFriends;
            Object.keys(peers || {}).forEach(function (k) { delete peers[k]; });
            window.fetchPeerCloseFriends('alice');
            await new Promise((r) => setTimeout(r, 80));
            return window._peerCloseFriends && window._peerCloseFriends.alice;
          });
          a.ok(peer && peer.loaded, 'peer membership loaded: ' + JSON.stringify(peer));
          a.ok(peer.users && peer.users.indexOf('reg_personal') !== -1, 'self is reported as a member');
          a.ok(peer.users.indexOf('secret_friend') === -1, 'other members are not revealed');
        });
      }
    },
    {
      name: 'Phase 2: Unit: applying a verified Plus session does not write isPlus to Firestore; it calls the Worker',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, { 'users/reg_personal': { username: 'reg_personal', isPlus: false, isVerified: false } }, async () => {
          const r = await page.evaluate(async () => {
            window.__syncCalls = [];
            window.__origFetch = window.fetch;
            window.fetch = async function (url, init) {
              if (String(url).indexOf('/sync-subscription') !== -1) {
                window.__syncCalls.push({ url: String(url), body: JSON.parse((init && init.body) || '{}') });
                return new Response(JSON.stringify({ ok: true, applied: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              return window.__origFetch.apply(this, arguments);
            };
            const sid = 'cs_test_abcdefghijklmnopqrstuvwxyz';
            window.applyStripeSessionVerification('reg_personal', sid, true);
            await new Promise((x) => setTimeout(x, 50));
            return {
              plus: !!(state.currentUser && state.currentUser.isPlus),
              verified: !!(state.currentUser && state.currentUser.isVerified),
              pub: window.__pfs.docs['users/reg_personal'],
              writes: window.__pfs.writes.filter((w) => (w.path || '').indexOf('users/reg_personal') === 0),
              calls: window.__syncCalls
            };
          });
          a.equal(r.plus, true, 'local Plus state still updates');
          a.equal(r.verified, true, 'local verified state still updates');
          a.ok(r.pub.isPlus !== true, 'isPlus not written to the public user doc by the client');
          a.ok(r.pub.isVerified !== true, 'isVerified not written to the public user doc by the client');
          a.ok(!r.writes.some((w) => w.data && (w.data.isPlus === true || w.data.isVerified === true)), 'no client privilege write');
          a.ok(r.calls.length >= 1, 'Worker /sync-subscription was called');
          a.equal(r.calls[0].body.action, 'activate', 'activate action');
          a.equal(r.calls[0].body.username, 'reg_personal', 'username sent to Worker');
        });
      }
    },
    {
      name: 'Phase 2: Unit: private and public account types still write their own content doc; admin tools stay',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'users/reg_personal': { username: 'reg_personal', isPrivate: true },
          'users/bob_public': { username: 'bob_public', isPrivate: false, notes: [{ id: 'pub' }] },
          'users/bob_public/content/profile': { notes: [{ id: 'pub' }] }
        }, async () => {
          const r = await page.evaluate(async () => {
            await window.firebase.setDoc(window.firebase.doc(window.firebase.db, 'users', 'reg_personal'), {
              notes: [{ id: 'priv-note' }], isPrivate: true
            }, { merge: true });
            const pub = await window.firebase.getDoc(window.firebase.doc(window.firebase.db, 'users', 'bob_public'));
            return {
              ownContent: window.__pfs.docs['users/reg_personal/content/profile'],
              ownPub: window.__pfs.docs['users/reg_personal'],
              bobNotes: pub.data().notes,
              guardHasContent: !!(window.pixlyGuard && window.pixlyGuard.CONTENT_USER_FIELDS),
              guardHasPriv: !!(window.PIXLY_PRIVILEGE_USER_FIELDS)
            };
          });
          a.equal(r.ownContent.notes[0].id, 'priv-note', 'private owner still writes content/profile');
          a.ok(!('notes' in (r.ownPub || {})), 'private notes not left on the public doc');
          a.equal(r.bobNotes[0].id, 'pub', 'a public account\'s content is still readable');
          a.ok(r.guardHasContent && r.guardHasPriv, 'content and privilege field lists stay exported for admin tools');
        });
      }
    }
  ]
};
