'use strict';
// Legacy Terms 30+30 nightly sweep (tools/legacy-terms/sweep.js). Pure unit tests with in-memory fakes:
// no Firestore, Stripe, Resend or R2 network. Success and failure for every step.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { runLegacyTermsSweep, DAY } = require(path.join(__dirname, '..', '..', 'tools', 'legacy-terms', 'sweep.js'));

const T0 = Date.UTC(2026, 11, 1, 14, 0); // Day 0 send time
function world(users, opts) {
  opts = opts || {};
  const w = {
    config: Object.assign({ enabled: true }, opts.config || {}),
    users: JSON.parse(JSON.stringify(users)),
    priv: JSON.parse(JSON.stringify(opts.priv || {})),
    emails: [], cancels: [], purged: [], patches: [], logs: [], calls: { listCohort: 0 },
    fail: Object.assign({}, opts.fail || {})
  };
  w.deps = {
    getConfig: async () => { if (w.fail.config) throw new Error('config read failed'); return w.config; },
    setConfig: async (p) => { Object.assign(w.config, p); },
    listCohort: async () => { w.calls.listCohort++; if (w.fail.list) throw new Error('query failed'); return Object.entries(w.users).filter(([, d]) => d && d.tosNoticeAt > 0).map(([username, data]) => ({ username, data: JSON.parse(JSON.stringify(data)) })); },
    getUser: async (u) => { if (w.fail.read === u) throw new Error('read failed'); return w.users[u] ? JSON.parse(JSON.stringify(w.users[u])) : null; },
    patchUser: async (u, f) => {
      const key = Object.keys(f).join(',');
      if (w.fail.patch && w.fail.patch(u, f)) throw new Error('PERMISSION_DENIED patch ' + key);
      w.patches.push({ u, f }); Object.assign(w.users[u], JSON.parse(JSON.stringify(f)));
    },
    getPrivate: async (u) => w.priv[u] || {},
    sendEmail: async (kind, a) => { if (w.fail.email && w.fail.email(kind, a)) throw new Error('resend 429'); w.emails.push({ kind, to: a.to, u: a.username, deletionAt: a.deletionAt }); },
    cancelAtPeriodEnd: async (sid) => { if (w.fail.stripe && w.fail.stripe(sid)) throw new Error('stripe 500'); w.cancels.push(sid); return { id: sid, cancel_at_period_end: true }; },
    purgeAccount: async (u) => { if (w.fail.purge === u) throw new Error('purge failed'); w.purged.push(u); delete w.users[u]; },
    log: (e) => w.logs.push(e)
  };
  w.run = (day) => runLegacyTermsSweep(w.deps, T0 + day * DAY + 3600000);
  return w;
}
const legacy = (extra) => Object.assign({ username: 'x', accountType: 'personal', tosNoticeAt: T0 }, extra || {});

test('sweep: off by default (enabled not true) and a no-op after completedAt: no cohort query, no writes', async () => {
  const w = world({ a: legacy({ username: 'a' }) }, { config: { enabled: false } });
  const r = await w.run(30);
  assert.equal(r.skipped, 'disabled'); assert.equal(w.calls.listCohort, 0); assert.equal(w.patches.length, 0);
  const w2 = world({ a: legacy({ username: 'a' }) }, { config: { enabled: true, completedAt: T0 } });
  assert.equal((await w2.run(30)).skipped, 'completed'); assert.equal(w2.calls.listCohort, 0);
});

test('sweep: turns itself off once no legacy account is pending (all agreed or gone), then stays a no-op', async () => {
  const w = world({ a: legacy({ username: 'a', tosAcceptedAt: T0 + DAY }), b: { username: 'b' } });
  const r = await w.run(31);
  assert.equal(r.completed, true); assert.equal(w.config.enabled, false); assert.ok(w.config.completedAt > 0);
  assert.equal(w.emails.length + w.patches.length + w.purged.length, 0, 'an agreed account is never touched');
  const r2 = await w.run(32);
  assert.equal(r2.skipped, 'completed'); assert.equal(w.calls.listCohort, 1);
});

