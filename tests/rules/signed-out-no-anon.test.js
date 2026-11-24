'use strict';
// Signed-out visitors with Anonymous sign-in DISABLED in Firebase (production setting since Nov 2026):
// requests carry no auth at all. Everything a signed-out visitor does must work (or fail safely) like this.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, increment } = require('firebase/firestore');

let env;
const nobody = () => env.unauthenticatedContext().firestore();
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-noanon',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/bradley_hansen', { username: 'bradley_hansen', uid: 'uid-brad', authEmail: 'b@users.pixlynote.app', isPrivate: false });
    await put('users/private_pat', { username: 'private_pat', uid: 'uid-pat', isPrivate: true });
    await put('users/bradley_hansen/private/account', { email: 'brad@example.test' });
    await put('users/bradley_hansen/followers/alice', { username: 'alice' });
    await put('uidIndex/uid-brad', { username: 'bradley_hansen' });
    await put('posts/p_public', { id: 'p_public', author: 'bradley_hansen', authorPrivate: false, views: 4, comments: [] });
    await put('posts/p_noviews', { id: 'p_noviews', author: 'bradley_hansen', authorPrivate: false, comments: [] });
    await put('posts/p_private', { id: 'p_private', author: 'private_pat', authorPrivate: true, views: 0 });
    await put('noteViews/n1', { views: 3 });
    await put('contactIndex/k1', { usernames: ['bradley_hansen'], by: 'bradley_hansen' });
    await put('closeFriends/bradley_hansen', { list: [] });
    await put('story_comments/bradley_hansen__s1', { comments: [] });
    await put('profileHistory/bradley_hansen', { entries: [] });
  });
});

test('no-anon visitor: reads public profiles, posts, Explore page, notes, stories, contact index (taken checks)', async () => {
  await assertSucceeds(getDoc(doc(nobody(), 'users/bradley_hansen')));
  await assertSucceeds(getDoc(doc(nobody(), 'users/private_pat')));
  await assertSucceeds(getDoc(doc(nobody(), 'posts/p_public')));
  await assertSucceeds(getDocs(query(collection(nobody(), 'posts'), where('authorPrivate', '==', false))));
  await assertSucceeds(getDocs(query(collection(nobody(), 'posts'), where('author', '==', 'bradley_hansen'))));
  await assertSucceeds(getDocs(collection(nobody(), 'users/bradley_hansen/followers')));
  await assertSucceeds(getDoc(doc(nobody(), 'noteViews/n1')));
  await assertSucceeds(getDoc(doc(nobody(), 'contactIndex/k1')));
  await assertSucceeds(getDoc(doc(nobody(), 'closeFriends/bradley_hansen')));
  await assertSucceeds(getDoc(doc(nobody(), 'story_comments/bradley_hansen__s1')));
});

test('no-anon visitor: private content, private fields and admin data stay closed', async () => {
  await assertFails(getDoc(doc(nobody(), 'posts/p_private')));
  await assertFails(getDocs(collection(nobody(), 'posts')));
  await assertFails(getDoc(doc(nobody(), 'users/bradley_hansen/private/account')));
  await assertFails(getDoc(doc(nobody(), 'uidIndex/uid-brad')));
  await assertFails(getDocs(collection(nobody(), 'contactIndex')));
  await assertFails(getDoc(doc(nobody(), 'profileHistory/bradley_hansen')));
});

test('no-anon visitor: cannot write anything except a +1 view count', async () => {
  const db = nobody();
  await assertFails(updateDoc(doc(db, 'users/bradley_hansen'), { bio: 'x' }));
  await assertFails(setDoc(doc(db, 'users/bradley_hansen'), { notifications: [] }, { merge: true }));
  await assertFails(setDoc(doc(db, 'users/newbie'), { username: 'newbie' }));
  await assertFails(setDoc(doc(db, 'posts/p_new'), { author: 'bradley_hansen', authorPrivate: false }));
  await assertFails(updateDoc(doc(db, 'posts/p_public'), { comments: [{ t: 'spam' }] }));
  await assertFails(setDoc(doc(db, 'contactIndex/k2'), { usernames: ['x'], by: 'x' }));
  await assertFails(setDoc(doc(db, 'story_comments/bradley_hansen__s1'), { comments: [] }, { merge: true }));
  await assertFails(setDoc(doc(db, 'users/bradley_hansen/followers/eve'), { username: 'eve' }));
});

test('no-anon visitor: post and note view counts go up by exactly one', async () => {
  const db = nobody();
  await assertSucceeds(updateDoc(doc(db, 'posts/p_public'), { views: increment(1) }));
  await assertSucceeds(updateDoc(doc(db, 'posts/p_noviews'), { views: increment(1) }));
  await assertSucceeds(setDoc(doc(db, 'noteViews/n1'), { views: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'noteViews/n_new'), { views: increment(1) }, { merge: true }));
  // Not a free-for-all: no jumps, no resets, no extra fields, nothing on private posts.
  await assertFails(updateDoc(doc(db, 'posts/p_public'), { views: increment(50) }));
  await assertFails(updateDoc(doc(db, 'posts/p_public'), { views: 0 }));
  await assertFails(updateDoc(doc(db, 'posts/p_public'), { views: increment(1), caption: 'x' }));
  await assertFails(updateDoc(doc(db, 'posts/p_private'), { views: increment(1) }));
  await assertFails(setDoc(doc(db, 'noteViews/n1'), { views: increment(9) }, { merge: true }));
  await assertFails(setDoc(doc(db, 'noteViews/n1'), { views: 0 }, { merge: true }));
  await assertFails(setDoc(doc(db, 'noteViews/n2'), { views: 500 }));
  await assertFails(setDoc(doc(db, 'noteViews/n1'), { views: increment(1), junk: 1 }, { merge: true }));
});

test('signed-in accounts still count views the same way', async () => {
  await assertSucceeds(updateDoc(doc(real('uid-brad'), 'posts/p_public'), { views: increment(1) }));
  await assertSucceeds(setDoc(doc(real('uid-brad'), 'noteViews/n1'), { views: increment(1) }, { merge: true }));
});

test('step 6 before cleanup: owners can still save while legacy email/phone/passwordHash sit on their public doc', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/bradley_hansen'), { email: 'legacy@example.test', phone: '+15555550100', passwordHash: 'sha256:x' }, { merge: true });
  });
  const db = real('uid-brad');
  await assertSucceeds(setDoc(doc(db, 'users/bradley_hansen'), { bio: 'still works', lastUpdated: 2 }, { merge: true }));
  await assertSucceeds(updateDoc(doc(db, 'users/bradley_hansen'), { fullName: 'Bradley H' }));
  // ...but cannot put new values into those legacy public fields.
  await assertFails(updateDoc(doc(db, 'users/bradley_hansen'), { email: 'new@example.test' }));
  await assertFails(updateDoc(doc(db, 'users/bradley_hansen'), { passwordHash: 'sha256:y' }));
  await assertFails(updateDoc(doc(nobody(), 'users/bradley_hansen'), { bio: 'x' }));
});
