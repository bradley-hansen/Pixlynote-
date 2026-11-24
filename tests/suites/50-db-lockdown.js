'use strict';

/**
 * Database lockdown (branch grokbot/db-lockdown): private fields split out of users/{u}, contact index,
 * per-user Firebase Auth login / password change / Privileged Access, scoped post queries for locked rules.
 * In-page mock Firestore + stubbed Firebase Auth only. Never touches production.
 */

const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const MIG = 'dbl_mig';
const MIG_UID = 'uid-dbl-mig';
const MIG_AUTH = 'dbl_mig.0123456789ab@users.pixlynote.app';
const MIG_PW = 'Correct-pw-1';

// Mock Firestore + the data guard + a stub Firebase Auth (records every call).
async function setup(page, seed) {
  await page.evaluate(() => {
    window.__dblSnap = { cu: Object.assign({}, state.currentUser), following: JSON.parse(JSON.stringify(state.following || [])), loggedIn: state.isLoggedIn, posts: (state.posts || []).slice(), authU: window._pixlyAuthUsername || '', privacy: Object.assign({}, window._acctPrivacy || {}) };
  });
  await page.evaluate(installPixlyMockFirestore, seed || {});
  await page.evaluate(([authEmail, uid, pw]) => {
    const fb = window.firebase;
    delete fb.__pixlyGuarded; delete fb.__raw;
    const calls = [];
    window.__authCalls = calls;
    fb.auth = { currentUser: null };
    const users = { [authEmail]: { uid, pw: 'pixlynote_v1:' + pw } };
    window.__authUsers = users;
    fb.signInWithEmailAndPassword = async (auth, email, p) => {
      calls.push({ fn: 'signIn', email, p });
      if (window.__authNetworkDown) throw Object.assign(new Error('net'), { code: 'auth/network-request-failed' });
      const u = users[email];
      if (!u || u.pw !== p) throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' });
      auth.currentUser = { uid: window.__authWrongUid ? 'someone-else' : u.uid, isAnonymous: false, email };
      return { user: auth.currentUser };
    };
    fb.createUserWithEmailAndPassword = async (auth, email, p) => {
      calls.push({ fn: 'create', email, p });
      const nu = 'uid-new-' + Object.keys(users).length;
      users[email] = { uid: nu, pw: p };
      auth.currentUser = { uid: nu, isAnonymous: false, email };
      return { user: auth.currentUser };
    };
    fb.signOut = async (auth) => { calls.push({ fn: 'signOut' }); auth.currentUser = null; };
    fb.EmailAuthProvider = { credential: (email, p) => ({ email, p }) };
    fb.reauthenticateWithCredential = async (user, cred) => {
      calls.push({ fn: 'reauth', email: cred.email, p: cred.p });
      const u = users[cred.email];
      if (!u || u.pw !== cred.p) throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' });
    };
    fb.updatePassword = async (user, p) => { calls.push({ fn: 'updatePassword', p }); users[user.email].pw = p; };
    window.installPixlyDataGuard(fb);
  }, [MIG_AUTH, MIG_UID, MIG_PW]);
}
async function teardown(page) {
  await page.evaluate(uninstallPixlyMockFirestore);
  await page.evaluate(() => {
    const s = window.__dblSnap; if (!s) return;
    state.currentUser = s.cu; state.following = s.following; state.isLoggedIn = s.loggedIn; state.posts = s.posts;
    window._pixlyAuthUsername = s.authU; window._acctPrivacy = s.privacy;
    window._postsScopedMode = false; window._postsScopedPlan = null; window._postsCollectionUnsub = null;
    window.__authNetworkDown = false; window.__authWrongUid = false;
    window.__dblSnap = null;
  });
}
async function withMock(page, seed, fn) { await setup(page, seed); try { await fn(); } finally { await teardown(page); } }
async function reloadSignedOut(page, h) {
  await h.clearLoginSession(page);
  await h.loadApp(page, { port: Number(new URL(page.url()).port) });
}
const tick = (page, ms) => page.waitForTimeout(ms || 120);
const keyOf = (page, kind, v) => page.evaluate(([k, x]) => window.pixlyGuard.contactKey(k, x), [kind, v]);