test('sweep: config read or cohort query failure throws (the nightly run reports it) and writes nothing', async () => {
  await assert.rejects(world({}, { fail: { config: true } }).run(1));
  const w = world({ a: legacy({ username: 'a' }) }, { fail: { list: true } });
  await assert.rejects(w.run(23));
  assert.equal(w.patches.length, 0); assert.equal(w.config.completedAt, undefined, 'a failed query never marks the cohort complete');
});

test('sweep: before Day 23 nothing happens', async () => {
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test' } } });
  await w.run(22);
  assert.equal(w.emails.length + w.patches.length, 0);
});

test('sweep Day 23: sends the reminder once and records the flag; a re-run the same night or next night does not double-send', async () => {
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test' } } });
  const r = await w.run(23);
  assert.equal(r.emailed.d23, 1); assert.deepEqual(w.emails.map((e) => e.kind), ['legacy_terms_reminder']);
  assert.ok(w.users.a.termsEmailsSent.d23 > 0);
  await w.run(23); await w.run(24);
  assert.equal(w.emails.length, 1, 'no double send');
  assert.ok(!w.users.a.deactivated, 'not disabled before Day 30');
});

test('sweep Day 23 failure: Resend error leaves no flag and retries next night; missing email is reported, not flagged', async () => {
  let failing = true;
  const w = world({ a: legacy({ username: 'a' }), b: legacy({ username: 'b' }) }, { priv: { a: { email: 'a@example.test' } }, fail: { email: () => failing } });
  const r = await w.run(23);
  assert.equal(r.emailed.d23, 0); assert.ok(!(w.users.a.termsEmailsSent || {}).d23);
  assert.ok(r.errors.some((e) => e.username === 'a' && e.step === 'email_d23'));
  assert.ok(r.errors.some((e) => e.username === 'b' && /no_email/.test(e.error)));
  failing = false;
  await w.run(24);
  assert.equal(w.emails.filter((e) => e.u === 'a').length, 1, 'retried and sent next night');
});

test('sweep Day 30: disables + hides (reason terms, Day 60 date), cancels each subscription at period end (no refund), sends the disabled email; idempotent', async () => {
  const w = world({ a: legacy({ username: 'a', isPlus: true, termsEmailsSent: { d23: T0 + 23 * DAY } }) }, { priv: { a: { email: 'a@example.test', stripeSubscriptionId: 'sub_plus', stripeBusinessSubscriptionId: 'sub_biz' } } });
  const r = await w.run(30);
  const u = w.users.a;
  assert.equal(u.deactivated, true); assert.equal(u.deactivationReason, 'terms'); assert.equal(u.scheduledDeletionAt, T0 + 60 * DAY);
  assert.ok(u.termsDisabledAt > 0);
  assert.deepEqual(w.cancels, ['sub_plus', 'sub_biz'], 'cancel at period end for both subscriptions');
  assert.equal(u.subscriptionStatus, 'cancel_at_period_end'); assert.equal(u.stripeCancelAtPeriodEnd, true); assert.ok(u.termsSubscriptionCanceledAt > 0);
  assert.deepEqual(w.emails.map((e) => e.kind), ['legacy_terms_disabled']);
  assert.ok(u.termsEmailsSent.d30 > 0);
  assert.equal(r.disabled, 1); assert.equal(r.canceled, 1);
  const patchesBefore = w.patches.length;
  await w.run(30); await w.run(31);
  assert.equal(w.cancels.length, 2, 'no second cancel'); assert.equal(w.emails.length, 1, 'no second email');
  assert.equal(w.patches.length, patchesBefore, 'no re-disable writes');
  assert.ok(!w.deps.refund, 'there is no refund path at all');
});

