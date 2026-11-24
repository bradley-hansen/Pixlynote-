'use strict';
// Firestore security rules tests. Run inside the local emulator only (never production):
//   npm run test:rules   (firebase emulators:exec --only firestore "node --test tests/rules")
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, increment, arrayUnion, arrayRemove
} = require('firebase/firestore');

const PROJECT = 'demo-pixlynote-rules';
let env;

const UID = { brad: 'uid-brad', alice: 'uid-alice', priv: 'uid-priv', admin: 'uid-admin', mallory: 'uid-mallory', helper: 'uid-helper' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = () => env.authenticatedContext('anon-visitor', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/bradley_hansen', { username: 'bradley_hansen', uid: UID.brad, authEmail: 'b@users.pixlynote.app', fullName: 'Bradley', bio: 'hi', isPrivate: false, delegateUids: [UID.helper] });
    await put('users/alice', { username: 'alice', uid: UID.alice, fullName: 'Alice', isPrivate: false });
    await put('users/private_pat', { username: 'private_pat', uid: UID.priv, fullName: 'Pat', isPrivate: true });
    await put('users/pixlynote', { username: 'pixlynote', uid: UID.admin, fullName: 'Pixlynote' });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory, fullName: 'Mallory' });
    await put('users/helper', { username: 'helper', uid: UID.helper, fullName: 'Helper' });
    await put('users/stub_persona', { notifications: [] });
    await put('users/legacy_user', { username: 'legacy_user', passwordHash: 'sha256:abc' });
    for (const [n, u] of Object.entries({ bradley_hansen: UID.brad, alice: UID.alice, private_pat: UID.priv, pixlynote: UID.admin, mallory: UID.mallory, helper: UID.helper })) {
      await put('uidIndex/' + u, { username: n });
    }
    await put('users/bradley_hansen/private/account', { email: 'brad@example.test', phone: '+15555550100', dms: [] });
    await put('users/private_pat/followers/alice', { username: 'alice', followedAt: 1 });
    await put('posts/p_public', { id: 'p_public', author: 'bradley_hansen', authorPrivate: false, caption: 'public', comments: [], views: 0 });
    await put('posts/p_private', { id: 'p_private', author: 'private_pat', authorPrivate: true, caption: 'private', comments: [], views: 0 });
    await put('users/private_pat/connectRequests/mallory', { username: 'mallory', fullName: 'M', avatar: '', requestedAt: 1 });
    await put('accountCenters/bradley_hansen', { accounts: [{ username: 'bradley_hansen', email: 'brad@example.test' }], removedUsernames: [] });
    await put('profileHistory/bradley_hansen', { entries: [] });
    await put('contactIndex/k_brad', { usernames: ['bradley_hansen'], by: 'bradley_hansen' });
    await put('closeFriends/bradley_hansen', { list: ['alice'] });
    await put('blocks/bradley_hansen', { list: [] });
    await put('noteViews/n1', { views: 3 });
    await put('story_comments/bradley_hansen__s1', { comments: [] });
    await put('verificationRequests/alice', { status: 'pending' });
    await put('secretStuff/x', { a: 1 });
  });
}

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

