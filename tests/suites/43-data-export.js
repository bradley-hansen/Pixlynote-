'use strict';

/**
 * Download your data: unit coverage for ZIP/auth/sanitize helpers, plus
 * Account Center e2e for the button, request flow, and error states.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

let libPromise;
function loadLib() {
  if (!libPromise) libPromise = import('../../worker/data-export-lib.mjs');
  return libPromise;
}

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

async function clearExportMock(page) {
  await page.evaluate(() => {
    try { delete window.__pixlyDataExportMock; } catch (e) { window.__pixlyDataExportMock = undefined; }
    try { delete window.__pixlyDataExportCalls; } catch (e) { window.__pixlyDataExportCalls = undefined; }
  });
}

module.exports = {
  name: 'Download your data',
  tests: [
    {
      name: 'Unit: ZIP contains sanitized export files and strips secrets',
      accounts: ['personal'],
      covers: [],
      async run({ a }) {
        const lib = await loadLib();
        const account = { username: 'reg_personal', email: 'reg.personal@example.test' };
        const bundle = {
          profile: {
            username: 'reg_personal',
            email: 'reg.personal@example.test',
            bio: 'hello',
            passwordHash: 'SHOULD-NOT-APPEAR',
            password: 'secret',
            avatar: 'data:image/png;base64,' + 'A'.repeat(9000)
          },
          posts: [{ id: 'p1', author: 'reg_personal', caption: 'Trail shot' }],
          notes: [{ id: 'n1', text: 'a note' }],
          likes: { likedPostIds: ['p1'] },
          saves: { savedPostIds: ['p2'] },
          connections: { following: [{ username: 'nordic_trails', isFollowing: true }], followers: [{ username: 'elena_eats' }] },
          drafts: [{ id: 'd1', type: 'post', caption: 'draft caption' }],
          highlights: [],
          profileHistory: { name: [{ at: 1, value: 'Reg' }] }
        };
        const built = lib.buildSizedZip(account, bundle, { now: Date.UTC(2026, 10, 24) });
        a.ok(built.zip && built.zip.length > 0, 'ZIP bytes produced');
        a.ok(/pixlynote-data-reg_personal-2026-11-24\.zip/.test(built.filename), 'filename uses username and date: ' + built.filename);
        const files = lib.readZip(built.zip);
        const expected = ['README.txt', 'profile.json', 'posts.json', 'notes.json', 'likes.json', 'saves.json', 'connections.json', 'drafts.json', 'highlights.json', 'profile-history.json'];
        expected.forEach((name) => a.ok(files[name], 'zip has ' + name));
        const profile = lib.zipFileText(files, 'profile.json');
        a.ok(profile.includes('reg_personal'), 'profile includes username');
        a.ok(!/SHOULD-NOT-APPEAR/.test(profile), 'passwordHash stripped');
        a.ok(!/"password": "secret"/.test(profile), 'password stripped');
        a.ok(/inline_data_too_large/.test(profile), 'large data URL omitted');
        const posts = lib.zipFileText(files, 'posts.json');
        a.ok(posts.includes('Trail shot'), 'posts included');
        const likes = lib.zipFileText(files, 'likes.json');
        a.ok(likes.includes('p1'), 'likes included');
        const drafts = lib.zipFileText(files, 'drafts.json');
        a.ok(drafts.includes('draft caption'), 'device drafts included');
        const readme = lib.zipFileText(files, 'README.txt');
        a.ok(/email on file/i.test(readme), 'README explains destination');
      }
    },
    {
      name: 'Unit: worker ignores client username/email and requires a real identity',
      accounts: ['personal'],
      covers: [],
      async run({ a }) {
        const lib = await loadLib();
        const cleaned = lib.ignoreClientIdentity({
          username: 'victim',
          email: 'attacker@evil.example',
          to: 'attacker@evil.example',
          deviceDrafts: [{ id: 'd1' }]
        });
        a.ok(!cleaned.username && !cleaned.email && !cleaned.to, 'identity fields dropped');
        a.ok(cleaned.deviceDrafts && cleaned.deviceDrafts[0].id === 'd1', 'device drafts still accepted as data');

        const bearer = lib.extractBearer('Bearer abc.def.ghi');
        a.equal(bearer, 'abc.def.ghi', 'Bearer token extracted');
        a.equal(lib.extractBearer('Basic nope'), '', 'non-bearer rejected');

        try {
          await lib.verifyFirebaseIdToken('', { apiKey: 'test', fetch: async () => ({ ok: false, json: async () => ({}) }) });
          a.ok(false, 'empty token should throw');
        } catch (e) {
          a.equal(e.code, 'unauthorized', 'empty token is unauthorized');
        }

        const fetchOk = async () => ({
          ok: true,
          json: async () => ({ users: [{ localId: 'uid-1', email: 'reg.personal@example.test', emailVerified: true, providerUserInfo: [{ providerId: 'password' }] }] })
        });
        const identity = await lib.verifyFirebaseIdToken('aaa.eyJlbWFpbCI6InJlZy5wZXJzb25hbEBleGFtcGxlLnRlc3QiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.ccc', {
          apiKey: 'test-key',
          fetch: fetchOk
        });
        a.equal(identity.sub, 'uid-1', 'uid from lookup');
        a.ok(identity.email_verified, 'email verified');
        a.ok(!identity.anonymous, 'password provider is not anonymous');

        const acc = await lib.resolveExportAccount(identity, {
          findByUid: async () => [{ username: 'reg_personal', email: 'reg.personal@example.test' }],
          findByEmail: async () => [{ username: 'reg_personal', email: 'reg.personal@example.test' }]
        });
        a.equal(acc.username, 'reg_personal', 'resolved signed-in account only');

        try {
          await lib.resolveExportAccount({ sub: 'other', email: 'x@y.com', email_verified: false, anonymous: true }, {
            findByUid: async () => [],
            findByEmail: async () => [{ username: 'victim', email: 'victim@example.test' }]
          });
          a.ok(false, 'unverified/anonymous must not resolve by guess');
        } catch (e) {
          a.equal(e.code, 'identity_unlinked', 'anonymous without uid match is unlinked');
        }

        a.equal(lib.recipientOnFile({ email: '  ok@example.test ' }), 'ok@example.test', 'on-file email used');
        a.equal(lib.recipientOnFile({ email: '' }), '', 'missing email rejected');
        a.equal(lib.recipientOnFile({ email: 'not-an-email' }), '', 'malformed email rejected');
      }
    },
    {
      name: 'Unit: oversized export degrades to a smaller ZIP still containing JSON',
      accounts: ['personal'],
      covers: [],
      async run({ a }) {
        const lib = await loadLib();
        const huge = 'data:image/jpeg;base64,' + 'B'.repeat(200000);
        const posts = [];
        for (let i = 0; i < 40; i++) posts.push({ id: 'p' + i, author: 'reg_personal', image: huge, caption: 'cap' + i });
        const built = lib.buildSizedZip({ username: 'reg_personal', email: 'reg.personal@example.test' }, {
          profile: { username: 'reg_personal', avatar: huge },
          posts,
          notes: [],
          likes: {},
          saves: {},
          connections: {},
          drafts: [],
          highlights: [],
          profileHistory: null
        }, { now: Date.now() });
        a.ok(built.zip.length <= lib.MAX_ZIP_BYTES, 'zip stays under cap: ' + built.zip.length);
        const files = lib.readZip(built.zip);
        a.ok(Object.keys(files).length >= 1, 'degraded zip still has files');
        const joined = Object.keys(files).map((n) => lib.zipFileText(files, n)).join('\n');
        a.ok(/reg_personal/.test(joined), 'username still present after shrink');
      }
    },
    {
      name: 'Download your data button is on Your Account for every account type',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-ac-download-data', 'el:#ac-data-export-code', 'el:#btn-ac-data-export-verify'],
      async run({ page, h, a, account }) {
        await openYourAccount(page, h);
        a.ok(await h.isVisible(page, '#btn-ac-download-data'), 'Download your data button visible for @' + account.username);
        const label = await page.evaluate(() => (document.getElementById('btn-ac-download-data') || {}).innerText || '');
        a.ok(/Download your data/i.test(label), 'button label: ' + label);
        a.ok(/email a ZIP/i.test(label), 'subtitle mentions ZIP email');
      }
    },
    {
      name: 'Download your data: verified token request emails a ZIP and shows success',
      accounts: ['personal', 'business', 'empty', 'pixlynote'],
      covers: ['el:#btn-ac-download-data'],
      async run({ page, h, a, account }) {
        await openYourAccount(page, h);
        await page.evaluate(() => {
          window.__pixlyDataExportCalls = [];
          window.__pixlyDataExportMock = async (path, payload, headers) => {
            window.__pixlyDataExportCalls.push({ path, payload, headers });
            if (path === '/data-export') {
              const auth = (headers && (headers.Authorization || headers.authorization)) || '';
              if (!auth) return { error: 'unauthorized', status: 401 };
              if (/username|to\b/.test(JSON.stringify(payload || {})) && (payload.username || payload.email || payload.to)) {
                return { error: 'identity_ignored_should_not_happen', status: 400 };
              }
              return { ok: true, sent: true, test: true, filename: 'pixlynote-data-test.zip' };
            }
            return { error: 'unexpected', status: 400 };
          };
          if (window.firebase && window.firebase.auth) {
            window.firebase.auth.currentUser = { getIdToken: async () => 'test-id-token' };
          } else {
            window.firebase = { auth: { currentUser: { getIdToken: async () => 'test-id-token' } } };
          }
        });
        await page.click('#btn-ac-download-data');
        await page.waitForTimeout(250);
        const status = await page.evaluate(() => (document.getElementById('ac-data-export-status') || {}).textContent || '');
        a.ok(/emailed a ZIP of your data to the email on file/i.test(status), 'success message: ' + status);
        const calls = await page.evaluate(() => window.__pixlyDataExportCalls || []);
        a.ok(calls.length === 1 && calls[0].path === '/data-export', 'one export request');
        a.ok(/Bearer test-id-token/.test((calls[0].headers && calls[0].headers.Authorization) || ''), 'Firebase ID token sent');
        a.ok(!calls[0].payload.username && !calls[0].payload.email && !calls[0].payload.to, 'client does not send username or email');
        a.ok(Array.isArray(calls[0].payload.deviceDrafts), 'optional device drafts only');
        await clearExportMock(page);
      }
    },
    {
      name: 'Download your data: auth rejection starts email confirmation, wrong code fails, right code succeeds',
      accounts: ['personal'],
      covers: ['el:#btn-ac-download-data', 'el:#ac-data-export-code', 'el:#btn-ac-data-export-verify'],
      async run({ page, h, a }) {
        await openYourAccount(page, h);
        await page.evaluate(() => {
          window.__pixlyDataExportCalls = [];
          window.__pixlyDataExportMock = async (path, payload, headers) => {
            window.__pixlyDataExportCalls.push({ path, payload, headers });
            if (path === '/data-export' && !(payload && payload.grant) && !((headers || {})['X-Pixlynote-Export-Grant'])) {
              return { error: 'identity_unlinked', status: 403 };
            }
            if (path === '/data-export/code') return { ok: true, sent: true, test: true };
            if (path === '/data-export/verify') {
              if (String(payload.code) !== '123456') return { valid: false, error: 'wrong_code' };
              return { ok: true, valid: true, grant: 'unit-grant' };
            }
            if (path === '/data-export' && (payload.grant === 'unit-grant' || (headers || {})['X-Pixlynote-Export-Grant'] === 'unit-grant')) {
              return { ok: true, sent: true, test: true };
            }
            return { error: 'unexpected', status: 400 };
          };
        });
        await page.click('#btn-ac-download-data');
        await page.waitForTimeout(300);
        const waitMsg = await page.evaluate(() => (document.getElementById('ac-data-export-status') || {}).textContent || '');
        a.ok(/confirmation code/i.test(waitMsg), 'asks for confirmation code: ' + waitMsg);
        a.ok(await h.isVisible(page, '#ac-data-export-code-row'), 'code row shown');

        await page.fill('#ac-data-export-code', '000000');
        await page.click('#btn-ac-data-export-verify');
        await page.waitForTimeout(200);
        const bad = await page.evaluate(() => (document.getElementById('ac-data-export-status') || {}).textContent || '');
        a.ok(/not valid/i.test(bad), 'wrong code message: ' + bad);

        await page.fill('#ac-data-export-code', '123456');
        await page.click('#btn-ac-data-export-verify');
        await page.waitForTimeout(250);
        const okMsg = await page.evaluate(() => (document.getElementById('ac-data-export-status') || {}).textContent || '');
        a.ok(/emailed a ZIP of your data to the email on file/i.test(okMsg), 'success after code: ' + okMsg);
        await clearExportMock(page);
      }
    },
    {
      name: 'Download your data: rate limit, missing email, and send failure show clear errors',
      accounts: ['personal'],
      covers: ['el:#btn-ac-download-data'],
      async run({ page, h, a }) {
        await openYourAccount(page, h);
        const expectError = async (mock, re, label) => {
          await page.evaluate((fn) => {
            window.__pixlyDataExportMock = eval('(' + fn + ')');
            if (window.firebase && window.firebase.auth) {
              window.firebase.auth.currentUser = { getIdToken: async () => 'test-id-token' };
            } else {
              window.firebase = { auth: { currentUser: { getIdToken: async () => 'test-id-token' } } };
            }
          }, mock);
          await page.click('#btn-ac-download-data');
          await page.waitForTimeout(250);
          const status = await page.evaluate(() => (document.getElementById('ac-data-export-status') || {}).textContent || '');
          a.ok(re.test(status), label + ': ' + status);
        };

        await expectError(
          'async (path) => ({ error: "rate_limited", status: 429 })',
          /24 hours/i,
          'rate limited'
        );
        await expectError(
          'async (path) => ({ error: "no_email_on_file", status: 400 })',
          /Add and verify an email/i,
          'no email on file'
        );
        await expectError(
          'async (path) => ({ error: "send_failed", status: 502 })',
          /could not send the email/i,
          'send failed'
        );
        await clearExportMock(page);
      }
    },
    {
      name: 'Download your data: signed-out request is refused',
      accounts: ['personal'],
      covers: [],
      async run({ page, h, a }) {
        await openYourAccount(page, h);
        await page.evaluate(() => {
          state.isLoggedIn = false;
        });
        await page.evaluate(() => { if (typeof requestAccountDataExport === 'function') requestAccountDataExport(); });
        await page.waitForTimeout(80);
        const status = await page.evaluate(() => (document.getElementById('ac-data-export-status') || {}).textContent || '');
        a.ok(/Sign in to download your data/i.test(status), 'signed-out message: ' + status);
        await page.evaluate(() => { state.isLoggedIn = true; });
        await clearExportMock(page);
      }
    }
  ]
};
