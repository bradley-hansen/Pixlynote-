'use strict';
// Legacy Terms 30+30 (branch legacy-terms-standing-nov28). Rules emulator only, never production.
// users/{u} with deactivationReason 'terms' (set by the worker on Day 30) stays disabled unless the owner records
// consent in the same write. Worker fields tosNoticeAt / termsDisabledAt / termsRemindersSent are admin-only
// except when the owner is accepting. users/{u}/private/account.lastLoginAt is owner-only (existing private rules).
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

let env;
const DAY = 86400000;
const UID = { held: 'uid-held', legacy: 'uid-legacy', self: 'uid-self', mallory: 'uid-mallory', admin: 'uid-admin' };
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const DEL_AT = 1767000000000;

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/pixlynote', { username: 'pixlynote', uid: UID.admin, accountType: 'business' });
    await put('users/held', {
      username: 'held', uid: UID.held, accountType: 'personal', fullName: 'Held',
      tosNoticeAt: DEL_AT - 60 * DAY, termsDisabledAt: DEL_AT - 30 * DAY,
      deactivated: true, deactivatedAt: DEL_AT - 30 * DAY, scheduledDeletionAt: DEL_AT, deactivationReason: 'terms'
    });
    await put('users/legacy', { username: 'legacy', uid: UID.legacy, accountType: 'personal', tosNoticeAt: DEL_AT - 60 * DAY });
    await put('users/self', { username: 'self', uid: UID.self, accountType: 'personal', tosAcceptedAt: 1764000000000,
      deactivated: true, deactivatedAt: DEL_AT - DAY, scheduledDeletionAt: DEL_AT });
    await put('users/mallory', { username: 'mallory', uid: UID.mallory });
    for (const [n, u] of Object.entries({ pixlynote: UID.admin, held: UID.held, legacy: UID.legacy, self: UID.self, mallory: UID.mallory })) await put('uidIndex/' + u, { username: n });
  });
}
const read = async (p) => { let d = null; await env.withSecurityRulesDisabled(async (ctx) => { d = (await getDoc(doc(ctx.firestore(), p))).data(); }); return d; };
const RESTORE = () => ({ tosAcceptedAt: Date.now(), tosVersion: '2026-11-28', deactivated: false, deactivatedAt: null, scheduledDeletionAt: null,
  deactivationReason: null, termsDisabledAt: null, deletionRequestedAt: null, lastUpdated: Date.now() });

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-pixlynote-legacy-terms',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host, port: Number(port) }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

test('legacy terms: the owner of a Terms-disabled account restores it by agreeing (consent + clear in one write)', async () => {
  await assertSucceeds(setDoc(doc(real(UID.held), 'users/held'), RESTORE(), { merge: true }));
  const d = await read('users/held');
  if (d.deactivated !== false || d.deactivationReason !== null || !d.tosAcceptedAt) throw new Error('not restored: ' + JSON.stringify(d));
});

test('legacy terms: after restoring, the app follow-up reactivation write is allowed', async () => {
  await assertSucceeds(setDoc(doc(real(UID.held), 'users/held'), RESTORE(), { merge: true }));
  await assertSucceeds(setDoc(doc(real(UID.held), 'users/held'), { deactivated: false, deactivatedAt: null, scheduledDeletionAt: null, lastUpdated: Date.now() }, { merge: true }));
});

test('legacy terms: the owner cannot lift a Terms hold without consent (sign-in auto-reactivation is blocked)', async () => {
  await assertFails(setDoc(doc(real(UID.held), 'users/held'), { deactivated: false, deactivatedAt: null, scheduledDeletionAt: null, lastUpdated: Date.now() }, { merge: true }));
  await assertFails(updateDoc(doc(real(UID.held), 'users/held'), { deactivationReason: 'declined_terms' }));
  await assertFails(updateDoc(doc(real(UID.held), 'users/held'), { scheduledDeletionAt: DEL_AT + 365 * DAY }));
  await assertFails(updateDoc(doc(real(UID.held), 'users/held'), { tosAcceptedAt: 0, deactivated: false }));
  const d = await read('users/held');
  if (d.deactivated !== true || d.deactivationReason !== 'terms') throw new Error('hold changed');
});

test('legacy terms: while held, the owner can still save profile fields and request deletion (Day 60 date unchanged)', async () => {
  await assertSucceeds(updateDoc(doc(real(UID.held), 'users/held'), { fullName: 'Held Two', lastUpdated: Date.now() }));
  await assertSucceeds(setDoc(doc(real(UID.held), 'users/held'), {
    deactivated: true, deactivatedAt: DEL_AT - 30 * DAY, scheduledDeletionAt: DEL_AT, deactivationReason: 'terms', deletionRequestedAt: Date.now(), lastUpdated: Date.now()
  }, { merge: true }));
});

