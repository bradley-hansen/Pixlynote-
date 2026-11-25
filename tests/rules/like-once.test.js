'use strict';
// Likes: one like per person (branch grokbot/like-once). Rules emulator only, never production.
//   posts/{id}.likedBy  - add yourself once / remove yourself; nothing else
//   users/{u}.likedPostIds / likedNoteIds - only the owner writes them (a person's own like set)
//   users/{owner}.storyLikes - one story's list per write (see the limits noted below)
//   posts/{id}.comments - any signed-in user can overwrite the whole array (finding, documented here)
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } = require('firebase/firestore');

let env;
const UID = { brad: 'uid-brad', alice: 'uid-alice', priv: 'uid-priv', mallory: 'uid-mallory' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-like-once',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/bradley_hansen', { username: 'bradley_hansen', uid: UID.brad, isPrivate: false, storyLikes: { s1: ['alice'], s2: ['mallory'] } });
    await put('users/alice', { username: 'alice', uid: UID.alice, isPrivate: false, likedPostIds: ['p_public'] });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory, isPrivate: false });
    await put('users/private_pat', { username: 'private_pat', uid: UID.priv, isPrivate: true, storyLikes: {} });
    for (const [n, u] of Object.entries({ bradley_hansen: UID.brad, alice: UID.alice, private_pat: UID.priv, mallory: UID.mallory })) {
      await put('uidIndex/' + u, { username: n });
    }
    await put('posts/p_public', { id: 'p_public', author: 'bradley_hansen', authorPrivate: false, caption: 'public', comments: [{ id: 1, user: 'alice', text: 'hi', likedBy: ['alice'] }], views: 0, likedBy: ['alice'] });
    await put('posts/p_fresh', { id: 'p_fresh', author: 'bradley_hansen', authorPrivate: false, caption: 'no likes yet', comments: [], views: 0 });
    await put('posts/p_private', { id: 'p_private', author: 'private_pat', authorPrivate: true, caption: 'private', comments: [], views: 0, likedBy: [] });
  });
});
const postRef = (db, id) => doc(db, 'posts/' + id);
const likedBy = async (id) => (await getDoc(postRef(real(UID.brad), id))).data().likedBy;

// ---------- posts/{id}.likedBy ----------
test('post likedBy: a signed-in user can add only themselves, once', async () => {
  await assertSucceeds(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: arrayUnion('mallory') }));
  const l = await likedBy('p_public');
  if (JSON.stringify(l.slice().sort()) !== JSON.stringify(['alice', 'mallory'])) throw new Error('unexpected likedBy ' + JSON.stringify(l));
  // arrayUnion of a name already there is a no-op and stays allowed (a double tap that lands twice)
  await assertSucceeds(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: arrayUnion('mallory') }));
  const l2 = await likedBy('p_public');
  if (l2.filter((u) => u === 'mallory').length !== 1) throw new Error('mallory is in the list twice: ' + JSON.stringify(l2));
});
test('post likedBy: the first like on a post that has no likedBy yet works', async () => {
  await assertSucceeds(updateDoc(postRef(real(UID.alice), 'p_fresh'), { likedBy: arrayUnion('alice') }));
});
test('post likedBy: adding yourself twice in one write, or a second copy, is denied', async () => {
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: ['alice', 'mallory', 'mallory'] }));
  await assertFails(updateDoc(postRef(real(UID.alice), 'p_public'), { likedBy: ['alice', 'alice'] }));
});
test('post likedBy: you cannot add someone else, or replace the whole list', async () => {
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: arrayUnion('bradley_hansen') }));
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: ['alice', 'bradley_hansen', 'mallory'] }));
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: ['mallory'] }));
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: [] }));
});
test('post likedBy: you can remove yourself but not another person', async () => {
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: arrayRemove('alice') }));
  await assertSucceeds(updateDoc(postRef(real(UID.alice), 'p_public'), { likedBy: arrayRemove('alice') }));
  const l = await likedBy('p_public');
  if (l.length !== 0) throw new Error('expected empty likedBy: ' + JSON.stringify(l));
  // removing yourself when you are not in the list changes nothing and is allowed
  await assertSucceeds(updateDoc(postRef(real(UID.alice), 'p_public'), { likedBy: arrayRemove('alice') }));
});
test('post likedBy: it cannot ride along with other fields, and a counter cannot be forged', async () => {
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: arrayUnion('mallory'), caption: 'hacked' }));
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likes: 999999 }));
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_public'), { likedBy: arrayUnion('mallory'), likes: 999999 }));
});
test('post likedBy: signed-out visitors and private posts you cannot see are denied', async () => {
  await assertFails(updateDoc(postRef(nobody(), 'p_public'), { likedBy: arrayUnion('mallory') }));
  await assertFails(updateDoc(postRef(real(UID.mallory), 'p_private'), { likedBy: arrayUnion('mallory') }));
});
test('post likedBy: the author still edits their own post, and views still go up by exactly one', async () => {
  await assertSucceeds(updateDoc(postRef(real(UID.brad), 'p_public'), { caption: 'edited' }));
  await assertSucceeds(updateDoc(postRef(nobody(), 'p_public'), { views: 1 }));
  await assertFails(updateDoc(postRef(nobody(), 'p_public'), { views: 5 }));
});

