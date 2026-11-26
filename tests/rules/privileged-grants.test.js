'use strict';
// Per-permission Privileged Access grants (branch grokbot/privileged-grants). Rules emulator only, never production.
//   users/{owner}.delegateUids         - who may view as the owner (unchanged)
//   users/{owner}.delegateGrants[uid]  - what that delegate may do: post, note, like, comment, dm, editProfile,
//                                        deletePost, billing, promote. Missing / [] = read only (old grants migrate as is).
// Every delegate write must match an ON grant; anything else stays owner-only.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } = require('firebase/firestore');

let env;
const UID = { owner: 'uid-owner', del: 'uid-del', ro: 'uid-ro', mallory: 'uid-mallory', admin: 'uid-admin', pour: 'uid-pour', other: 'uid-other' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const ALL = ['post', 'note', 'like', 'comment', 'dm', 'editProfile', 'deletePost', 'billing', 'promote'];

async function seed(grants) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/pixlynote', { username: 'pixlynote', uid: UID.admin, isPrivate: false });
    await put('users/owner', {
      username: 'owner', uid: UID.owner, isPrivate: false, bio: 'hi', fullName: 'Owner', accountType: 'personal',
      delegateUids: [UID.del, UID.ro],
      delegateGrants: grants === undefined ? { [UID.del]: ALL } : grants,
      likedPostIds: []
    });
    await put('users/del', { username: 'del', uid: UID.del, isPrivate: false });
    await put('users/ro', { username: 'ro', uid: UID.ro, isPrivate: false });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory, isPrivate: false });
    await put('users/other', { username: 'other', uid: UID.other, isPrivate: false });
    await put('users/morning_pour', { username: 'morning_pour', uid: UID.pour, isPrivate: false, isShowcase: true, delegateUids: [UID.del], delegateGrants: { [UID.del]: ALL } });
    for (const [n, u] of Object.entries({ pixlynote: UID.admin, owner: UID.owner, del: UID.del, ro: UID.ro, mallory: UID.mallory, other: UID.other, morning_pour: UID.pour })) {
      await put('uidIndex/' + u, { username: n });
    }
    await put('users/owner/content/profile', { notes: [{ id: 1, author: 'owner', text: 'first' }] });
    await put('users/owner/private/account', { email: 'o@example.com', dms: [] });
    await put('users/owner/billing/cs_1', { kind: 'promote', amountCents: 500, status: 'paid' });
    await put('posts/p_owner', { id: 'p_owner', author: 'owner', authorPrivate: false, caption: 'mine', comments: [], likedBy: [], views: 0 });
    await put('posts/p_other', { id: 'p_other', author: 'other', authorPrivate: false, caption: 'theirs', comments: [], likedBy: [], views: 0 });
  });
}

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-privileged-grants',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });
const ref = (db, p) => doc(db, p);
const newPost = (id, extra) => Object.assign({ id, author: 'owner', authorPrivate: false, caption: 'by delegate', comments: [] }, extra || {});

// ---------- grants are owner-only ----------
test('grants: only the owner can set or change delegateGrants; a delegate cannot grant itself more', async () => {
  await assertFails(updateDoc(ref(real(UID.ro), 'users/owner'), { delegateGrants: { [UID.ro]: ALL } }));
  await assertFails(updateDoc(ref(real(UID.del), 'users/owner'), { [`delegateGrants.${UID.ro}`]: ['post'] }));
  await assertFails(updateDoc(ref(real(UID.mallory), 'users/owner'), { delegateGrants: { [UID.mallory]: ALL } }));
  await assertSucceeds(updateDoc(ref(real(UID.owner), 'users/owner'), { [`delegateGrants.${UID.ro}`]: ['like'] }));
});
test('grants: a delegate cannot add itself to delegateUids', async () => {
  await assertFails(updateDoc(ref(real(UID.mallory), 'users/owner'), { delegateUids: arrayUnion(UID.mallory) }));
});