test('legacy terms: restoring cannot un-cancel a subscription the worker set to cancel on Day 30 (no resubscribe by doc write)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'users/held'), { isPlus: true, subscriptionStatus: 'cancel_at_period_end', stripeCancelAtPeriodEnd: true, termsSubscriptionCanceledAt: DEL_AT - 30 * DAY });
  });
  await assertFails(setDoc(doc(real(UID.held), 'users/held'), { ...RESTORE(), stripeCancelAtPeriodEnd: false }, { merge: true }));
  await assertFails(setDoc(doc(real(UID.held), 'users/held'), { ...RESTORE(), subscriptionStatus: 'active' }, { merge: true }));
  await assertSucceeds(setDoc(doc(real(UID.held), 'users/held'), RESTORE(), { merge: true }));
  const d = await read('users/held');
  if (d.subscriptionStatus !== 'cancel_at_period_end' || d.stripeCancelAtPeriodEnd !== true || d.deactivated !== false) throw new Error('subscription must stay canceled: ' + JSON.stringify(d));
});

test('legacy terms: the worker/admin can record the Day 30 subscription cancel on the held doc', async () => {
  await assertSucceeds(updateDoc(doc(real(UID.admin), 'users/held'), { subscriptionStatus: 'cancel_at_period_end', stripeCancelAtPeriodEnd: true, plusCancelScheduledAt: Date.now(), termsSubscriptionCanceledAt: Date.now() }));
});

test('legacy terms: the owner cannot edit the worker fields unless accepting', async () => {
  await assertFails(updateDoc(doc(real(UID.legacy), 'users/legacy'), { tosNoticeAt: Date.now() + 365 * DAY }));
  await assertFails(updateDoc(doc(real(UID.legacy), 'users/legacy'), { termsRemindersSent: [23, 30, 53] }));
  await assertFails(updateDoc(doc(real(UID.held), 'users/held'), { termsDisabledAt: null }));
  await assertSucceeds(updateDoc(doc(real(UID.legacy), 'users/legacy'), { tosAcceptedAt: Date.now(), tosVersion: '2026-11-28', tosNoticeAt: null }));
});

test('legacy terms: a normal legacy consent (no hold) and a self-deactivated reactivation still work', async () => {
  await assertSucceeds(setDoc(doc(real(UID.legacy), 'users/legacy'), { tosAcceptedAt: Date.now(), tosVersion: '2026-11-28' }, { merge: true }));
  await assertSucceeds(setDoc(doc(real(UID.self), 'users/self'), { deactivated: false, deactivatedAt: null, scheduledDeletionAt: null, lastUpdated: Date.now() }, { merge: true }));
});

test('legacy terms: decline from the modal (deactivate with declined_terms) is allowed for the owner, not for others', async () => {
  const rec = { deactivated: true, deactivatedAt: Date.now(), scheduledDeletionAt: Date.now() + 30 * DAY, deactivationReason: 'declined_terms', deletionRequestedAt: Date.now(), lastUpdated: Date.now() };
  await assertSucceeds(setDoc(doc(real(UID.legacy), 'users/legacy'), rec, { merge: true }));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/held'), RESTORE(), { merge: true }));
});

test('legacy terms: the worker/admin can set and clear the hold and notice fields', async () => {
  await assertSucceeds(updateDoc(doc(real(UID.admin), 'users/legacy'), { tosNoticeAt: Date.now(), termsRemindersSent: [23] }));
  await assertSucceeds(updateDoc(doc(real(UID.admin), 'users/legacy'), { deactivated: true, deactivationReason: 'terms', termsDisabledAt: Date.now(), scheduledDeletionAt: Date.now() + 30 * DAY }));
});

test('legacy terms: lastLoginAt in private/account is owner-only and not readable by others', async () => {
  await assertSucceeds(setDoc(doc(real(UID.legacy), 'users/legacy/private/account'), { lastLoginAt: Date.now() }, { merge: true }));
  await assertSucceeds(getDoc(doc(real(UID.legacy), 'users/legacy/private/account')));
  await assertFails(setDoc(doc(real(UID.mallory), 'users/legacy/private/account'), { lastLoginAt: 1 }, { merge: true }));
  await assertFails(getDoc(doc(real(UID.mallory), 'users/legacy/private/account')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/legacy/private/account')));
  await assertFails(updateDoc(doc(real(UID.legacy), 'users/legacy'), { email: 'x@example.com' }));
});