// ---------- a person's own like set (users/{me}.likedPostIds / likedNoteIds) ----------
test('own like set: only the owner writes it; nobody can change someone else\'s likes', async () => {
  await assertSucceeds(setDoc(doc(real(UID.mallory), 'users/mallory'), { likedPostIds: arrayUnion('p_public'), likedNoteIds: arrayUnion('n1') }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/alice'), { likedPostIds: arrayRemove('p_public') }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/alice'), { likedPostIds: arrayUnion('p_other') }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/alice'), { likedNoteIds: ['x'] }, { merge: true }));
  await assertFails(setDoc(doc(nobody(), 'users/alice'), { likedPostIds: [] }, { merge: true }));
  const a = (await getDoc(doc(real(UID.alice), 'users/alice'))).data();
  if (JSON.stringify(a.likedPostIds) !== JSON.stringify(['p_public'])) throw new Error('alice likes changed: ' + JSON.stringify(a.likedPostIds));
});
test('own like set: arrayUnion cannot create a duplicate of an id already in the set', async () => {
  await assertSucceeds(setDoc(doc(real(UID.alice), 'users/alice'), { likedPostIds: arrayUnion('p_public') }, { merge: true }));
  const a = (await getDoc(doc(real(UID.alice), 'users/alice'))).data();
  if (a.likedPostIds.length !== 1) throw new Error('duplicate in set: ' + JSON.stringify(a.likedPostIds));
});
test('FINDING: rules do not stop the owner writing a duplicate id into their OWN likedPostIds (counting is by set, so the count is unaffected)', async () => {
  await assertSucceeds(setDoc(doc(real(UID.alice), 'users/alice'), { likedPostIds: ['p_public', 'p_public'] }, { merge: true }));
});

// ---------- story likes: users/{owner}.storyLikes ----------
test('story likes: arrayUnion / arrayRemove of one story by a signed-in viewer works', async () => {
  await assertSucceeds(setDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { storyLikes: { s1: arrayUnion('mallory') } }, { merge: true }));
  await assertSucceeds(setDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { storyLikes: { s1: arrayRemove('mallory') } }, { merge: true }));
  const b = (await getDoc(doc(real(UID.brad), 'users/bradley_hansen'))).data();
  if (JSON.stringify(b.storyLikes.s1) !== JSON.stringify(['alice'])) throw new Error('s1 not back to alice only: ' + JSON.stringify(b.storyLikes));
});
test('story likes: one write cannot touch two stories, and signed-out visitors cannot like', async () => {
  await assertFails(setDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { storyLikes: { s1: arrayUnion('mallory'), s2: arrayUnion('zed') } }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { storyLikes: { s1: [], s2: [] } }, { merge: true }));
  await assertFails(setDoc(doc(nobody(), 'users/bradley_hansen'), { storyLikes: { s1: arrayUnion('mallory') } }, { merge: true }));
});
test('story likes: a private account\'s story cannot be liked by someone who is not approved', async () => {
  await assertFails(setDoc(doc(real(UID.mallory), 'users/private_pat'), { storyLikes: { s9: arrayUnion('mallory') } }, { merge: true }));
});
test('FINDING: story likes cannot be limited to "my own name only" in this data shape (a signed-in viewer can still edit one story\'s list)', async () => {
  // Firestore rules cannot read a map key out of a diff, so adding a second copy of yourself or removing another
  // person from ONE story's list is still accepted. Posts get the strict check (see the post likedBy tests above).
  await assertSucceeds(setDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { storyLikes: { s1: ['alice', 'mallory', 'mallory'] } }, { merge: true }));
  await assertSucceeds(setDoc(doc(real(UID.mallory), 'users/bradley_hansen'), { storyLikes: { s1: [] } }, { merge: true }));
});

// ---------- comment and reply likes live inside posts/{id}.comments ----------
test('FINDING: comment and reply likes live inside the comments array, which any signed-in user can overwrite', async () => {
  const forged = [{ id: 1, user: 'alice', text: 'hi', likedBy: ['mallory', 'mallory', 'mallory'] }];
  await assertSucceeds(updateDoc(postRef(real(UID.mallory), 'p_public'), { comments: forged }));
  await assertFails(updateDoc(postRef(nobody(), 'p_public'), { comments: forged }));
});
