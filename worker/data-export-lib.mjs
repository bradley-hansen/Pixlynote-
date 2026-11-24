'use strict';

/**
 * Pure helpers for Pixlynote "Download your data".
 * Used by the Worker and by the regression unit tests. No secrets, no I/O
 * except through injected fetch/deps.
 */

const MAX_ZIP_BYTES = 7 * 1024 * 1024; // under Resend's 40 MB cap and typical inbox filters
const INLINE_DATA_LIMIT = 8000;
const STRIP_KEY_RE = /^(password|passwordHash|passwordSalt|pwHash|hashedPassword|sessionToken|idToken|refreshToken|apiKey|api_key|secret|privateKey|private_key|twoFactorSecret|otpSecret|backupCodes|stripeSecret)$/i;

function base64UrlToBytes(s) {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function textToBytes(str) {
  return new TextEncoder().encode(String(str));
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return {};
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
  } catch (e) {
    return {};
  }
}

function extractBearer(authHeader) {
  const raw = String(authHeader || '');
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : '';
}

function isAnonymousClaims(claims, lookupUser) {
  const provider = claims && claims.firebase && claims.firebase.sign_in_provider;
  if (provider === 'anonymous') return true;
  if (lookupUser && Array.isArray(lookupUser.providerUserInfo) && lookupUser.providerUserInfo.length) {
    const ids = lookupUser.providerUserInfo.map((p) => p && p.providerId).filter(Boolean);
    if (ids.length && ids.every((id) => id === 'anonymous')) return true;
    if (ids.some((id) => id === 'password' || id === 'google.com' || id === 'phone' || String(id).includes('google'))) return false;
  }
  if (provider && provider !== 'anonymous') return false;
  if (lookupUser && lookupUser.email) return false;
  return !!(lookupUser && !lookupUser.email && (!lookupUser.providerUserInfo || !lookupUser.providerUserInfo.length));
}

async function verifyFirebaseIdToken(token, deps) {
  const tok = String(token || '').trim();
  if (!tok || tok.split('.').length !== 3) {
    const err = new Error('unauthorized');
    err.code = 'unauthorized';
    throw err;
  }
  const apiKey = (deps && deps.apiKey) || '';
  if (!apiKey) {
    const err = new Error('auth_unavailable');
    err.code = 'auth_unavailable';
    throw err;
  }
  const fetchFn = deps.fetch;
  const base = String((deps && deps.authBase) || 'https://identitytoolkit.googleapis.com').replace(/\/+$/, '');
  const r = await fetchFn(base + '/v1/accounts:lookup?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: tok })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data || !Array.isArray(data.users) || !data.users[0] || !data.users[0].localId) {
    const err = new Error('unauthorized');
    err.code = 'unauthorized';
    throw err;
  }
  const user = data.users[0];
  const claims = decodeJwtPayload(tok);
  return {
    sub: String(user.localId),
    email: String(user.email || claims.email || '').trim(),
    email_verified: user.emailVerified === true || claims.email_verified === true,
    anonymous: isAnonymousClaims(claims, user),
    claims,
    user
  };
}

function uniqueAccounts(list) {
  const map = new Map();
  for (const a of list || []) {
    if (!a || !a.username) continue;
    map.set(String(a.username).toLowerCase(), a);
  }
  return [...map.values()];
}

async function resolveExportAccount(identity, deps) {
  if (deps && deps.grantAccount) return deps.grantAccount;
  const uid = String((identity && identity.sub) || '');
  const email = String((identity && identity.email) || '').trim().toLowerCase();
  const emailVerified = !!(identity && identity.email_verified);
  const found = [];
  if (uid && deps.findByUid) {
    const byUid = await deps.findByUid(uid);
    found.push(...(Array.isArray(byUid) ? byUid : byUid ? [byUid] : []));
  }
  if (emailVerified && email && deps.findByEmail) {
    const byEmail = await deps.findByEmail(email);
    found.push(...(Array.isArray(byEmail) ? byEmail : byEmail ? [byEmail] : []));
  }
  const uniq = uniqueAccounts(found);
  if (uniq.length === 1) {
    const acc = uniq[0];
    if (emailVerified && email && acc.email && String(acc.email).trim().toLowerCase() !== email) {
      const err = new Error('identity_mismatch');
      err.code = 'identity_mismatch';
      throw err;
    }
    return acc;
  }
  const err = new Error('identity_unlinked');
  err.code = 'identity_unlinked';
  throw err;
}

