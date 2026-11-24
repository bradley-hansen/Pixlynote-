'use strict';

/**
 * Download your data: client-side JSZip export — unit coverage plus
 * Account Center e2e for loading state, JSON contents, media allSettled,
 * download filename, error toast, button reset, and signed-out refusal.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');
const lib = require('../../assets/pixly-data-export.js');
const JSZip = require('../vendor/jszip-3.10.1.min.js');

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_PNG = 'data:image/png;base64,' + TINY_PNG_B64;

async function openYourAccount(page, h) {
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
    if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    else if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
  });
  await page.waitForTimeout(200);
  await page.click('#btn-ac-open-your-account');
  await page.waitForTimeout(80);
}

async function cleanupExportExtras(page) {
  await page.evaluate(() => {
    if (state && Array.isArray(state.posts)) {
      state.posts = state.posts.filter((p) => String(p.id) !== 'export-fail-media');
    }
    try { delete window.__pixlyExportBeforeZip; } catch (e) { window.__pixlyExportBeforeZip = undefined; }
    window.__exportHold = null;
    try { delete window.__pixlyExportFetch; } catch (e) { window.__pixlyExportFetch = undefined; }
  });
}

async function armExportCapture(page) {
  await page.evaluate(() => {
    window.__pixlyExportCaptured = null;
    window.__pixlyExportCapturedBlob = null;
    window.__pixlyOnDataExportDownload = (blob, name) => {
      window.__pixlyExportCaptured = { name: name, size: blob && (blob.size || 0) };
      window.__pixlyExportCapturedBlob = blob;
    };
  });
  const status = await page.evaluate(async () => {
    if (window.JSZip) return 'present';
    try {
      if (window.PixlyDataExport && typeof window.PixlyDataExport.loadJSZip === 'function') {
        await window.PixlyDataExport.loadJSZip(window);
      }
      return window.JSZip ? 'loaded' : 'missing';
    } catch (e) {
      return 'error:' + ((e && e.message) || 'failed');
    }
  });
  if (status === 'missing' || String(status).indexOf('error:') === 0) {
    await page.addScriptTag({ url: '/tests/vendor/jszip-3.10.1.min.js' });
  }
}

async function startDownloadClick(page) {
  const btn = page.locator('#btn-ac-download-data');
  await btn.scrollIntoViewIfNeeded();
  const clickP = btn.click({ force: true }).catch(() => page.evaluate(() => requestAccountDataExport()));
  return clickP;
}

async function waitForExportCapture(page, timeoutMs) {
  await page.waitForFunction(() => !!(window.__pixlyExportCaptured && window.__pixlyExportCaptured.name), null, { timeout: timeoutMs || 15000 });
  return page.evaluate(() => window.__pixlyExportCaptured || null);
}

async function zipFromDownloadOrCapture(page, downloadPromise) {
  let buf = null;
  let filename = '';
  try {
    const download = await downloadPromise;
    filename = download.suggestedFilename();
    const dest = path.join(os.tmpdir(), 'pixly-data-export-test-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.zip');
    await download.saveAs(dest);
    buf = fs.readFileSync(dest);
    try { fs.unlinkSync(dest); } catch (e) {}
  } catch (e) {
    filename = '';
  }
  if (!buf) {
    const packed = await page.evaluate(async () => {
      const blob = window.__pixlyExportCapturedBlob;
      const name = window.__pixlyExportCaptured && window.__pixlyExportCaptured.name;
      if (!blob || typeof blob.arrayBuffer !== 'function') return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return { name: name, b64: btoa(binary) };
    });
    if (!packed || !packed.b64) throw new Error('export zip was not captured');
    buf = Buffer.from(packed.b64, 'base64');
    filename = filename || packed.name;
  }
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const userDataRaw = zip.file('user-data.json') ? await zip.file('user-data.json').async('string') : '';
  const userData = userDataRaw ? JSON.parse(userDataRaw) : null;
  const mediaErrors = zip.file('media-errors.txt') ? await zip.file('media-errors.txt').async('string') : '';
  return { filename, zip, names, userData, userDataRaw, mediaErrors, buf };
}

async function seedExportExtras(page, opts) {
  const options = opts || {};
  await page.evaluate(({ tinyPng, extras }) => {
    const u = state.currentUser && state.currentUser.username;
    state.currentUser.passwordHash = 'SHOULD-NOT-APPEAR';
    state.currentUser.password = 'super-secret-pass';
    state.currentUser.verificationCode = '654321';
    state.currentUser.resetCode = '111111';
    try {
      const key = 'pixly_account_' + String(u).toLowerCase();
      const rec = JSON.parse(localStorage.getItem(key) || '{}');
      rec.password = 'local-secret-pass';
      rec.passwordHash = 'LOCAL-HASH-SHOULD-NOT-APPEAR';
      rec.verificationCode = '000111';
      localStorage.setItem(key, JSON.stringify(rec));
    } catch (e) {}
    if (!Array.isArray(state.posts)) state.posts = [];
    if (!Array.isArray(state.notes)) state.notes = [];
    const ownPost = {
      id: 'export-own-post',
      author: u,
      authorName: state.currentUser.fullName,
      caption: 'My own photo',
      image: extras.okUrl || tinyPng,
      likes: 0,
      comments: [],
      isLiked: false,
      timestamp: '1 MIN AGO'
    };
    state.posts = state.posts.filter((p) => String(p.id) !== 'export-own-post');
    state.posts.push(ownPost);
    const legacy = state.posts.find((p) => String(p.author) === String(u) && String(p.id) === '3001');
    if (legacy) {
      legacy.caption = 'My own photo';
      if (extras.okUrl) legacy.image = extras.okUrl;
    }
    if (extras.failUrl) {
      state.posts = state.posts.filter((p) => String(p.id) !== 'export-fail-media');
      state.posts.push({
        id: 'export-fail-media',
        author: u,
        authorName: state.currentUser.fullName,
        caption: 'missing export photo',
        image: extras.failUrl,
        likes: 0,
        comments: [],
        isLiked: false,
        timestamp: '1 MIN AGO'
      });
    }
    state.notes = state.notes.filter((n) => String(n.id) !== 'export-own-note');
    state.notes.push({
      id: 'export-own-note',
      author: u,
      authorName: state.currentUser.fullName,
      text: 'My own note',
      time: '1m ago',
      likes: 0,
      isLiked: false,
      comments: []
    });
    const draft = {
      id: 'd-export-1',
      type: 'post',
      caption: 'export-draft-caption',
      author: u,
      image: tinyPng,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    try { localStorage.setItem('pixly_drafts_' + u, JSON.stringify([draft])); } catch (e) {}
    state.highlights = [{ id: 'hl-1', title: 'Trail days', cover: tinyPng }];
    window._profileHistory = { user: u, fields: { name: [{ from: 'Old Name', to: state.currentUser.fullName, at: 1 }] } };
    if (state.likedPostIds && typeof state.likedPostIds.add === 'function') state.likedPostIds.add('2123');
    if (state.savedPostIds && typeof state.savedPostIds.add === 'function') state.savedPostIds.add('2144');

    const okBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    window.__pixlyExportFetch = async (url) => {
      if (String(url).indexOf('missing') !== -1) {
        throw new Error('Failed to fetch (CORS)');
      }
      if (String(url).indexOf('ok.png') !== -1) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => okBytes.buffer
        };
      }
      throw new Error('unexpected media url');
    };
  }, { tinyPng: TINY_PNG, extras: options });
}

module.exports = {
  name: 'Download your data',
  tests: [
    {
      name: 'Unit: sanitize strips secrets and leaves public profile fields',
      accounts: ['personal'],
      covers: [],
      async run({ a }) {
        const cleaned = lib.sanitize({
          username: 'reg_personal',
          bio: 'hello',
          password: 'secret',
          passwordHash: 'SHOULD-NOT-APPEAR',
          verificationCode: '123456',
          resetCode: '999999',
          signup_code: '000000',
          apiKey: 'abc',
          token: 'tok',
          nested: { secret: 'nope', caption: 'keep me' }
        });
        a.equal(cleaned.username, 'reg_personal', 'username kept');
        a.equal(cleaned.bio, 'hello', 'bio kept');
        a.equal(cleaned.nested.caption, 'keep me', 'nested public field kept');
        a.ok(cleaned.password === undefined, 'password stripped');
        a.ok(cleaned.passwordHash === undefined, 'passwordHash stripped');
        a.ok(cleaned.verificationCode === undefined, 'verificationCode stripped');
        a.ok(cleaned.resetCode === undefined, 'resetCode stripped');
        a.ok(cleaned.signup_code === undefined, 'signup_code stripped');
        a.ok(cleaned.apiKey === undefined, 'apiKey stripped');
        a.ok(cleaned.token === undefined, 'token stripped');
        a.ok(cleaned.nested.secret === undefined, 'nested secret stripped');
        a.ok(lib.isSecretKey('passwordHash'), 'passwordHash is a secret key');
        a.ok(!lib.isSecretKey('username'), 'username is not a secret key');
      }
    },
    {
      name: 'Unit: JSON payload, media allSettled, and zip filename',
      accounts: ['personal'],
      covers: [],
      async run({ a }) {
        const records = {
          profile: { username: 'reg_personal', bio: 'hello', passwordHash: 'SHOULD-NOT-APPEAR', avatar: TINY_PNG, link: 'https://example.test/reg_personal' },
          posts: [
            { id: 'p1', author: 'reg_personal', caption: 'Trail shot', image: 'https://export-media.test/ok.png' },
            { id: 'p2', author: 'reg_personal', caption: 'Missing shot', image: 'https://export-media.test/missing.png' }
          ],
          notes: [{ id: 'n1', text: 'a note', author: 'reg_personal' }],
          likes: { likedPostIds: ['p1'] },
          saves: { savedPostIds: ['p2'] },
          connections: { following: [{ username: 'nordic_trails', avatar: 'https://export-media.test/someone-else.png' }], followers: [] },
          drafts: [{ id: 'd1', type: 'post', caption: 'draft caption' }],
          highlights: [{ id: 'h1', title: 'Hikes' }],
          profileHistory: { name: [{ at: 1, value: 'Reg' }] }
        };
        const refs = lib.collectMediaRefs(records);
        a.ok(refs.some((r) => r.kind === 'data' && /profile\.avatar/.test(r.source)), 'collects profile data URL');
        a.ok(refs.some((r) => r.url === 'https://export-media.test/ok.png'), 'collects successful http media');
        a.ok(refs.some((r) => r.url === 'https://export-media.test/missing.png'), 'collects failing http media');
        a.ok(!refs.some((r) => /someone-else/.test(r.url)), 'does not collect another user avatar from connections');
        a.ok(!refs.some((r) => r.url === 'https://example.test/reg_personal'), 'does not treat profile.link as media');

        const okBytes = Buffer.from(TINY_PNG_B64, 'base64');
        const media = await lib.fetchMediaAllSettled(refs, async (url) => {
          if (String(url).includes('missing') || String(url).includes('someone-else')) {
            throw new Error('Failed to fetch (CORS)');
          }
          if (String(url).includes('ok.png')) {
            return {
              ok: true,
              status: 200,
              headers: { get: () => 'image/png' },
              arrayBuffer: async () => okBytes
            };
          }
          throw new Error('unexpected');
        });
        a.ok(media.settled && media.settled.length === refs.length, 'Promise.allSettled used for every media ref');
        a.ok(media.files.some((f) => f.original === 'data-url'), 'data URL inlined into media/');
        a.ok(media.files.some((f) => /ok\.png/.test(f.original)), 'successful http file added');
        a.ok(media.errors.some((e) => /missing\.png/.test(e.url) && /CORS|Failed/.test(e.reason)), 'CORS/missing file listed in errors');
        a.ok(!media.files.some((f) => /missing/.test(String(f.original || ''))), 'failed media is skipped, not added');

        const userData = lib.buildUserDataPayload({
          username: 'reg_personal',
          records: records,
          files: media.files,
          mediaErrors: media.errors,
          metadata: { accountType: 'personal' },
          exportedAt: '2026-11-24T14:39:00.000Z'
        });
        a.equal(userData.username, 'reg_personal', 'payload username');
        a.ok(userData.posts.some((p) => p.caption === 'Trail shot'), 'posts included');
        a.ok(userData.notes.some((n) => n.text === 'a note'), 'notes included');
        a.ok(userData.likes.likedPostIds.includes('p1'), 'likes included');
        a.ok(userData.saves.savedPostIds.includes('p2'), 'saves included');
        a.ok(userData.drafts.some((d) => d.caption === 'draft caption'), 'drafts included');
        a.ok(userData.profileHistory && userData.profileHistory.name, 'profile history included');
        a.ok(userData.metadata && userData.metadata.accountType === 'personal', 'metadata included');
        const asText = JSON.stringify(userData);
        a.ok(!/SHOULD-NOT-APPEAR/.test(asText), 'passwordHash stripped from user-data.json');
        a.ok(userData.mediaErrors && userData.mediaErrors.length >= 1, 'media errors listed in user-data.json');

        const blobOrBuf = await lib.buildZipBlob(JSZip, { userData, files: media.files, mediaErrors: media.errors });
        const buf = Buffer.isBuffer(blobOrBuf) ? blobOrBuf : Buffer.from(await blobOrBuf.arrayBuffer());
        const zip = await JSZip.loadAsync(buf);
        a.ok(!!zip.file('user-data.json'), 'zip contains user-data.json');
        a.ok(!!zip.file('media-errors.txt'), 'zip contains media-errors.txt');
        const mediaNames = Object.keys(zip.files).filter((n) => n.startsWith('media/') && !n.endsWith('/'));
        a.ok(mediaNames.length >= 2, 'media/ folder has successful files: ' + mediaNames.join(','));
        a.equal(lib.EXPORT_FILENAME, 'pixlynote-data-export.zip', 'download filename is pixlynote-data-export.zip');
        a.equal(lib.triggerDownload(buf, lib.EXPORT_FILENAME, { document: null }), 'pixlynote-data-export.zip', 'triggerDownload uses the expected filename');
      }
    },
    {
      name: 'Unit: loadJSZip is lazy and skips the CDN when already loaded',
      accounts: ['personal'],
      covers: [],
      async run({ a }) {
        const created = [];
        const fake = {
          JSZip: function FakeZip() {},
          document: {
            createElement: (tag) => {
              created.push(tag);
              return { dataset: {}, setAttribute: () => {}, addEventListener: () => {} };
            },
            querySelector: () => null,
            head: { appendChild: (el) => created.push('append') }
          }
        };
        const ctor = await lib.loadJSZip(fake);
        a.equal(ctor, fake.JSZip, 'returns existing JSZip');
        a.equal(created.length, 0, 'does not inject a script when JSZip is already present');

        const injected = [];
        const loading = {
          document: {
            querySelector: () => null,
            createElement: (tag) => {
              const el = {
                dataset: {},
                setAttribute: function (k, v) { this[k] = v; },
                onload: null,
                onerror: null
              };
              injected.push(el);
              return el;
            },
            head: {
              appendChild: (el) => {
                injected.push('appended');
                loading.JSZip = function LoadedZip() {};
                setTimeout(() => el.onload && el.onload(), 0);
              }
            }
          }
        };
        const loaded = await lib.loadJSZip(loading);
        a.ok(typeof loaded === 'function', 'loads JSZip from the CDN script');
        a.ok(injected[0] && injected[0].src === lib.JSZIP_CDN, 'uses the pinned CDN URL');
        a.ok(injected[0] && injected[0].integrity === lib.JSZIP_SRI, 'sets the SRI hash');
        a.ok(injected[0] && injected[0].crossOrigin === 'anonymous', 'uses CORS anonymous for SRI');
        a.equal(lib.exportFailureMessage(new Error('jszip_unavailable')), 'Could not load the ZIP library. Check your connection and try again.', 'clean JSZip error');
        a.equal(lib.signedOutMessage(), 'Sign in to download your data.', 'signed-out message');
      }
    },
    {
      name: 'Download your data button is visible for every account type',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-ac-download-data'],
      async run({ page, h, a, account }) {
        await openYourAccount(page, h);
        a.ok(await h.isVisible(page, '#btn-ac-download-data'), 'Download your data button visible for @' + account.username);
        const label = await page.evaluate(() => (document.getElementById('ac-data-export-label') || {}).textContent || '');
        a.ok(/Download your data/i.test(label), 'button keeps the Download your data label: ' + label);
        const placeholder = await page.evaluate(() => (document.body.innerText || '').includes('this method is not yet available'));
        a.ok(!placeholder, 'no "not yet available" placeholder');
        const sub = await page.evaluate(() => {
          const btn = document.getElementById('btn-ac-download-data');
          return btn ? btn.innerText : '';
        });
        a.ok(!/email a zip/i.test(sub), 'subtitle no longer says the export is emailed');
      }
    },
    {
      name: 'Clicking Download your data shows a disabled Preparing export... state then resets',
      accounts: ['personal'],
      covers: ['el:#btn-ac-download-data'],
      async run({ page, h, a }) {
        await openYourAccount(page, h);
        await armExportCapture(page);
        await seedExportExtras(page, { okUrl: 'https://export-media.test/ok.png', failUrl: 'https://export-media.test/missing.png' });
        await page.evaluate(() => {
          window.__exportHold = null;
          window.__pixlyExportBeforeZip = () => new Promise((resolve) => { window.__exportHold = resolve; });
        });
        const clickP = startDownloadClick(page);
        await page.waitForFunction(() => {
          const btn = document.getElementById('btn-ac-download-data');
          const label = document.getElementById('ac-data-export-label');
          return !!(btn && btn.disabled && label && label.textContent === 'Preparing export...');
        }, null, { timeout: 10000 });
        const mid = await page.evaluate(() => {
          const btn = document.getElementById('btn-ac-download-data');
          const status = document.getElementById('ac-data-export-status');
          return {
            disabled: !!btn.disabled,
            busy: btn.getAttribute('aria-busy'),
            label: (document.getElementById('ac-data-export-label') || {}).textContent,
            status: (status && status.textContent) || ''
          };
        });
        a.ok(mid.disabled, 'button is disabled while preparing');
        a.equal(mid.label, 'Preparing export...', 'button label is Preparing export...');
        a.ok(/Preparing export/i.test(mid.status), 'status shows preparing');
        await page.evaluate(() => { if (typeof window.__exportHold === 'function') window.__exportHold(); });
        await clickP;
        await waitForExportCapture(page);
        await page.waitForFunction(() => {
          const btn = document.getElementById('btn-ac-download-data');
          const label = document.getElementById('ac-data-export-label');
          return !!(btn && !btn.disabled && label && label.textContent === 'Download your data');
        }, null, { timeout: 10000 });
        const after = await page.evaluate(() => ({
          disabled: !!(document.getElementById('btn-ac-download-data') || {}).disabled,
          label: (document.getElementById('ac-data-export-label') || {}).textContent,
          busy: document.getElementById('btn-ac-download-data').getAttribute('aria-busy')
        }));
        a.ok(!after.disabled, 'button is re-enabled after the download starts');
        a.equal(after.label, 'Download your data', 'label resets after the download starts');
        a.ok(after.busy !== 'true', 'aria-busy cleared');
        await cleanupExportExtras(page);
      }
    },
    {
      name: 'Export zip is named pixlynote-data-export.zip, secrets are stripped, and media allSettled skips failures',
      accounts: ['personal'],
      covers: ['el:#btn-ac-download-data', 'el:#ac-data-export-status'],
      async run({ page, h, a, account }) {
        await openYourAccount(page, h);
        await armExportCapture(page);
        await seedExportExtras(page, { okUrl: 'https://export-media.test/ok.png', failUrl: 'https://export-media.test/missing.png' });
        const downloadP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await startDownloadClick(page);
        const packed = await zipFromDownloadOrCapture(page, downloadP);
        a.equal(packed.filename, 'pixlynote-data-export.zip', 'download filename is pixlynote-data-export.zip');
        a.ok(packed.userData, 'user-data.json present');
        const data = packed.userData;
        a.equal(data.username, account.username, 'export is for the signed-in user');
        a.ok(data.profile && data.profile.username === account.username, 'profile included');
        a.ok(Array.isArray(data.posts) && data.posts.some((p) => String(p.id) === 'export-own-post' || String(p.id) === '3001' || p.caption === 'My own photo'), 'own posts included');
        a.ok(!(data.posts || []).some((p) => p.author && String(p.author) !== String(account.username)), 'no other authors in posts');
        a.ok(!(data.posts || []).some((p) => String(p.author) === 'explore_alice'), 'explore posts from other users are not exported');
        a.ok(Array.isArray(data.notes) && data.notes.some((n) => String(n.id) === 'export-own-note' || String(n.id) === '9001' || /My own note/.test(n.text || '')), 'own notes included');
        a.ok(data.likes && (data.likes.likedPostIds || []).map(String).includes('2123'), 'likes included');
        a.ok(data.saves && (data.saves.savedPostIds || []).map(String).includes('2144'), 'saves included');
        a.ok(data.connections && Array.isArray(data.connections.following), 'connections included');
        a.ok(Array.isArray(data.drafts) && data.drafts.some((d) => d.caption === 'export-draft-caption'), 'drafts included');
        a.ok(Array.isArray(data.highlights) && data.highlights.some((h) => h.title === 'Trail days'), 'highlights included');
        a.ok(data.profileHistory, 'profile history included');
        a.ok(data.metadata, 'metadata included');
        a.ok(!/SHOULD-NOT-APPEAR|LOCAL-HASH-SHOULD-NOT-APPEAR|super-secret-pass|local-secret-pass/.test(packed.userDataRaw), 'password hashes and secrets stripped');
        a.ok(!/"verificationCode"\s*:\s*"654321"/.test(packed.userDataRaw), 'verification codes stripped');
        a.ok(!/"resetCode"\s*:\s*"111111"/.test(packed.userDataRaw), 'reset codes stripped');
        const mediaFiles = packed.names.filter((n) => n.startsWith('media/') && !n.endsWith('/'));
        a.ok(mediaFiles.length >= 1, 'successful media is written under media/: ' + mediaFiles.join(','));
        a.ok((data.mediaErrors && data.mediaErrors.length) || /missing|CORS/i.test(packed.mediaErrors), 'failed or CORS-blocked media is listed');
        a.ok(packed.names.includes('media-errors.txt') || (data.mediaErrors && data.mediaErrors.length), 'skipped files listed in user-data.json or media-errors.txt');
        await cleanupExportExtras(page);
      }
    },
    {
      name: 'Export failure shows a clean error toast and re-enables the button',
      accounts: ['personal'],
      covers: ['el:#btn-ac-download-data'],
      async run({ page, h, a }) {
        await openYourAccount(page, h);
        await page.evaluate(() => {
          window.__pixlyOrigLoadJSZip = window.PixlyDataExport && window.PixlyDataExport.loadJSZip;
          window.PixlyDataExport.loadJSZip = async () => { throw new Error('jszip_unavailable'); };
        });
        try {
          await page.click('#btn-ac-download-data');
          await page.waitForTimeout(200);
          const result = await page.evaluate(() => {
            const btn = document.getElementById('btn-ac-download-data');
            const toast = document.getElementById('toast-text');
            const toastEl = document.getElementById('toast');
            const status = document.getElementById('ac-data-export-status');
            return {
              disabled: !!(btn && btn.disabled),
              label: (document.getElementById('ac-data-export-label') || {}).textContent,
              toast: (toast && toast.textContent) || '',
              toastVisible: !!(toastEl && toastEl.classList.contains('opacity-100')),
              status: (status && status.textContent) || ''
            };
          });
          a.ok(/Could not load the ZIP library|Could not download your data/i.test(result.toast || result.status), 'clean error message shown: ' + result.toast + ' / ' + result.status);
          a.ok(result.toastVisible || /Could not/.test(result.toast), 'error toast is shown');
          a.ok(!result.disabled, 'button is re-enabled after failure');
          a.equal(result.label, 'Download your data', 'label resets after failure');
        } finally {
          await page.evaluate(() => {
            if (window.__pixlyOrigLoadJSZip && window.PixlyDataExport) window.PixlyDataExport.loadJSZip = window.__pixlyOrigLoadJSZip;
            try { delete window.__pixlyExportBeforeZip; } catch (e) { window.__pixlyExportBeforeZip = undefined; }
          });
        }
      }
    },
    {
      name: 'Signed-out request refuses with a message and does not download',
      accounts: ['signed-out'],
      covers: ['el:#btn-ac-download-data'],
      async run({ page, a }) {
        const result = await page.evaluate(async () => {
          window.__pixlyExportCaptured = null;
          window.__pixlyOnDataExportDownload = (blob, name) => {
            window.__pixlyExportCaptured = { name: name };
          };
          if (typeof requestAccountDataExport === 'function') await requestAccountDataExport();
          const toast = document.getElementById('toast-text');
          const status = document.getElementById('ac-data-export-status');
          return {
            status: (status && status.textContent) || '',
            toast: (toast && toast.textContent) || '',
            captured: window.__pixlyExportCaptured,
            disabled: !!(document.getElementById('btn-ac-download-data') || {}).disabled
          };
        });
        a.ok(/Sign in to download your data/i.test(result.status), 'status refuses when signed out: ' + result.status);
        a.ok(/Sign in to download your data/i.test(result.toast), 'toast refuses when signed out: ' + result.toast);
        a.ok(!result.captured, 'no zip is downloaded when signed out');
        a.ok(!result.disabled, 'button is not left disabled');
      }
    },
    {
      name: 'Client-side export works for every account type',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-ac-download-data'],
      async run({ page, h, a, account }) {
        await openYourAccount(page, h);
        await armExportCapture(page);
        await seedExportExtras(page, { okUrl: 'https://export-media.test/ok.png' });
        const downloadP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await startDownloadClick(page);
        const packed = await zipFromDownloadOrCapture(page, downloadP);
        a.equal(packed.filename, 'pixlynote-data-export.zip', 'filename for @' + account.username);
        a.ok(packed.userData && packed.userData.username === account.username, 'zip belongs to @' + account.username);
        a.ok(packed.userData.profile && packed.userData.profile.accountType === account.accountType, 'account type in profile/metadata for @' + account.username);
        a.ok(!/SHOULD-NOT-APPEAR|super-secret-pass/.test(packed.userDataRaw), 'secrets stripped for @' + account.username);
        const reset = await page.evaluate(() => ({
          disabled: !!(document.getElementById('btn-ac-download-data') || {}).disabled,
          label: (document.getElementById('ac-data-export-label') || {}).textContent
        }));
        a.ok(!reset.disabled, 'button reset for @' + account.username);
        a.equal(reset.label, 'Download your data', 'label reset for @' + account.username);
        await cleanupExportExtras(page);
      }
    }
  ]
};
