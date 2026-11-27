'use strict';

/**
 * Static map: which interactive controls in index.html can reach a network call
 * (Worker fetch, Firestore write, Firebase Auth). Used by interaction-inventory.js
 * to flag interactions that need a failure-path test.
 */

const NET_PRIMS = [
  { re: /\bfetch\s*\(/, kind: 'worker' },
  { re: /\bpostSignupVerify\s*\(/, kind: 'worker' },
  { re: /\bcallWorkerAi\s*\(/, kind: 'worker' },
  { re: /\bsendPixlynoteEmail\s*\(/, kind: 'worker' },
  { re: /\bsyncSubscriptionWithWorker\s*\(/, kind: 'worker' },
  { re: /\b(setDoc|updateDoc|deleteDoc|addDoc|runTransaction)\s*\(|\.commit\s*\(/, kind: 'firestore-write' },
  { re: /\b(createUserWithEmailAndPassword|signInWithEmailAndPassword|updatePassword|reauthenticateWithCredential|signInWithPhoneNumber)\s*\(/, kind: 'auth' }
];

function matchBrace(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  let inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return src.length - 1;
}

function collectFunctions(html) {
  const fns = new Map();
  const re = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(html))) {
    const name = m[1];
    const open = m.index + m[0].length - 1;
    const close = matchBrace(html, open);
    const body = html.slice(open, Math.min(close + 1, open + 40000));
    const line = html.slice(0, m.index).split('\n').length;
    if (!fns.has(name)) fns.set(name, { name, body, line });
  }
  return fns;
}

function directNet(body) {
  const kinds = new Set();
  NET_PRIMS.forEach((p) => { if (p.re.test(body)) kinds.add(p.kind); });
  const paths = new Set();
  const pre = /(?:PIXLYNOTE_API_ENDPOINT|base|signupVerifyApi\(\))\s*\+\s*['"`]([^'"`?]+)/g;
  let m;
  while ((m = pre.exec(body))) paths.add(m[1]);
  const sre = /postSignupVerify\(\s*['"]([^'"]+)['"]/g;
  while ((m = sre.exec(body))) paths.add(m[1]);
  const are = /callWorkerAi\(\s*['"]([^'"]+)['"]/g;
  while ((m = are.exec(body))) paths.add(m[1]);
  if (/sendPixlynoteEmail\(/.test(body)) paths.add('/email');
  if (/syncSubscriptionWithWorker\(/.test(body)) paths.add('/sync-subscription');
  return { kinds, paths };
}

function calledNames(body, fns) {
  const out = new Set();
  const re = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(body))) { if (fns.has(m[1])) out.add(m[1]); }
  return out;
}

function buildNetworkMap(html) {
  const fns = collectFunctions(html);
  const memo = new Map();
  function reach(name, depth, seen) {
    if (memo.has(name) && depth === 0) return memo.get(name);
    const f = fns.get(name);
    const res = { kinds: new Set(), paths: new Set(), via: new Set() };
    if (!f || seen.has(name) || depth > (Number(process.env.NETMAP_DEPTH || 1))) return res;
    seen.add(name);
    const d = directNet(f.body);
    d.kinds.forEach((k) => res.kinds.add(k));
    d.paths.forEach((p) => res.paths.add(p));
    if (d.kinds.size) res.via.add(name);
    calledNames(f.body, fns).forEach((c) => {
      if (c === name) return;
      const r = reach(c, depth + 1, seen);
      r.kinds.forEach((k) => res.kinds.add(k));
      r.paths.forEach((p) => res.paths.add(p));
      r.via.forEach((v) => res.via.add(v));
    });
    if (depth === 0) memo.set(name, res);
    return res;
  }
  // Entry functions for id-bound listeners: names called in the 700 chars after the binding.
  function listenerEntry(id) {
    const out = new Set();
    const esc = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const res = [
      new RegExp("getElementById\\(\\s*['\"]" + esc + "['\"]\\s*\\)[\\s\\S]{0,180}?addEventListener\\(", 'g'),
      new RegExp("bind\\(\\s*['\"]" + esc + "['\"]", 'g'),
      new RegExp("t\\.id\\s*===\\s*['\"]" + esc + "['\"]", 'g')
    ];
    res.forEach((re) => {
      let m;
      while ((m = re.exec(html))) {
        const win = html.slice(m.index, m.index + 700);
        calledNames(win, fns).forEach((n) => out.add(n));
      }
    });
    return out;
  }
  function forItem(item) {
    const entries = new Set();
    if (item.fn) entries.add(item.fn);
    const handlerExpr = item.onclick || item.onsubmit || '';
    calledNames(handlerExpr, fns).forEach((n) => entries.add(n));
    if (item.key.startsWith('handler:')) entries.add(item.key.slice('handler:'.length));
    if (item.id) listenerEntry(item.id).forEach((n) => entries.add(n));
    const kinds = new Set();
    const paths = new Set();
    const via = new Set();
    entries.forEach((e) => {
      const r = reach(e, 0, new Set());
      r.kinds.forEach((k) => kinds.add(k));
      r.paths.forEach((p) => paths.add(p));
      r.via.forEach((v) => via.add(v));
    });
    return { entries: [...entries], kinds: [...kinds].sort(), paths: [...paths].sort(), via: [...via].sort() };
  }
  return { fns, forItem };
}

module.exports = { buildNetworkMap };
