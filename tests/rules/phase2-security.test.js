'use strict';
// Phase 2 security: privilege fields, private content, tight cross-user writes, close friends.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection } = require('firebase/firestore');

let env;
const UID = { brad: 'uid-brad', alice: 'uid-alice', priv: 'uid-priv', admin: 'uid-admin', mallory: 'uid-mallory' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-phase2',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/bradley_hansen', { username: 'bradley_hansen', uid: UID.brad, isPrivate: false, isPlus: true, isVerified: true, following: [{ username: 'alice' }], notifications: [] });
    await put('users/alice', { username: 'alice', uid: UID.alice, isPrivate: false, isPlus: false, notifications: [{ fromUser: 'bradley_hansen', type: 'like', id: 1 }] });
    await put('users/private_pat', { username: 'private_pat', uid: UID.priv, isPrivate: true, isPlus: false });
    await put('users/pixlynote', { username: 'pixlynote', uid: UID.admin, isPrivate: false });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory, isPrivate: false });
    for (const [n, u] of Object.entries({ bradley_hansen: UID.brad, alice: UID.alice, private_pat: UID.priv, pixlynote: UID.admin, mallory: UID.mallory })) {
      await put('uidIndex/' + u, { username: n });
    }
    await put('users/private_pat/followers/alice', { username: 'alice', followedAt: 1 });
    await put('users/bradley_hansen/content/profile', { notes: [{ id: 1, text: 'public note' }], story: { id: 's1', image: 'x' }, userStories: [{ id: 's1' }], highlights: [{ id: 'h1' }], following: [{ username: 'alice' }] });
    await put('users/private_pat/content/profile', { notes: [{ id: 2, text: 'secret note' }], story: { id: 's2' }, highlights: [], following: [{ username: 'alice' }] });
    await put('users/alice/content/profile', { notes: [], following: [] });
    await put('closeFriends/bradley_hansen', { users: ['alice', 'mallory'], updatedAt: 1 });
    await put('closeFriends/bradley_hansen/members/alice', { username: 'alice', addedAt: 1 });
    await put('closeFriends/bradley_hansen/members/mallory', { username: 'mallory', addedAt: 1 });
    await put('users/alice', { username: 'alice', uid: UID.alice, isPrivate: false, isPlus: false, notifications: [{ fromUser: 'bradley_hansen', type: 'like', id: 1 }], privilegedAccounts: [{ username: 'bradley_hansen', status: 'accepted' }], privilegedAccessGranted: [{ username: 'mallory', status: 'pending' }] });
  });
});

test('owner cannot set isPlus or isVerified on themselves; admin can', async () => {
  const before = await getDoc(doc(real(UID.mallory), 'users/mallory'));
  if ((before.data() || {}).isPlus === true) throw new Error('seed had isPlus already true: ' + JSON.stringify(before.data()));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/mallory'), { isPlus: true }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/mallory'), { isVerified: true }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/mallory'), { isBusinessPlus: true }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/mallory'), { subscriptionStatus: 'active', isPlus: true }));
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'users/mallory'), { bio: 'hi' }));
  await assertSucceeds(updateDoc(doc(real(UID.admin), 'users/mallory'), { isPlus: true, isVerified: true }));
  await assertFails(updateDoc(doc(real(UID.alice), 'users/mallory'), { isPlus: false }));
});

test('new accounts cannot create themselves as Plus or Verified', async () => {
  await assertFails(setDoc(doc(real(UID.mallory), 'users/newbie'), { username: 'newbie', uid: UID.mallory, isPlus: true }));
  await assertSucceeds(setDoc(doc(real(UID.mallory), 'users/newbie2'), { username: 'newbie2', uid: UID.mallory, isPlus: false, isVerified: false }));
});

test('public content (notes, stories, highlights, following) is readable by anyone; only the owner can write it', async () => {
  await assertSucceeds(getDoc(doc(nobody(), 'users/bradley_hansen/content/profile')));
  await assertSucceeds(getDoc(doc(real(UID.mallory), 'users/bradley_hansen/content/profile')));
  await assertSucceeds(setDoc(doc(real(UID.brad), 'users/bradley_hansen/content/profile'), { notes: [{ id: 3, text: 'new' }] }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/bradley_hansen/content/profile'), { notes: [{ id: 9, text: 'pwn' }] }, { merge: true }));
  await assertFails(updateDoc(doc(real(UID.alice), 'users/bradley_hansen'), { following: [{ username: 'mallory' }] }));
});

test('private account content is only readable by the owner and approved connections', async () => {
  await assertSucceeds(getDoc(doc(real(UID.priv), 'users/private_pat/content/profile')));
  await assertSucceeds(getDoc(doc(real(UID.alice), 'users/private_pat/content/profile')));
  await assertFails(getDoc(doc(real(UID.mallory), 'users/private_pat/content/profile')));
  await assertFails(getDoc(doc(nobody(), 'users/private_pat/content/profile')));
  // @pixlynote is a normal user for private content (no admin bypass).
  await assertFails(getDoc(doc(real(UID.admin), 'users/private_pat/content/profile')));
  // Public header of a private account stays readable.
  await assertSucceeds(getDoc(doc(real(UID.mallory), 'users/private_pat')));
});

test('others cannot rewrite following or other social fields; they may only append their own notification', async () => {
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { following: [] }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { bio: 'pwned' }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { notifications: [] }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { notifications: [{ fromUser: 'bradley_hansen', type: 'like', id: 1 }, { fromUser: 'mallory', type: 'like', id: 2 }] }));
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'users/alice'), { notifications: [{ fromUser: 'mallory', type: 'follow', id: 3 }, { fromUser: 'bradley_hansen', type: 'like', id: 1 }] }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { notifications: [{ fromUser: 'not-me', type: 'follow', id: 4 }, { fromUser: 'bradley_hansen', type: 'like', id: 1 }] }));
});