// ---------- Post posts ----------
test('post: a delegate with the post grant may create a post for the owner, stamped with its own name', async () => {
  await assertSucceeds(setDoc(ref(real(UID.del), 'posts/p_new'), newPost('p_new', { delegatedBy: 'del' })));
});
test('post: unstamped or forged-stamp delegate posts are denied', async () => {
  await assertFails(setDoc(ref(real(UID.del), 'posts/p_new'), newPost('p_new')));
  await assertFails(setDoc(ref(real(UID.del), 'posts/p_new'), newPost('p_new', { delegatedBy: 'someone_else' })));
});
test('post: a read-only delegate (no grants, the migrated default) cannot post', async () => {
  await assertFails(setDoc(ref(real(UID.ro), 'posts/p_new'), newPost('p_new', { delegatedBy: 'ro' })));
});
test('post: without the post grant (other grants on) a delegate cannot post', async () => {
  await env.clearFirestore(); await seed({ [UID.del]: ['like', 'comment'] });
  await assertFails(setDoc(ref(real(UID.del), 'posts/p_new'), newPost('p_new', { delegatedBy: 'del' })));
});
test('post: a stranger cannot post for the owner even with a stamp', async () => {
  await assertFails(setDoc(ref(real(UID.mallory), 'posts/p_new'), newPost('p_new', { delegatedBy: 'mallory' })));
});
test('post: a delegate with grants still cannot edit the owner\'s post caption (no edit grant)', async () => {
  await assertFails(updateDoc(ref(real(UID.del), 'posts/p_owner'), { caption: 'changed' }));
});

// ---------- Delete posts ----------
test('deletePost: only with the deletePost grant', async () => {
  await env.clearFirestore(); await seed({ [UID.del]: ['post'] });
  await assertFails(deleteDoc(ref(real(UID.del), 'posts/p_owner')));
  await env.clearFirestore(); await seed({ [UID.del]: ['deletePost'] });
  await assertSucceeds(deleteDoc(ref(real(UID.del), 'posts/p_owner')));
});
test('deletePost: the grant covers only the owner\'s posts', async () => {
  await assertFails(deleteDoc(ref(real(UID.del), 'posts/p_other')));
});

// ---------- Post notes ----------
test('note: a delegate with the note grant adds exactly one stamped note at the top', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.del), 'users/owner/content/profile'), {
    notes: [{ id: 2, author: 'owner', text: 'by delegate', delegatedBy: 'del' }, { id: 1, author: 'owner', text: 'first' }]
  }));
});
test('note: unstamped notes, rewriting old notes, or touching other content fields are denied', async () => {
  await assertFails(updateDoc(ref(real(UID.del), 'users/owner/content/profile'), { notes: [{ id: 2, author: 'owner', text: 'x' }, { id: 1, author: 'owner', text: 'first' }] }));
  await assertFails(updateDoc(ref(real(UID.del), 'users/owner/content/profile'), { notes: [{ id: 2, author: 'owner', text: 'x', delegatedBy: 'del' }] }));
  await assertFails(updateDoc(ref(real(UID.del), 'users/owner/content/profile'), { following: ['x'] }));
});
test('note: read-only delegate cannot add a note', async () => {
  await assertFails(updateDoc(ref(real(UID.ro), 'users/owner/content/profile'), {
    notes: [{ id: 2, author: 'owner', text: 'x', delegatedBy: 'ro' }, { id: 1, author: 'owner', text: 'first' }]
  }));
});

// ---------- Like ----------
test('like: a delegate with the like grant likes a post as the owner and is recorded in likeDelegates', async () => {
  await assertSucceeds(setDoc(ref(real(UID.del), 'posts/p_other'), { likedBy: arrayUnion('owner'), likeDelegates: { owner: 'del' } }, { merge: true }));
  await assertSucceeds(setDoc(ref(real(UID.del), 'users/owner'), { likedPostIds: arrayUnion('p_other'), lastUpdated: 1 }, { merge: true }));
  const d = (await getDoc(ref(real(UID.del), 'posts/p_other'))).data();
  if (!d.likedBy.includes('owner') || d.likeDelegates.owner !== 'del') throw new Error('like not recorded');
  await assertSucceeds(updateDoc(ref(real(UID.del), 'posts/p_other'), { likedBy: arrayRemove('owner') }));
});
test('like: without the grant, or lying about who did it, is denied', async () => {
  await assertFails(setDoc(ref(real(UID.ro), 'posts/p_other'), { likedBy: arrayUnion('owner'), likeDelegates: { owner: 'ro' } }, { merge: true }));
  await assertFails(setDoc(ref(real(UID.ro), 'users/owner'), { likedPostIds: arrayUnion('p_other') }, { merge: true }));
  await assertFails(setDoc(ref(real(UID.del), 'posts/p_other'), { likedBy: arrayUnion('owner'), likeDelegates: { owner: 'mallory' } }, { merge: true }));
  await assertFails(setDoc(ref(real(UID.mallory), 'posts/p_other'), { likedBy: arrayUnion('owner'), likeDelegates: { owner: 'mallory' } }, { merge: true }));
});
test('like: a delegate cannot like for a Showcase owner (no fake engagement)', async () => {
  await assertFails(setDoc(ref(real(UID.del), 'posts/p_other'), { likedBy: arrayUnion('morning_pour'), likeDelegates: { morning_pour: 'del' } }, { merge: true }));
});
test('like: normal likes by the signed-in account still work', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.mallory), 'posts/p_other'), { likedBy: arrayUnion('mallory') }));
});