// ---- users/{u} public doc ----
test('users: anyone (even signed-out) can read the public profile header', async () => {
  await assertSucceeds(getDoc(doc(nobody(), 'users/private_pat')));
  await assertSucceeds(getDoc(doc(anon(), 'users/bradley_hansen')));
});
test('users: owner can edit own profile; another account cannot', async () => {
  await assertSucceeds(updateDoc(doc(real(UID.brad), 'users/bradley_hansen'), { bio: 'new bio' }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { bio: 'pwned' }));
  await assertFails(updateDoc(doc(anon(), 'users/bradley_hansen'), { bio: 'pwned' }));
});
test('users: owner cannot change uid or put contact/credential fields on the public doc', async () => {
  await assertFails(updateDoc(doc(real(UID.brad), 'users/bradley_hansen'), { uid: 'other' }));
  await assertFails(updateDoc(doc(real(UID.brad), 'users/bradley_hansen'), { email: 'x@y.z' }));
  await assertFails(updateDoc(doc(real(UID.brad), 'users/bradley_hansen'), { phone: '+1555' }));
  await assertFails(updateDoc(doc(real(UID.brad), 'users/bradley_hansen'), { passwordHash: 'sha256:1' }));
  await assertFails(updateDoc(doc(real(UID.brad), 'users/bradley_hansen'), { dms: [] }));
});
test('users: another signed-in account may only append their own notification, not rewrite following or grant Plus', async () => {
  await assertSucceeds(setDoc(doc(real(UID.alice), 'users/bradley_hansen'), { notifications: [{ id: 1, fromUser: 'alice' }] }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.priv), 'users/alice'), { following: [{ username: 'private_pat' }] }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.alice), 'users/bradley_hansen'), { notifications: [], isPlus: true }, { merge: true }));
  await assertFails(setDoc(doc(anon(), 'users/bradley_hansen'), { notifications: [] }, { merge: true }));
});
test('users: sign-up creates a doc bound to your own uid only', async () => {
  const fresh = 'uid-fresh';
  await assertSucceeds(setDoc(doc(real(fresh), 'users/newbie'), { username: 'newbie', uid: fresh, isPlus: false }));
  await assertFails(setDoc(doc(real(fresh), 'users/newbie2'), { username: 'newbie2', uid: 'someone-else' }));
  await assertFails(setDoc(doc(real(fresh), 'users/newbie3'), { username: 'newbie3', uid: fresh, email: 'a@b.c' }));
  await assertFails(setDoc(doc(anon(), 'users/newbie4'), { username: 'newbie4', uid: 'anon-visitor' }));
});
test('users: a placeholder doc can be claimed at sign-up, a real or legacy account cannot', async () => {
  const fresh = 'uid-fresh2';
  await assertSucceeds(setDoc(doc(real(fresh), 'users/stub_persona'), { username: 'stub_persona', uid: fresh }, { merge: true }));
  await assertFails(setDoc(doc(real(fresh), 'users/legacy_user'), { uid: fresh }, { merge: true }));
  await assertFails(setDoc(doc(real(fresh), 'users/alice'), { uid: fresh }, { merge: true }));
});
test('users: only the owner or admin can delete an account doc', async () => {
  await assertFails(deleteDoc(doc(real(UID.mallory), 'users/alice')));
  await assertSucceeds(deleteDoc(doc(real(UID.alice), 'users/alice')));
  await assertSucceeds(deleteDoc(doc(real(UID.admin), 'users/mallory')));
});

// ---- private contact data ----
test('private: email/phone/DMs readable and writable by the owner only (plus admin and delegates)', async () => {
  await assertSucceeds(getDoc(doc(real(UID.brad), 'users/bradley_hansen/private/account')));
  await assertSucceeds(setDoc(doc(real(UID.brad), 'users/bradley_hansen/private/account'), { email: 'new@example.test' }, { merge: true }));
  await assertFails(getDoc(doc(real(UID.mallory), 'users/bradley_hansen/private/account')));
  await assertFails(getDoc(doc(anon(), 'users/bradley_hansen/private/account')));
  await assertFails(getDoc(doc(nobody(), 'users/bradley_hansen/private/account')));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/bradley_hansen/private/account'), { email: 'evil@example.test' }, { merge: true }));
  await assertSucceeds(getDoc(doc(real(UID.admin), 'users/bradley_hansen/private/account')));
  await assertSucceeds(getDoc(doc(real(UID.helper), 'users/bradley_hansen/private/account')));
});

// ---- Privileged Access delegates ----
test('delegates: a granted account can act for the owner but cannot change who is granted', async () => {
  await assertSucceeds(updateDoc(doc(real(UID.helper), 'users/bradley_hansen'), { bio: 'by helper' }));
  await assertFails(updateDoc(doc(real(UID.helper), 'users/bradley_hansen'), { delegateUids: [UID.helper, UID.mallory] }));
  await assertSucceeds(updateDoc(doc(real(UID.brad), 'users/bradley_hansen'), { delegateUids: [] }));
  await assertFails(updateDoc(doc(real(UID.helper), 'users/bradley_hansen'), { bio: 'revoked' }));
});