module.exports = {
  name: 'Database lockdown',
  tests: [
    {
      name: 'DB lockdown: Unit: your own write keeps email/phone/DMs/Stripe ids out of the public users doc',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, { 'users/reg_personal': { username: 'reg_personal', fullName: 'Reg' } }, async () => {
          await page.evaluate(async () => {
            state.currentUser.contactPrefs = { showEmail: true, showPhone: false };
            await window.firebase.setDoc(window.firebase.doc(window.firebase.db, 'users', 'reg_personal'), {
              fullName: 'Reg P', email: 'Reg@Example.test', phone: '(555) 555-0199', dms: [{ t: 'hi' }], stripeCustomerId: 'cus_1', contactPrefs: { showEmail: true, showPhone: false }
            }, { merge: true });
          });
          await tick(page);
          const r = await page.evaluate(() => ({ pub: window.__pfs.docs['users/reg_personal'], priv: window.__pfs.docs['users/reg_personal/private/account'], docs: Object.keys(window.__pfs.docs) }));
          a.equal(r.pub.fullName, 'Reg P', 'public field written');
          for (const k of ['email', 'phone', 'dms', 'stripeCustomerId']) a.ok(!(k in r.pub), k + ' not on the public doc');
          a.equal(r.priv.email, 'Reg@Example.test', 'email in private doc');
          a.equal(r.priv.phone, '(555) 555-0199', 'phone in private doc');
          a.equal(r.priv.stripeCustomerId, 'cus_1', 'Stripe id in private doc');
          a.equal(r.pub.publicEmail, 'Reg@Example.test', 'contact button email mirrored because showEmail is on');
          a.equal(r.pub.publicPhone, '', 'phone not mirrored because showPhone is off');
          const ek = await keyOf(page, 'email', 'reg@example.test');
          const pk = await keyOf(page, 'phone', '+1 555 555 0199');
          const idx = await page.evaluate(([e, p]) => [window.__pfs.docs['contactIndex/' + e], window.__pfs.docs['contactIndex/' + p]], [ek, pk]);
          a.ok(idx[0] && idx[0].usernames.includes('reg_personal'), 'email indexed (normalized, hashed)');
          a.ok(idx[1] && idx[1].usernames.includes('reg_personal'), 'phone indexed (normalized, hashed)');
          a.ok(!JSON.stringify(idx).includes('example.test') && !JSON.stringify(idx).includes('0199'), 'index stores no email/phone');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: writes to another account never carry private fields; reads of others are not merged',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'users/reg_personal': { username: 'reg_personal' },
          'users/reg_personal/private/account': { email: 'me@example.test', dms: [1] },
          'users/someone_else': { username: 'someone_else', notifications: [] },
          'users/someone_else/private/account': { email: 'them@example.test' }
        }, async () => {
          const r = await page.evaluate(async () => {
            const fb = window.firebase;
            await fb.setDoc(fb.doc(fb.db, 'users', 'someone_else'), { notifications: [{ id: 1 }], email: 'evil@example.test' }, { merge: true });
            const mine = (await fb.getDoc(fb.doc(fb.db, 'users', 'reg_personal'))).data();
            const theirs = (await fb.getDoc(fb.doc(fb.db, 'users', 'someone_else'))).data();
            let live = null;
            const un = fb.onSnapshot(fb.doc(fb.db, 'users', 'reg_personal'), (s) => { live = s.data(); });
            await new Promise((res) => setTimeout(res, 60)); un();
            return { other: window.__pfs.docs['users/someone_else'], otherPriv: window.__pfs.docs['users/someone_else/private/account'], mine, theirs, live };
          });
          a.equal(r.other.notifications.length, 1, 'social field written to the other account');
          a.ok(!('email' in r.other), 'no email written onto someone else');
          a.equal(r.otherPriv.email, 'them@example.test', 'their private doc untouched');
          a.equal(r.mine.email, 'me@example.test', 'own getDoc merges the private doc');
          a.ok(r.live && r.live.email === 'me@example.test', 'own onSnapshot merges the private doc');
          a.ok(!('email' in r.theirs), 'another account read is not merged');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: a private account keeps its post mirror in the private doc; a public one keeps it public',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, { 'users/reg_personal': { username: 'reg_personal', isPrivate: true } }, async () => {
          const r = await page.evaluate(async () => {
            const fb = window.firebase;
            state.currentUser.isPrivate = true;
            await fb.setDoc(fb.doc(fb.db, 'users', 'reg_personal'), { customPosts: [{ id: 'cp1' }] }, { merge: true });
            await new Promise((res) => setTimeout(res, 40));
            const out = { pub: window.__pfs.docs['users/reg_personal'].customPosts, priv: (window.__pfs.docs['users/reg_personal/private/account'] || {}).customPosts };
            out.mergedPrivate = (await fb.getDoc(fb.doc(fb.db, 'users', 'reg_personal'))).data().customPosts;
            state.currentUser.isPrivate = false;
            window.__pfs.docs['users/reg_personal'].isPrivate = false;
            await fb.setDoc(fb.doc(fb.db, 'users', 'reg_personal'), { customPosts: [{ id: 'cp2' }] }, { merge: true });
            out.pubAfter = window.__pfs.docs['users/reg_personal'].customPosts;
            out.mergedPublic = (await fb.getDoc(fb.doc(fb.db, 'users', 'reg_personal'))).data().customPosts;
            return out;
          });
          a.equal(JSON.stringify(r.pub), '[]', 'public mirror empty while private');
          a.equal(r.priv[0].id, 'cp1', 'private mirror has the posts');
          a.equal(r.mergedPrivate[0].id, 'cp1', 'owner still sees their posts');
          a.equal(r.pubAfter[0].id, 'cp2', 'public account mirror is public again');
          a.equal(r.mergedPublic[0].id, 'cp2', 'stale private mirror ignored for a public account');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: "already taken" checks use the contact index without publishing contacts',
      accounts: ['personal'],
      async run({ page, a }) {
        const ek = await keyOf(page, 'email', 'taken@example.test');
        const pk = await keyOf(page, 'phone', '5555550142');
        await withMock(page, { ['contactIndex/' + ek]: { usernames: ['other_user'] }, ['contactIndex/' + pk]: { usernames: ['reg_personal'] } }, async () => {
          const r = await page.evaluate(async () => {
            const g = window.pixlyGuard;
            const first = g.contactIndexOwner('email', 'Taken@Example.test', 'reg_personal');
            await new Promise((res) => setTimeout(res, 80));
            return {
              first,
              email: g.contactIndexOwner('email', 'taken@example.test', 'reg_personal'),
              ownPhone: g.contactIndexOwner('phone', '+1 (555) 555-0142', 'reg_personal'),
              free: await g.lookupContactOwners('email', 'free@example.test')
            };
          });
          a.equal(r.first, null, 'first check never blocks (looks up in the background)');
          a.equal(r.email && r.email.username, 'other_user', 'email on another account is taken');
          a.equal(r.ownPhone, null, 'your own number is not "taken"');
          a.equal(r.free.length, 0, 'unused email is free');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: locked rules load posts with allowed queries only (public, mine, approved private)',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'users/dbl_priv_ok': { username: 'dbl_priv_ok', isPrivate: true },
          'users/dbl_priv_no': { username: 'dbl_priv_no', isPrivate: true },
          'posts/pub1': { id: 'pub1', author: 'dbl_pub', authorPrivate: false },
          'posts/mine1': { id: 'mine1', author: 'reg_personal', authorPrivate: true },
          'posts/ok1': { id: 'ok1', author: 'dbl_priv_ok', authorPrivate: true },
          'posts/no1': { id: 'no1', author: 'dbl_priv_no', authorPrivate: true },
          'posts/stranger1': { id: 'stranger1', author: 'dbl_stranger', authorPrivate: true }
        }, async () => {
          const r = await page.evaluate(async () => {
            const fb = window.firebase;
            const raw = fb.onSnapshot;
            const queries = [];
            // Behave like the security rules: only these exact queries are allowed.
            fb.onSnapshot = function (target, next, err) {
              const w = (target.parts || [])[0];
              queries.push(w ? w.f + '==' + w.v : 'ALL');
              const allowed = w && ((w.f === 'authorPrivate' && w.v === false) || (w.f === 'author' && (w.v === 'reg_personal' || w.v === 'dbl_priv_ok')));
              if (!allowed) { setTimeout(() => err && err({ code: 'permission-denied' }), 0); return () => {}; }
              return raw(target, next, err);
            };
            state.isLoggedIn = true;
            state.following = [{ username: 'dbl_priv_ok', isFollowing: true }, { username: 'dbl_priv_no', isFollowing: true }];
            window._acctPrivacy = {};
            let got = [];
            await window.attachScopedPostsListeners((list) => { got = list.map((p) => p.id).sort(); });
            await new Promise((res) => setTimeout(res, 150));
            if (window._postsCollectionUnsub) window._postsCollectionUnsub();
            return { got, queries, plan: window._postsScopedPlan, mode: window._postsScopedMode,
              planUnit: window.scopedPostsPlan('me', [{ username: 'a' }, { username: 'b', isFollowing: false }, { username: 'c' }], { a: true, b: true, c: false }).map((p) => p.key) };
          });
          a.ok(r.mode, 'scoped mode on');
          a.equal(r.got.join(','), 'mine1,ok1,pub1', 'public + own + approved private posts; others stay hidden');
          a.ok(!r.queries.includes('ALL'), 'never asks for the whole posts collection');
          a.equal(r.planUnit.join(','), 'public,mine,conn:a', 'plan: only followed private accounts get their own query');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: Explore paging switches to public posts only when the rules deny the open query',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'posts/ex_pub': { id: 'ex_pub', author: 'dbl_pub', authorPrivate: false, createdAt: 2 },
          'posts/ex_priv': { id: 'ex_priv', author: 'dbl_priv', authorPrivate: true, createdAt: 1 }
        }, async () => {
          const r = await page.evaluate(async () => {
            const fb = window.firebase; const raw = fb.getDocs; const asked = [];
            fb.getDocs = async (q) => {
              const w = (q.parts || []).find((p) => p.f === 'authorPrivate');
              asked.push(w ? 'public' : 'all');
              if (!w) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
              return raw(q);
            };
            const saved = Object.assign({}, window._explorePaged);
            window._explorePublicOnly = false;
            await fetchExplorePostsPage(true);
            const out = { asked, ids: window._explorePaged.posts.map((p) => p.id), flag: window._explorePublicOnly };
            Object.assign(window._explorePaged, saved, { posts: saved.posts });
            window._explorePublicOnly = false;
            return out;
          });
          a.equal(r.asked.join(','), 'all,public', 'open query first, then public-only');
          a.equal(r.ids.join(','), 'ex_pub', 'only public posts listed');
          a.ok(r.flag, 'remembers to ask for public posts only');
        });
      }
    },
    {
      name: "DB lockdown: Bradley's decision: going Public auto-approves every pending connect request (fails safe)",
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {
          'users/reg_personal': { username: 'reg_personal', isPrivate: true },
          'users/dbl_r1': { username: 'dbl_r1', following: [] },
          'users/dbl_r2': { username: 'dbl_r2', following: [] },
          'users/reg_personal/connectRequests/dbl_r1': { username: 'dbl_r1', fullName: 'R1', requestedAt: 1 },
          'users/reg_personal/connectRequests/dbl_r2': { username: 'dbl_r2', fullName: 'R2', requestedAt: 2 }
        }, async () => {
          const r = await page.evaluate(async () => {
            state.isLoggedIn = true; state.currentUser.isPrivate = true; window._acctPrivacy = { reg_personal: true };
            window._incomingConnectRequests = { owner: '', list: [] };
            const toasts = []; const origToast = window.showToast;
            window.showToast = (m) => { toasts.push(m); };
            // Still private: nothing is approved by itself.
            applyIncomingConnectRequests('reg_personal', [{ id: 'dbl_r1', username: 'dbl_r1' }]);
            await new Promise((res) => setTimeout(res, 120));
            const stillPending = !!window.__pfs.docs['users/reg_personal/connectRequests/dbl_r1'];
            window._lastLocalPrivacyWriteTs = 0;
            await setAccountPrivacy(false);
            await new Promise((res) => setTimeout(res, 400));
            const d = window.__pfs.docs;
            const out = {
              stillPending,
              req1: !!d['users/reg_personal/connectRequests/dbl_r1'], req2: !!d['users/reg_personal/connectRequests/dbl_r2'],
              edge1: !!d['users/reg_personal/followers/dbl_r1'], edge2: !!d['users/reg_personal/followers/dbl_r2'],
              f1: (d['users/dbl_r1'].following || []).some((f) => f.username === 'reg_personal' && f.isFollowing),
              summary: toasts.filter((t) => /Approved 2 pending/.test(t)).length,
              perUserToasts: toasts.filter((t) => /^Approved @/.test(t)).length
            };
            // A write failure leaves the request pending (retried next time the list loads).
            d['users/reg_personal/connectRequests/dbl_r3'] = { username: 'dbl_r3' };
            d['users/dbl_r3'] = { username: 'dbl_r3' };
            window.__pfs.failWrites = true;
            await window.autoApprovePendingRequests('reg_personal');
            window.__pfs.failWrites = false;
            out.failedStaysPending = !!d['users/reg_personal/connectRequests/dbl_r3'];
            window.showToast = origToast;
            window._incomingConnectRequests = { owner: '', list: [] };
            return out;
          });
          a.ok(r.stillPending, 'private account: requests wait for approval');
          a.ok(!r.req1 && !r.req2, 'both pending requests approved on going public');
          a.ok(r.edge1 && r.edge2, 'Connections edges written');
          a.ok(r.f1, "requester's Connected list has the account");
          a.equal(r.summary, 1, 'one summary toast');
          a.equal(r.perUserToasts, 0, 'no toast per request');
          a.ok(r.failedStaysPending, 'failed approval stays pending');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: per-user Auth sign-in reports wrong password, network and account mismatch safely',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {}, async () => {
          const r = await page.evaluate(async ([u, uid, em, pw]) => {
            const g = window.pixlyGuard; const d = { uid, authEmail: em };
            const out = {};
            out.legacy = await g.signInAccount(u, { passwordHash: 'sha256:x' }, pw);
            out.wrong = await g.signInAccount(u, d, 'nope');
            window.__authNetworkDown = true; out.net = await g.signInAccount(u, d, pw); window.__authNetworkDown = false;
            window.__authWrongUid = true; out.mismatch = await g.signInAccount(u, d, pw); window.__authWrongUid = false;
            out.signedOutAfterMismatch = window.firebase.auth.currentUser === null;
            out.ok = await g.signInAccount(u, d, pw);
            out.sentSecret = window.__authCalls.filter((c) => c.fn === 'signIn').pop().p;
            out.uidIndex = window.__pfs.docs['uidIndex/' + uid];
            out.msgNet = g.authLoginErrorMessage('network', u);
            out.msgWrong = g.authLoginErrorMessage('wrong-password', u);
            return out;
          }, [MIG, MIG_UID, MIG_AUTH, MIG_PW]);
          a.equal(r.legacy.code, 'not-migrated', 'legacy account keeps the old login path');
          a.equal(r.wrong.code, 'wrong-password');
          a.equal(r.net.code, 'network');
          a.equal(r.mismatch.code, 'mismatch'); a.ok(r.signedOutAfterMismatch, 'mismatched session signed out');
          a.ok(r.ok.ok, 'correct password signs in');
          a.equal(r.sentSecret, 'pixlynote_v1:' + MIG_PW, 'Auth gets the same derived secret the old hash used');
          a.equal(r.uidIndex && r.uidIndex.username, MIG, 'uidIndex links the uid to the account');
          a.ok(/try again/i.test(r.msgNet) && /Incorrect/.test(r.msgWrong), 'friendly messages');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: sign-up creates a Firebase Auth user with a private placeholder login email',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {}, async () => {
          const r = await page.evaluate(async () => {
            const info = await window.pixlyGuard.createAuthAccount('New.User_1', 'Pw-123456');
            const call = window.__authCalls.find((c) => c.fn === 'create');
            const u = window._pixlyAuthUsername;
            window._pixlyAuthUsername = '';
            return { info, call, u, uses: window.pixlyGuard.accountUsesAuth({ uid: info.uid, authEmail: info.authEmail }) };
          });
          a.ok(/^new\.user_1\.[0-9a-f]{12}@users\.pixlynote\.app$/.test(r.info.authEmail), 'placeholder login email (no real email in Auth): ' + r.info.authEmail);
          a.equal(r.call.p, 'pixlynote_v1:Pw-123456', 'Auth secret derived like the old hash');
          a.equal(r.u, 'new.user_1', 'session linked to the new account');
          a.ok(r.uses, 'account now uses Firebase Auth');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: password change goes through Firebase Auth (re-auth first); Privileged Access cannot change it',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, {}, async () => {
          const r = await page.evaluate(async ([u, uid, em, pw]) => {
            const g = window.pixlyGuard; const out = {};
            out.legacy = await g.changeAuthPassword('some_legacy_user', 'a', 'b');
            await g.signInAccount(u, { uid, authEmail: em }, pw);
            out.wrongCur = await g.changeAuthPassword(u, 'not-it', 'New-pw-2');
            out.ok = await g.changeAuthPassword(u, pw, 'New-pw-2');
            out.stored = window.__authUsers[em].pw;
            window.firebase.auth.currentUser = { uid: 'uid-delegate', isAnonymous: false, email: 'x@users.pixlynote.app' };
            out.delegate = await g.changeAuthPassword(u, 'New-pw-2', 'Other-pw-3');
            return out;
          }, [MIG, MIG_UID, MIG_AUTH, MIG_PW]);
          a.equal(r.legacy.handled, false, 'legacy accounts keep the old password path');
          a.ok(r.wrongCur.handled && !r.wrongCur.ok && /incorrect/i.test(r.wrongCur.message), 'wrong current password refused');
          a.ok(r.ok.handled && r.ok.ok, 'password changed');
          a.equal(r.stored, 'pixlynote_v1:New-pw-2', 'Auth has the new password');
          a.ok(r.delegate.handled && !r.delegate.ok, 'a Privileged Access session cannot change the owner password');
        });
      }
    },
    {
      name: 'DB lockdown: Unit: Privileged Access grant/revoke updates delegateUids used by the rules',
      accounts: ['personal'],
      async run({ page, a }) {
        await withMock(page, { 'users/reg_personal': { username: 'reg_personal' }, 'users/dbl_helper': { username: 'dbl_helper', uid: 'uid-helper' }, 'users/dbl_legacy': { username: 'dbl_legacy' } }, async () => {
          const r = await page.evaluate(async () => {
            const g = window.pixlyGuard;
            const fb = window.firebase;
            const writes = [];
            const raw = fb.setDoc;
            fb.setDoc = (ref, d, o) => { writes.push({ path: ref.path, d }); return raw(ref, d, o); };
            const add = await g.syncDelegateUid('reg_personal', 'dbl_helper', true);
            const legacy = await g.syncDelegateUid('reg_personal', 'dbl_legacy', true);
            const rem = await g.syncDelegateUid('reg_personal', 'dbl_helper', false);
            return { add, legacy, rem, writes };
          });
          a.ok(r.add && r.rem, 'grant and revoke written');
          a.equal(r.legacy, false, 'not-yet-migrated grantee: nothing to add');
          a.equal(r.writes[0].path, 'users/reg_personal'); a.ok('delegateUids' in r.writes[0].d, 'delegateUids on the owner doc');
        });
      }
    },
    {
      name: 'DB lockdown: E2E: a migrated account logs in with its password via Firebase Auth; no password hash is written',
      accounts: ['signed-out'],
      async run({ page, h, a }) {
        try {
          await setup(page, {
            ['users/' + MIG]: { username: MIG, fullName: 'DBL Migrated', uid: MIG_UID, authEmail: MIG_AUTH, isPlus: true, likedPostIds: ['p1'] },
            ['users/' + MIG + '/private/account']: { email: 'dbl@example.test' }
          });
          await h.openLoginForm(page);
          await page.fill('#login-username', MIG);
          await page.fill('#login-password', 'wrong-password');
          await page.click('#btn-auth-submit');
          await tick(page, 900);
          const afterWrong = await page.evaluate(() => !!(state.isLoggedIn && state.currentUser.username === 'dbl_mig'));
          a.ok(!afterWrong, 'wrong password does not sign in');
          await page.fill('#login-password', MIG_PW);
          await page.click('#btn-auth-submit');
          await page.waitForFunction(() => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === 'dbl_mig'), null, { timeout: 8000 });
          await tick(page, 600);
          const r = await page.evaluate(() => ({
            authU: window._pixlyAuthUsername,
            hashWrites: window.__pfs.writes.filter((w) => w.data && ('passwordHash' in w.data || 'password' in w.data)).length,
            pubEmail: 'email' in window.__pfs.docs['users/dbl_mig'],
            idx: window.__pfs.docs['uidIndex/uid-dbl-mig'],
            plus: window.__pfs.docs['users/dbl_mig'].isPlus,
            signIns: window.__authCalls.filter((c) => c.fn === 'signIn').length
          }));
          a.equal(r.authU, MIG, 'Auth session belongs to the account');
          a.equal(r.hashWrites, 0, 'no password hash written anywhere');
          a.ok(!r.pubEmail, 'email still not on the public doc after login');
          a.equal(r.idx && r.idx.username, MIG, 'uidIndex linked');
          a.equal(r.plus, true, 'Plus kept');
          a.equal(r.signIns, 2, 'both attempts went to Firebase Auth');
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
          await reloadSignedOut(page, h);
        }
      }
    }
  ]
};
