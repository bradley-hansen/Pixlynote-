'use strict';
// Business History (branch business-history-nov27). Rules emulator only, never production.
//   profileHistory/{owner}.business = { dbaName: [{from,to,at,by,delegatedBy?}], ... }  (Account Info > Business History)
// The owner (and @pixlynote) may write the whole doc as before. A delegate with the 'Edit profile' grant may add
// business entries only; Profile History (fields) and everything else stay owner-only.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');

let env;
const UID = { owner: 'uid-owner', del: 'uid-del', ro: 'uid-ro', mallory: 'uid-mallory', admin: 'uid-admin' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const entry = (by, extra) => Object.assign({ from: 'Old DBA', to: 'New DBA', at: 1764280000000, by }, extra || {});

async function seed(opts) {
  const o = opts || {};
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/pixlynote', { username: 'pixlynote', uid: UID.admin, accountType: 'business' });
    await put('users/owner', {
      username: 'owner', uid: UID.owner, accountType: 'business',
      delegateUids: [UID.del, UID.ro],
      delegateGrants: { [UID.del]: ['editProfile'], [UID.ro]: o.roGrants || ['like'] }
    });
    for (const [n, u] of Object.entries({ del: UID.del, ro: UID.ro, mallory: UID.mallory })) await put('users/' + n, { username: n, uid: u });
    for (const [n, u] of Object.entries({ pixlynote: UID.admin, owner: UID.owner, del: UID.del, ro: UID.ro, mallory: UID.mallory })) {
      await put('uidIndex/' + u, { username: n });
    }
    if (!o.noHistory) {
      await put('profileHistory/owner', {
        username: 'owner', updatedAt: 1,
        fields: { name: [{ from: 'A', to: 'B', at: 1 }] },
        business: { dbaName: [entry('owner')] }
      });
    }
  });
}

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-business-history',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });
const ref = (db, p) => doc(db, p);

test('business history: the owner can read and add business entries (merge keeps Profile History)', async () => {
  await assertSucceeds(getDoc(ref(real(UID.owner), 'profileHistory/owner')));
  await assertSucceeds(setDoc(ref(real(UID.owner), 'profileHistory/owner'),
    { business: { dbaName: [entry('owner', { at: 2 }), entry('owner')], businessCity: [entry('owner')] }, updatedAt: 2 }, { merge: true }));
  let snap = null;
  await env.withSecurityRulesDisabled(async (ctx) => { snap = (await getDoc(doc(ctx.firestore(), 'profileHistory/owner'))).data(); });
  if (!snap.fields || !snap.fields.name || snap.fields.name.length !== 1) throw new Error('Profile History fields were lost');
  if (snap.business.dbaName.length !== 2) throw new Error('business entries not written');
});
test('business history: the owner can create the doc when none exists', async () => {
  await env.clearFirestore(); await seed({ noHistory: true });
  await assertSucceeds(setDoc(ref(real(UID.owner), 'profileHistory/owner'), { username: 'owner', business: { dbaName: [entry('owner')] }, updatedAt: 1 }, { merge: true }));
});
test('business history: a delegate with the Edit profile grant may add business entries stamped as delegate', async () => {
  await assertSucceeds(getDoc(ref(real(UID.del), 'profileHistory/owner')));
  await assertSucceeds(setDoc(ref(real(UID.del), 'profileHistory/owner'),
    { business: { dbaName: [entry('del', { at: 3, delegatedBy: 'del' }), entry('owner')] }, updatedAt: 3 }, { merge: true }));
});
test('business history: a delegate with the Edit profile grant may create the doc with business only', async () => {
  await env.clearFirestore(); await seed({ noHistory: true });
  await assertSucceeds(setDoc(ref(real(UID.del), 'profileHistory/owner'), { username: 'owner', business: { dbaName: [entry('del', { delegatedBy: 'del' })] }, updatedAt: 1 }, { merge: true }));
});
test('business history: a delegate cannot touch Profile History fields or other keys', async () => {
  await assertFails(setDoc(ref(real(UID.del), 'profileHistory/owner'), { fields: { name: [] }, updatedAt: 3 }, { merge: true }));
  await assertFails(setDoc(ref(real(UID.del), 'profileHistory/owner'), { business: { dbaName: [] }, renamedFrom: 'x' }, { merge: true }));
  await assertFails(setDoc(ref(real(UID.del), 'profileHistory/owner'), { username: 'owner', business: {}, updatedAt: 3 }));
  await assertFails(deleteDoc(ref(real(UID.del), 'profileHistory/owner')));
});
test('business history: a delegate cannot create the doc with extra keys or another username', async () => {
  await env.clearFirestore(); await seed({ noHistory: true });
  await assertFails(setDoc(ref(real(UID.del), 'profileHistory/owner'), { username: 'owner', business: {}, fields: {}, updatedAt: 1 }));
  await assertFails(setDoc(ref(real(UID.del), 'profileHistory/owner'), { username: 'someone', business: {}, updatedAt: 1 }));
  await assertFails(setDoc(ref(real(UID.del), 'profileHistory/owner'), { username: 'owner', business: 'nope', updatedAt: 1 }));
});
test('business history: a delegate without the Edit profile grant can read but not write', async () => {
  await assertSucceeds(getDoc(ref(real(UID.ro), 'profileHistory/owner')));
  await assertFails(setDoc(ref(real(UID.ro), 'profileHistory/owner'), { business: { dbaName: [] }, updatedAt: 3 }, { merge: true }));
});
test('business history: strangers can neither read nor write it', async () => {
  await assertFails(getDoc(ref(real(UID.mallory), 'profileHistory/owner')));
  await assertFails(setDoc(ref(real(UID.mallory), 'profileHistory/owner'), { business: { dbaName: [] }, updatedAt: 3 }, { merge: true }));
  await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(), 'profileHistory/owner')));
});
test('business history: @pixlynote (admin) can read and write it', async () => {
  await assertSucceeds(getDoc(ref(real(UID.admin), 'profileHistory/owner')));
  await assertSucceeds(updateDoc(ref(real(UID.admin), 'profileHistory/owner'), { business: { dbaName: [] }, updatedAt: 4 }));
});
