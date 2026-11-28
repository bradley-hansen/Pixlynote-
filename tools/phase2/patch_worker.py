#!/usr/bin/env python3
"""Phase 2 worker patch: POST /sync-subscription writes Plus/Verified flags with the service account.

Usage: python3 patch_worker.py <worker.db-lockdown.js in> <worker.phase2.js out>
NOT deployed by this script.
"""
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()

def rep(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)

SNIPPET = r'''
// ---------- Phase 2: server-side Plus / Verified / Business Plus writes (service account, free) ----------
function firestoreValue(v) {
  if (v === true || v === false) return { booleanValue: v };
  if (v === null) return { nullValue: null };
  if (typeof v === "number" && Number.isFinite(v)) {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}
async function fsPatchDoc(env, path, fields) {
  const p = env.FIREBASE_PROJECT_ID || "pixlynote";
  const token = env.AUTH_EMULATOR_BASE ? "owner" : await googleAccessToken(env);
  if (!token) throw new Error("no_google_token");
  const mask = Object.keys(fields).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const url = `${fsBase(env)}/v1/projects/${p}/databases/(default)/documents/${path}?${mask}`;
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) body.fields[k] = firestoreValue(v);
  const r = await fetch(url, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("firestore_patch " + r.status);
  return true;
}
function plusFieldsFromSession(body, username, sessionId) {
  const plan = body.plan || (body.verified ? "plus" : null);
  const now = Date.now();
  const pub = { username };
  const priv = {};
  if (plan === "business" || body.is_business) {
    // Business sessions are never "verified" (that flag is Plus-only). A paid or no-payment-required (free / $0)
    // Business Checkout Session whose subscription is still alive turns Business Plus on.
    const bizPaid = body.status === "complete" && (body.payment_status === "paid" || body.payment_status === "no_payment_required");
    const bizAlive = body.mode !== "subscription" || ["active", "trialing", "past_due"].includes(body.subscription_status);
    pub.isBusinessPlus = bizPaid && bizAlive && !body.canceled;
    pub.businessPlusUpdatedAt = now;
    if (sessionId) pub.stripeBusinessSessionId = sessionId;
    if (body.subscription_id) priv.stripeBusinessSubscriptionId = body.subscription_id;
    if (body.canceled) { pub.isBusinessPlus = false; pub.businessPlusCanceledAt = now; }
  } else {
    const active = body.plus_active === true || (body.verified === true && !body.canceled);
    pub.isPlus = active;
    pub.isVerified = active;
    pub.subscriptionStatus = body.canceled ? "canceled" : (body.cancel_at_period_end ? "cancel_at_period_end" : (active ? "active" : "inactive"));
    pub.verifiedUpdatedAt = now;
    if (sessionId) pub.stripeSessionId = sessionId;
    if (body.subscription_id) priv.stripeSubscriptionId = body.subscription_id;
    if (body.current_period_end) pub.stripeCurrentPeriodEnd = body.current_period_end;
    if (body.cancel_at_period_end) { pub.stripeCancelAtPeriodEnd = true; pub.plusCancelScheduledAt = now; }
    if (body.canceled) { pub.isPlus = false; pub.isVerified = false; pub.subscriptionStatus = "canceled"; pub.canceledAt = now; }
  }
  if (body.customer_id) priv.stripeCustomerId = body.customer_id;
  return { pub, priv };
}
async function applySubscriptionWrite(env, username, sessionBody, sessionId) {
  const { pub, priv } = plusFieldsFromSession(sessionBody, username, sessionId);
  await fsPatchDoc(env, "users/" + encodeURIComponent(username), pub);
  if (Object.keys(priv).length) {
    await fsPatchDoc(env, "users/" + encodeURIComponent(username) + "/private/account", Object.assign({ updatedAt: Date.now() }, priv)).catch(() => {});
  }
  return pub;
}
function sessionOwnedByUser(sessionBody, username) {
  return normStripeUser(sessionBody.client_reference_id) === username;
}
async function handleSyncSubscription(req, env, cors, body) {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, cors);
  const username = normStripeUser(body.username);
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  const action = String(body.action || "sync");
  if (!USER_RE.test(username)) return json({ ok: false, error: "invalid_username" }, 400, cors);
  if (!env.FIREBASE_SA_JSON && !env.AUTH_EMULATOR_BASE) return json({ ok: false, error: "auth_admin_unavailable" }, 503, cors);
  if (sessionId && !SESSION_RE.test(sessionId)) return json({ ok: false, error: "invalid_session_id" }, 400, cors);
  let verified = { body: {} };
  if (sessionId) {
    verified = await verifyStripeSession(env, sessionId);
    if (verified.status !== 200) return json({ ok: false, error: verified.body && verified.body.error || "stripe_error" }, verified.status, cors);
    if (!sessionOwnedByUser(verified.body, username)) return json({ ok: false, error: "not_owner" }, 403, cors);
  } else {
    return json({ ok: false, error: "session_required" }, 400, cors);
  }
  const sessionBody = Object.assign({}, verified.body);
  if (action === "cancel") { sessionBody.canceled = true; sessionBody.plus_active = false; }
  if (action === "cancel_at_period_end") { sessionBody.cancel_at_period_end = true; }
  // A session that is neither a Plus nor a Business Plus purchase must never touch membership flags.
  if (action !== "cancel" && !sessionBody.plan) return json({ ok: false, error: "not_a_membership_purchase" }, 422, cors);
  try {
    // A free / $0 Business Plus activation gets a $0 History record (written first, so a failure changes nothing).
    let billing = false;
    if (action === "activate" && sessionBody.plan === "business" && businessSessionIsFree(sessionBody)) {
      await fsPatchDoc(env, "users/" + encodeURIComponent(username) + "/billing/" + encodeURIComponent(sessionId), {
        kind: "subscription", item: "Business Plus (free)", amountCents: 0,
        currency: String(sessionBody.currency || "usd").toLowerCase(), status: "free",
        note: "Free: no payment required",
        createdAt: (Number(sessionBody.created) || Math.floor(Date.now() / 1000)) * 1000,
        sessionId: sessionId, livemode: !!sessionBody.livemode, source: "sync_free", updatedAt: Date.now(),
      });
      billing = true;
    }
    const pub = await applySubscriptionWrite(env, username, sessionBody, sessionId);
    return json({ ok: true, applied: true, fields: pub, billing }, 200, cors);
  } catch (e) {
    return json({ ok: false, error: "write_failed" }, 502, cors);
  }
}
function businessSessionIsFree(b) {
  const alive = b.mode !== "subscription" || ["active", "trialing", "past_due"].includes(b.subscription_status);
  return b.status === "complete" && alive && !b.canceled && (b.payment_status === "no_payment_required" || b.amount_total === 0);
}
// Count only: how many Business verification applications are waiting for a decision. No names, no details.
// Public on purpose (the admin menu shows it before the admin token is typed); everything else stays behind ADMIN_TOKEN.
async function handleBusinessVerificationPendingCount(req, env, cors) {
  const origin = req.headers.get("Origin") || "";
  if (!originAllowed(origin, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, cors);
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const rl = await env.GUARD.get(env.GUARD.idFromName("global")).hit([{ k: `bizcount:ip:${ip}`, limit: 60, win: 600 }]);
  if (!rl.ok) return json({ ok: false, error: "rate_limited" }, 429, cors);
  const bucket = r2Bucket(env);
  if (!bucket) return json({ ok: false, error: "storage_not_configured" }, 503, cors);
  try {
    let pending = 0, cursor, pages = 0;
    do {
      const listed = await bucket.list({ prefix: "business-verify/", limit: 500, cursor });
      for (const obj of (listed && listed.objects) || []) {
        if (!obj.key || !obj.key.endsWith("/meta.json")) continue;
        const got = await bucket.get(obj.key);
        if (!got) continue;
        let meta; try { meta = await got.json(); } catch (e) { continue; }
        if (meta && meta.status === "pending") pending++;
      }
      cursor = listed && listed.truncated ? listed.cursor : undefined;
      pages++;
    } while (cursor && pages < 10);
    return json({ ok: true, pending }, 200, cors);
  } catch (e) {
    return json({ ok: false, error: "count_failed" }, 502, cors);
  }
}

'''

