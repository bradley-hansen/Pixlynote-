'use strict';
/**
 * Legacy Terms 30+30: one-time nightly check, run from the worker's nightly purge (scheduled handler).
 * NOT DEPLOYED. Pure logic; every side effect is injected so it is testable and reuses the worker's helpers:
 *
 *   deps.getConfig()                       -> { enabled, completedAt, dailyEmailMax } from config/legacyTerms (admin read)
 *   deps.setConfig(patch)                  -> merge into config/legacyTerms
 *   deps.listCohort()                      -> [{ username, data }] users/* with tosNoticeAt > 0 (admin query)
 *   deps.getUser(u)                        -> users/{u} data or null (fresh re-read before acting)
 *   deps.patchUser(u, fields)              -> merge into users/{u} (fsPatchExisting)
 *   deps.getPrivate(u)                     -> users/{u}/private/account data (email, stripe ids) (fsGetDocAdmin)
 *   deps.sendEmail(kind, { to, username, deletionAt })   -> resolves on Resend OK, throws otherwise
 *   deps.cancelAtPeriodEnd(subscriptionId) -> existing Stripe cancel path with atPeriodEnd (never refunds)
 *   deps.purgeAccount(u, data)             -> existing permanent-deletion purge (Firestore docs, R2 business-verify/<u>/, Auth)
 *   deps.log(entry)                        -> optional audit log
 *
 * Timeline from tosNoticeAt (Day 0 = the notice email's send time):
 *   Day 23 reminder email; Day 30 disable + hide (deactivated, reason 'terms', Day 60 date) + cancel subscription at period end
 *   + "disabled" email; Day 53 final email; Day 60 permanent deletion. Agreeing at any time (tosAcceptedAt) stops everything.
 * Idempotent: per-day email flags in users/{u}.termsEmailsSent { d23, d30, d53 } (set only after Resend accepts), the
 * disable is skipped when already disabled for 'terms', the cancel is skipped once termsSubscriptionCanceledAt is set.
 * At most one email per account per night, and only the newest one that is due (no stale Day 23 email on Day 31).
 * Turns itself off: when no account is pending (tosNoticeAt set, no tosAcceptedAt) it writes completedAt + enabled:false,
 * and every later night is a no-op after one config read.
 */

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_EMAIL_MAX = 60; // Resend free tier is 100/day and the worker caps GLOBAL_DAILY at 90: keep 30 for sign-ups/resets.

function errText(e) { return String((e && (e.code || e.message)) || e || 'error').slice(0, 300); }

function isPending(d) {
  return !!(d && Number(d.tosNoticeAt) > 0 && !d.tosAcceptedAt && d.username !== 'pixlynote');
}

function dueEmail(age, sent) {
  if (age >= 60 * DAY) return null;
  if (age >= 53 * DAY) return sent.d53 ? null : 'd53';
  if (age >= 30 * DAY) return sent.d30 ? null : 'd30';
  if (age >= 23 * DAY) return sent.d23 ? null : 'd23';
  return null;
}
const EMAIL_KIND = { d23: 'legacy_terms_reminder', d30: 'legacy_terms_disabled', d53: 'legacy_terms_final' };