function recipientOnFile(account) {
  const email = account && typeof account.email === 'string' ? account.email.trim() : '';
  if (!email || !/^[^\s@<>"',;:()\[\]\\]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(email)) return '';
  return email;
}

function fsDecode(v) {
  if (v == null) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDecode);
  if ('mapValue' in v) {
    const out = {};
    const fields = (v.mapValue.fields || {});
    for (const k of Object.keys(fields)) out[k] = fsDecode(fields[k]);
    return out;
  }
  if ('bytesValue' in v) return { _bytes: true, encoding: 'base64', value: v.bytesValue };
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return undefined;
}

function fsDecodeDoc(doc) {
  const fields = (doc && doc.fields) || {};
  const out = {};
  for (const k of Object.keys(fields)) out[k] = fsDecode(fields[k]);
  if (doc && doc.name) out._id = doc.name.split('/').pop();
  return out;
}

function sanitizeRecord(value, opts) {
  const limit = (opts && opts.inlineDataLimit) || INLINE_DATA_LIMIT;
  if (Array.isArray(value)) return value.map((v) => sanitizeRecord(v, opts));
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > limit) {
      return { omitted: true, reason: 'inline_data_too_large', bytes: value.length };
    }
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (STRIP_KEY_RE.test(k)) continue;
    out[k] = sanitizeRecord(v, opts);
  }
  return out;
}

function jsonBytes(obj) {
  return textToBytes(JSON.stringify(obj, null, 2) + '\n');
}

function buildExportManifest(account, bundle, extras) {
  const username = account && account.username ? String(account.username) : '';
  const truncated = !!(extras && extras.truncated);
  const files = {
    'README.txt': [
      'Pixlynote data export for @' + username,
      'Generated (UTC): ' + new Date((extras && extras.now) || Date.now()).toISOString(),
      '',
      'This ZIP contains a copy of the data Pixlynote stores for this account.',
      'The archive was emailed only to the verified email on file.',
      'Password hashes and other secrets are not included.',
      'Large inline images are replaced with a short placeholder; image URLs are kept.',
      'Drafts saved only on a device are included when the device sent them with this request.',
      truncated ? 'Some large fields were omitted so the email could stay within size limits.' : '',
      ''
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
    'profile.json': sanitizeRecord((bundle && bundle.profile) || {}),
    'posts.json': sanitizeRecord((bundle && bundle.posts) || []),
    'notes.json': sanitizeRecord((bundle && bundle.notes) || []),
    'likes.json': sanitizeRecord((bundle && bundle.likes) || {}),
    'saves.json': sanitizeRecord((bundle && bundle.saves) || {}),
    'connections.json': sanitizeRecord((bundle && bundle.connections) || {}),
    'drafts.json': sanitizeRecord((bundle && bundle.drafts) || []),
    'highlights.json': sanitizeRecord((bundle && bundle.highlights) || []),
    'profile-history.json': sanitizeRecord((bundle && bundle.profileHistory) || null)
  };
  return files;
}

function crc32(bytes) {
  let c = 0xffffffff;
  const table = crc32.table || (crc32.table = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let x = n;
      for (let k = 0; k < 8; k++) x = (x & 1) ? (0xedb88320 ^ (x >>> 1)) : (x >>> 1);
      t[n] = x >>> 0;
    }
    return t;
  })());
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(ms) {
  const d = new Date(ms || Date.now());
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

function u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }

function concatBytes(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function normalizeZipFiles(files) {
  const entries = [];
  if (Array.isArray(files)) {
    for (const f of files) {
      if (!f || !f.name) continue;
      const data = typeof f.content === 'string' ? textToBytes(f.content) : (f.content instanceof Uint8Array ? f.content : textToBytes(String(f.content || '')));
      entries.push({ name: String(f.name).replace(/^\/+/, '').replace(/\\/g, '/'), data });
    }
    return entries;
  }
  for (const [name, content] of Object.entries(files || {})) {
    const data = content instanceof Uint8Array ? content
      : (typeof content === 'string' ? textToBytes(content) : jsonBytes(content));
    entries.push({ name: String(name).replace(/^\/+/, '').replace(/\\/g, '/'), data });
  }
  return entries;
}

function buildZip(files, now) {
  const entries = normalizeZipFiles(files);
  const { time, date } = dosTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const ent of entries) {
    const nameBytes = textToBytes(ent.name);
    const crc = crc32(ent.data);
    const size = ent.data.length;
    const local = concatBytes([
      u32(0x04034b50),
      u16(20), u16(0), u16(0),
      u16(time), u16(date),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0),
      nameBytes,
      ent.data
    ]);
    const central = concatBytes([
      u32(0x02014b50),
      u16(20), u16(20), u16(0), u16(0),
      u16(time), u16(date),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0),
      u32(offset),
      nameBytes
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concatBytes(centrals);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0)
  ]);
  return concatBytes(locals.concat([centralDir, end]));
}

