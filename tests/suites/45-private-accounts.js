'use strict';

/**
 * Public / Private account mode (Account Center > Privacy and safety > Private account).
 * Covers: the toggle (top of Privacy and safety, one boolean so public XOR private), request / cancel /
 * approve / decline / revoke, public<->private transitions, every content surface (profile, feed, explore,
 * Saved, Likes, post + note modals, stories, highlights, Connections lists), signed-out viewers and
 * fail-safe behavior when the network or a write fails. Uses an in-page mock Firestore; no production calls.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const OWNER = 'pt_owner';
const REQ = 'pt_req';
const STRANGER = 'pt_stranger';
const PUB = 'pt_public';
const POST_ID = 'ptpost1';
const PUB_POST_ID = 'ptpub1';
const NOTE_ID = 'ptnote1';

function baseSeed(opts) {
  const o = opts || {};
  const seed = {};
  seed['users/' + OWNER] = {
    username: OWNER, fullName: 'PT Owner', isPrivate: o.ownerPublic ? false : true,
    following: [],
    notes: [{ id: NOTE_ID, author: OWNER, text: 'private note text', timestamp: Date.now() }],
    userStories: [{ id: 'ptstory1', author: OWNER, image: 'data:image/png;base64,iVBORw0KGgo=', timestamp: Date.now() }]
  };
  seed['users/' + REQ] = { username: REQ, fullName: 'PT Requester', following: o.reqFollowing || [] };
  seed['users/' + STRANGER] = { username: STRANGER, fullName: 'PT Stranger', following: [] };
  seed['users/' + PUB] = { username: PUB, fullName: 'PT Public', following: [] };
  seed['posts/' + POST_ID] = { id: POST_ID, author: OWNER, authorName: 'PT Owner', image: 'data:image/png;base64,iVBORw0KGgo=', caption: 'private photo', likes: 0, comments: [], authorPrivate: !o.ownerPublic };
  seed['posts/' + PUB_POST_ID] = { id: PUB_POST_ID, author: PUB, authorName: 'PT Public', image: 'data:image/png;base64,iVBORw0KGgo=', caption: 'public photo', likes: 0, comments: [] };
  Object.assign(seed, o.extra || {});
  return seed;
}

// Snapshot + restore everything a privacy test touches so later suites see the account unchanged.
async function sandbox(page, seed, fn) {
  await page.evaluate(() => {
    window.__privSnap = {
      currentUser: Object.assign({}, state.currentUser),
      following: JSON.parse(JSON.stringify(state.following || [])),
      posts: (state.posts || []).slice(),
      explorePosts: (state.explorePosts || []).slice(),
      notes: (state.notes || []).slice(),
      exploreNotes: (state.exploreNotes || []).slice(),
      saved: new Set(state.savedPostIds || []),
      liked: new Set(state.likedPostIds || []),
      savedNotes: new Set(state.savedNoteIds || []),
      likedNotes: new Set(state.likedNoteIds || []),
      notifications: (state.notifications || []).slice(),
      isLoggedIn: state.isLoggedIn,
      viewedCreator: state.viewedCreator,
      dir: window._exploreUserDir,
      rc: Object.assign({}, window._remoteUserProfilesCache || {})
    };
    window._exploreUserDir = null;
    window._exploreUserDirPromise = null;
  });
  await page.evaluate(installPixlyMockFirestore, seed);
  await page.evaluate(() => {
    // Test helpers: act as a given account (state mirrors that account's users doc in the mock store).
    window.__asUser = function (u) {
      const d = (window.__pfs.docs['users/' + u]) || {};
      state.isLoggedIn = true;
      state.currentUser.username = u;
      state.currentUser.fullName = d.fullName || u;
      state.currentUser.isPrivate = d.isPrivate === true;
      state.following = JSON.parse(JSON.stringify(d.following || []));
      window._acctPrivacy = {};
      Object.keys(window.__pfs.docs).forEach((p) => {
        const m = p.match(/^users\/([^/]+)$/);
        if (m) window._acctPrivacy[m[1]] = window.__pfs.docs[p].isPrivate === true;
      });
      window._incomingConnectRequests = { owner: '', list: [] };
    };
    window.__injectContent = function () {
      const docs = window.__pfs.docs;
      ['posts/ptpost1', 'posts/ptpub1'].forEach((p) => {
        const d = docs[p];
        if (!d) return;
        if (!state.posts.some((x) => String(x.id) === String(d.id))) state.posts.unshift(Object.assign({}, d));
      });
      const n = (docs['users/pt_owner'].notes || [])[0];
      if (n) {
        state.exploreNotes = state.exploreNotes || [];
        if (!state.exploreNotes.some((x) => String(x.id) === String(n.id))) state.exploreNotes.unshift(Object.assign({}, n));
      }
    };
  });
  try {
    await fn();
  } finally {
    await page.evaluate(uninstallPixlyMockFirestore);
    await page.evaluate(() => {
      const s = window.__privSnap;
      if (!s) return;
      state.currentUser = s.currentUser;
      state.following = s.following;
      state.posts = s.posts;
      state.explorePosts = s.explorePosts;
      state.notes = s.notes;
      state.exploreNotes = s.exploreNotes;
      state.savedPostIds = s.saved;
      state.likedPostIds = s.liked;
      state.savedNoteIds = s.savedNotes;
      state.likedNoteIds = s.likedNotes;
      state.notifications = s.notifications;
      state.isLoggedIn = s.isLoggedIn;
      state.viewedCreator = s.viewedCreator;
      window._exploreUserDir = s.dir;
      window._exploreUserDirPromise = null;
      window._remoteUserProfilesCache = s.rc;
      window._acctPrivacy = {};
      window._incomingConnectRequests = { owner: '', list: [] };
      window._viewedPrivacyLock = null;
      window._privacyToggleBusy = false;
      window._lastLocalPrivacyWriteTs = 0;
      window._connReqBusy = {};
      try {
        const kill = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (/pt_(owner|req|stranger|public)/.test(k) || k.indexOf('pixly_conn_req_out_') === 0)) kill.push(k);
        }
        kill.forEach((k) => localStorage.removeItem(k));
      } catch (e) {}
      try { if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal(); } catch (e) {}
      try { if (typeof closePostDetailModal === 'function') closePostDetailModal(); } catch (e) {}
      try { if (typeof switchMainTab === 'function') switchMainTab('profile'); } catch (e) {}
      try { if (typeof renderProfile === 'function') renderProfile(); } catch (e) {}
      try { if (typeof renderFeed === 'function') renderFeed(); } catch (e) {}
      window.__privSnap = null;
    });
  }
}

async function openPrivacySafety(page, h) {
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
    else if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => { if (typeof setAccountCenterView === 'function') setAccountCenterView('privacySafety'); });
  await page.waitForTimeout(60);
}

const tick = (page, ms) => page.waitForTimeout(ms || 80);

function lockedState(page) {
  return page.evaluate(() => ({
    panel: !document.getElementById('user-profile-private-lock').classList.contains('hidden'),
    tabsHidden: document.getElementById('user-profile-tabs-wrap').classList.contains('hidden'),
    cardHidden: document.getElementById('user-profile-content-card').classList.contains('hidden'),
    gridItems: document.querySelectorAll('#user-profile-grid [data-post-id]').length,
    notes: document.querySelectorAll('#user-profile-notes-list [data-note-id]').length,
    followText: (document.getElementById('user-profile-follow-text') || {}).textContent || '',
    reqText: (document.getElementById('user-profile-private-request') || {}).textContent || ''
  }));
}

module.exports = {
  name: 'Private accounts',
  tests: [
    {
      name: 'Private accounts: toggle sits at the top of Privacy and safety and defaults to Public',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-ac-private-account-toggle', 'el:#ac-private-account-row'],
      async run({ page, h, a }) {
        await openPrivacySafety(page, h);
        const info = await page.evaluate(() => {
          const view = document.getElementById('ac-view-privacy-safety');
          const first = view && view.firstElementChild;
          const sw = document.getElementById('btn-ac-private-account-toggle');
          return {
            visible: !!(view && !view.classList.contains('hidden')),
            firstId: first ? first.id : '',
            secondId: first && first.nextElementSibling ? first.nextElementSibling.id : '',
            role: sw && sw.getAttribute('role'),
            checked: sw && sw.getAttribute('aria-checked'),
            label: (document.getElementById('ac-private-account-state') || {}).textContent || '',
            spam: !!document.getElementById('btn-ac-tab-spam'),
            blocked: !!document.getElementById('btn-ac-tab-blocked'),
            muted: !!document.getElementById('btn-ac-tab-muted')
          };
        });
        a.ok(info.visible, 'Privacy and safety view open');
        a.equal(info.firstId, 'ac-private-account-row', 'Private account row is first');
        a.equal(info.secondId, 'btn-ac-tab-connect-requests', 'Connect requests row second');
        a.equal(info.role, 'switch', 'toggle is a switch');
        a.equal(info.checked, 'false', 'existing accounts are public by default');
        a.ok(/^Public:/.test(info.label), 'label says Public: ' + info.label);
        a.ok(info.spam && info.blocked && info.muted, 'existing Spam / Blocked / Muted rows kept');
      }
    },
    {
      name: 'Private accounts: switching Private then Public writes one boolean (never both) and stamps posts',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['listener:#btn-ac-private-account-toggle:click'],
      async run({ page, h, a, account }) {
        const me = account.username;
        const seed = baseSeed();
        seed['users/' + me] = { username: me, fullName: account.fullName };
        seed['posts/mine1'] = { id: 'mine1', author: me, caption: 'mine', likes: 0, comments: [] };
        await sandbox(page, seed, async () => {
          await openPrivacySafety(page, h);
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#btn-ac-private-account-toggle');
          await tick(page, 150);
          let r = await page.evaluate((me) => ({
            doc: window.__pfs.docs['users/' + me],
            post: window.__pfs.docs['posts/mine1'],
            checked: document.getElementById('btn-ac-private-account-toggle').getAttribute('aria-checked'),
            label: document.getElementById('ac-private-account-state').textContent,
            st: state.currentUser.isPrivate
          }), me);
          a.equal(r.doc.isPrivate, true, 'users doc isPrivate true');
          a.equal(r.checked, 'true', 'switch on');
          a.ok(/^Private:/.test(r.label), 'label Private');
          a.equal(r.st, true, 'state private');
          a.equal(r.post.authorPrivate, true, 'own post stamped authorPrivate');
          a.ok(r.doc.fullName === account.fullName, 'other profile fields untouched');
          await page.evaluate(() => { window._lastLocalPrivacyWriteTs = 0; });
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#btn-ac-private-account-toggle');
          await tick(page, 150);
          r = await page.evaluate((me) => ({
            doc: window.__pfs.docs['users/' + me],
            post: window.__pfs.docs['posts/mine1'],
            checked: document.getElementById('btn-ac-private-account-toggle').getAttribute('aria-checked'),
            label: document.getElementById('ac-private-account-state').textContent
          }), me);
          a.equal(r.doc.isPrivate, false, 'users doc isPrivate false (public)');
          a.equal(r.checked, 'false', 'switch off');
          a.ok(/^Public:/.test(r.label) && !/Private:/.test(r.label), 'exactly one mode shown');
          a.equal(r.post.authorPrivate, false, 'stamp cleared');
        });
      }
    },
    {
      name: 'Private accounts: toggle fails safe offline and on a failed write (stays as it was)',
      accounts: ['personal'],
      covers: ['el:#ac-private-account-state'],
      async run({ page, h, a, account }) {
        await openPrivacySafety(page, h);
        // Offline: suite stubs leave firebaseReady=false.
        await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#btn-ac-private-account-toggle');
        await tick(page, 100);
        let r = await page.evaluate(() => ({ st: state.currentUser.isPrivate === true, checked: document.getElementById('btn-ac-private-account-toggle').getAttribute('aria-checked') }));
        a.equal(r.st, false, 'offline: still public');
        a.equal(r.checked, 'false', 'offline: switch still off');
        const me = account.username;
        await sandbox(page, { ['users/' + me]: { username: me } }, async () => {
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          await openPrivacySafety(page, h);
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#btn-ac-private-account-toggle');
          await tick(page, 120);
          r = await page.evaluate(() => ({ st: state.currentUser.isPrivate === true, checked: document.getElementById('btn-ac-private-account-toggle').getAttribute('aria-checked'), disabled: document.getElementById('btn-ac-private-account-toggle').disabled }));
          a.equal(r.st, false, 'failed write: still public');
          a.equal(r.checked, 'false', 'failed write: switch off');
          a.equal(r.disabled, false, 'switch usable again');
        });
      }
    },
    {
      name: 'Private accounts: permission matrix (public, private, owner, stranger, pending, approved, revoked, signed-out)',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        await sandbox(page, baseSeed(), async () => {
          const r = await page.evaluate(() => {
            const out = {};
            window.__asUser('pt_stranger');
            out.strangerPrivate = isPrivacyLockedFor('pt_owner');
            out.strangerPublic = isPrivacyLockedFor('pt_public');
            out.strangerPost = canSeeAudienceContent(window.__pfs.docs['posts/ptpost1']);
            out.strangerPubPost = canSeeAudienceContent(window.__pfs.docs['posts/ptpub1']);
            window.__asUser('pt_owner');
            out.ownerSelf = isPrivacyLockedFor('pt_owner');
            out.ownerOwnPost = canSeeAudienceContent(window.__pfs.docs['posts/ptpost1']);
            window.__asUser('pt_req');
            localStorage.setItem('pixly_conn_req_out_pt_req', JSON.stringify({ pt_owner: Date.now() }));
            out.pending = isPrivacyLockedFor('pt_owner');
            state.following = [{ username: 'pt_owner', isFollowing: true, explicit: true }];
            out.approved = isPrivacyLockedFor('pt_owner');
            out.approvedPost = canSeeAudienceContent(window.__pfs.docs['posts/ptpost1']);
            state.following = [{ username: 'pt_owner', isFollowing: false, explicit: true }];
            out.revoked = isPrivacyLockedFor('pt_owner');
            // Stamp fail-safe: author doc not known yet, post says private.
            window._acctPrivacy = {};
            out.unknownStamped = isPrivacyLockedFor('pt_someone', { author: 'pt_someone', authorPrivate: true });
            out.unknownUnstamped = isPrivacyLockedFor('pt_someone', { author: 'pt_someone' });
            // Users doc wins over a stale stamp.
            window._acctPrivacy = { pt_someone: false };
            out.docPublicStaleStamp = isPrivacyLockedFor('pt_someone', { author: 'pt_someone', authorPrivate: true });
            state.isLoggedIn = false;
            window._acctPrivacy = { pt_owner: true, pt_public: false };
            out.signedOutPrivate = isPrivacyLockedFor('pt_owner');
            out.signedOutPublic = isPrivacyLockedFor('pt_public');
            state.isLoggedIn = true;
            return out;
          });
          a.equal(r.strangerPrivate, true, 'stranger locked out of private');
          a.equal(r.strangerPublic, false, 'stranger sees public');
          a.equal(r.strangerPost, false, 'stranger cannot see private post');
          a.equal(r.strangerPubPost, true, 'stranger sees public post');
          a.equal(r.ownerSelf, false, 'owner sees own');
          a.equal(r.ownerOwnPost, true, 'owner sees own post');
          a.equal(r.pending, true, 'pending requester still locked');
          a.equal(r.approved, false, 'approved connection sees');
          a.equal(r.approvedPost, true, 'approved sees post');
          a.equal(r.revoked, true, 'revoked connection locked again');
          a.equal(r.unknownStamped, true, 'stamped post hidden before doc loads');
          a.equal(r.unknownUnstamped, false, 'unstamped unknown stays public (existing accounts)');
          a.equal(r.docPublicStaleStamp, false, 'public users doc beats stale stamp');
          a.equal(r.signedOutPrivate, true, 'signed-out locked');
          a.equal(r.signedOutPublic, false, 'signed-out sees public');
        });
      }
    },
    {
      name: 'Private accounts: stranger sees the private message, Request sends a request (no connection), tap again cancels',
      accounts: ['personal'],
      covers: ['el:#user-profile-private-lock', 'el:#user-profile-private-request', 'listener:#user-profile-private-request:click'],
      async run({ page, a }) {
        await sandbox(page, baseSeed(), async () => {
          await page.evaluate(() => { window.__asUser('pt_req'); window.__injectContent(); viewUserProfile('pt_owner'); });
          await tick(page, 150);
          let s = await lockedState(page);
          a.ok(s.panel, 'private message shown');
          a.ok(s.tabsHidden && s.cardHidden, 'tabs and content hidden');
          a.equal(s.gridItems, 0, 'no photos rendered');
          a.equal(s.notes, 0, 'no notes rendered');
          a.equal(s.followText, 'Request', 'Connect button reads Request');
          a.ok(/Request to connect/.test(s.reqText), 'panel button: Request to connect');
          const msg = await page.evaluate(() => document.getElementById('user-profile-private-lock').innerText);
          a.ok(/This account is private/.test(msg), 'message text');
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#user-profile-private-request');
          await tick(page, 150);
          let r = await page.evaluate(() => ({
            req: window.__pfs.docs['users/pt_owner/connectRequests/pt_req'],
            edge: window.__pfs.docs['users/pt_owner/followers/pt_req'],
            following: (state.following || []).filter((f) => f.username === 'pt_owner' && f.isFollowing !== false).length,
            notif: (window.__pfs.docs['users/pt_owner'].notifications || []).find((n) => n.type === 'connect_request' && n.fromUser === 'pt_req')
          }));
          a.ok(r.req && r.req.username === 'pt_req', 'request doc written');
          a.ok(!r.edge, 'NO Connections edge written');
          a.equal(r.following, 0, 'NOT added to Connected');
          a.ok(r.notif, 'owner notified');
          s = await lockedState(page);
          a.ok(s.panel, 'still locked while pending');
          a.equal(s.followText, 'Requested', 'button: Requested');
          a.ok(/Requested/.test(s.reqText), 'panel: Requested');
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#user-profile-private-request');
          await tick(page, 150);
          r = await page.evaluate(() => ({ req: window.__pfs.docs['users/pt_owner/connectRequests/pt_req'] }));
          a.ok(!r.req, 'request canceled');
          s = await lockedState(page);
          a.equal(s.followText, 'Request', 'back to Request');
        });
      }
    },
    {
      name: 'Private accounts: the main Connect button on a private profile also only requests',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        await sandbox(page, baseSeed(), async () => {
          await page.evaluate(() => { window.__asUser('pt_req'); viewUserProfile('pt_owner'); });
          await tick(page, 120);
          await page.evaluate(() => document.getElementById('btn-user-profile-follow').click());
          await tick(page, 150);
          const r = await page.evaluate(() => ({
            req: !!window.__pfs.docs['users/pt_owner/connectRequests/pt_req'],
            edge: !!window.__pfs.docs['users/pt_owner/followers/pt_req'],
            res: applyLocalFollowToggle('pt_owner', true),
            edge2: !!window.__pfs.docs['users/pt_owner/followers/pt_req']
          }));
          await tick(page, 150);
          const after = await page.evaluate(() => ({ req: !!window.__pfs.docs['users/pt_owner/connectRequests/pt_req'], following: (state.following || []).some((f) => f.username === 'pt_owner' && f.isFollowing !== false) }));
          a.ok(r.req, 'request sent from Connect button');
          a.ok(!r.edge && !r.edge2, 'no edge even with forced follow');
          a.equal(r.res, null, 'forced follow refused for private');
          a.equal(after.following, false, 'never in Connected before approval');
        });
      }
    },
    {
      name: 'Private accounts: owner sees the request, approves it, and the requester can then view',
      accounts: ['personal'],
      covers: ['el:#btn-ac-tab-connect-requests', 'listener:#btn-ac-tab-connect-requests:click', 'el:#ac-view-connect-requests', 'el:#ac-connect-requests-list', 'el:#ac-connect-requests-count-badge', 'handler:approveConnectRequest'],
      async run({ page, h, a }) {
        const seed = baseSeed();
        seed['users/pt_owner/connectRequests/pt_req'] = { username: 'pt_req', fullName: 'PT Requester', requestedAt: Date.now() };
        await sandbox(page, seed, async () => {
          await page.evaluate(() => { window.__asUser('pt_owner'); attachMyConnectRequestsListener('pt_owner'); });
          await tick(page, 100);
          await openPrivacySafety(page, h);
          const badge = await page.evaluate(() => document.getElementById('ac-connect-requests-count-badge').textContent);
          a.equal(badge, '1', 'badge shows 1 request');
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#btn-ac-tab-connect-requests');
          await tick(page, 80);
          const listInfo = await page.evaluate(() => ({
            vis: !document.getElementById('ac-view-connect-requests').classList.contains('hidden'),
            rows: document.querySelectorAll('#ac-connect-requests-list [data-request-user="pt_req"]').length,
            title: document.getElementById('ac-header-title').textContent
          }));
          a.ok(listInfo.vis, 'requests view open');
          a.equal(listInfo.rows, 1, 'requester listed');
          a.equal(listInfo.title, 'Connect requests', 'header');
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#ac-connect-requests-list .btn-approve-connect-request');
          await tick(page, 200);
          const r = await page.evaluate(() => ({
            req: window.__pfs.docs['users/pt_owner/connectRequests/pt_req'],
            edge: window.__pfs.docs['users/pt_owner/followers/pt_req'],
            reqFollowing: (window.__pfs.docs['users/pt_req'].following || []).find((f) => f.username === 'pt_owner'),
            notif: (window.__pfs.docs['users/pt_req'].notifications || []).find((n) => n.type === 'connect_approved'),
            empty: /No connect requests/.test(document.getElementById('ac-connect-requests-list').innerText)
          }));
          a.ok(!r.req, 'request removed');
          a.ok(r.edge && r.edge.username === 'pt_req', 'Connections edge created by owner');
          a.ok(r.reqFollowing && r.reqFollowing.isFollowing === true, 'requester Connected list has owner');
          a.ok(r.notif, 'requester notified of approval');
          a.ok(r.empty, 'list now empty');
          await page.evaluate(() => { closeAccountCenterModal(); window.__asUser('pt_req'); window.__injectContent(); viewUserProfile('pt_owner'); });
          await tick(page, 200);
          const s = await lockedState(page);
          a.ok(!s.panel, 'approved: no private message');
          a.ok(!s.tabsHidden && !s.cardHidden, 'approved: tabs and content visible');
          a.ok(s.gridItems >= 1, 'approved: private photo visible');
          a.equal(s.followText, 'Connected', 'approved: Connected');
        });
      }
    },
    {
      name: 'Private accounts: decline removes the request and the requester stays locked',
      accounts: ['personal'],
      covers: ['handler:declineConnectRequest'],
      async run({ page, h, a }) {
        const seed = baseSeed();
        seed['users/pt_owner/connectRequests/pt_req'] = { username: 'pt_req', fullName: 'PT Requester', requestedAt: Date.now() };
        await sandbox(page, seed, async () => {
          await page.evaluate(() => { window.__asUser('pt_owner'); attachMyConnectRequestsListener('pt_owner'); });
          await tick(page, 100);
          await openPrivacySafety(page, h);
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#btn-ac-tab-connect-requests');
          await tick(page, 60);
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, '#ac-connect-requests-list .btn-decline-connect-request');
          await tick(page, 150);
          const r = await page.evaluate(() => ({
            req: !!window.__pfs.docs['users/pt_owner/connectRequests/pt_req'],
            edge: !!window.__pfs.docs['users/pt_owner/followers/pt_req'],
            f: (window.__pfs.docs['users/pt_req'].following || []).length
          }));
          a.ok(!r.req, 'request deleted');
          a.ok(!r.edge, 'no edge');
          a.equal(r.f, 0, 'requester not connected');
          await page.evaluate(() => { closeAccountCenterModal(); window.__asUser('pt_req'); window.__injectContent(); viewUserProfile('pt_owner'); });
          await tick(page, 150);
          const s = await lockedState(page);
          a.ok(s.panel && s.gridItems === 0, 'still locked after decline');
        });
      }
    },
    {
      name: 'Private accounts: request approve also works from the notification',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        const seed = baseSeed();
        seed['users/pt_owner/connectRequests/pt_req'] = { username: 'pt_req', fullName: 'PT Requester', requestedAt: Date.now() };
        await sandbox(page, seed, async () => {
          await page.evaluate(() => {
            window.__asUser('pt_owner');
            state.notifications = [{ id: 1, type: 'connect_request', fromUser: 'pt_req', text: 'requested to connect with you.', timestamp: Date.now(), read: false }];
            attachMyConnectRequestsListener('pt_owner');
          });
          await tick(page, 120);
          await page.evaluate(() => renderNotifications(true));
          const btns = await page.evaluate(() => document.querySelectorAll('#notifications-list .notif-connreq-approve').length);
          a.equal(btns, 1, 'Approve shown on the request notification');
          await page.evaluate(() => document.querySelector('#notifications-list .notif-connreq-approve').click());
          await tick(page, 200);
          const r = await page.evaluate(() => ({
            edge: !!window.__pfs.docs['users/pt_owner/followers/pt_req'],
            req: !!window.__pfs.docs['users/pt_owner/connectRequests/pt_req'],
            btns: document.querySelectorAll('#notifications-list .notif-connreq-approve').length
          }));
          a.ok(r.edge && !r.req, 'approved from notification');
          a.equal(r.btns, 0, 'buttons gone after approve');
        });
      }
    },
    {
      name: 'Private accounts: removing an approved connection locks the profile again',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        const seed = baseSeed({ reqFollowing: [{ username: OWNER, isFollowing: true, explicit: true, followedAt: Date.now() }] });
        seed['users/pt_owner/followers/pt_req'] = { username: 'pt_req', followedAt: Date.now() };
        await sandbox(page, seed, async () => {
          await page.evaluate(() => { window.__asUser('pt_req'); window.__injectContent(); viewUserProfile('pt_owner'); });
          await tick(page, 150);
          let s = await lockedState(page);
          a.ok(!s.panel && s.gridItems >= 1, 'approved connection sees content');
          // Owner removes the connection with the existing Remove Connection path.
          await page.evaluate(async () => { window.__asUser('pt_owner'); await disconnectFollowerSide('pt_req', 'pt_owner'); });
          await tick(page, 80);
          await page.evaluate(() => { window.__asUser('pt_req'); window.__injectContent(); viewUserProfile('pt_owner'); });
          await tick(page, 150);
          s = await lockedState(page);
          a.ok(s.panel, 'revoked: private message back');
          a.equal(s.gridItems, 0, 'revoked: photos hidden');
          a.equal(s.followText, 'Request', 'revoked: must request again');
        });
      }
    },
    {
      name: 'Private accounts: Private to Public lets everyone view and connect directly; stale request cleaned up',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        const seed = baseSeed();
        seed['users/pt_owner/connectRequests/pt_req'] = { username: 'pt_req', requestedAt: Date.now() };
        await sandbox(page, seed, async () => {
          await page.evaluate(async () => { window.__asUser('pt_owner'); await setAccountPrivacy(false); });
          await tick(page, 150);
          const pub = await page.evaluate(() => ({ doc: window.__pfs.docs['users/pt_owner'].isPrivate, stamp: window.__pfs.docs['posts/ptpost1'].authorPrivate }));
          a.equal(pub.doc, false, 'owner public');
          a.equal(pub.stamp, false, 'post stamp cleared');
          await page.evaluate(() => {
            window.__asUser('pt_req');
            localStorage.setItem('pixly_conn_req_out_pt_req', JSON.stringify({ pt_owner: Date.now() }));
            window.__injectContent();
            state.posts.forEach((p) => { if (p.author === 'pt_owner') p.authorPrivate = false; });
            viewUserProfile('pt_owner');
          });
          await tick(page, 150);
          const s = await lockedState(page);
          a.ok(!s.panel && !s.cardHidden && s.gridItems >= 1, 'public again: visible to non-connections');
          a.equal(s.followText, 'Connect', 'plain Connect');
          const r = await page.evaluate(() => { const x = applyLocalFollowToggle('pt_owner'); return { now: x && x.nowFollowing }; });
          await tick(page, 150);
          const after = await page.evaluate(() => ({ req: !!window.__pfs.docs['users/pt_owner/connectRequests/pt_req'], edge: !!window.__pfs.docs['users/pt_owner/followers/pt_req'] }));
          a.equal(r.now, true, 'direct connect on public account');
          a.ok(after.edge, 'edge written for public connect');
          a.ok(!after.req, 'stale request removed');
        });
      }
    },
    {
      name: 'Private accounts: Public to Private keeps existing connections and locks everyone else',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        const seed = baseSeed({ ownerPublic: true, reqFollowing: [{ username: OWNER, isFollowing: true, explicit: true }] });
        seed['users/pt_owner/followers/pt_req'] = { username: 'pt_req', followedAt: Date.now() };
        await sandbox(page, seed, async () => {
          await page.evaluate(async () => { window.__asUser('pt_owner'); await setAccountPrivacy(true); });
          await tick(page, 150);
          const st = await page.evaluate(() => ({ doc: window.__pfs.docs['users/pt_owner'].isPrivate, stamp: window.__pfs.docs['posts/ptpost1'].authorPrivate, edge: !!window.__pfs.docs['users/pt_owner/followers/pt_req'] }));
          a.equal(st.doc, true, 'now private');
          a.equal(st.stamp, true, 'posts stamped');
          a.ok(st.edge, 'existing connection untouched');
          const r = await page.evaluate(() => {
            window.__asUser('pt_req');
            const existing = isPrivacyLockedFor('pt_owner');
            window.__asUser('pt_stranger');
            const stranger = isPrivacyLockedFor('pt_owner');
            return { existing, stranger };
          });
          a.equal(r.existing, false, 'existing connection keeps access');
          a.equal(r.stranger, true, 'others locked');
        });
      }
    },
    {
      name: 'Private accounts: every surface hides private content from non-approved viewers',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        const seed = baseSeed();
        await sandbox(page, seed, async () => {
          const check = () => page.evaluate(() => {
            window.__injectContent();
            const post = state.posts.find((p) => String(p.id) === 'ptpost1');
            const note = state.exploreNotes.find((n) => String(n.id) === 'ptnote1');
            state.savedPostIds = new Set(['ptpost1']);
            state.likedPostIds = new Set(['ptpost1']);
            switchMainTab('feed');
            renderFeed();
            const feed = !!document.querySelector('#posts-stream [data-post-id="ptpost1"]');
            const feedPub = !!document.querySelector('#posts-stream [data-post-id="ptpub1"]');
            const creatorPosts = getCreatorPosts('pt_owner').some((p) => String(p.id) === 'ptpost1');
            const savedOk = canSeeAudienceContent(post);
            const noteOk = isContentVisibleToViewer(note);
            const storyOk = isStoryVisibleToViewer({ author: 'pt_owner', id: 'ptstory1', image: 'x' });
            closePostDetailModal && closePostDetailModal();
            openPostDetailModal('ptpost1');
            const m = document.getElementById('modal-post-detail');
            const modalOpen = !!(m && !m.classList.contains('hidden') && m.style.display !== 'none' && m.getAttribute('data-post-id') === 'ptpost1');
            if (typeof closePostDetailModal === 'function') closePostDetailModal();
            if (m) m.removeAttribute('data-post-id');
            switchMainTab('profile');
            if (typeof renderSaved === 'function') renderSaved();
            if (typeof renderLikes === 'function') renderLikes();
            const savedDom = !!document.querySelector('#saved-grid [data-post-id="ptpost1"]');
            const likedDom = !!document.querySelector('#likes-grid [data-post-id="ptpost1"]');
            return { feed, feedPub, creatorPosts, savedOk, noteOk, storyOk, modalOpen, savedDom, likedDom };
          });
          await page.evaluate(() => window.__asUser('pt_stranger'));
          const s = await check();
          a.equal(s.feed, false, 'feed hides private post');
          a.equal(s.feedPub, true, 'feed still shows public post');
          a.equal(s.creatorPosts, false, 'profile posts hidden');
          a.equal(s.savedOk, false, 'saved hidden');
          a.equal(s.savedDom, false, 'Saved tab hides it');
          a.equal(s.likedDom, false, 'Likes tab hides it');
          a.equal(s.noteOk, false, 'note hidden');
          a.equal(s.storyOk, false, 'story hidden');
          a.equal(s.modalOpen, false, 'post modal refuses');
          await page.evaluate(() => {
            window.__asUser('pt_req');
            state.following = [{ username: 'pt_owner', isFollowing: true, explicit: true }];
          });
          const ok = await check();
          a.equal(ok.feed, true, 'approved: feed shows');
          a.equal(ok.creatorPosts, true, 'approved: profile posts');
          a.equal(ok.savedDom, true, 'approved: Saved shows');
          a.equal(ok.likedDom, true, 'approved: Likes shows');
          a.equal(ok.noteOk && ok.storyOk, true, 'approved: note + story');
          a.equal(ok.modalOpen, true, 'approved: modal opens');
        });
      }
    },
    {
      name: 'Private accounts: Connections lists, stories and highlights are locked on a private profile',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        await sandbox(page, baseSeed(), async () => {
          await page.evaluate(() => { window.__asUser('pt_stranger'); viewUserProfile('pt_owner'); });
          await tick(page, 150);
          const r = await page.evaluate(async () => {
            openViewedConnectionsList('connections');
            const m = document.getElementById('modal-viewed-connections');
            const listOpen = !!(m && !m.classList.contains('hidden') && m.style.display !== 'none');
            renderViewedHighlights([{ id: 'h1', title: 'Trip', icon: '✨' }]);
            const hl = document.querySelectorAll('#user-profile-highlights-container .user-highlight-item').length;
            const before = document.getElementById('modal-story-viewer');
            await openCreatorStory({ username: 'pt_owner' });
            const sv = document.getElementById('modal-story-viewer');
            const storyOpen = !!(sv && !sv.classList.contains('hidden') && sv.style.display !== 'none');
            return { listOpen, hl, storyOpen, hadViewer: !!before };
          });
          a.equal(r.listOpen, false, 'Connections list refused');
          a.equal(r.hl, 0, 'highlights hidden');
          a.equal(r.storyOpen, false, 'story refused');
        });
      }
    },
    {
      name: 'Private accounts: signed-out visitors see the private message and are asked to log in',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        await sandbox(page, baseSeed(), async () => {
          const r = await page.evaluate(() => {
            window.__asUser('pt_stranger');
            state.viewedCreator = { username: 'pt_owner' };
            state.isLoggedIn = false;
            const locked = paintPrivateProfileLock();
            const txt = document.getElementById('user-profile-private-request').textContent;
            onPrivateRequestButton();
            const wrote = !!window.__pfs.docs['users/pt_owner/connectRequests/pt_stranger'];
            state.isLoggedIn = true;
            return { locked, txt, wrote };
          });
          a.equal(r.locked, true, 'locked when signed out');
          a.ok(/Log in/.test(r.txt), 'asks to log in');
          a.equal(r.wrote, false, 'no request written while signed out');
        });
      }
    },
    {
      name: 'Private accounts: request send fails safe (offline or write error keeps it locked, no pending)',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        const off = await page.evaluate(async () => {
          window._acctPrivacy = { pt_owner: true };
          const ok = await sendConnectRequest('pt_owner');
          const pending = hasPendingConnectRequest('pt_owner');
          window._acctPrivacy = {};
          return { ok, pending };
        });
        a.equal(off.ok, false, 'offline: not sent');
        a.equal(off.pending, false, 'offline: not pending');
        await sandbox(page, baseSeed(), async () => {
          const r = await page.evaluate(async () => {
            window.__asUser('pt_req');
            window.__pfs.failWrites = true;
            const ok = await sendConnectRequest('pt_owner');
            return { ok, pending: hasPendingConnectRequest('pt_owner'), locked: isPrivacyLockedFor('pt_owner') };
          });
          a.equal(r.ok, false, 'write error: not sent');
          a.equal(r.pending, false, 'write error: not pending');
          a.equal(r.locked, true, 'still locked');
        });
      }
    },
    {
      name: 'Private accounts: approve fails safe when a write fails (no partial access)',
      accounts: ['personal'],
      covers: [],
      async run({ page, a }) {
        const seed = baseSeed();
        seed['users/pt_owner/connectRequests/pt_req'] = { username: 'pt_req', requestedAt: Date.now() };
        await sandbox(page, seed, async () => {
          const r = await page.evaluate(async () => {
            window.__asUser('pt_owner');
            window.__pfs.failWrites = true;
            const ok = await approveConnectRequest('pt_req');
            return {
              ok,
              req: !!window.__pfs.docs['users/pt_owner/connectRequests/pt_req'],
              edge: !!window.__pfs.docs['users/pt_owner/followers/pt_req'],
              f: (window.__pfs.docs['users/pt_req'].following || []).length
            };
          });
          a.equal(r.ok, false, 'approve reported failure');
          a.ok(r.req, 'request kept so owner can retry');
          a.ok(!r.edge && r.f === 0, 'no access granted');
        });
      }
    },
    {
      name: 'Private accounts: own users doc hydrates the switch; account switch clears it; requests follow the account',
      accounts: ['personal'],
      covers: [],
      async run({ page, a, account }) {
        const me = account.username;
        await sandbox(page, { ['users/' + me]: { username: me, isPrivate: true } }, async () => {
          const r = await page.evaluate((me) => {
            state.currentUser.username = me;
            state.currentUser.isPrivate = false;
            window._lastLocalPrivacyWriteTs = 0;
            applyOwnPrivacyFromDoc(me, { isPrivate: true }, false);
            const afterDoc = state.currentUser.isPrivate;
            const listening = window._connReqUnsubUser === me;
            const flagListed = (window.STORED_ACCOUNT_FLAG_FIELDS || []).includes('isPrivate');
            applyOwnPrivacyFromDoc('someone_else', { isPrivate: false }, false);
            const unchanged = state.currentUser.isPrivate;
            return { afterDoc, listening, flagListed, unchanged };
          }, me);
          a.equal(r.afterDoc, true, 'doc isPrivate applied');
          a.ok(r.listening, 'incoming requests listener on my account');
          a.ok(r.flagListed, 'isPrivate cleared on account switch');
          a.equal(r.unchanged, true, 'other account doc ignored');
        });
      }
    },
    {
      name: 'Profile History: Show dropdown has Profile status with empty state "No changes yet"',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [],
      async run({ page, h, a, account }) {
        const me = account.username;
        await page.evaluate((me) => { try { localStorage.removeItem('pixly_profile_history_' + me); } catch (e) {} if (window._profileHistory && window._profileHistory.user === me) window._profileHistory = null; }, me);
        await openPrivacySafety(page, h);
        const r = await page.evaluate(() => {
          setAccountCenterView('accountInfo');
          setAccountInfoTab('history');
          const sel = document.getElementById('ac-history-field');
          const opts = Array.from(sel.options).map((o) => [o.value, o.textContent.trim()]);
          sel.value = 'status';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          const list = document.getElementById('ac-history-list');
          return { opts, text: list.innerText.trim(), rows: list.querySelectorAll('.ac-history-entry').length };
        });
        const st = r.opts.find((o) => o[0] === 'status');
        a.ok(st && st[1] === 'Profile status', 'Profile status option present');
        a.ok(r.opts.some((o) => o[0] === 'name' && o[1] === 'Name changes'), 'existing options kept');
        a.equal(r.rows, 0, 'no entries');
        a.equal(r.text, 'No changes yet', 'empty state');
      }
    },
    {
      name: 'Profile History: every Public/Private toggle is recorded newest first with date and time',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [],
      async run({ page, h, a, account }) {
        const me = account.username;
        await page.evaluate((me) => { try { localStorage.removeItem('pixly_profile_history_' + me); } catch (e) {} window._profileHistory = null; }, me);
        await sandbox(page, { ['users/' + me]: { username: me } }, async () => {
          await page.evaluate(async () => {
            await setAccountPrivacy(true);
            window._lastLocalPrivacyWriteTs = 0;
            await new Promise((r) => setTimeout(r, 20));
            await setAccountPrivacy(false);
          });
          await tick(page, 200);
          await openPrivacySafety(page, h);
          const r = await page.evaluate((me) => {
            setAccountCenterView('accountInfo');
            setAccountInfoTab('history');
            const sel = document.getElementById('ac-history-field');
            sel.value = 'status';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            const rows = Array.from(document.querySelectorAll('#ac-history-list .ac-history-entry')).map((row) => ({
              from: row.querySelector('.ac-history-from').textContent,
              to: row.querySelector('.ac-history-to').textContent,
              at: Number(row.querySelector('.ac-history-at').getAttribute('data-at')),
              when: row.querySelector('.ac-history-at').textContent
            }));
            const doc = window.__pfs.docs['profileHistory/' + me];
            sel.value = 'name';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            const nameRows = document.querySelectorAll('#ac-history-list .ac-history-entry').length;
            return { rows, cloud: doc && doc.fields && doc.fields.status, nameRows };
          }, me);
          a.equal(r.rows.length, 2, 'two status changes listed');
          a.equal(r.rows[0].from + '>' + r.rows[0].to, 'Private>Public', 'newest first: Private to Public');
          a.equal(r.rows[1].from + '>' + r.rows[1].to, 'Public>Private', 'then Public to Private');
          a.ok(r.rows[0].at >= r.rows[1].at, 'ordered by time');
          a.ok(/\d{1,2}:\d{2}/.test(r.rows[0].when) && /\d{4}/.test(r.rows[0].when), 'shows date and time: ' + r.rows[0].when);
          a.ok(Array.isArray(r.cloud) && r.cloud.length === 2, 'saved to the owner-only profileHistory doc');
          a.equal(r.nameRows, 0, 'status changes do not show under Name changes');
        });
        await page.evaluate((me) => { try { localStorage.removeItem('pixly_profile_history_' + me); } catch (e) {} window._profileHistory = null; }, me);
      }
    },
    {
      name: 'Profile History: Profile status keeps the last 20, is owner-only, and failed toggles record nothing',
      accounts: ['personal'],
      covers: [],
      async run({ page, a, account }) {
        const me = account.username;
        const r = await page.evaluate((me) => {
          const changes = [];
          for (let i = 0; i < 25; i++) changes.push({ field: 'status', from: i % 2 ? 'Private' : 'Public', to: i % 2 ? 'Public' : 'Private', at: 1000 + i });
          const merged = mergeProfileHistory({}, changes);
          const capped = merged.status.length;
          const newest = merged.status[0].at;
          // Another account's history is never shown to me.
          setLocalProfileHistory('pt_other', { status: [{ from: 'Public', to: 'Private', at: Date.now() }] });
          window._profileHistory = null;
          try { localStorage.removeItem('pixly_profile_history_' + me); } catch (e) {}
          const mine = getLocalProfileHistory(me).status.length;
          try { localStorage.removeItem('pixly_profile_history_pt_other'); } catch (e) {}
          window._profileHistory = null;
          return { capped, newest, mine };
        }, me);
        a.equal(r.capped, 20, 'keeps last 20');
        a.equal(r.newest, 1024, 'newest kept first');
        a.equal(r.mine, 0, 'other account history not mine');
        // Offline toggle: nothing recorded.
        const off = await page.evaluate(async (me) => {
          await setAccountPrivacy(true);
          return getLocalProfileHistory(me).status.length;
        }, me);
        a.equal(off, 0, 'offline toggle records nothing');
        await sandbox(page, { ['users/' + me]: { username: me } }, async () => {
          const n = await page.evaluate(async (me) => {
            window.__pfs.failWrites = true;
            await setAccountPrivacy(true);
            return getLocalProfileHistory(me).status.length;
          }, me);
          a.equal(n, 0, 'failed toggle records nothing');
        });
      }
    },
    {
      name: 'Private accounts: new posts carry authorPrivate and the proposed rules file ships with the branch',
      accounts: ['personal'],
      covers: [],
      async run({ a }) {
        const fs = require('fs');
        const path = require('path');
        const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
        a.ok(/authorPrivate: !!\(state\.currentUser && state\.currentUser\.isPrivate === true\)/.test(html), 'post payload stamps authorPrivate');
        const rulesPath = path.join(__dirname, '../../firestore.rules.private-accounts');
        a.ok(fs.existsSync(rulesPath), 'proposed rules file present');
        const rules = fs.readFileSync(rulesPath, 'utf8');
        a.ok(/connectRequests/.test(rules) && /authorPrivate/.test(rules), 'rules cover requests and private posts');
        a.ok(/NOT DEPLOYED/.test(rules), 'rules file clearly marked not deployed');
      }
    }
  ]
};
