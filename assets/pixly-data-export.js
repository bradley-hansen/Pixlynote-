/* Pixlynote client-side account data export. Loaded by index.html and by unit tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PixlyDataExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  var JSZIP_SRI = 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==';
  var EXPORT_FILENAME = 'pixlynote-data-export.zip';
  var EXPORT_VERSION = 1;
  var MAX_MEDIA_FILES = 250;

  var SECRET_KEY_RE = /^(password|passwd|passphrase|passwordhash|hashedpassword|password_hash|passworddigest|secret|secrets|secretkey|secret_key|apikey|api_key|apisecret|api_secret|token|idtoken|accesstoken|refreshtoken|sessiontoken|authtoken|bearertoken|verificationcode|verification_code|verifycode|verify_code|resetcode|reset_code|signupcode|signup_code|confirmationcode|confirmation_code|confirmcode|emailverificationcode|hashedcode|codehash|otp|totp|mfa|grant|privatekey|private_key|clientsecret|client_secret)$/i;
  var SECRET_KEY_PART_RE = /(password|secret|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|verification[_-]?code|reset[_-]?code|signup[_-]?code|confirm(ation)?[_-]?code)/i;
  var SKIP_MEDIA_KEY_RE = /^(link|website|href|email|phone|bio|caption|text|location|username|author|fullname|name|id|title|description|type|status)$/i;
  var IMAGE_KEY_RE = /(image|avatar|photo|thumb|cover|poster|banner|media|picture|logo|icon|r2)/i;
  var MEDIA_HOST_RE = /r2\.dev|r2\.cloudflarestorage\.com|imagedelivery\.net/i;
  var MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg|mp4|webm|mov|m4v)(\?|#|$)/i;
  var OWN_MEDIA_SECTIONS = ['profile', 'posts', 'notes', 'drafts', 'highlights', 'stories', 'customPosts'];

  function isSecretKey(key) {
    var k = String(key || '');
    if (!k) return false;
    if (SECRET_KEY_RE.test(k)) return true;
    if (SECRET_KEY_PART_RE.test(k)) return true;
    return false;
  }

  function sanitize(value, seen) {
    if (value == null) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'function') return undefined;
    if (typeof value !== 'object') return String(value);
    seen = seen || new WeakSet();
    if (seen.has(value)) return undefined;
    if (typeof Set !== 'undefined' && value instanceof Set) {
      return Array.from(value).map(function (v) { return sanitize(v, seen); });
    }
    if (typeof Map !== 'undefined' && value instanceof Map) {
      var mapped = {};
      value.forEach(function (v, k) {
        if (isSecretKey(k)) return;
        mapped[String(k)] = sanitize(v, seen);
      });
      return mapped;
    }
    if (typeof Date !== 'undefined' && value instanceof Date) return value.toISOString();
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map(function (item) { return sanitize(item, seen); }).filter(function (item) { return item !== undefined; });
    }
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (isSecretKey(key)) return;
      var cleaned = sanitize(value[key], seen);
      if (cleaned !== undefined) out[key] = cleaned;
    });
    return out;
  }

  function looksLikeDataMedia(s) {
    return typeof s === 'string' && /^data:(image|video|audio)\//i.test(s);
  }

  function looksLikeHttpMedia(s, key) {
    if (typeof s !== 'string' || !/^https?:\/\//i.test(s)) return false;
    if (SKIP_MEDIA_KEY_RE.test(String(key || '')) && !IMAGE_KEY_RE.test(String(key || ''))) return false;
    if (MEDIA_EXT_RE.test(s) || MEDIA_HOST_RE.test(s)) return true;
    if (IMAGE_KEY_RE.test(String(key || ''))) return true;
    return false;
  }

  function looksLikeMediaUrl(s, key) {
    return looksLikeDataMedia(s) || looksLikeHttpMedia(s, key);
  }

  function extFromMime(mime) {
    var m = String(mime || '').toLowerCase().split(';')[0].trim();
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    if (m === 'image/png') return 'png';
    if (m === 'image/gif') return 'gif';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/avif') return 'avif';
    if (m === 'image/svg+xml') return 'svg';
    if (m === 'image/heic') return 'heic';
    if (m === 'image/heif') return 'heif';
    if (m === 'image/bmp') return 'bmp';
    if (m === 'video/mp4') return 'mp4';
    if (m === 'video/webm') return 'webm';
    return 'bin';
  }

  function extFromUrl(url) {
    if (looksLikeDataMedia(url)) {
      var mime = String(url).slice(5).split(';')[0];
      return extFromMime(mime);
    }
    var path = String(url || '').split('?')[0].split('#')[0];
    var m = path.match(/\.([a-z0-9]{2,5})$/i);
    if (m && /^(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg|mp4|webm|mov|m4v|bin)$/i.test(m[1])) {
      return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    }
    return 'bin';
  }

  function safeNamePart(s, fallback) {
    var part = String(s || fallback || 'file').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return (part || fallback || 'file').slice(0, 80);
  }

  function walkMedia(value, path, acc, seen) {
    if (value == null) return;
    if (typeof value === 'string') {
      var key = path.split('.').pop();
      if (looksLikeMediaUrl(value, key)) {
        acc.push({
          source: path || 'field',
          url: value,
          kind: looksLikeDataMedia(value) ? 'data' : 'http'
        });
      }
      return;
    }
    if (typeof value !== 'object') return;
    seen = seen || new WeakSet();
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(function (item, i) {
        walkMedia(item, path ? path + '[' + i + ']' : '[' + i + ']', acc, seen);
      });
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (isSecretKey(key)) return;
      walkMedia(value[key], path ? path + '.' + key : key, acc, seen);
    });
  }

  function collectMediaRefs(records, opts) {
    var acc = [];
    var sections = (opts && opts.sections) || OWN_MEDIA_SECTIONS;
    var src = records || {};
    sections.forEach(function (section) {
      if (src[section] != null) walkMedia(src[section], section, acc, new WeakSet());
    });
    var seen = Object.create(null);
    var unique = [];
    acc.forEach(function (ref) {
      var key = ref.kind + '\0' + ref.url;
      if (seen[key]) return;
      seen[key] = true;
      unique.push(ref);
    });
    return unique.slice(0, MAX_MEDIA_FILES);
  }

  function decodeDataUrl(url) {
    var raw = String(url || '');
    var comma = raw.indexOf(',');
    if (comma < 0) throw new Error('invalid_data_url');
    var meta = raw.slice(5, comma);
    var payload = raw.slice(comma + 1);
    var mime = meta.split(';')[0] || 'application/octet-stream';
    var isBase64 = /;base64/i.test(meta);
    var bytes;
    if (isBase64) {
      var bin = (typeof atob === 'function') ? atob(payload) : Buffer.from(payload, 'base64').toString('binary');
      bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      var decoded = decodeURIComponent(payload);
      bytes = new Uint8Array(decoded.length);
      for (var j = 0; j < decoded.length; j++) bytes[j] = decoded.charCodeAt(j);
    }
    return { data: bytes, mime: mime };
  }

  function assignMediaNames(refs) {
    var used = Object.create(null);
    return (refs || []).map(function (ref, index) {
      var base = safeNamePart(ref.source, 'file') + '-' + String(index + 1).padStart(3, '0');
      var ext = extFromUrl(ref.url);
      var name = base + '.' + ext;
      var n = 2;
      while (used[name]) {
        name = base + '-' + n + '.' + ext;
        n += 1;
      }
      used[name] = true;
      return Object.assign({}, ref, { name: name, zipPath: 'media/' + name });
    });
  }

  async function fetchMediaAllSettled(refs, fetchImpl) {
    var named = assignMediaNames(refs || []);
    var files = [];
    var errors = [];
    var results = await Promise.allSettled(named.map(async function (ref) {
      if (ref.kind === 'data') {
        try {
          var decoded = decodeDataUrl(ref.url);
          files.push({
            name: ref.name,
            zipPath: ref.zipPath,
            source: ref.source,
            data: decoded.data,
            mime: decoded.mime,
            original: 'data-url'
          });
        } catch (err) {
          errors.push({
            source: ref.source,
            url: 'data-url',
            path: ref.zipPath,
            reason: (err && err.message) || 'invalid_data_url'
          });
        }
        return;
      }
      if (typeof fetchImpl !== 'function') {
        errors.push({ source: ref.source, url: ref.url, path: ref.zipPath, reason: 'fetch_unavailable' });
        return;
      }
      try {
        var res = await fetchImpl(ref.url, { mode: 'cors', credentials: 'omit' });
        if (!res || !res.ok) {
          var status = res && typeof res.status === 'number' ? res.status : 0;
          throw new Error(status ? ('HTTP ' + status) : 'fetch_failed');
        }
        var mime = 'application/octet-stream';
        try {
          mime = (res.headers && res.headers.get && res.headers.get('content-type')) || mime;
        } catch (e) {}
        var buf;
        if (typeof res.arrayBuffer === 'function') buf = new Uint8Array(await res.arrayBuffer());
        else if (typeof res.blob === 'function') {
          var blob = await res.blob();
          buf = blob;
          if (blob && blob.type) mime = blob.type;
        } else {
          throw new Error('unreadable_response');
        }
        files.push({
          name: ref.name,
          zipPath: ref.zipPath,
          source: ref.source,
          data: buf,
          mime: mime,
          original: ref.url
        });
      } catch (err) {
        errors.push({
          source: ref.source,
          url: ref.url,
          path: ref.zipPath,
          reason: (err && err.message) || 'fetch_failed'
        });
      }
    }));
    return { files: files, errors: errors, settled: results, refs: named };
  }

  function mediaErrorsText(errors) {
    if (!errors || !errors.length) return '';
    return errors.map(function (err) {
      return [err.source || '', err.url || '', err.reason || 'failed'].join('\t');
    }).join('\n') + '\n';
  }

  function applyMediaPaths(records, files, errors) {
    var cloned = sanitize(records) || {};
    cloned.media = (files || []).map(function (f) {
      return { path: f.zipPath, source: f.source, ok: true, original: f.original === 'data-url' ? 'data-url' : (f.original || '') };
    }).concat((errors || []).map(function (e) {
      return { path: e.path || null, source: e.source, ok: false, original: e.url || '', error: e.reason };
    }));
    cloned.mediaErrors = (errors || []).map(function (e) {
      return { source: e.source, url: e.url || '', reason: e.reason };
    });
    return cloned;
  }

  function buildUserDataPayload(opts) {
    var username = (opts && opts.username) || '';
    var exportedAt = (opts && opts.exportedAt) || new Date().toISOString();
    var records = sanitize((opts && opts.records) || {});
    var payload = applyMediaPaths(records, (opts && opts.files) || [], (opts && opts.mediaErrors) || []);
    payload.exportVersion = EXPORT_VERSION;
    payload.exportedAt = exportedAt;
    payload.username = username;
    payload.metadata = Object.assign({
      exportVersion: EXPORT_VERSION,
      exportedAt: exportedAt,
      username: username,
      source: 'pixlynote-client'
    }, sanitize((opts && opts.metadata) || {}) || {});
    return payload;
  }

  async function buildZipBlob(JSZipCtor, parts) {
    if (!JSZipCtor) throw new Error('jszip_unavailable');
    var zip = new JSZipCtor();
    var userData = (parts && parts.userData) || {};
    zip.file('user-data.json', JSON.stringify(userData, null, 2));
    var errors = (parts && parts.mediaErrors) || userData.mediaErrors || [];
    if (errors && errors.length) zip.file('media-errors.txt', mediaErrorsText(errors));
    var files = (parts && parts.files) || [];
    files.forEach(function (f) {
      if (!f || !f.zipPath) return;
      zip.file(f.zipPath, f.data);
    });
    var canBlob = typeof Blob !== 'undefined';
    return zip.generateAsync({ type: canBlob ? 'blob' : 'nodebuffer', compression: 'DEFLATE' });
  }

  function injectJSZipScript(doc, g, useSri) {
    return new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = JSZIP_CDN;
      s.async = true;
      s.dataset = s.dataset || {};
      try { s.dataset.pixlyJszip = '1'; } catch (e) { s.setAttribute('data-pixly-jszip', '1'); }
      if (useSri) {
        s.crossOrigin = 'anonymous';
        s.integrity = JSZIP_SRI;
      }
      s.onload = function () {
        if (g.JSZip) resolve(g.JSZip);
        else reject(new Error('jszip_unavailable'));
      };
      s.onerror = function () {
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('jszip_unavailable'));
      };
      (doc.head || doc.documentElement || doc.body).appendChild(s);
    });
  }

  function loadJSZip(root) {
    var g = root || (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g.JSZip) return Promise.resolve(g.JSZip);
    if (g.__pixlyJSZipLoading) return g.__pixlyJSZipLoading;
    var doc = g.document;
    if (!doc || typeof doc.createElement !== 'function') {
      return Promise.reject(new Error('jszip_unavailable'));
    }
    var existing = typeof doc.querySelector === 'function' ? doc.querySelector('script[data-pixly-jszip="1"]') : null;
    if (existing && g.JSZip) return Promise.resolve(g.JSZip);
    g.__pixlyJSZipLoading = injectJSZipScript(doc, g, true).catch(function () {
      return injectJSZipScript(doc, g, false);
    }).then(function (ctor) {
      try { delete g.__pixlyJSZipLoading; } catch (e) { g.__pixlyJSZipLoading = null; }
      return ctor;
    }, function (err) {
      try { delete g.__pixlyJSZipLoading; } catch (e) { g.__pixlyJSZipLoading = null; }
      throw err;
    });
    return g.__pixlyJSZipLoading;
  }

  function triggerDownload(blob, filename, win) {
    var name = filename || EXPORT_FILENAME;
    var w = win || (typeof window !== 'undefined' ? window : null);
    if (w && typeof w.__pixlyOnDataExportDownload === 'function') {
      try { w.__pixlyOnDataExportDownload(blob, name); } catch (e) {}
    }
    if (!w || !w.document) return name;
    var URLRef = w.URL || w.webkitURL;
    if (!URLRef || typeof URLRef.createObjectURL !== 'function') return name;
    var url = URLRef.createObjectURL(blob);
    var a = w.document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    (w.document.body || w.document.documentElement).appendChild(a);
    a.click();
    if (a.parentNode) a.parentNode.removeChild(a);
    setTimeout(function () {
      try { URLRef.revokeObjectURL(url); } catch (e) {}
    }, 1500);
    return name;
  }

  function exportFailureMessage(err) {
    var raw = err && err.message ? String(err.message) : String(err || '');
    if (/not_signed_in|not signed/i.test(raw)) return 'Sign in to download your data.';
    if (/jszip/i.test(raw)) return 'Could not load the ZIP library. Check your connection and try again.';
    return 'Could not download your data. Please try again.';
  }

  function signedOutMessage() {
    return 'Sign in to download your data.';
  }

  return {
    JSZIP_CDN: JSZIP_CDN,
    JSZIP_SRI: JSZIP_SRI,
    EXPORT_FILENAME: EXPORT_FILENAME,
    EXPORT_VERSION: EXPORT_VERSION,
    isSecretKey: isSecretKey,
    sanitize: sanitize,
    looksLikeMediaUrl: looksLikeMediaUrl,
    collectMediaRefs: collectMediaRefs,
    decodeDataUrl: decodeDataUrl,
    assignMediaNames: assignMediaNames,
    fetchMediaAllSettled: fetchMediaAllSettled,
    mediaErrorsText: mediaErrorsText,
    buildUserDataPayload: buildUserDataPayload,
    buildZipBlob: buildZipBlob,
    loadJSZip: loadJSZip,
    triggerDownload: triggerDownload,
    exportFailureMessage: exportFailureMessage,
    signedOutMessage: signedOutMessage
  };
});
