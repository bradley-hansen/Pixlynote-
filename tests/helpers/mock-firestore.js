'use strict';

/**
 * Generic in-page Firestore mock for permission/flow tests. Path-based docs, merge writes,
 * collection queries with where(), onSnapshot, runTransaction. Never touches production.
 * Install with page.evaluate(installPixlyMockFirestore, seed).
 */
function installPixlyMockFirestore(seed) {
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const prev = window.__pfsPrev || { firebase: window.firebase, firebaseReady: window.firebaseReady };
  window.__pfsPrev = prev;
  const store = { docs: {}, writes: [], failWrites: false };
  Object.keys(seed || {}).forEach((p) => { store.docs[p] = clone(seed[p]); });
  window.__pfs = store;
  const listeners = [];
  const ref = (segs) => ({ path: segs.join('/'), id: segs[segs.length - 1], segs });
  const doc = (dbArg, ...segs) => ref(segs.join('/').split('/'));
  const collection = (dbArg, ...segs) => Object.assign(ref(segs.join('/').split('/')), { isCol: true });
  const where = (f, op, v) => ({ kind: 'where', f, op, v });
  const noop = () => ({ kind: 'noop' });
  const query = (col, ...parts) => ({ col, parts: parts.filter((p) => p && p.kind === 'where'), isQuery: true });
  const snapOf = (path) => {
    const d = store.docs[path];
    const segs = path.split('/');
    return {
      id: segs[segs.length - 1],
      ref: ref(segs),
      exists: () => d !== undefined,
      data: () => clone(d),
      metadata: { hasPendingWrites: false, fromCache: false }
    };
  };
  const childrenOf = (colPath) => Object.keys(store.docs).filter((p) => {
    const parent = p.split('/').slice(0, -1).join('/');
    return parent === colPath;
  });
  const runQuery = (q) => {
    const col = q.isQuery ? q.col : q;
    let paths = childrenOf(col.path);
    (q.parts || []).forEach((w) => {
      paths = paths.filter((p) => {
        const v = (store.docs[p] || {})[w.f];
        if (w.op === '==') return v === w.v;
        if (w.op === 'in') return Array.isArray(w.v) && w.v.includes(v);
        return true;
      });
    });
    const docs = paths.map(snapOf);
    return { size: docs.length, docs, empty: docs.length === 0, metadata: { fromCache: false, hasPendingWrites: false }, forEach: (cb) => docs.forEach(cb) };
  };
  const emit = () => {
    listeners.slice().forEach((l) => {
      if (l.dead) return;
      try { l.cb(l.target.isCol || l.target.isQuery ? runQuery(l.target) : snapOf(l.target.path)); } catch (e) {}
    });
  };
  // arrayUnion / arrayRemove are real sentinels: they resolve against the stored array (any nesting depth).
  const isOp = (v) => v && typeof v === 'object' && (v.__op === 'union' || v.__op === 'remove') && Array.isArray(v.vals);
  const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const resolveOps = (incoming, existing) => {
    if (isOp(incoming)) {
      const base = Array.isArray(existing) ? existing.slice() : [];
      if (incoming.__op === 'union') {
        incoming.vals.forEach((v) => { if (!base.some((x) => sameVal(x, v))) base.push(v); });
        return base;
      }
      return base.filter((x) => !incoming.vals.some((v) => sameVal(x, v)));
    }
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
      const out = {};
      const ex = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
      Object.keys(incoming).forEach((k) => { out[k] = resolveOps(incoming[k], ex[k]); });
      return out;
    }
    return incoming;
  };
  // For the write log only: the old mock logged arrayUnion as its plain values and arrayRemove as [].
  const plainForLog = (v) => {
    if (isOp(v)) return v.__op === 'union' ? v.vals.slice() : [];
    if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; Object.keys(v).forEach((k) => { o[k] = plainForLog(v[k]); }); return o; }
    return v;
  };
  const mergeDeep = (cur, add) => {
    const out = Object.assign({}, cur);
    Object.keys(add).forEach((k) => {
      const a = add[k];
      if (a && typeof a === 'object' && !Array.isArray(a) && cur[k] && typeof cur[k] === 'object' && !Array.isArray(cur[k])) out[k] = mergeDeep(cur[k], a);
      else out[k] = a;
    });
    return out;
  };
  const write = (r, data, opts, kind) => {
    if (store.failWrites) throw new Error('mock write failure');
    const cur = store.docs[r.path];
    const resolved = data === null || data === undefined ? data : resolveOps(clone(data), cur || {});
    if (kind === 'delete') delete store.docs[r.path];
    else if (opts && opts.merge && cur) store.docs[r.path] = mergeDeep(cur, resolved);
    else store.docs[r.path] = resolved;
    store.writes.push({ kind, path: r.path, data: plainForLog(clone(data)) });
  };
  const api = {
    db: { __mock: true },
    doc, collection, where, query,
    orderBy: noop, limit: noop, startAfter: noop,
    serverTimestamp: () => Date.now(),
    increment: (n) => n,
    arrayUnion: (...a) => ({ __op: 'union', vals: a }),
    arrayRemove: (...a) => ({ __op: 'remove', vals: a }),
    getDoc: async (r) => snapOf(r.path),
    getDocFromServer: async (r) => snapOf(r.path),
    getDocs: async (q) => runQuery(q),
    setDoc: async (r, data, opts) => { write(r, data, opts, 'set'); setTimeout(emit, 0); },
    updateDoc: async (r, data) => { write(r, data, { merge: true }, 'update'); setTimeout(emit, 0); },
    deleteDoc: async (r) => { write(r, null, null, 'delete'); setTimeout(emit, 0); },
    addDoc: async (col, data) => { const r = ref((col.path + '/auto' + Date.now() + Math.floor(Math.random() * 1e6)).split('/')); write(r, data, null, 'set'); setTimeout(emit, 0); return r; },
    writeBatch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => write(r, d, o, 'set')), update: (r, d) => ops.push(() => write(r, d, { merge: true }, 'update')), delete: (r) => ops.push(() => write(r, null, null, 'delete')), commit: async () => { ops.forEach((f) => f()); setTimeout(emit, 0); } }; },
    runTransaction: async (dbArg, fn) => {
      const out = await fn({
        get: async (r) => snapOf(r.path),
        set: (r, d, o) => write(r, d, o, 'set'),
        update: (r, d) => write(r, d, { merge: true }, 'update'),
        delete: (r) => write(r, null, null, 'delete')
      });
      setTimeout(emit, 0);
      return out;
    },
    onSnapshot: (target, cb) => {
      const l = { target, cb, dead: false };
      listeners.push(l);
      setTimeout(() => { if (!l.dead) { try { cb(target.isCol || target.isQuery ? runQuery(target) : snapOf(target.path)); } catch (e) {} } }, 0);
      return () => { l.dead = true; };
    }
  };
  window.__pfsListeners = listeners;
  window.firebase = Object.assign({}, prev.firebase || {}, api);
  window.firebaseReady = true;
  return true;
}

function uninstallPixlyMockFirestore() {
  try { (window.__pfsListeners || []).forEach((l) => { l.dead = true; }); } catch (e) {}
  try { if (window._connReqUnsub) window._connReqUnsub(); } catch (e) {}
  window._connReqUnsub = null;
  window._connReqUnsubUser = null;
  try { if (typeof detachViewedConnections === 'function') detachViewedConnections(); } catch (e) {}
  const prev = window.__pfsPrev;
  if (prev) {
    window.firebase = prev.firebase;
    window.firebaseReady = false;
  }
  window.__pfsPrev = null;
  return true;
}

module.exports = { installPixlyMockFirestore, uninstallPixlyMockFirestore };
