#!/usr/bin/env python3
"""Database lockdown patch for the misty-frog Worker (NOT deployed by this script).

Usage: python3 patch_worker.py <worker.js in> <worker.db-lockdown.js out>

1. Email/phone lookups use the public contactIndex (sha256 of the normalized contact) first and fall back to the
   legacy public users.email / users.phone fields, so the Worker keeps working before, during and after migration.
2. POST /auth/reset-password: after a verified reset code (POST /email/reset-verify), sets the Firebase Auth
   password of a migrated account with a Google service account (secret FIREBASE_SA_JSON, free), signs out its
   other sessions, then sends the "password was reset" email. Without the secret it answers 503
   auth_admin_unavailable and changes nothing.
"""
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()

def rep(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)

LOOKUPS = r'''
// ---------- Database lockdown: contact index (public single-doc reads, no PII stored) ----------
const CONTACT_SALT = "pixlynote-contact-v1|";
function normalizeContactW(kind, value) {
  if (kind === "email") { const em = String(value || "").trim().toLowerCase(); return EMAIL_RE.test(em) ? em : ""; }
  const d = phoneDigits10(value); return d.length === 10 ? d : "";
}
async function fsGetDoc(env, path) {
  const p = env.FIREBASE_PROJECT_ID || "pixlynote";
  const url = `${fsBase(env)}/v1/projects/${p}/databases/(default)/documents/${path}?key=${encodeURIComponent(env.FIREBASE_API_KEY || "")}`;
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("firestore " + r.status);
  const d = await r.json(); return d.fields || {};
}
async function fsContactOwners(env, kind, value) {
  const norm = normalizeContactW(kind, value);
  if (!norm) return [];
  const f = await fsGetDoc(env, "contactIndex/" + (await sha256(CONTACT_SALT + kind + "|" + norm)));
  const arr = f && f.usernames && f.usernames.arrayValue && f.usernames.arrayValue.values;
  return Array.isArray(arr) ? arr.map(v => String(v.stringValue || "").toLowerCase()).filter(u => USER_RE.test(u)) : [];
}
async function fsPublicAccount(env, username) {
  const f = await fsGetDoc(env, "users/" + encodeURIComponent(username));
  return f ? { username, deactivated: fsVal(f.deactivated) === true, uid: fsVal(f.uid) || "" } : null;
}
// Accounts listed in the index for this contact (email/phone set to the looked-up value so callers' checks still hold).
async function fsIndexedOwners(env, kind, value) {
  const out = [];
  for (const u of await fsContactOwners(env, kind, value)) {
    const a = await fsPublicAccount(env, u).catch(() => null);
    if (a) out.push({ ...a, [kind]: String(value || "").trim() });
  }
  return out;
}
'''

# Rename the legacy lookups and wrap them: index first, legacy public fields as fallback (merged, de-duplicated).
rep("async function fsGetUser(env, username) {", LOOKUPS + "\nasync function fsGetUserLegacy(env, username) {")
rep("async function fsFindUsersByEmail(env, email) {", "async function fsFindUsersByEmailLegacy(env, email) {")
rep("async function fsFindUsersByPhone(env, e164) {", "async function fsFindUsersByPhoneLegacy(env, e164) {")
rep("// Returns the account if `to` is the email on file for `username`", r'''async function fsGetUser(env, username) { return fsGetUserLegacy(env, username); }
async function mergeOwners(a, b) { const m = new Map(); for (const x of [...a, ...b]) if (x && !m.has(x.username)) m.set(x.username, x); return [...m.values()]; }
async function fsFindUsersByEmail(env, email) {
  const indexed = await fsIndexedOwners(env, "email", email).catch(() => []);
  const legacy = await fsFindUsersByEmailLegacy(env, email).catch(e => { if (!indexed.length) throw e; return []; });
  return mergeOwners(indexed, legacy);
}
async function fsFindUsersByPhone(env, e164) {
  const indexed = await fsIndexedOwners(env, "phone", e164).catch(() => []);
  const legacy = await fsFindUsersByPhoneLegacy(env, e164).catch(e => { if (!indexed.length) throw e; return []; });
  return mergeOwners(indexed, legacy);
}
// Returns the account if `to` is the email on file for `username`''')
rep('''  if (username) {
    const u = await fsGetUser(env, username);
    return u && u.email && u.email.trim().toLowerCase() === want ? u : null;
  }''', '''  if (username) {
    // Migrated accounts keep email private; the contact index proves this address belongs to the account.
    const owners = await fsContactOwners(env, "email", want).catch(() => []);
    if (owners.includes(username)) {
      const a = await fsPublicAccount(env, username);
      if (a) return { ...a, email: want };
    }
    const u = await fsGetUser(env, username);
    return u && u.email && u.email.trim().toLowerCase() === want ? u : null;
  }''')