rep(
    "    price_ids, plan,\n",
    "    price_ids, plan, created: s.created || null, amount_total: typeof s.amount_total === \"number\" ? s.amount_total : null, currency: s.currency || \"usd\",\n"
)
rep(
    "      if (req.method === \"GET\" && path === \"/business-verification/status\") {",
    "      if (req.method === \"GET\" && path === \"/business-verification/pending-count\") return handleBusinessVerificationPendingCount(req, env, cors);\n      if (req.method === \"GET\" && path === \"/business-verification/status\") {"
)

# Insert before the fetch handler / after reset password section
rep(
    "if (req.method === \"GET\" && path === \"/health\") return json({ ok: true, signup_verify: true, cancel_at_period_end: true, contact_index: true, auth_reset: !!(env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE) }, 200, cors);",
    "if (req.method === \"GET\" && path === \"/health\") return json({ ok: true, signup_verify: true, cancel_at_period_end: true, contact_index: true, auth_reset: !!(env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE), sync_subscription: !!(env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE) }, 200, cors);"
)
rep(
    "if (path === \"/auth/reset-password\") return handleAuthResetPassword(req, env, cors, body);",
    "if (path === \"/auth/reset-password\") return handleAuthResetPassword(req, env, cors, body);\n      if (path === \"/sync-subscription\") return handleSyncSubscription(req, env, cors, body);"
)

# Place function definitions before the export default object (module scope).
needle = "export default {"
assert s.count(needle) == 1
s = s.replace(needle, SNIPPET + "\nexport default {")

open(dst, "w").write(s)
print("wrote", dst, "bytes", len(s))