// ---- posts ----
test('posts: a public post is readable by everyone', async () => {
  await assertSucceeds(getDoc(doc(nobody(), 'posts/p_public')));
  await assertSucceeds(getDoc(doc(anon(), 'posts/p_public')));
});
test('posts: a private account post is readable by the owner and approved connections only (no admin bypass by default)', async () => {
  await assertFails(getDoc(doc(nobody(), 'posts/p_private')));
  await assertFails(getDoc(doc(anon(), 'posts/p_private')));
  await assertFails(getDoc(doc(real(UID.mallory), 'posts/p_private')));
  await assertSucceeds(getDoc(doc(real(UID.alice), 'posts/p_private')));
  await assertSucceeds(getDoc(doc(real(UID.priv), 'posts/p_private')));
  await assertFails(getDoc(doc(real(UID.admin), 'posts/p_private')));
  // Admin moderation still works: delete by id without reading.
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'posts/p_private2'), { id: 'p_private2', author: 'private_pat', authorPrivate: true }));
  await assertSucceeds(deleteDoc(doc(real(UID.admin), 'posts/p_private2')));
});
test('posts: the feed query must be constrained (rules are not filters)', async () => {
  await assertFails(getDocs(collection(anon(), 'posts')));
  const pub = await assertSucceeds(getDocs(query(collection(anon(), 'posts'), where('authorPrivate', '==', false))));
  assert.deepStrictEqual(pub.docs.map((d) => d.id), ['p_public']);
  await assertSucceeds(getDocs(query(collection(anon(), 'posts'), where('author', '==', 'bradley_hansen'))));
  await assertFails(getDocs(query(collection(real(UID.mallory), 'posts'), where('author', '==', 'private_pat'))));
  const conn = await assertSucceeds(getDocs(query(collection(real(UID.alice), 'posts'), where('author', '==', 'private_pat'))));
  assert.strictEqual(conn.size, 1);
  await assertSucceeds(getDocs(query(collection(real(UID.priv), 'posts'), where('author', '==', 'private_pat'))));
  await assertFails(getDocs(collection(real(UID.admin), 'posts')));
  await assertSucceeds(getDocs(query(collection(real(UID.admin), 'posts'), where('authorPrivate', '==', false))));
});
test('posts: an unknown author can never unlock a query (no exists() loophole)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'posts/p_legacy'), { id: 'p_legacy', author: 'bradley_hansen', caption: 'no authorPrivate field yet' });
  });
  await assertFails(getDocs(collection(real(UID.mallory), 'posts')));
  await assertFails(getDocs(query(collection(anon(), 'posts'), where('author', 'in', ['bradley_hansen', 'private_pat']))));
  // A legacy post without the authorPrivate field is still visible on its public author's profile.
  const legacy = await assertSucceeds(getDocs(query(collection(anon(), 'posts'), where('author', '==', 'bradley_hansen'))));
  assert.ok(legacy.docs.some((d) => d.id === 'p_legacy'));
});
test('posts: only the author creates, edits or deletes; no impersonation', async () => {
  await assertSucceeds(setDoc(doc(real(UID.brad), 'posts/p_new'), { id: 'p_new', author: 'bradley_hansen', authorPrivate: false }));
  await assertFails(setDoc(doc(real(UID.mallory), 'posts/p_fake'), { id: 'p_fake', author: 'bradley_hansen', authorPrivate: false }));
  await assertFails(setDoc(doc(anon(), 'posts/p_anon'), { id: 'p_anon', author: 'bradley_hansen', authorPrivate: false }));
  await assertSucceeds(updateDoc(doc(real(UID.brad), 'posts/p_public'), { caption: 'edited' }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'posts/p_public'), { caption: 'pwned' }));
  await assertFails(updateDoc(doc(real(UID.brad), 'posts/p_public'), { author: 'alice' }));
  await assertFails(deleteDoc(doc(real(UID.mallory), 'posts/p_public')));
  await assertSucceeds(deleteDoc(doc(real(UID.admin), 'posts/p_public')));
});
test('posts: a username change moves posts to the new name you own, never to someone else', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/brad_renamed'), { username: 'brad_renamed', uid: UID.brad, isPrivate: false });
  });
  await assertSucceeds(updateDoc(doc(real(UID.brad), 'posts/p_public'), { author: 'brad_renamed' }));
  await assertFails(updateDoc(doc(real(UID.brad), 'posts/p_public'), { author: 'alice' }));
});
test('posts: a private account cannot publish a post marked public', async () => {
  await assertFails(setDoc(doc(real(UID.priv), 'posts/p2'), { id: 'p2', author: 'private_pat', authorPrivate: false }));
  await assertSucceeds(setDoc(doc(real(UID.priv), 'posts/p3'), { id: 'p3', author: 'private_pat', authorPrivate: true }));
});
test('posts: comments by anyone signed in on visible posts; views counted by visitors', async () => {
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'posts/p_public'), { comments: [{ id: 1, text: 'nice' }] }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'posts/p_private'), { comments: [{ id: 1 }] }));
  await assertSucceeds(updateDoc(doc(real(UID.alice), 'posts/p_private'), { comments: [{ id: 2 }] }));
  await assertSucceeds(updateDoc(doc(anon(), 'posts/p_public'), { views: increment(1) }));
  await assertFails(updateDoc(doc(anon(), 'posts/p_private'), { views: increment(1) }));
  await assertFails(updateDoc(doc(anon(), 'posts/p_public'), { comments: [] }));
});

