#!/usr/bin/env python3
"""Promote Post worker patch: Stripe Checkout for Promote, the Stripe webhook, and view counting.

Usage: python3 patch_worker.py <worker.phase2.js in> <worker.promote.js out>
NOT deployed by this script. See tools/promote/SHIP.md.

Routes added
- POST /promote/checkout   {username, kind, id, amount, ctaLabel?, ctaUrl?, idToken}
    Verifies the Firebase ID token, that the signed-in uid owns `username`, and that the post/note is that
    user's own public item. Creates a Stripe Checkout Session (mode=payment, test key only unless
    PROMOTE_ALLOW_LIVE=on). Duration and view target are computed here from the amount, never taken from
    the browser. Returns {ok, url}. Nothing is marked promoted here.
- POST /stripe/webhook     Stripe-signed (STRIPE_WEBHOOK_SECRET). On checkout.session.completed /
    async_payment_succeeded with payment_status=paid and metadata.purpose=promote, re-checks ownership and
    writes the promotion fields with the service account. NOTHING is ever refunded by this code: a paid
    session whose post was deleted or made private before payment completed is recorded (billing) and not promoted.
- POST /promote/impression {key, sid}  counts one view per browser session per promotion, with per-IP caps.
    The count lives in the Guard Durable Object and is written to Firestore every 10 views and at the end.
- GET  /promote/stats?key= live {count, target, until, active} for the Insights drawer.

Billing History (t1007u): the same webhook writes one record per Stripe purchase to
users/{username}/billing/{id} (read: owner only; write: Worker/admin only, see firestore.rules):
  {kind: "promote"|"subscription", item, amountCents, currency, status, createdAt, sessionId|invoiceId,
   paymentIntent, livemode, source: "stripe_webhook"}
  - checkout.session.completed (promote)       -> status paid (with a note if the item could not be promoted)
  - checkout.session.completed (subscription)  -> status paid | trial  (Plus flags still come from /sync-subscription)
  - invoice.paid (renewals) / invoice.payment_failed -> paid | failed
  - charge.refunded                             -> refunded | partially_refunded (display only, when Stripe reports a
                                                   refund made manually in the Stripe Dashboard; this code never issues refunds)
Stripe webhook events to enable: checkout.session.completed, checkout.session.async_payment_succeeded,
invoice.paid, invoice.payment_failed, charge.refunded.
"""
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()

def rep(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)