// ---------- Comment ----------
test('comment: a delegate with the comment grant comments as the owner with its own stamp', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.del), 'posts/p_other'), { comments: [{ id: 1, user: 'owner', text: 'hi', delegatedBy: 'del' }] }));
});
test('comment: no grant, no stamp, or a forged stamp is denied', async () => {
  await assertFails(updateDoc(ref(real(UID.ro), 'posts/p_other'), { comments: [{ id: 1, user: 'owner', text: 'hi', delegatedBy: 'ro' }] }));
  await assertFails(updateDoc(ref(real(UID.del), 'posts/p_other'), { comments: [{ id: 1, user: 'owner', text: 'hi' }] }));
  await assertFails(updateDoc(ref(real(UID.mallory), 'posts/p_other'), { comments: [{ id: 1, user: 'owner', text: 'hi', delegatedBy: 'mallory' }] }));
});
test('comment: commenting in your own name still works', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.mallory), 'posts/p_other'), { comments: [{ id: 1, user: 'mallory', text: 'hi' }] }));
});
test('comment: the comment grant covers the owner\'s commentsMap only', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.del), 'users/owner'), { commentsMap: { p_other: [] } }));
  await assertFails(updateDoc(ref(real(UID.ro), 'users/owner'), { commentsMap: { p_other: [{ id: 2 }] } }));
});

// ---------- Send DMs ----------
test('dm: a delegate with the dm grant may change only the owner\'s DMs', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.del), 'users/owner/private/account'), { dms: [{ user: 'x', chat: [{ text: 'hi', delegatedBy: 'del' }] }], lastDmUpdated: 1 }));
  await assertFails(updateDoc(ref(real(UID.del), 'users/owner/private/account'), { email: 'evil@example.com' }));
});
test('dm: a read-only delegate cannot send DMs', async () => {
  await assertFails(updateDoc(ref(real(UID.ro), 'users/owner/private/account'), { dms: [], lastDmUpdated: 1 }));
});

// ---------- Edit profile ----------
test('editProfile: name, bio, link and photo only', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.del), 'users/owner'), { bio: 'new bio', fullName: 'Owner Two', link: 'https://example.com' }));
  for (const f of [{ username: 'x' }, { accountType: 'business' }, { isPrivate: true }, { isPlus: true }, { uid: UID.del },
    { isShowcase: true }, { delegateUids: [UID.del, UID.ro, UID.mallory] }, { following: ['x'] }]) {
    await assertFails(updateDoc(ref(real(UID.del), 'users/owner'), f), JSON.stringify(f));
  }
});
test('editProfile: without the grant a delegate cannot edit the profile', async () => {
  await assertFails(updateDoc(ref(real(UID.ro), 'users/owner'), { bio: 'nope' }));
  await env.clearFirestore(); await seed({ [UID.del]: ['like'] });
  await assertFails(updateDoc(ref(real(UID.del), 'users/owner'), { bio: 'nope' }));
});

// ---------- View Billing History and stats ----------
test('billing: a delegate reads Billing History only with the billing grant', async () => {
  await assertSucceeds(getDoc(ref(real(UID.del), 'users/owner/billing/cs_1')));
  await assertSucceeds(getDocs(collection(real(UID.del), 'users/owner/billing')));
  await assertFails(getDoc(ref(real(UID.ro), 'users/owner/billing/cs_1')));
  await assertFails(getDoc(ref(real(UID.mallory), 'users/owner/billing/cs_1')));
  await assertSucceeds(getDoc(ref(real(UID.owner), 'users/owner/billing/cs_1')));
});
test('billing: nobody but the Worker/admin writes billing records, delegates included', async () => {
  await assertFails(setDoc(ref(real(UID.del), 'users/owner/billing/cs_2'), { kind: 'promote', amountCents: 1 }));
});

// ---------- Promote (enforced by the Worker; rules keep promote fields Worker-only) ----------
test('promote: even with the promote grant, a delegate cannot write promote fields directly', async () => {
  await assertFails(updateDoc(ref(real(UID.del), 'posts/p_owner'), { isPromoted: true }));
});

// ---------- revoked delegate ----------
test('revoked: a grant left behind after the delegate is removed from delegateUids does nothing', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'users/owner'), { delegateUids: [] }); });
  await assertFails(setDoc(ref(real(UID.del), 'posts/p_new'), newPost('p_new', { delegatedBy: 'del' })));
  await assertFails(getDoc(ref(real(UID.del), 'users/owner/billing/cs_1')));
});