test("Bradley's decision: a private user's comments and likes on public posts stay visible to everyone", async () => {
  await assertSucceeds(updateDoc(doc(real(UID.priv), 'posts/p_public'), { comments: [{ id: 9, author: 'private_pat', text: 'hi' }] }));
  const seen = await assertSucceeds(getDoc(doc(real(UID.mallory), 'posts/p_public')));
  assert.strictEqual(seen.data().comments[0].author, 'private_pat');
  await assertSucceeds(setDoc(doc(real(UID.priv), 'users/private_pat'), { likedPostIds: ['p_public'] }, { merge: true }));
  const likes = await assertSucceeds(getDoc(doc(nobody(), 'users/private_pat')));
  assert.deepStrictEqual(likes.data().likedPostIds, ['p_public']);
});
test("Bradley's decision: DMs to a private account from a non-connection stay allowed (sender's own private copy)", async () => {
  await assertSucceeds(setDoc(doc(real(UID.mallory), 'users/mallory/private/account'), { dms: [{ with: 'private_pat', text: 'hello' }] }, { merge: true }));
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'users/private_pat'), { notifications: [{ type: 'dm', fromUser: 'mallory' }] }));
  await assertFails(getDoc(doc(real(UID.mallory), 'users/private_pat/private/account')));
});
// ---- connections ----
test('followers: public account accepts your own edge; nobody can forge one', async () => {
  await assertSucceeds(setDoc(doc(real(UID.alice), 'users/bradley_hansen/followers/alice'), { username: 'alice', followedAt: 2 }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/bradley_hansen/followers/alice'), { username: 'alice', followedAt: 2 }));
  await assertSucceeds(deleteDoc(doc(real(UID.alice), 'users/bradley_hansen/followers/alice')));
});
test('followers: on a private account only the owner approves (creates) an edge', async () => {
  await assertFails(setDoc(doc(real(UID.mallory), 'users/private_pat/followers/mallory'), { username: 'mallory', followedAt: 3 }));
  await assertSucceeds(setDoc(doc(real(UID.priv), 'users/private_pat/followers/mallory'), { username: 'mallory', followedAt: 3 }));
});
test('followers: a private account connections list is hidden from strangers', async () => {
  await assertFails(getDocs(collection(real(UID.mallory), 'users/private_pat/followers')));
  await assertFails(getDocs(collection(anon(), 'users/private_pat/followers')));
  await assertSucceeds(getDocs(collection(real(UID.alice), 'users/private_pat/followers')));
  await assertSucceeds(getDocs(collection(real(UID.priv), 'users/private_pat/followers')));
  await assertSucceeds(getDocs(collection(anon(), 'users/bradley_hansen/followers')));
});
test('connect requests: requester writes their own; owner reads and clears', async () => {
  await assertSucceeds(setDoc(doc(real(UID.brad), 'users/private_pat/connectRequests/bradley_hansen'), { username: 'bradley_hansen', fullName: 'B', avatar: '', requestedAt: 5 }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/private_pat/connectRequests/alice'), { username: 'alice', fullName: 'A', avatar: '', requestedAt: 5 }));
  await assertFails(setDoc(doc(real(UID.brad), 'users/private_pat/connectRequests/bradley_hansen'), { username: 'bradley_hansen', isApproved: true }));
  await assertSucceeds(getDocs(collection(real(UID.priv), 'users/private_pat/connectRequests')));
  await assertFails(getDocs(collection(real(UID.alice), 'users/private_pat/connectRequests')));
  await assertSucceeds(deleteDoc(doc(real(UID.priv), 'users/private_pat/connectRequests/mallory')));
});

// ---- identity indexes ----
test('uidIndex: you can only map your own uid to an account you own', async () => {
  await assertSucceeds(setDoc(doc(real(UID.alice), 'uidIndex/' + UID.alice), { username: 'alice' }));
  await assertFails(setDoc(doc(real(UID.mallory), 'uidIndex/' + UID.mallory), { username: 'pixlynote' }));
  await assertFails(setDoc(doc(real(UID.mallory), 'uidIndex/' + UID.alice), { username: 'alice' }));
  await assertFails(getDoc(doc(real(UID.mallory), 'uidIndex/' + UID.alice)));
  await assertFails(getDocs(collection(real(UID.mallory), 'uidIndex')));
  await assertSucceeds(getDocs(collection(real(UID.admin), 'uidIndex')));
});
test('contactIndex: single gets only; you can add or remove only your own account', async () => {
  await assertSucceeds(getDoc(doc(nobody(), 'contactIndex/k_brad')));
  await assertFails(getDocs(collection(anon(), 'contactIndex')));
  await assertSucceeds(setDoc(doc(real(UID.alice), 'contactIndex/k_alice'), { usernames: ['alice'], by: 'alice', updatedAt: 1 }));
  await assertSucceeds(setDoc(doc(real(UID.alice), 'contactIndex/k_brad'), { usernames: arrayUnion('alice'), by: 'alice', updatedAt: 1 }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'contactIndex/k_brad'), { usernames: [], by: 'mallory', updatedAt: 1 }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'contactIndex/k_new'), { usernames: ['alice'], by: 'alice', updatedAt: 1 }));
  await assertSucceeds(setDoc(doc(real(UID.brad), 'contactIndex/k_brad'), { usernames: arrayRemove('bradley_hansen'), by: 'bradley_hansen', updatedAt: 2 }, { merge: true }));
  await assertFails(deleteDoc(doc(real(UID.alice), 'contactIndex/k_alice')));
});

// ---- other collections ----
test('accountCenters: private to the owner; others may only add themselves to removedUsernames', async () => {
  await assertSucceeds(getDoc(doc(real(UID.brad), 'accountCenters/bradley_hansen')));
  await assertFails(getDoc(doc(real(UID.mallory), 'accountCenters/bradley_hansen')));
  await assertSucceeds(setDoc(doc(real(UID.alice), 'accountCenters/bradley_hansen'), { removedUsernames: arrayUnion('alice') }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.alice), 'accountCenters/bradley_hansen'), { accounts: [] }, { merge: true }));
});
test('profileHistory, verificationRequests, blocks: owner or admin only', async () => {
  await assertSucceeds(getDoc(doc(real(UID.brad), 'profileHistory/bradley_hansen')));
  await assertFails(getDoc(doc(real(UID.alice), 'profileHistory/bradley_hansen')));
  await assertFails(getDoc(doc(real(UID.mallory), 'verificationRequests/alice')));
  await assertSucceeds(getDocs(collection(real(UID.admin), 'verificationRequests')));
  await assertFails(getDoc(doc(real(UID.alice), 'blocks/bradley_hansen')));
  await assertFails(getDoc(doc(real(UID.alice), 'closeFriends/bradley_hansen')));
  await assertSucceeds(getDoc(doc(real(UID.brad), 'closeFriends/bradley_hansen')));
  await assertFails(setDoc(doc(real(UID.alice), 'closeFriends/bradley_hansen'), { list: [] }));
});
test('noteViews and story comments keep working for visitors', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'noteViews/n1'), { views: increment(1) }, { merge: true }));
  await assertFails(setDoc(doc(anon(), 'noteViews/n1'), { views: 1, junk: true }, { merge: true }));
  await assertSucceeds(getDoc(doc(nobody(), 'story_comments/bradley_hansen__s1')));
  await assertSucceeds(setDoc(doc(real(UID.alice), 'story_comments/bradley_hansen__s1'), { comments: [{ id: 1 }] }, { merge: true }));
  await assertFails(setDoc(doc(anon(), 'story_comments/bradley_hansen__s1'), { comments: [] }, { merge: true }));
});
test('everything else is closed to everyone but the admin', async () => {
  await assertFails(getDoc(doc(real(UID.alice), 'secretStuff/x')));
  await assertFails(setDoc(doc(real(UID.alice), 'newCollection/y'), { a: 1 }));
  await assertSucceeds(getDoc(doc(real(UID.admin), 'secretStuff/x')));
});
test('admin (@pixlynote) keeps full access for admin tools', async () => {
  await assertSucceeds(getDocs(collection(real(UID.admin), 'users')));
  await assertSucceeds(setDoc(doc(real(UID.admin), 'users/alice'), { isVerified: true }, { merge: true }));
  await assertSucceeds(deleteDoc(doc(real(UID.admin), 'users/alice/followers/x')));
  await assertSucceeds(deleteDoc(doc(real(UID.admin), 'accountCenters/bradley_hansen')));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/alice'), { isVerified: false }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { isPlus: true }, { merge: true }));
});