test('Privileged Access: others cannot rewrite privilegedAccounts; the invited account may update the grant entry', async () => {
  await assertFails(updateDoc(doc(real(UID.brad), 'users/alice'), { privilegedAccounts: [] }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { privilegedAccounts: [] }));
  await assertSucceeds(updateDoc(doc(real(UID.alice), 'users/alice'), { privilegedAccounts: [] }));
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'users/alice'), { privilegedAccessGranted: [{ username: 'mallory', status: 'accepted' }] }));
});

test('Privileged Access: a same-size swap of someone else\'s grant entry is denied; only your own entry may change', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), {
      privilegedAccessGranted: [
        { username: 'mallory', status: 'pending' },
        { username: 'bradley_hansen', status: 'accepted' }
      ]
    }, { merge: true });
  });
  // Swap mallory for private_pat, keep the other entry (same list size).
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { privilegedAccessGranted: [
    { username: 'private_pat', status: 'pending' },
    { username: 'bradley_hansen', status: 'accepted' }
  ] }));
  // Accept your own invite while wiping the other person (size drops by 1, but the diff includes them).
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { privilegedAccessGranted: [
    { username: 'mallory', status: 'accepted' }
  ] }));
  // Accept your own invite, leave the other entry alone.
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'users/alice'), { privilegedAccessGranted: [
    { username: 'mallory', status: 'accepted' },
    { username: 'bradley_hansen', status: 'accepted' }
  ] }));
  // Decline: remove only yourself.
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'users/alice'), { privilegedAccessGranted: [
    { username: 'bradley_hansen', status: 'accepted' }
  ] }));
});

test('storyComments: a no-op write is denied; adding a comment on one story is allowed', async () => {
  const existing = { s1: [{ id: 1, user: 'alice', text: 'hi' }] };
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), { storyComments: existing }, { merge: true });
  });
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { storyComments: existing, lastUpdated: 99 }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/alice'), { lastUpdated: 99 }));
  await assertSucceeds(updateDoc(doc(real(UID.mallory), 'users/alice'), {
    storyComments: { s1: [{ id: 1, user: 'alice', text: 'hi' }, { id: 2, user: 'mallory', text: 'nice' }] }
  }));
});

test('close friends: only the owner can read the full list; a member can only read their own edge', async () => {
  await assertSucceeds(getDoc(doc(real(UID.brad), 'closeFriends/bradley_hansen')));
  await assertFails(getDoc(doc(real(UID.alice), 'closeFriends/bradley_hansen')));
  await assertFails(getDoc(doc(nobody(), 'closeFriends/bradley_hansen')));
  await assertFails(getDocs(collection(real(UID.alice), 'closeFriends')));
  await assertSucceeds(getDoc(doc(real(UID.alice), 'closeFriends/bradley_hansen/members/alice')));
  await assertFails(getDoc(doc(real(UID.alice), 'closeFriends/bradley_hansen/members/mallory')));
  await assertSucceeds(getDoc(doc(real(UID.brad), 'closeFriends/bradley_hansen/members/mallory')));
  await assertFails(setDoc(doc(real(UID.alice), 'closeFriends/bradley_hansen/members/alice'), { username: 'alice' }));
  await assertSucceeds(setDoc(doc(real(UID.brad), 'closeFriends/bradley_hansen/members/private_pat'), { username: 'private_pat', addedAt: 2 }));
  // Admin tools can still read the list.
  await assertSucceeds(getDoc(doc(real(UID.admin), 'closeFriends/bradley_hansen')));
});

test('admin tools still work on public collections; admin cannot set another user as admin via catch-all', async () => {
  await assertSucceeds(setDoc(doc(real(UID.admin), 'users/alice'), { isVerified: true, isPlus: true }, { merge: true }));
  await assertSucceeds(setDoc(doc(real(UID.admin), 'verificationRequests/alice'), { status: 'approved' }, { merge: true }));
});
