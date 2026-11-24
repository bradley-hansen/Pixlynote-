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
    pub.isBusinessPlus = body.plus_active !== false && body.verified !== false && !body.canceled;
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
  try {
    const pub = await applySubscriptionWrite(env, username, sessionBody, sessionId);
    return json({ ok: true, applied: true, fields: pub }, 200, cors);
  } catch (e) {
    return json({ ok: false, error: "write_failed" }, 502, cors);
  }
}

'''

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