function readZip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let end = -1;
  for (let i = u8.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('invalid_zip');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('invalid_zip');
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOff = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(u8.subarray(offset + 46, offset + 46 + nameLen));
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtra = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + localNameLen + localExtra;
    if (method !== 0) throw new Error('unsupported_compression');
    files[name] = u8.subarray(dataStart, dataStart + size);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function zipFileText(files, name) {
  const data = files[name];
  if (!data) return '';
  return new TextDecoder().decode(data);
}

function buildSizedZip(account, bundle, extras) {
  let truncated = !!(extras && extras.truncated);
  let files = buildExportManifest(account, bundle, Object.assign({}, extras, { truncated }));
  let zip = buildZip(files, extras && extras.now);
  if (zip.length <= MAX_ZIP_BYTES) return { zip, files, truncated, filename: exportFilename(account, extras && extras.now) };
  const tighter = { inlineDataLimit: 64 };
  const slimBundle = {
    profile: sanitizeRecord(bundle.profile, tighter),
    posts: sanitizeRecord(bundle.posts, tighter),
    notes: sanitizeRecord(bundle.notes, tighter),
    likes: sanitizeRecord(bundle.likes, tighter),
    saves: sanitizeRecord(bundle.saves, tighter),
    connections: sanitizeRecord(bundle.connections, tighter),
    drafts: sanitizeRecord(bundle.drafts, tighter),
    highlights: sanitizeRecord(bundle.highlights, tighter),
    profileHistory: sanitizeRecord(bundle.profileHistory, tighter)
  };
  truncated = true;
  files = buildExportManifest(account, slimBundle, Object.assign({}, extras, { truncated }));
  zip = buildZip(files, extras && extras.now);
  if (zip.length <= MAX_ZIP_BYTES) return { zip, files, truncated, filename: exportFilename(account, extras && extras.now) };
  // Last resort: compact JSON only (still inside a ZIP).
  const compact = {
    'README.txt': 'This Pixlynote export was reduced to a compact JSON file so the email could be sent.\n',
    'data.json': {
      username: account && account.username,
      profile: slimBundle.profile,
      postIds: Array.isArray(slimBundle.posts) ? slimBundle.posts.map((p) => p && (p.id || p._id)).filter(Boolean) : [],
      notes: slimBundle.notes,
      likes: slimBundle.likes,
      saves: slimBundle.saves,
      connections: slimBundle.connections,
      drafts: slimBundle.drafts
    }
  };
  zip = buildZip(compact, extras && extras.now);
  return { zip, files: compact, truncated: true, filename: exportFilename(account, extras && extras.now) };
}

function exportFilename(account, now) {
  const u = String((account && account.username) || 'account').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 30);
  const d = new Date(now || Date.now()).toISOString().slice(0, 10);
  return 'pixlynote-data-' + u + '-' + d + '.zip';
}

function ignoreClientIdentity(body) {
  // The worker must not honor these even if a client sends them.
  if (!body || typeof body !== 'object') return {};
  const out = {};
  if (Array.isArray(body.deviceDrafts)) out.deviceDrafts = body.deviceDrafts;
  return out;
}

function exportErrorMessage(code) {
  switch (code) {
    case 'unauthorized':
    case 'auth_unavailable':
      return 'We could not verify it is you. Try signing in again, then tap Download your data.';
    case 'anonymous_not_allowed':
    case 'identity_unlinked':
    case 'identity_mismatch':
      return 'To protect your data, we need to confirm the email on file before sending the ZIP.';
    case 'no_email_on_file':
      return 'Add and verify an email in Edit Profile first. We can only send your data to the verified email on file.';
    case 'rate_limited':
      return 'You can request another copy after 24 hours.';
    case 'account_deactivated':
      return 'This account is deactivated, so we cannot email a data export.';
    case 'grant_invalid':
    case 'wrong_code':
      return 'That confirmation code was not valid. Request Download your data again and enter the new code.';
    case 'expired':
      return 'That confirmation code expired. Request Download your data again.';
    case 'send_failed':
      return 'We could not send the email just now. Please try again later.';
    case 'not_signed_in':
      return 'Sign in to download your data.';
    default:
      return 'We could not email your data just now. Please try again later.';
  }
}

export {
  MAX_ZIP_BYTES,
  INLINE_DATA_LIMIT,
  extractBearer,
  decodeJwtPayload,
  verifyFirebaseIdToken,
  resolveExportAccount,
  recipientOnFile,
  fsDecode,
  fsDecodeDoc,
  sanitizeRecord,
  buildExportManifest,
  buildZip,
  readZip,
  zipFileText,
  buildSizedZip,
  exportFilename,
  ignoreClientIdentity,
  exportErrorMessage,
  crc32,
  bytesToBase64,
  textToBytes
};