async function runLegacyTermsSweep(deps, now) {
  now = typeof now === 'number' ? now : Date.now();
  const log = deps.log || (() => {});
  const out = { ran: false, skipped: '', pending: 0, emailed: { d23: 0, d30: 0, d53: 0 }, disabled: 0, canceled: 0, deleted: 0, errors: [], completed: false };

  const cfg = (await deps.getConfig()) || {};
  if (cfg.completedAt) { out.skipped = 'completed'; return out; }
  if (cfg.enabled !== true) { out.skipped = 'disabled'; return out; }
  out.ran = true;
  const emailMax = Math.max(0, Number(cfg.dailyEmailMax) || DEFAULT_DAILY_EMAIL_MAX);
  let emailsLeft = emailMax;

  const cohort = ((await deps.listCohort()) || []).filter((r) => r && isPending(r.data));
  out.pending = cohort.length;
  if (cohort.length === 0) {
    await deps.setConfig({ enabled: false, completedAt: now });
    out.completed = true;
    log({ type: 'legacy_terms_complete', at: now });
    return out;
  }

  for (const row of cohort) {
    const u = row.username;
    const fail = (step, e) => { out.errors.push({ username: u, step, error: errText(e) }); log({ type: 'legacy_terms_error', username: u, step, error: errText(e), at: now }); };
    let d;
    try { d = await deps.getUser(u); } catch (e) { fail('read', e); continue; }
    if (!isPending(d)) continue; // agreed (or deleted) since the cohort query: agreeing always wins
    const noticeAt = Number(d.tosNoticeAt);
    const age = now - noticeAt;
    const deletionAt = noticeAt + 60 * DAY;
    let priv = {};
    try { priv = (await deps.getPrivate(u)) || {}; } catch (e) { priv = null; }
    const subs = priv ? [priv.stripeSubscriptionId, priv.stripeBusinessSubscriptionId].filter(Boolean) : [];

    const cancelSubs = async () => {
      if (d.termsSubscriptionCanceledAt || subs.length === 0) return true;
      if (priv === null) { fail('stripe_cancel', new Error('private doc unreadable')); return false; }
      try {
        for (const sid of subs) await deps.cancelAtPeriodEnd(sid);
      } catch (e) {
        fail('stripe_cancel', e);
        try { await deps.patchUser(u, { termsStripeCancelError: errText(e) }); } catch (e2) {}
        return false;
      }
      const f = { termsSubscriptionCanceledAt: now, subscriptionStatus: 'cancel_at_period_end', stripeCancelAtPeriodEnd: true, plusCancelScheduledAt: now, termsStripeCancelError: null };
      try { await deps.patchUser(u, f); Object.assign(d, f); } catch (e) { fail('stripe_cancel_record', e); }
      out.canceled++;
      return true;
    };

    // Day 60 (or the owner asked to delete): cancel at period end if somehow still renewing, then the existing purge.
    const deleteNow = age >= 60 * DAY || (d.deletionRequestedAt && d.deactivated === true);
    if (deleteNow) {
      const subsOk = await cancelSubs();
      if (!subsOk) continue; // never delete an account whose subscription could still renew; retry tomorrow
      try {
        await deps.purgeAccount(u, d);
        out.deleted++;
        log({ type: 'legacy_terms_deleted', username: u, reason: d.deletionRequestedAt ? 'requested' : 'day60', at: now });
      } catch (e) {
        fail('purge', e);
        try { await deps.patchUser(u, { termsPurgeError: errText(e) }); } catch (e2) {}
      }
      continue;
    }

    // Day 30: disable + hide, then cancel at period end.
    if (age >= 30 * DAY) {
      if (!(d.deactivated === true && d.deactivationReason === 'terms')) {
        const f = { deactivated: true, deactivatedAt: now, termsDisabledAt: now, deactivationReason: 'terms', scheduledDeletionAt: deletionAt, lastUpdated: now };
        try { await deps.patchUser(u, f); Object.assign(d, f); out.disabled++; } catch (e) { fail('disable', e); continue; }
      }
      await cancelSubs();
    }

    // Emails (Day 23 / 30 / 53): only after the state above is saved; flag only after Resend accepts.
    const sent = Object.assign({}, d.termsEmailsSent || {});
    const key = dueEmail(age, sent);
    if (!key) continue;
    if (emailsLeft <= 0) { out.errors.push({ username: u, step: 'email_' + key, error: 'daily_budget' }); continue; }
    const to = priv && typeof priv.email === 'string' && priv.email.indexOf('@') > 0 ? priv.email.trim() : '';
    if (!to) { fail('email_' + key, new Error('no_email')); continue; }
    try {
      emailsLeft--;
      await deps.sendEmail(EMAIL_KIND[key], { to, username: u, deletionAt, subscriptionCanceled: !!d.termsSubscriptionCanceledAt });
    } catch (e) { fail('email_' + key, e); continue; }
    sent[key] = now;
    try { await deps.patchUser(u, { termsEmailsSent: sent }); out.emailed[key]++; } catch (e) {
      // Sent but not recorded: count it, and report loudly. The next night would re-send this one email.
      out.emailed[key]++;
      fail('email_flag_' + key, e);
    }
  }
  return out;
}

module.exports = { runLegacyTermsSweep, DAY, DEFAULT_DAILY_EMAIL_MAX, isPending, dueEmail };