test('sweep Day 30 with no subscription: disables, no Stripe call', async () => {
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test' } } });
  await w.run(30);
  assert.equal(w.users.a.deactivated, true); assert.equal(w.cancels.length, 0);
});

test('sweep Day 30 failure: the disable write fails -> no cancel, no email, retried next night', async () => {
  let failing = true;
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test', stripeSubscriptionId: 'sub_1' } }, fail: { patch: (u, f) => failing && f.deactivated === true } });
  const r = await w.run(30);
  assert.ok(r.errors.some((e) => e.step === 'disable'));
  assert.ok(!w.users.a.deactivated); assert.equal(w.cancels.length, 0); assert.equal(w.emails.length, 0);
  failing = false;
  await w.run(31);
  assert.equal(w.users.a.deactivated, true); assert.deepEqual(w.cancels, ['sub_1']); assert.equal(w.emails.length, 1);
});

test('sweep Day 30 failure: Stripe cancel fails -> still disabled, error recorded, email still sent; cancel retried and succeeds next night', async () => {
  let failing = true;
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test', stripeSubscriptionId: 'sub_1' } }, fail: { stripe: () => failing } });
  const r = await w.run(30);
  assert.equal(w.users.a.deactivated, true);
  assert.ok(r.errors.some((e) => e.step === 'stripe_cancel'));
  assert.ok(/stripe 500/.test(w.users.a.termsStripeCancelError)); assert.ok(!w.users.a.termsSubscriptionCanceledAt);
  assert.equal(w.emails.length, 1, 'disabled email still goes out');
  failing = false;
  await w.run(31);
  assert.deepEqual(w.cancels, ['sub_1']); assert.ok(w.users.a.termsSubscriptionCanceledAt > 0); assert.equal(w.users.a.termsStripeCancelError, null);
  assert.equal(w.emails.length, 1, 'no extra email on the retry night');
});

test('sweep Day 30 failure: the disabled email fails -> account stays disabled, no flag, email retried next night', async () => {
  let failing = true;
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test' } }, fail: { email: () => failing } });
  await w.run(30);
  assert.equal(w.users.a.deactivated, true); assert.ok(!(w.users.a.termsEmailsSent || {}).d30);
  failing = false;
  await w.run(31);
  assert.deepEqual(w.emails.map((e) => e.kind), ['legacy_terms_disabled']);
});

test('sweep Day 53: sends the final email once; failure leaves no flag and retries', async () => {
  let failing = true;
  const base = legacy({ username: 'a', deactivated: true, deactivationReason: 'terms', termsDisabledAt: T0 + 30 * DAY, scheduledDeletionAt: T0 + 60 * DAY, termsEmailsSent: { d23: 1, d30: 1 } });
  const w = world({ a: base }, { priv: { a: { email: 'a@example.test' } }, fail: { email: () => failing } });
  const r = await w.run(53);
  assert.equal(r.emailed.d53, 0); assert.ok(!w.users.a.termsEmailsSent.d53);
  failing = false;
  await w.run(54); await w.run(55);
  assert.deepEqual(w.emails.map((e) => e.kind), ['legacy_terms_final']);
});

test('sweep catch-up: an account first seen on Day 55 is disabled, canceled, and gets only the Day 53 email (no stale Day 23/30)', async () => {
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test', stripeSubscriptionId: 'sub_1' } } });
  await w.run(55);
  assert.equal(w.users.a.deactivated, true); assert.deepEqual(w.cancels, ['sub_1']);
  assert.deepEqual(w.emails.map((e) => e.kind), ['legacy_terms_final']);
});

