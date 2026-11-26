'use strict';
// Showcase accounts + Promote Post (branch grokbot/showcase-promote). Rules emulator only, never production.
//   users/{u}.isShowcase / accountType 'showcase' - only @pixlynote (admin) may add them; owners may keep or drop them
//   posts/{id} promote fields - only the Worker (service account) or admin may write them; owners cannot self-promote
//   promotions/{id} - public read (the feed shows promoted notes), admin/Worker write only
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } = require('firebase/firestore');

let env;
const UID = { admin: 'uid-admin', alice: 'uid-alice', mallory: 'uid-mallory', pour: 'uid-pour', fresh: 'uid-fresh' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();
const PROMO = { isPromoted: true, promotedUntil: Date.now() + 86400000, targetImpressions: 250, promotedImpressionsCount: 0,
  ctaLabel: '', ctaUrl: '', promotedAt: Date.now(), promotionTier: 'feed', promotionAmount: 5, promotionDurationHours: 24,
  promoteSessionId: 'cs_test_x' };

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-showcase-promote',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/pixlynote', { username: 'pixlynote', uid: UID.admin, isPrivate: false });
    await put('users/alice', { username: 'alice', uid: UID.alice, isPrivate: false, bio: 'hi' });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory, isPrivate: false });
    await put('users/morning_pour', { username: 'morning_pour', uid: UID.pour, isPrivate: false, isShowcase: true });
    for (const [n, u] of Object.entries({ pixlynote: UID.admin, alice: UID.alice, mallory: UID.mallory, morning_pour: UID.pour })) {
      await put('uidIndex/' + u, { username: n });
    }
    await put('posts/p_alice', { id: 'p_alice', author: 'alice', authorPrivate: false, caption: 'mine', comments: [], views: 0 });
    await put('posts/p_promoted', Object.assign({ id: 'p_promoted', author: 'alice', authorPrivate: false, caption: 'boosted', comments: [], views: 0 }, PROMO));
    await put('promotions/note_n1', { kind: 'note', noteId: 'n1', author: 'alice', isPromoted: true, targetImpressions: 250 });
  });
});
const ref = (db, p) => doc(db, p);

// ---------- Showcase marker ----------
test('showcase: a new sign-up cannot create itself as a Showcase account', async () => {
  await assertFails(setDoc(ref(real(UID.fresh), 'users/fresh'), { username: 'fresh', uid: UID.fresh, isPrivate: false, isShowcase: true }));
  await assertFails(setDoc(ref(real(UID.fresh), 'users/fresh'), { username: 'fresh', uid: UID.fresh, isPrivate: false, accountType: 'showcase' }));
  await assertSucceeds(setDoc(ref(real(UID.fresh), 'users/fresh'), { username: 'fresh', uid: UID.fresh, isPrivate: false }));
});
test('showcase: an owner cannot mark their own account as Showcase', async () => {
  await assertFails(updateDoc(ref(real(UID.alice), 'users/alice'), { isShowcase: true }));
  await assertFails(updateDoc(ref(real(UID.alice), 'users/alice'), { accountType: 'showcase' }));
  await assertSucceeds(updateDoc(ref(real(UID.alice), 'users/alice'), { bio: 'still fine' }));
});
test('showcase: another user cannot mark someone as Showcase', async () => {
  await assertFails(updateDoc(ref(real(UID.mallory), 'users/alice'), { isShowcase: true }));
});
test('showcase: a Showcase account keeps its marker on normal profile edits and may drop it', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.pour), 'users/morning_pour'), { bio: 'Coffee, sunrise, repeat.' }));
  const d = (await getDoc(ref(real(UID.pour), 'users/morning_pour'))).data();
  if (d.isShowcase !== true) throw new Error('marker lost');
  await assertSucceeds(updateDoc(ref(real(UID.pour), 'users/morning_pour'), { isShowcase: false }));
});
test('showcase: @pixlynote (admin) may mark an account as Showcase', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.admin), 'users/alice'), { isShowcase: true }));
});