SNIPPET = r'''
// ---------- Promote Post: Stripe Checkout, webhook, view counting (free tiers) ----------
// Keep PROMOTE_ANCHORS identical to PROMOTE_ANCHORS in index.html (tests compare them).
const PROMOTE_ANCHORS = [[5, 24, 250], [25, 72, 1500], [100, 168, 7000], [500, 720, 50000]];
const PROMOTE_MIN = 5, PROMOTE_MAX = 500;
const PROMOTE_CTA_LABELS = ["Learn more", "Shop now", "Visit site", "Book now", "Sign up", "Contact us"];
const PROMOTE_KEY_RE = /^(post|note)_[A-Za-z0-9_-]{1,64}$/;
const PROMOTE_ITEM_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PROMOTE_SID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PROMOTE_FLUSH_EVERY = 10;
function promotePlan(amount) {
  const a = Math.round(Number(amount));
  if (!Number.isFinite(a) || a < PROMOTE_MIN || a > PROMOTE_MAX) return null;
  let seg = PROMOTE_ANCHORS.length - 2;
  for (let i = 0; i < PROMOTE_ANCHORS.length - 1; i++) { if (a <= PROMOTE_ANCHORS[i + 1][0]) { seg = i; break; } }
  const [a0, h0, v0] = PROMOTE_ANCHORS[seg], [a1, h1, v1] = PROMOTE_ANCHORS[seg + 1];
  const t = (a - a0) / (a1 - a0);
  // Whole hours under 2 days, whole days from 2 days up (so "5 days" is exactly 5 days).
  const rawH = h0 + t * (h1 - h0);
  const durationHours = rawH < 48 ? Math.round(rawH) : Math.round(rawH / 24) * 24;
  const targetImpressions = Math.round((v0 + t * (v1 - v0)) / 50) * 50;
  const tier = a >= 100 ? "cta" : (a >= 25 ? "explore" : "feed");
  return { amount: a, durationHours, targetImpressions, tier };
}
function promoteCleanCta(label, url, tier) {
  if (tier !== "cta") return { ctaLabel: "", ctaUrl: "" };
  const l = PROMOTE_CTA_LABELS.includes(String(label || "")) ? String(label) : "";
  let u = String(url || "").trim();
  if (u.length > 300) u = "";
  if (u) { try { const p = new URL(u); if (p.protocol !== "https:" || !p.hostname.includes(".")) u = ""; else u = p.toString(); } catch (e) { u = ""; } }
  if (!l || !u) return { ctaLabel: "", ctaUrl: "" };
  return { ctaLabel: l, ctaUrl: u };
}
function promoteDocPath(kind, id) {
  return kind === "note" ? "promotions/note_" + encodeURIComponent(id) : "posts/" + encodeURIComponent(id);
}
function promoteStripeKeyOk(env) {
  const k = String(env.STRIPE_SECRET_KEY || "");
  if (!k) return false;
  if (k.startsWith("sk_test_") || k.startsWith("rk_test_")) return true;
  return env.PROMOTE_ALLOW_LIVE === "on";
}
async function fsAdminToken(env) { return env.AUTH_EMULATOR_BASE ? "owner" : await googleAccessToken(env); }
async function fsGetDocAdmin(env, path) {
  const p = env.FIREBASE_PROJECT_ID || "pixlynote";
  const token = await fsAdminToken(env);
  const r = await fetch(`${fsBase(env)}/v1/projects/${p}/databases/(default)/documents/${path}`, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("firestore_get " + r.status);
  const d = await r.json(); return d.fields || {};
}
// Same as fsPatchDoc, but only when the document still exists (a deleted post is never re-created).
async function fsPatchExisting(env, path, fields) {
  const p = env.FIREBASE_PROJECT_ID || "pixlynote";
  const token = await fsAdminToken(env);
  const mask = Object.keys(fields).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const url = `${fsBase(env)}/v1/projects/${p}/databases/(default)/documents/${path}?${mask}&currentDocument.exists=true`;
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) body.fields[k] = firestoreValue(v);
  const r = await fetch(url, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 404 || r.status === 400 || r.status === 409) return false;
  if (!r.ok) throw new Error("firestore_patch " + r.status);
  return true;
}
async function verifyFirebaseIdToken(env, idToken) {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) return "";
  const base = env.AUTH_EMULATOR_BASE ? env.AUTH_EMULATOR_BASE.replace(/\/+$/, "") + "/identitytoolkit.googleapis.com" : "https://identitytoolkit.googleapis.com";
  const r = await fetch(`${base}/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY || "")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
  if (!r.ok) return "";
  const d = await r.json().catch(() => ({}));
  const u = d && Array.isArray(d.users) ? d.users[0] : null;
  return (u && typeof u.localId === "string") ? u.localId : "";
}
function promoteActive(f, now) {
  if (!f || fsVal(f.isPromoted) !== true) return false;
  const until = Number(fsVal(f.promotedUntil) || 0), target = Number(fsVal(f.targetImpressions) || 0), count = Number(fsVal(f.promotedImpressionsCount) || 0);
  return now < until || count < target;
}
// Owner + public checks shared by checkout and the webhook. Returns "" when OK, else an error code.
async function promoteEligibility(env, username, kind, id) {
  const user = await fsGetDocAdmin(env, "users/" + encodeURIComponent(username));
  if (!user) return { error: "no_account" };
  if (fsVal(user.isPrivate) === true) return { error: "private_account" };
  if (fsVal(user.deactivated) === true) return { error: "no_account" };
  if (kind === "post") {
    const post = await fsGetDocAdmin(env, "posts/" + encodeURIComponent(id));
    if (!post) return { error: "not_found" };
    if (normStripeUser(fsVal(post.author)) !== username) return { error: "not_owner" };
    if (fsVal(post.authorPrivate) === true) return { error: "private_account" };
    if (String(fsVal(post.audience) || "public") !== "public") return { error: "not_public" };
    if (promoteActive(post, Date.now())) return { error: "already_promoted", sessionId: fsVal(post.promoteSessionId) || "" };
    return { uid: fsVal(user.uid) || "", doc: post };
  }
  const content = await fsGetDocAdmin(env, "users/" + encodeURIComponent(username) + "/content/profile");
  const notes = content && content.notes && content.notes.arrayValue && content.notes.arrayValue.values || [];
  const hit = notes.map(v => (v && v.mapValue && v.mapValue.fields) || {}).find(f => String(fsVal(f.id)) === String(id));
  if (!hit) return { error: "not_found" };
  const na = normStripeUser(fsVal(hit.author) || username);
  if (na !== username) return { error: "not_owner" };
  if (String(fsVal(hit.audience) || "public") !== "public") return { error: "not_public" };
  const existing = await fsGetDocAdmin(env, promoteDocPath("note", id));
  if (promoteActive(existing, Date.now())) return { error: "already_promoted", sessionId: fsVal(existing.promoteSessionId) || "" };
  return { uid: fsVal(user.uid) || "", doc: hit };
}
function formBody(obj, prefix, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formBody(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}
async function stripePost(env, path, obj) {
  const r = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body: formBody(obj) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
function promoteSiteBase(env) {
  const b = String(env.PROMOTE_SITE_BASE || "https://pixlynote.com").replace(/\/+$/, "");
  return /^https:\/\//.test(b) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(b) ? b : "https://pixlynote.com";
}
async function handlePromoteCheckout(req, env, cors, body) {
  if (!promoteStripeKeyOk(env)) return json({ ok: false, error: "stripe_not_configured" }, 503, cors);
  if (!env.FIREBASE_SA_JSON && !env.AUTH_EMULATOR_BASE) return json({ ok: false, error: "auth_admin_unavailable" }, 503, cors);
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const rl = await env.GUARD.get(env.GUARD.idFromName("global")).hit([{ k: `promo:co:ip:${ip}`, limit: 20, win: HOUR }]);
  if (!rl.ok) return json({ ok: false, error: "rate_limited" }, 429, cors);
  const username = normStripeUser(body.username);
  const kind = body.kind === "note" ? "note" : (body.kind === "post" ? "post" : "");
  const id = String(body.id == null ? "" : body.id);
  if (!USER_RE.test(username)) return json({ ok: false, error: "invalid_username" }, 400, cors);
  if (!kind || !PROMOTE_ITEM_RE.test(id)) return json({ ok: false, error: "invalid_item" }, 400, cors);
  const plan = promotePlan(body.amount);
  if (!plan) return json({ ok: false, error: "invalid_amount" }, 400, cors);
  const uid = await verifyFirebaseIdToken(env, body.idToken);
  if (!uid) return json({ ok: false, error: "sign_in_required" }, 401, cors);
  let elig;
  try { elig = await promoteEligibility(env, username, kind, id); } catch (e) { return json({ ok: false, error: "lookup_failed" }, 502, cors); }
  if (elig.error) return json({ ok: false, error: elig.error }, elig.error === "not_found" || elig.error === "no_account" ? 404 : (elig.error === "already_promoted" ? 409 : 403), cors);
  if (!elig.uid || elig.uid !== uid) return json({ ok: false, error: "not_owner" }, 403, cors);
  const cta = promoteCleanCta(body.ctaLabel, body.ctaUrl, plan.tier);
  const days = plan.durationHours >= 48 ? Math.round(plan.durationHours / 24) + " days" : plan.durationHours + " hours";
  const meta = {
    purpose: "promote", username, kind, postId: id, amount: String(plan.amount), durationHours: String(plan.durationHours),
    targetImpressions: String(plan.targetImpressions), tier: plan.tier, ctaLabel: cta.ctaLabel, ctaUrl: cta.ctaUrl,
  };
  const site = promoteSiteBase(env);
  const r = await stripePost(env, "checkout/sessions", {
    mode: "payment",
    client_reference_id: username,
    success_url: site + "/?promote=success",
    cancel_url: site + "/?promote=cancel",
    line_items: { 0: { quantity: 1, price_data: { currency: "usd", unit_amount: plan.amount * 100, product_data: { name: `Pixlynote Promote (${days}, at least ${plan.targetImpressions.toLocaleString("en-US")} views)` } } } },
    metadata: meta,
    payment_intent_data: { metadata: meta, description: `Pixlynote Promote ${kind} ${id}` },
  });
  if (!r.ok || !r.data || typeof r.data.url !== "string" || !/^https:\/\/checkout\.stripe\.com\//.test(r.data.url)) return json({ ok: false, error: "stripe_error" }, 502, cors);
  return json({ ok: true, url: r.data.url, plan, livemode: !!r.data.livemode }, 200, cors);
}
async function verifyStripeSignature(env, raw, header) {
  const secret = String(env.STRIPE_WEBHOOK_SECRET || "");
  if (!secret || !header) return false;
  const parts = String(header).split(",").map(x => x.trim());
  const t = (parts.find(p => p.startsWith("t=")) || "").slice(2);
  const sigs = parts.filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  if (!/^\d{1,12}$/.test(t) || !sigs.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + raw)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, "0")).join("");
  return sigs.some(s => timingSafeEqualStr(s, hex));
}
// ---------- Billing History records (users/{u}/billing/{id}); Worker/admin write only ----------
const BILLING_ID_RE = /^[A-Za-z0-9_]{6,128}$/;
function stripePi(o) { return typeof o.payment_intent === "string" ? o.payment_intent : (o.payment_intent && o.payment_intent.id) || ""; }
async function billingUpsert(env, username, id, rec) {
  if (!USER_RE.test(username) || !BILLING_ID_RE.test(id)) return false;
  await fsPatchDoc(env, "users/" + encodeURIComponent(username) + "/billing/" + encodeURIComponent(id), Object.assign({ source: "stripe_webhook", updatedAt: Date.now() }, rec));
  const guard = env.GUARD.get(env.GUARD.idFromName("global"));
  if (rec.paymentIntent) await guard.billMapSet("pi:" + rec.paymentIntent, JSON.stringify({ u: username, id }));
  return true;
}
function promoteBillingRecord(s, plan, kind, id, status, note) {
  const days = plan.durationHours >= 48 ? Math.round(plan.durationHours / 24) + " days" : plan.durationHours + " hours";
  return {
    kind: "promote", item: `Promote ${kind} (${days}, at least ${plan.targetImpressions.toLocaleString("en-US")} views)`,
    itemKind: kind, itemId: id, amountCents: Number(s.amount_total) || plan.amount * 100, currency: String(s.currency || "usd").toLowerCase(),
    status, note: note || "", createdAt: (Number(s.created) || Math.floor(Date.now() / 1000)) * 1000, sessionId: s.id, paymentIntent: stripePi(s), livemode: !!s.livemode,
  };
}
function stripeLiveBlocked(env, o) { return !!(o && o.livemode) && env.PROMOTE_ALLOW_LIVE !== "on"; }
async function handleBillingEvent(env, cors, type, o) {
  const guard = env.GUARD.get(env.GUARD.idFromName("global"));
  if (stripeLiveBlocked(env, o)) return json({ received: true, ignored: "livemode" }, 200, cors);
  try {
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const username = normStripeUser(o.client_reference_id);
      if (!USER_RE.test(username) || !(await fsGetDocAdmin(env, "users/" + encodeURIComponent(username)))) return json({ received: true, ignored: "unknown_user" }, 200, cors);
      const cust = typeof o.customer === "string" ? o.customer : (o.customer && o.customer.id) || "";
      if (cust) await guard.billMapSet("cus:" + cust, username);
      const status = o.payment_status === "paid" ? "paid" : (o.payment_status === "no_payment_required" ? "trial" : "pending");
      await billingUpsert(env, username, o.id, { kind: "subscription", item: "Pixlynote subscription", amountCents: Number(o.amount_total) || 0,
        currency: String(o.currency || "usd").toLowerCase(), status, createdAt: (Number(o.created) || Math.floor(Date.now() / 1000)) * 1000,
        sessionId: o.id, paymentIntent: stripePi(o), livemode: !!o.livemode });
      return json({ received: true, billing: true }, 200, cors);
    }
    if (type === "invoice.paid" || type === "invoice.payment_failed") {
      if (o.billing_reason === "subscription_create" && type === "invoice.paid") return json({ received: true, ignored: "covered_by_checkout" }, 200, cors);
      const cust = typeof o.customer === "string" ? o.customer : (o.customer && o.customer.id) || "";
      const md = (o.subscription_details && o.subscription_details.metadata) || (o.parent && o.parent.subscription_details && o.parent.subscription_details.metadata) || {};
      const username = normStripeUser((cust && await guard.billMapGet("cus:" + cust)) || md.username || "");
      if (!USER_RE.test(username) || !(await fsGetDocAdmin(env, "users/" + encodeURIComponent(username)))) return json({ received: true, ignored: "unknown_customer" }, 200, cors);
      const paid = type === "invoice.paid";
      const at = Number((o.status_transitions && o.status_transitions.paid_at) || o.created) || Math.floor(Date.now() / 1000);
      await billingUpsert(env, username, o.id, { kind: "subscription", item: o.billing_reason === "subscription_create" ? "Pixlynote subscription" : "Pixlynote subscription renewal",
        amountCents: Number(paid ? o.amount_paid : o.amount_due) || 0, currency: String(o.currency || "usd").toLowerCase(), status: paid ? "paid" : "failed",
        createdAt: at * 1000, invoiceId: o.id, paymentIntent: stripePi(o), livemode: !!o.livemode });
      return json({ received: true, billing: true }, 200, cors);
    }
    if (type === "charge.refunded") {
      const pi = stripePi(o);
      const ref = pi ? await guard.billMapGet("pi:" + pi) : "";
      let m = null; try { m = ref ? JSON.parse(ref) : null; } catch (e) { m = null; }
      if (!m || !USER_RE.test(m.u) || !BILLING_ID_RE.test(m.id)) return json({ received: true, ignored: "unknown_payment" }, 200, cors);
      const full = Number(o.amount_refunded) >= Number(o.amount);
      await fsPatchExisting(env, "users/" + encodeURIComponent(m.u) + "/billing/" + encodeURIComponent(m.id),
        { status: full ? "refunded" : "partially_refunded", refundedCents: Number(o.amount_refunded) || 0, updatedAt: Date.now() });
      return json({ received: true, billing: true }, 200, cors);
    }
  } catch (e) {
    return json({ error: "billing_write_failed" }, 500, cors);
  }
  return json({ received: true, ignored: type || "unknown" }, 200, cors);
}
const PROMOTE_NOT_STARTED = {
  not_found: "Not started: the item was deleted before payment completed",
  private_account: "Not started: the account was private when payment completed",
  not_public: "Not started: the item was not public when payment completed",
  not_owner: "Not started: the item belongs to another account",
  no_account: "Not started: the account no longer exists",
};
async function handleStripeWebhook(req, env, cors) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "webhook_not_configured" }, 503, cors);
  const raw = await req.text();
  if (raw.length > 200000) return json({ error: "too_large" }, 413, cors);
  if (!(await verifyStripeSignature(env, raw, req.headers.get("Stripe-Signature")))) return json({ error: "bad_signature" }, 400, cors);
  let evt; try { evt = JSON.parse(raw); } catch (e) { return json({ error: "bad_json" }, 400, cors); }
  const type = evt && evt.type;
  const s = evt.data && evt.data.object || {};
  const m = s.metadata || {};
  if (type === "invoice.paid" || type === "invoice.payment_failed" || type === "charge.refunded") return handleBillingEvent(env, cors, type, s);
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") return json({ received: true, ignored: type || "unknown" }, 200, cors);
  if (m.purpose !== "promote") {
    if (s.mode === "subscription") return handleBillingEvent(env, cors, type, s);
    return json({ received: true, ignored: "not_promote" }, 200, cors);
  }
  if (s.payment_status !== "paid") return json({ received: true, pending: true }, 200, cors);
  if (!promoteStripeKeyOk(env) || (s.livemode && env.PROMOTE_ALLOW_LIVE !== "on")) return json({ received: true, ignored: "livemode" }, 200, cors);
  const username = normStripeUser(m.username), kind = m.kind === "note" ? "note" : (m.kind === "post" ? "post" : ""), id = String(m.postId || "");
  const plan = promotePlan(m.amount);
  if (!USER_RE.test(username) || !kind || !PROMOTE_ITEM_RE.test(id) || !plan
      || normStripeUser(s.client_reference_id) !== username
      || Number(s.amount_total) !== plan.amount * 100 || String(s.currency || "").toLowerCase() !== "usd"
      || Number(m.durationHours) !== plan.durationHours || Number(m.targetImpressions) !== plan.targetImpressions) {
    return json({ received: true, ignored: "metadata_mismatch" }, 200, cors);
  }
  const key = kind + "_" + id;
  const guard = env.GUARD.get(env.GUARD.idFromName("global"));
  const seen = await guard.promoGet(key);
  if (seen && seen.sid === s.id) {
    try { await billingUpsert(env, username, s.id, promoteBillingRecord(s, plan, kind, id, "paid")); } catch (e) { return json({ error: "billing_write_failed" }, 500, cors); }
    return json({ received: true, duplicate: true }, 200, cors);
  }
  let elig;
  try { elig = await promoteEligibility(env, username, kind, id); } catch (e) { return json({ error: "lookup_failed" }, 500, cors); }
  if (elig.error === "already_promoted" && elig.sessionId === s.id) {
    // A retry after the Firestore write already succeeded: finish the bookkeeping.
    if (!seen || seen.sid !== s.id) await guard.promoStart(key, s.id, plan.targetImpressions, Date.now() + plan.durationHours * HOUR * 1000);
    try { await billingUpsert(env, username, s.id, promoteBillingRecord(s, plan, kind, id, "paid")); } catch (e) { return json({ error: "billing_write_failed" }, 500, cors); }
    return json({ received: true, duplicate: true }, 200, cors);
  }
  if (elig.error === "already_promoted") {
    // Two checkouts raced for the same item and both were paid. No refunds: the second purchase is added on top
    // (more time and more guaranteed views) instead of being lost.
    try {
      const cur = kind === "post" ? await fsGetDocAdmin(env, promoteDocPath(kind, id)) : await fsGetDocAdmin(env, promoteDocPath("note", id));
      const now2 = Date.now();
      const curUntil = Number(fsVal(cur && cur.promotedUntil) || 0), curTarget = Number(fsVal(cur && cur.targetImpressions) || 0);
      const until2 = Math.max(curUntil, now2) + plan.durationHours * HOUR * 1000;
      const target2 = curTarget + plan.targetImpressions;
      const f2 = { isPromoted: true, promotedUntil: until2, targetImpressions: target2, promoteSessionId: s.id };
      const ok2 = await fsPatchExisting(env, promoteDocPath(kind, id), f2);
      if (!ok2) throw new Error("extend_failed");
      await guard.promoExtend(key, s.id, target2, until2, Number(fsVal(cur && cur.promotedImpressionsCount) || 0));
      await billingUpsert(env, username, s.id, promoteBillingRecord(s, plan, kind, id, "paid", "Added to the promotion already running"));
    } catch (e) { return json({ error: "write_failed" }, 500, cors); }
    return json({ received: true, promoted: true, extended: true, key }, 200, cors);
  }
  if (elig.error) {
    // No refunds (Bradley, t1022u). Record the purchase so it shows in History; nothing is promoted.
    try { await billingUpsert(env, username, s.id, promoteBillingRecord(s, plan, kind, id, "paid", PROMOTE_NOT_STARTED[elig.error] || "Not started")); } catch (e) { return json({ error: "billing_write_failed" }, 500, cors); }
    return json({ received: true, promoted: false, reason: elig.error }, 200, cors);
  }
  const now = Date.now();
  const until = now + plan.durationHours * HOUR * 1000;
  const cta = promoteCleanCta(m.ctaLabel, m.ctaUrl, plan.tier);
  const fields = {
    isPromoted: true, promotedUntil: until, targetImpressions: plan.targetImpressions, promotedImpressionsCount: 0,
    ctaLabel: cta.ctaLabel, ctaUrl: cta.ctaUrl, promotedAt: now, promotionTier: plan.tier, promotionAmount: plan.amount,
    promotionDurationHours: plan.durationHours, promoteSessionId: s.id,
  };
  try {
    if (kind === "post") {
      const ok = await fsPatchExisting(env, promoteDocPath(kind, id), fields);
      if (!ok) {
        try { await billingUpsert(env, username, s.id, promoteBillingRecord(s, plan, kind, id, "paid", PROMOTE_NOT_STARTED.not_found)); } catch (e) { return json({ error: "billing_write_failed" }, 500, cors); }
        return json({ received: true, promoted: false, reason: "not_found" }, 200, cors);
      }
    } else {
      await fsPatchDoc(env, promoteDocPath(kind, id), Object.assign({ kind: "note", noteId: id, author: username }, fields));
    }
  } catch (e) {
    // Non-2xx makes Stripe retry later; nothing was marked promoted.
    return json({ error: "write_failed" }, 500, cors);
  }
  await guard.promoStart(key, s.id, plan.targetImpressions, until);
  // If this write fails Stripe retries; the retry takes the duplicate path above and writes the record.
  try { await billingUpsert(env, username, s.id, promoteBillingRecord(s, plan, kind, id, "paid")); } catch (e) { return json({ error: "billing_write_failed" }, 500, cors); }
  return json({ received: true, promoted: true, key }, 200, cors);
}
async function handlePromoteImpression(req, env, cors, body) {
  const key = String(body.key || ""), sid = String(body.sid || "");
  if (!PROMOTE_KEY_RE.test(key) || !PROMOTE_SID_RE.test(sid)) return json({ ok: false, error: "invalid" }, 400, cors);
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const guard = env.GUARD.get(env.GUARD.idFromName("global"));
  const rl = await guard.hit([
    { k: `promo:imp:ip:${ip}`, limit: 300, win: DAY },
    { k: `promo:imp:ipk:${ip}:${key}`, limit: 3, win: DAY },
    { k: `promo:imp:sk:${sid}:${key}`, limit: 1, win: 30 * DAY },
  ]);
  if (!rl.ok) return json({ ok: true, counted: false }, 200, cors);
  const h = await guard.promoHit(key);
  if (!h || !h.counted) return json({ ok: true, counted: false }, 200, cors);
  if (h.flush && (env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE)) {
    const kind = key.startsWith("note_") ? "note" : "post";
    const id = key.slice(kind.length + 1);
    const f = { promotedImpressionsCount: h.count };
    if (h.done) { f.isPromoted = false; f.promotionEndedAt = Date.now(); }
    try { await fsPatchExisting(env, promoteDocPath(kind, id), f); } catch (e) {}
  }
  return json({ ok: true, counted: true, count: h.count }, 200, cors);
}
async function handlePromoteStats(req, env, cors, url) {
  const key = String(url.searchParams.get("key") || "");
  if (!PROMOTE_KEY_RE.test(key)) return json({ ok: false, error: "invalid" }, 400, cors);
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const guard = env.GUARD.get(env.GUARD.idFromName("global"));
  const rl = await guard.hit([{ k: `promo:stats:ip:${ip}`, limit: 120, win: 600 }]);
  if (!rl.ok) return json({ ok: false, error: "rate_limited" }, 429, cors);
  const row = await guard.promoGet(key);
  if (!row) return json({ ok: true, found: false }, 200, cors);
  return json({ ok: true, found: true, count: row.count, target: row.target, until: row.until, active: !row.done }, 200, cors);
}
'''