test('sweep Day 60: reuses the purge; an agreed account is never deleted', async () => {
  const held = { deactivated: true, deactivationReason: 'terms', scheduledDeletionAt: T0 + 60 * DAY, termsSubscriptionCanceledAt: T0 + 30 * DAY };
  const w = world({ a: legacy(Object.assign({ username: 'a' }, held)), b: legacy(Object.assign({ username: 'b', tosAcceptedAt: T0 + 40 * DAY }, held)) }, { priv: { a: { stripeSubscriptionId: 'sub_1' } } });
  const r = await w.run(60);
  assert.deepEqual(w.purged, ['a']); assert.equal(r.deleted, 1);
  assert.equal(w.cancels.length, 0, 'already canceled on Day 30, not touched again');
  assert.ok(w.users.b, 'agreed account kept');
  await w.run(61);
  assert.equal(w.config.enabled, false, 'cohort now empty (b agreed) -> sweep turns itself off');
});

test('sweep Day 60: if the Day 30 cancel never succeeded, cancel first; if it still fails, do NOT delete yet', async () => {
  let failing = true;
  const held = { deactivated: true, deactivationReason: 'terms', scheduledDeletionAt: T0 + 60 * DAY };
  const w = world({ a: legacy(Object.assign({ username: 'a' }, held)) }, { priv: { a: { stripeSubscriptionId: 'sub_1' } }, fail: { stripe: () => failing } });
  await w.run(60);
  assert.equal(w.purged.length, 0, 'not deleted while the subscription could still renew');
  failing = false;
  await w.run(61);
  assert.deepEqual(w.cancels, ['sub_1']); assert.deepEqual(w.purged, ['a']);
});

test('sweep Day 60 failure: purge error is recorded and retried next night', async () => {
  const held = { deactivated: true, deactivationReason: 'terms', scheduledDeletionAt: T0 + 60 * DAY };
  const w = world({ a: legacy(Object.assign({ username: 'a' }, held)) }, { fail: { purge: 'a' } });
  const r = await w.run(60);
  assert.ok(r.errors.some((e) => e.step === 'purge')); assert.ok(/purge failed/.test(w.users.a.termsPurgeError));
  w.fail.purge = null;
  await w.run(61);
  assert.deepEqual(w.purged, ['a']);
});

test('sweep: "Decline and delete" (deletionRequestedAt on a disabled account) is purged on the next night', async () => {
  const w = world({ a: legacy({ username: 'a', deactivated: true, deactivationReason: 'declined_terms', deletionRequestedAt: T0 + 5 * DAY, scheduledDeletionAt: T0 + 35 * DAY }) });
  await w.run(6);
  assert.deepEqual(w.purged, ['a']);
});

test('sweep: agreeing between the cohort query and acting wins (fresh re-read)', async () => {
  const w = world({ a: legacy({ username: 'a' }) }, { priv: { a: { email: 'a@example.test' } } });
  const orig = w.deps.getUser;
  w.deps.getUser = async (u) => { const d = await orig(u); d.tosAcceptedAt = T0 + 29 * DAY; return d; };
  await w.run(30);
  assert.equal(w.patches.length + w.emails.length, 0);
});

test('sweep: daily email budget (60 default, configurable) defers the rest to the next night; disables still happen', async () => {
  const users = {}, priv = {};
  for (let i = 0; i < 3; i++) { users['u' + i] = legacy({ username: 'u' + i }); priv['u' + i] = { email: 'u' + i + '@example.test' }; }
  const w = world(users, { priv, config: { enabled: true, dailyEmailMax: 2 } });
  const r = await w.run(30);
  assert.equal(w.emails.length, 2); assert.ok(r.errors.some((e) => e.error === 'daily_budget'));
  assert.ok(Object.values(w.users).every((d) => d.deactivated === true), 'all disabled regardless of the email budget');
  await w.run(31);
  assert.equal(w.emails.length, 3, 'third email next night');
});

test('sweep: one account failing to read does not stop the others', async () => {
  const w = world({ a: legacy({ username: 'a' }), b: legacy({ username: 'b' }) }, { priv: { b: { email: 'b@example.test' } }, fail: { read: 'a' } });
  const r = await w.run(23);
  assert.ok(r.errors.some((e) => e.username === 'a' && e.step === 'read'));
  assert.equal(w.emails.filter((e) => e.u === 'b').length, 1);
});
