'use strict';
// Terms of Service consent (branch tos-consent-nov27). Rules emulator only, never production.
// users/{u}.tosAcceptedAt (ms) and users/{u}.tosVersion (string) are plain public-profile fields: the account OWNER may write
// them (at sign-up and from the one-time consent modal), and nobody else may write them on that account.
// The existing users/{u} rules already allow this, so no rules change is needed: these tests prove it.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

let env;
const UID = { owner: 'uid-owner', legacy: 'uid-legacy', del: 'uid-del', mallory: 'uid-mallory', admin: 'uid-admin', fresh: 'uid-fresh' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const CONSENT = () => ({ tosAcceptedAt: Date.now(), tosVersion: '2026-11-23' });

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/pixlynote', { username: 'pixlynote', uid: UID.admin, accountType: 'business' });
    // A legacy account: no consent fields at all.
    await put('users/legacy', { username: 'legacy', uid: UID.legacy, accountType: 'personal', fullName: 'Legacy User', isPlus: true, isVerified: true, subscriptionStatus: 'active' });
    await put('users/owner', {
      username: 'owner', uid: UID.owner, accountType: 'personal',
      tosAcceptedAt: 1764000000000, tosVersion: '2026-11-23',
      delegateUids: [UID.del], delegateGrants: { [UID.del]: ['editProfile'] }
    });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory });
    for (const [n, u] of Object.entries({ pixlynote: UID.admin, legacy: UID.legacy, owner: UID.owner, mallory: UID.mallory, del: UID.del })) await put('uidIndex/' + u, { username: n });
  });
}

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-tos-consent',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

test('tos consent: the owner of a legacy account can save tosAcceptedAt + tosVersion on their own doc (merge, as the modal does)', async () => {
  await assertSucceeds(setDoc(doc(real(UID.legacy), 'users/legacy'), CONSENT(), { merge: true }));
  let d = null;
  await env.withSecurityRulesDisabled(async (ctx) => { d = (await getDoc(doc(ctx.firestore(), 'users/legacy'))).data(); });
  if (!d.tosAcceptedAt || d.tosVersion !== '2026-11-23') throw new Error('consent not stored');
  if (d.fullName !== 'Legacy User' || d.isPlus !== true) throw new Error('merge must keep the rest of the doc');
});

test('tos consent: updateDoc by the owner works too, and a newer tosVersion can be recorded', async () => {
  await assertSucceeds(updateDoc(doc(real(UID.owner), 'users/owner'), { tosVersion: '2027-01-01' }));
  await assertSucceeds(updateDoc(doc(real(UID.legacy), 'users/legacy'), CONSENT()));
});

test('tos consent: a brand new sign-up doc may carry the consent fields', async () => {
  await assertSucceeds(setDoc(doc(real(UID.fresh), 'users/fresh'), {
    username: 'fresh', uid: UID.fresh, accountType: 'personal', isVerified: false, isPlus: false, subscriptionStatus: 'inactive',
    createdAt: Date.now(), ...CONSENT()
  }, { merge: true }));
});

test('tos consent: an own-doc consent write cannot carry a Plus grant', async () => {
  await assertFails(setDoc(doc(real(UID.mallory), 'users/mallory'), { ...CONSENT(), isPlus: true }, { merge: true }));
});

test('tos consent: another signed-in account cannot record consent on another account doc', async () => {
  await assertFails(setDoc(doc(real(UID.mallory), 'users/legacy'), CONSENT(), { merge: true }));
  await assertFails(updateDoc(doc(real(UID.mallory), 'users/owner'), { tosVersion: '1999-01-01' }));
});

test('tos consent: a Privileged Access delegate (even with Edit profile) cannot consent for the owner', async () => {
  await assertFails(updateDoc(doc(real(UID.del), 'users/owner'), { tosAcceptedAt: Date.now(), tosVersion: '2026-11-23' }));
});

test('tos consent: signed-out visitors cannot write the fields, but can still read the doc (public rendering unchanged)', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anon, 'users/legacy'), CONSENT(), { merge: true }));
  await assertSucceeds(getDoc(doc(anon, 'users/owner')));
});