needle = "export default {"
assert s.count(needle) == 1
s = s.replace(needle, SNIPPET + "\nexport default {")

# Health flag
rep('sync_subscription: !!(env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE) }, 200, cors);',
    'sync_subscription: !!(env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE), promote: promoteStripeKeyOk(env) && !!(env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE), promote_webhook: !!env.STRIPE_WEBHOOK_SECRET }, 200, cors);')

# GET stats (before the POST-only gate)
rep('      if (req.method === "GET" && path === "/business-verification/status") {',
    '      if (req.method === "GET" && path === "/promote/stats") return handlePromoteStats(req, env, cors, url);\n      if (req.method === "GET" && path === "/business-verification/status") {')

# Stripe webhook: no Origin header and raw body (signature), so it runs before the Origin/JSON checks.
rep('      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);',
    '      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);\n      if (path === "/stripe/webhook") return handleStripeWebhook(req, env, cors);')

rep('      if (path === "/sync-subscription") return handleSyncSubscription(req, env, cors, body);',
    '      if (path === "/sync-subscription") return handleSyncSubscription(req, env, cors, body);\n'
    '      if (path === "/promote/checkout") return handlePromoteCheckout(req, env, cors, body);\n'
    '      if (path === "/promote/impression") return handlePromoteImpression(req, env, cors, body);')