// ---------- Promote fields on posts ----------
test('promote: an owner cannot create a post that is already promoted', async () => {
  await assertFails(setDoc(ref(real(UID.alice), 'posts/p_new'), { id: 'p_new', author: 'alice', authorPrivate: false, caption: 'x', isPromoted: true }));
  await assertFails(setDoc(ref(real(UID.alice), 'posts/p_new'), { id: 'p_new', author: 'alice', authorPrivate: false, caption: 'x', targetImpressions: 50000 }));
  await assertSucceeds(setDoc(ref(real(UID.alice), 'posts/p_new'), { id: 'p_new', author: 'alice', authorPrivate: false, caption: 'x' }));
});
test('promote: an owner cannot self-promote, extend, or forge views on their post', async () => {
  for (const f of [{ isPromoted: true }, { promotedUntil: Date.now() + 1e10 }, { targetImpressions: 50000 },
    { promotedImpressionsCount: 9999 }, { ctaUrl: 'https://evil.example' }, { ctaLabel: 'Shop now' }, { promotionTier: 'cta' }]) {
    await assertFails(updateDoc(ref(real(UID.alice), 'posts/p_alice'), f));
  }
  await assertFails(updateDoc(ref(real(UID.alice), 'posts/p_promoted'), { promotedImpressionsCount: 7500 }));
  await assertFails(updateDoc(ref(real(UID.alice), 'posts/p_promoted'), { isPromoted: false }));
});
test('promote: an owner can still edit the caption of a promoted post (promote fields untouched)', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.alice), 'posts/p_promoted'), { caption: 'edited' }));
  await assertSucceeds(setDoc(ref(real(UID.alice), 'posts/p_promoted'), { caption: 'merged', isPromoted: true }, { merge: true }));
});
test('promote: another user cannot write promote fields on someone else\'s post', async () => {
  await assertFails(updateDoc(ref(real(UID.mallory), 'posts/p_alice'), { isPromoted: true }));
  await assertFails(updateDoc(ref(real(UID.mallory), 'posts/p_promoted'), { promotedImpressionsCount: 7500 }));
  await assertFails(updateDoc(ref(nobody(), 'posts/p_promoted'), { promotedImpressionsCount: 7500 }));
});
test('promote: @pixlynote (admin) may write promote fields', async () => {
  await assertSucceeds(updateDoc(ref(real(UID.admin), 'posts/p_alice'), PROMO));
});
test('promote: the feed query for promoted public posts is allowed for signed-out viewers', async () => {
  const q = query(collection(nobody(), 'posts'), where('isPromoted', '==', true), where('authorPrivate', '==', false));
  const snap = await assertSucceeds(getDocs(q));
  if (snap.size !== 1) throw new Error('expected 1 promoted post, got ' + snap.size);
});

// ---------- promotions/{id} (promoted notes) ----------
test('promotions: anyone can read; only admin can write', async () => {
  await assertSucceeds(getDoc(ref(nobody(), 'promotions/note_n1')));
  await assertSucceeds(getDocs(query(collection(nobody(), 'promotions'), where('isPromoted', '==', true))));
  await assertFails(setDoc(ref(real(UID.alice), 'promotions/note_n2'), { kind: 'note', noteId: 'n2', author: 'alice', isPromoted: true }));
  await assertFails(updateDoc(ref(real(UID.alice), 'promotions/note_n1'), { targetImpressions: 1 }));
  await assertFails(deleteDoc(ref(real(UID.alice), 'promotions/note_n1')));
  await assertFails(setDoc(ref(nobody(), 'promotions/note_n3'), { isPromoted: true }));
  await assertSucceeds(updateDoc(ref(real(UID.admin), 'promotions/note_n1'), { isPromoted: false }));
});

// ---------- users/{u}/billing (Billing History, t1007u) ----------
test('billing: only the owner reads their billing records; nobody but admin/Worker writes them', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice/billing/cs_test_1'), { kind: 'promote', item: 'Promote post', amountCents: 500, status: 'paid', createdAt: 1 });
    await setDoc(doc(ctx.firestore(), 'users/alice'), { delegateUids: [UID.mallory] }, { merge: true });
  });
  await assertSucceeds(getDoc(ref(real(UID.alice), 'users/alice/billing/cs_test_1')));
  await assertSucceeds(getDocs(collection(real(UID.alice), 'users/alice/billing')));
  await assertFails(getDoc(ref(real(UID.mallory), 'users/alice/billing/cs_test_1')));
  await assertFails(getDocs(collection(real(UID.mallory), 'users/alice/billing')));
  await assertFails(getDoc(ref(nobody(), 'users/alice/billing/cs_test_1')));
  await assertFails(setDoc(ref(real(UID.alice), 'users/alice/billing/cs_fake'), { kind: 'promote', amountCents: 50000, status: 'paid' }));
  await assertFails(updateDoc(ref(real(UID.alice), 'users/alice/billing/cs_test_1'), { status: 'refunded' }));
  await assertFails(deleteDoc(ref(real(UID.alice), 'users/alice/billing/cs_test_1')));
  await assertFails(setDoc(ref(real(UID.mallory), 'users/alice/billing/cs_fake'), { status: 'paid' }));
  await assertSucceeds(getDoc(ref(real(UID.admin), 'users/alice/billing/cs_test_1')));
});
