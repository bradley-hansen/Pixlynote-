'use strict';
// Admin Promote Settings (t1044u). Rules emulator only, never production.
//   promoteSettings/tiers  - anyone may read (the Promote slider); only @pixlynote may write, and only a valid shape
//   promoteSettings/exempt - @pixlynote only (read and write); the Worker reads it with its service account
//   collectionGroup('billing') - only @pixlynote may list every account's purchases (read only); owners keep their own
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup, getDocs } = require('firebase/firestore');

let env;
const UID = { admin: 'uid-admin', alice: 'uid-alice', mallory: 'uid-mallory' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();
const DEFAULTS = [{ price: 5, hours: 24, views: 250 }, { price: 25, hours: 72, views: 1500 }, { price: 100, hours: 168, views: 7000 }, { price: 500, hours: 720, views: 50000 }];
const tiers = (over) => ({ tiers: DEFAULTS.map((t, i) => Object.assign({}, t, (over || {})[i] || {})), updatedAt: Date.now(), updatedBy: 'pixlynote' });

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-admin-promote',
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
    await put('users/alice', { username: 'alice', uid: UID.alice, isPrivate: false, delegateUids: [UID.mallory] });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory, isPrivate: false });
    for (const [n, u] of Object.entries({ pixlynote: UID.admin, alice: UID.alice, mallory: UID.mallory })) await put('uidIndex/' + u, { username: n });
    await put('promoteSettings/tiers', tiers());
    await put('promoteSettings/exempt', { usernames: ['alice'], updatedAt: 1, updatedBy: 'pixlynote' });
    await put('users/alice/billing/cs_test_a', { kind: 'promote', item: 'Promote post', amountCents: 2500, status: 'paid', createdAt: 1 });
    await put('users/mallory/billing/cs_test_m', { kind: 'promote', item: 'Promote post', amountCents: 500, status: 'paid', createdAt: 2 });
  });
});
const ref = (db, p) => doc(db, p);

test('tiers: anyone (even signed out) can read; only @pixlynote can write', async () => {
  await assertSucceeds(getDoc(ref(nobody(), 'promoteSettings/tiers')));
  await assertSucceeds(getDoc(ref(real(UID.alice), 'promoteSettings/tiers')));
  await assertFails(setDoc(ref(real(UID.alice), 'promoteSettings/tiers'), tiers({ 0: { price: 1 } })));
  await assertFails(setDoc(ref(nobody(), 'promoteSettings/tiers'), tiers()));
  await assertFails(deleteDoc(ref(real(UID.alice), 'promoteSettings/tiers')));
  await assertSucceeds(setDoc(ref(real(UID.admin), 'promoteSettings/tiers'), tiers({ 0: { price: 7, hours: 36, views: 400 } })));
  await assertSucceeds(deleteDoc(ref(real(UID.admin), 'promoteSettings/tiers')));
});
test('tiers: a Privileged Access delegate cannot write them', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'users/pixlynote'), { delegateUids: [UID.mallory] }); });
  await assertFails(setDoc(ref(real(UID.mallory), 'promoteSettings/tiers'), tiers()));
  await assertFails(getDoc(ref(real(UID.mallory), 'promoteSettings/exempt')));
});
test('tiers: even @pixlynote cannot save an invalid shape', async () => {
  const admin = real(UID.admin);
  const bad = [
    tiers({ 1: { price: 5 } }),                 // not increasing
    tiers({ 2: { hours: 50 } }),                // 48h+ must be whole days
    tiers({ 0: { views: 260 } }),               // views in steps of 50
    tiers({ 3: { price: 20000 } }),             // over $10,000
    tiers({ 0: { price: 4.5 } }),               // not a whole number
    tiers({ 1: { views: 100 } }),               // fewer views than tier 1
    tiers({ 0: { price: '5' } }),               // wrong type
    { tiers: DEFAULTS.slice(0, 3), updatedAt: 1 },
    Object.assign(tiers(), { extra: true }),
    { tiers: DEFAULTS.map((t) => Object.assign({ bonus: 1 }, t)) },
  ];
  for (const d of bad) await assertFails(setDoc(ref(admin, 'promoteSettings/tiers'), d));
  await assertSucceeds(setDoc(ref(admin, 'promoteSettings/tiers'), tiers()));
});
test('exempt list: only @pixlynote can read or change it; owners cannot add themselves', async () => {
  await assertFails(getDoc(ref(nobody(), 'promoteSettings/exempt')));
  await assertFails(getDoc(ref(real(UID.alice), 'promoteSettings/exempt')));
  await assertFails(setDoc(ref(real(UID.mallory), 'promoteSettings/exempt'), { usernames: ['alice', 'mallory'] }));
  await assertFails(updateDoc(ref(real(UID.mallory), 'promoteSettings/exempt'), { usernames: ['mallory'] }));
  await assertSucceeds(getDoc(ref(real(UID.admin), 'promoteSettings/exempt')));
  await assertSucceeds(setDoc(ref(real(UID.admin), 'promoteSettings/exempt'), { usernames: ['alice', 'mallory'], updatedAt: 2, updatedBy: 'pixlynote' }));
  await assertFails(setDoc(ref(real(UID.admin), 'promoteSettings/exempt'), { usernames: 'alice' }));
  await assertFails(setDoc(ref(real(UID.admin), 'promoteSettings/exempt'), { usernames: [], other: 1 }));
});
test('other promoteSettings docs are not writable through the admin catch-all', async () => {
  await assertFails(setDoc(ref(real(UID.admin), 'promoteSettings/other'), { x: 1 }));
  await assertFails(setDoc(ref(real(UID.alice), 'promoteSettings/other'), { x: 1 }));
});
test('purchases: @pixlynote can list all billing records (collection group); others cannot', async () => {
  const snap = await assertSucceeds(getDocs(collectionGroup(real(UID.admin), 'billing')));
  if (snap.size !== 2) throw new Error('admin should see 2 records, saw ' + snap.size);
  await assertFails(getDocs(collectionGroup(real(UID.alice), 'billing')));
  await assertFails(getDocs(collectionGroup(nobody(), 'billing')));
  await assertSucceeds(getDocs(collection(real(UID.alice), 'users/alice/billing')));
  await assertFails(getDocs(collection(real(UID.alice), 'users/mallory/billing')));
});
test('purchases: the admin list is read only (no one writes billing records from the app except admin tools)', async () => {
  await assertFails(setDoc(ref(real(UID.alice), 'users/alice/billing/cs_test_a'), { kind: 'promote', status: 'refunded' }));
  await assertFails(setDoc(ref(real(UID.mallory), 'users/alice/billing/x1'), { kind: 'promote' }));
});