# Guard: promotion counters (same SQLite Durable Object, free plan)
rep('  async alarm() {',
r'''  promoTable() {
    this.sql.exec("CREATE TABLE IF NOT EXISTS promos (k TEXT PRIMARY KEY, sid TEXT, target INTEGER, until INTEGER, n INTEGER, done INTEGER)");
  }
  async promoStart(k, sid, target, until) {
    this.promoTable();
    this.sql.exec("INSERT OR REPLACE INTO promos (k, sid, target, until, n, done) VALUES (?, ?, ?, ?, 0, 0)", k, sid, target, until);
    return true;
  }
  // Adds a second paid purchase on top of a running promotion (keeps the views delivered so far).
  async promoExtend(k, sid, target, until, countIfNew) {
    this.promoTable();
    const r = this.sql.exec("SELECT n FROM promos WHERE k = ?", k).toArray()[0];
    if (r) this.sql.exec("UPDATE promos SET sid = ?, target = ?, until = ?, done = 0 WHERE k = ?", sid, target, until, k);
    else this.sql.exec("INSERT INTO promos (k, sid, target, until, n, done) VALUES (?, ?, ?, ?, ?, 0)", k, sid, target, until, Number(countIfNew) || 0);
    return true;
  }
  async promoGet(k) {
    this.promoTable();
    const r = this.sql.exec("SELECT sid, target, until, n, done FROM promos WHERE k = ?", k).toArray()[0];
    return r ? { sid: r.sid, target: r.target, until: r.until, count: r.n, done: !!r.done } : null;
  }
  // One counted view. Ends the promotion once BOTH the time has passed and the view target is met.
  async promoHit(k) {
    this.promoTable();
    const r = this.sql.exec("SELECT target, until, n, done FROM promos WHERE k = ?", k).toArray()[0];
    if (!r || r.done) return { counted: false };
    const now = Date.now();
    if (now >= r.until && r.n >= r.target) { this.sql.exec("UPDATE promos SET done = 1 WHERE k = ?", k); return { counted: false }; }
    const n = r.n + 1;
    const done = now >= r.until && n >= r.target;
    this.sql.exec("UPDATE promos SET n = ?, done = ? WHERE k = ?", n, done ? 1 : 0, k);
    return { counted: true, count: n, target: r.target, done, flush: n === 1 || done || n === r.target || n % 10 === 0 };
  }
  billMapTable() {
    this.sql.exec("CREATE TABLE IF NOT EXISTS billing_map (k TEXT PRIMARY KEY, v TEXT, at INTEGER)");
  }
  async billMapSet(k, v) {
    this.billMapTable();
    this.sql.exec("INSERT OR REPLACE INTO billing_map (k, v, at) VALUES (?, ?, ?)", k, String(v), Date.now());
    return true;
  }
  async billMapGet(k) {
    this.billMapTable();
    const r = this.sql.exec("SELECT v FROM billing_map WHERE k = ?", k).toArray()[0];
    return r ? r.v : "";
  }
  async alarm() {''')

open(dst, 'w').write(s)
print('wrote', dst)