RESET = r'''
// ---------- Database lockdown: Firebase Auth password reset (service account, free) ----------
function b64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function googleAccessToken(env) {
  const sa = JSON.parse(env.FIREBASE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const pem = String(sa.private_key || "").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + unsigned + "." + b64url(sig) });
  if (!r.ok) throw new Error("token " + r.status);
  return (await r.json()).access_token;
}
async function authAdminUpdate(env, uid, fields) {
  const p = env.FIREBASE_PROJECT_ID || "pixlynote";
  let base = "https://identitytoolkit.googleapis.com", bearer;
  if (env.AUTH_EMULATOR_BASE) { base = env.AUTH_EMULATOR_BASE.replace(/\/+$/, "") + "/identitytoolkit.googleapis.com"; bearer = "owner"; }
  else bearer = await googleAccessToken(env);
  const r = await fetch(`${base}/v1/projects/${p}/accounts:update`, { method: "POST", headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" }, body: JSON.stringify({ localId: uid, ...fields }) });
  return r.ok;
}
async function handleAuthResetPassword(req, env, cors, body) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const username = String(body.username || "").trim().toLowerCase().replace(/^@/, "");
  const pw = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!EMAIL_RE.test(to) || !USER_RE.test(username) || pw.length < 6 || pw.length > 128) return json({ ok: false, error: "invalid_request" }, 400, cors);
  if (!env.FIREBASE_SA_JSON && !env.AUTH_EMULATOR_BASE) return json({ ok: false, error: "auth_admin_unavailable" }, 503, cors);
  const guard = env.GUARD.get(env.GUARD.idFromName("global"));
  const rl = await guard.hit([{ k: `authreset:ip:${ip}`, limit: 10, win: HOUR }]);
  if (!rl.ok) return json({ ok: false, error: "rate_limited" }, 429, cors);
  const rcpt = await sha256("rcpt:" + to.toLowerCase());
  // The code for this address must have been verified for this same account in the last 15 minutes.
  const verifiedFor = await guard.peekVerifiedReset(rcpt);
  if (!verifiedFor || verifiedFor !== username) return json({ ok: false, error: "no_verified_reset" }, 403, cors);
  let acct;
  try { acct = await fsPublicAccount(env, username); } catch (e) { return json({ ok: false, error: "lookup_failed" }, 503, cors); }
  if (!acct || !acct.uid) return json({ ok: false, error: "not_migrated" }, 409, cors);
  let ok = false;
  try { ok = await authAdminUpdate(env, acct.uid, { password: "pixlynote_v1:" + pw, validSince: String(Math.floor(Date.now() / 1000)) }); } catch (e) { ok = false; }
  if (!ok) return json({ ok: false, error: "auth_update_failed" }, 502, cors);
  await guard.consumeVerifiedReset(rcpt);
  const tpl = TEMPLATES.password_reset({ username, at: Date.now() });
  const res = await deliver(env, to, tpl).catch(() => ({ ok: false }));
  return json({ ok: true, emailed: !!res.ok }, 200, cors);
}
'''
rep("function codeTtlMs(env) {", RESET + "\nfunction codeTtlMs(env) {")
rep('''      if (path === "/email/reset-verify") return handleResetVerify(req, env, cors, body);''',
    '''      if (path === "/email/reset-verify") return handleResetVerify(req, env, cors, body);
      if (path === "/auth/reset-password") return handleAuthResetPassword(req, env, cors, body);''')
rep('''  async consumeVerifiedReset(rcpt) {''', '''  async peekVerifiedReset(rcpt) {
    const row = this.sql.exec("SELECT verified_at, exp, username FROM resets WHERE rcpt = ?", rcpt).toArray()[0];
    return row && row.verified_at && row.exp >= Date.now() ? String(row.username || "") : "";
  }
  async consumeVerifiedReset(rcpt) {''')
rep('''path === "/health") return json({ ok: true, signup_verify: true, cancel_at_period_end: true }''',
    '''path === "/health") return json({ ok: true, signup_verify: true, cancel_at_period_end: true, contact_index: true, auth_reset: !!(env.FIREBASE_SA_JSON || env.AUTH_EMULATOR_BASE) }''')
open(dst, 'w').write(s)
print("wrote", dst)
