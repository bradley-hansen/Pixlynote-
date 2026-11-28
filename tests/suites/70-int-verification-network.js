'use strict';

/**
 * Interaction failure paths: Business verification and Government / Organization verification.
 * Every control that talks to the Worker or Firestore is tested for success AND failure
 * (HTTP error, error JSON, dropped connection). The UI must never say a code was sent, a code
 * was verified, or an application was submitted when the call failed.
 * Worker calls are fulfilled locally by page routes; Firestore is the in-page mock. No real email.
 */

const nf = require('../helpers/net-fail');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const BIZ_EMAIL = 'owner@regbusiness.example';

async function openBizver(page) {
  await page.evaluate((email) => {
    if (typeof closeBusinessVerificationModal === 'function') { try { closeBusinessVerificationModal(); } catch (e) {} }
    window._bizverEmailState = null;
    if (typeof openBusinessVerificationModal === 'function') openBusinessVerificationModal();
    const inp = document.getElementById('bizver-domain-email');
    if (inp) { inp.value = email; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const st = document.getElementById('bizver-email-status');
    if (st) { st.textContent = ''; st.classList.add('hidden'); }
    const code = document.getElementById('bizver-email-code');
    if (code) code.value = '';
  }, BIZ_EMAIL);
}

async function bizverEmailUi(page) {
  return page.evaluate(() => {
    const st = document.getElementById('bizver-email-status');
    const s = window._bizverEmailState || {};
    return {
      status: st ? (st.textContent || '').trim() : '',
      statusShown: !!(st && !st.classList.contains('hidden') && (st.textContent || '').trim()),
      codeSent: !!s.codeSent,
      verified: !!s.verified
    };
  });
}

async function closeBizver(page) {
  await page.evaluate(() => { if (typeof closeBusinessVerificationModal === 'function') { try { closeBusinessVerificationModal(); } catch (e) {} } });
}

async function fillBizverApplication(page) {
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('bizver-legal-name', 'Reg Business LLC');
    const et = document.getElementById('bizver-entity-type');
    if (et) {
      const opt = Array.from(et.options || []).find((o) => o.value);
      if (opt) et.value = opt.value;
    }
    set('bizver-country', 'US');
    set('bizver-tax-id', '12-3456789');
    set('bizver-rep-name', 'Reg Owner');
    set('bizver-rep-title', 'Owner');
    const attach = (id, f) => {
      const input = document.getElementById(id);
      if (!input) return;
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
    };
    attach('bizver-file-articles', new File([new Uint8Array([37, 80, 68, 70, 45, 49])], 'articles.pdf', { type: 'application/pdf' }));
    attach('bizver-file-photo-id', new File([new Uint8Array([37, 80, 68, 70, 45, 49])], 'photo-id.pdf', { type: 'application/pdf' }));
  });
}

async function bizverSubmitUi(page) {
  return page.evaluate(() => {
    const st = document.getElementById('business-verification-form-status');
    const btn = document.getElementById('btn-submit-business-verification');
    return {
      status: st ? (st.textContent || '').trim() : '',
      isError: !!(st && /rose/.test(st.className)),
      userStatus: (state.currentUser && state.currentUser.businessVerificationStatus) || '',
      btnDisabled: !!(btn && btn.disabled)
    };
  });
}

async function resetBizverStatus(page) {
  await page.evaluate(() => {
    if (!state.currentUser) return;
    state.currentUser.businessVerificationStatus = '';
    delete state.currentUser.businessVerificationSubmittedAt;
    delete state.currentUser.businessVerificationUpdatedAt;
  });
}

async function setPlus(page) {
  await page.evaluate(() => {
    if (!state.currentUser) return;
    state.currentUser.isPlus = true;
    state.currentUser.isVerified = true;
    state.currentUser.subscriptionStatus = 'active';
    state.currentUser.verificationStatus = '';
    state.currentUser.verificationType = '';
    window._verificationEmailState = null;
  });
}

async function openGovRequest(page, type) {
  await page.evaluate((type) => {
    if (typeof closeVerificationRequestModal === 'function') { try { closeVerificationRequestModal(); } catch (e) {} }
    if (typeof openVerificationRequestModal === 'function') openVerificationRequestModal(type || 'government');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('verification-entity-name', type === 'organization' ? 'Harbor Civic League' : 'City of Galloway');
    set('verification-official-email', '');
    set('verification-website-url', '');
    set('verification-email-code', '');
    set('verification-notes', '');
    const st = document.getElementById('verification-form-status');
    if (st) { st.textContent = ''; }
  }, type);
}

const govStatus = (page) => page.evaluate(() => {
  const st = document.getElementById('verification-form-status');
  const s = window._verificationEmailState || {};
  return { status: st ? (st.textContent || '').trim() : '', codeSent: !!s.codeSent, verified: !!s.verified, userStatus: (state.currentUser && state.currentUser.verificationStatus) || '' };
});

const FAIL_MODES = ['http403', 'http500', 'badJson', 'network'];

module.exports = {
  name: 'Interaction failure paths: verification',
  tests: [
    {
      name: 'Business verification Send code: a successful send posts the email to the Worker, says Code sent, and shows the code box',
      accounts: ['business'],
      covers: ['el:#btn-bizver-send-email-code', 'handler:sendBusinessVerificationEmailCode', 'el:#bizver-domain-email', 'el:#bizver-email-status', 'el:#bizver-email-code-wrap'],
      async run({ page, a }) {
        await openBizver(page);
        await nf.withWorker(page, '/email', { status: 200, body: { ok: true } }, async (r) => {
          await nf.tap(page, 'btn-bizver-send-email-code');
          const ui = await bizverEmailUi(page);
          a.equal(r.calls.length, 1, 'Send code makes exactly one /email request');
          a.ok(r.calls[0] && r.calls[0].body && r.calls[0].body.to === BIZ_EMAIL, 'The request is addressed to the typed business email: ' + JSON.stringify(r.calls[0] && r.calls[0].body));
          a.ok(/code sent/i.test(ui.status) && ui.codeSent, 'Success says Code sent: ' + ui.status);
          a.ok(await nf.shown(page, 'bizver-email-code-wrap'), 'The code box is shown after a successful send');
        });
        await closeBizver(page);
      }
    },
    {
      name: 'Business verification Send code: a failed send (403 email taken, 500, bad gateway, offline) never says Code sent',
      accounts: ['business'],
      covers: ['el:#btn-bizver-send-email-code', 'handler:sendBusinessVerificationEmailCode'],
      async run({ page, a }) {
        const seen = [];
        for (const mode of FAIL_MODES) {
          await openBizver(page);
          await nf.withWorker(page, '/email', mode, async (r) => {
            await nf.tap(page, 'btn-bizver-send-email-code');
            const ui = await bizverEmailUi(page);
            seen.push({ mode, calls: r.calls.length, ui });
          });
        }
        await closeBizver(page);
        seen.forEach((s) => {
          a.ok(s.calls >= 1, s.mode + ': the send was attempted');
          a.ok(!/code sent|check your email/i.test(s.ui.status), s.mode + ': must not say Code sent after a failed send, got "' + s.ui.status + '"');
          a.ok(!s.ui.codeSent, s.mode + ': must not record the code as sent');
          a.ok(s.ui.statusShown, s.mode + ': shows a visible error');
        });
      }
    },
    {
      name: 'Business verification Resend: each tap sends a new code request to the Worker',
      accounts: ['business'],
      covers: ['el:#btn-bizver-resend-email-code', 'handler:sendBusinessVerificationEmailCode'],
      async run({ page, a }) {
        await openBizver(page);
        await nf.withWorker(page, '/email', { status: 200, body: { ok: true } }, async (r) => {
          await nf.tap(page, 'btn-bizver-send-email-code');
          await nf.tap(page, 'btn-bizver-resend-email-code');
          await nf.tap(page, 'btn-bizver-resend-email-code');
          a.equal(r.calls.length, 3, 'Send + two Resend taps make three /email requests');
          a.ok(r.calls.every((c) => c.body && c.body.to === BIZ_EMAIL), 'Every resend goes to the same business email');
        });
        await closeBizver(page);
      }
    },
    {
      name: 'Business verification Resend: a failed resend shows an error instead of leaving "Code sent" on screen',
      accounts: ['business'],
      covers: ['el:#btn-bizver-resend-email-code'],
      async run({ page, a }) {
        await openBizver(page);
        const r = await nf.routeWorker(page, '/email', { status: 200, body: { ok: true } });
        try {
          await nf.tap(page, 'btn-bizver-send-email-code');
          const first = await bizverEmailUi(page);
          a.ok(/code sent/i.test(first.status), 'First send succeeded: ' + first.status);
          for (const mode of ['http500', 'network']) {
            r.set(mode);
            await nf.tap(page, 'btn-bizver-resend-email-code');
            const ui = await bizverEmailUi(page);
            a.ok(!/code sent|check your email/i.test(ui.status), mode + ': a failed Resend must replace "Code sent" with an error, got "' + ui.status + '"');
          }
        } finally { await r.restore(); }
        await closeBizver(page);
      }
    },
    {
      name: 'Business verification Verify email: only valid === true verifies; wrong code, 500, bad gateway and offline all stay unverified',
      accounts: ['business'],
      covers: ['el:#btn-bizver-verify-email-code', 'handler:verifyBusinessVerificationEmailCode', 'el:#bizver-email-code'],
      async run({ page, a }) {
        const cases = [
          { mode: { status: 200, body: { valid: false, error: 'wrong_code' } }, label: 'wrong code' },
          { mode: 'http500', label: '500' },
          { mode: 'badJson', label: 'bad gateway' },
          { mode: 'network', label: 'offline' },
          { mode: { status: 200, body: { ok: true } }, label: '200 without valid' }
        ];
        for (const c of cases) {
          await openBizver(page);
          await page.evaluate((email) => { window._bizverEmailState = { email: email.toLowerCase(), verified: false, codeSent: true }; }, BIZ_EMAIL);
          await nf.setValue(page, 'bizver-email-code', '123456');
          await nf.withWorker(page, '/email/signup-verify', c.mode, async (r) => {
            await nf.tap(page, 'btn-bizver-verify-email-code');
            a.equal(r.calls.length, 1, c.label + ': one verify request');
          });
          const ui = await bizverEmailUi(page);
          a.ok(!ui.verified, c.label + ': email is not marked verified');
          a.ok(!/^email verified/i.test(ui.status) && ui.statusShown, c.label + ': shows an error, got "' + ui.status + '"');
        }
        await openBizver(page);
        await nf.setValue(page, 'bizver-email-code', '123456');
        await nf.withWorker(page, '/email/signup-verify', { status: 200, body: { valid: true } }, async (r) => {
          await nf.tap(page, 'btn-bizver-verify-email-code');
          a.ok(r.calls[0] && r.calls[0].body && r.calls[0].body.code === '123456', 'The typed code is sent to the Worker');
        });
        const ok = await bizverEmailUi(page);
        a.ok(ok.verified && /verified/i.test(ok.status), 'valid === true verifies the email: ' + ok.status);
        await closeBizver(page);
      }
    },
    {
      name: 'Business verification Submit: 500, storage not configured, bad gateway and offline show an error and never mark the application pending',
      accounts: ['business'],
      covers: ['el:#btn-submit-business-verification', 'handler:submitBusinessVerificationApplication', 'el:#business-verification-form-status'],
      async run({ page, a }) {
        const cases = [
          { mode: 'http500', label: '500', re: /could not submit/i },
          { mode: { status: 503, body: { ok: false, error: 'storage_not_configured' } }, label: 'storage not configured', re: /not saved|not available/i },
          { mode: { status: 400, body: { ok: false, error: 'invalid_ein_format' } }, label: 'invalid EIN from Worker', re: /XX-XXXXXXX/ },
          { mode: { status: 200, body: { ok: false } }, label: '200 with ok:false', re: /could not submit/i },
          { mode: 'badJson', label: 'bad gateway', re: /could not submit/i },
          { mode: 'network', label: 'offline', re: /could not submit/i }
        ];
        // Keep the background status check from changing the status while the submit is under test.
        const statusRoute = await nf.routeWorker(page, '/business-verification/status', { status: 200, body: {} });
        try {
        for (const c of cases) {
          await resetBizverStatus(page);
          await openBizver(page);
          await fillBizverApplication(page);
          await nf.withWorker(page, '/business-verification/submit', c.mode, async (r) => {
            await nf.tap(page, 'btn-submit-business-verification', 700);
            const ui = await bizverSubmitUi(page);
            a.ok(r.calls.length === 1, c.label + ': one submit request was made');
            a.ok(ui.isError && c.re.test(ui.status), c.label + ': shows the error, got "' + ui.status + '"');
            a.ok(!/submitted|pending review/i.test(ui.status), c.label + ': never says submitted');
            a.ok(ui.userStatus !== 'pending', c.label + ': the account is not marked pending');
            a.ok(!ui.btnDisabled, c.label + ': Submit is enabled again so the person can retry');
          });
        }
        await resetBizverStatus(page);
        await openBizver(page);
        await fillBizverApplication(page);
        await nf.withWorker(page, '/business-verification/submit', { status: 200, body: { ok: true, status: 'pending', submittedAt: Date.now() } }, async () => {
          await nf.tap(page, 'btn-submit-business-verification', 700);
        });
        const ok = await bizverSubmitUi(page);
        a.ok(!ok.isError && /submitted/i.test(ok.status) && ok.userStatus === 'pending', 'A real success marks the application pending: ' + ok.status);
        } finally { await statusRoute.restore(); }
        await resetBizverStatus(page);
        await closeBizver(page);
      }
    },
    {
      name: 'Business verification status refresh: a failed status check never changes the shown status',
      accounts: ['business'],
      covers: ['handler:refreshBusinessVerificationStatusFromWorker'],
      async run({ page, a }) {
        for (const mode of ['http500', 'badJson', 'network']) {
          await page.evaluate(() => { state.currentUser.businessVerificationStatus = 'more_info'; });
          await nf.withWorker(page, '/business-verification/status', mode, async () => {
            await page.evaluate(() => refreshBusinessVerificationStatusFromWorker());
            await page.waitForTimeout(100);
          });
          const st = await page.evaluate(() => state.currentUser.businessVerificationStatus);
          a.equal(st, 'more_info', mode + ': status stays as it was');
        }
        await nf.withWorker(page, '/business-verification/status', { status: 200, body: { status: 'approved', adminNote: '' } }, async () => {
          await page.evaluate(() => refreshBusinessVerificationStatusFromWorker());
          await page.waitForTimeout(100);
        });
        const ok = await page.evaluate(() => state.currentUser.businessVerificationStatus);
        a.equal(ok, 'approved', 'A successful status check applies the new status');
        await resetBizverStatus(page);
      }
    },
    {
      name: 'Gov/Org Send code and Resend: failures (403, 500, bad gateway, offline) show an error and never say We sent a code',
      accounts: ['personal'],
      covers: ['el:#btn-verification-send-email-code', 'el:#btn-verification-resend-email-code', 'handler:sendVerificationEmailCode', 'el:#verification-official-email', 'el:#verification-form-status'],
      async run({ page, a }) {
        await setPlus(page);
        for (const btnId of ['btn-verification-send-email-code', 'btn-verification-resend-email-code']) {
          for (const mode of FAIL_MODES) {
            await openGovRequest(page, 'government');
            await nf.setValue(page, 'verification-official-email', 'clerk@city.galloway.gov');
            await page.evaluate(() => { window._verificationEmailState = null; });
            await nf.withWorker(page, '/email', mode, async (r) => {
              await nf.tap(page, btnId);
              a.equal(r.calls.length, 1, btnId + ' ' + mode + ': one request');
            });
            const ui = await govStatus(page);
            a.ok(!/we sent/i.test(ui.status) && ui.status.length > 0, btnId + ' ' + mode + ': shows an error, got "' + ui.status + '"');
            a.ok(!ui.codeSent, btnId + ' ' + mode + ': the code is not recorded as sent');
          }
        }
        await openGovRequest(page, 'government');
        await nf.setValue(page, 'verification-official-email', 'clerk@city.galloway.gov');
        await nf.withWorker(page, '/email', { status: 200, body: { ok: true } }, async (r) => {
          await nf.tap(page, 'btn-verification-send-email-code');
          await nf.tap(page, 'btn-verification-resend-email-code');
          a.equal(r.calls.length, 2, 'Send and Resend each make one request');
        });
        const ok = await govStatus(page);
        a.ok(/we sent/i.test(ok.status) && ok.codeSent, 'A real send says We sent a 6-digit code: ' + ok.status);
        await page.evaluate(() => { if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal(); });
      }
    },
    {
      name: 'Gov/Org Verify email: wrong code, 500, bad gateway and offline stay unverified; valid === true verifies',
      accounts: ['personal'],
      covers: ['el:#btn-verification-verify-email-code', 'handler:verifyVerificationEmailCode', 'el:#verification-email-code'],
      async run({ page, a }) {
        await setPlus(page);
        const cases = [{ status: 200, body: { valid: false, error: 'wrong_code' } }, 'http500', 'badJson', 'network', { status: 200, body: { ok: true } }];
        for (const mode of cases) {
          await openGovRequest(page, 'government');
          await nf.setValue(page, 'verification-official-email', 'clerk@city.galloway.gov');
          await nf.setValue(page, 'verification-email-code', '123456');
          await page.evaluate(() => { window._verificationEmailState = { email: 'clerk@city.galloway.gov', verified: false, codeSent: true }; });
          await nf.withWorker(page, '/email/signup-verify', mode, async (r) => { await nf.tap(page, 'btn-verification-verify-email-code'); a.equal(r.calls.length, 1, 'one verify request'); });
          const ui = await govStatus(page);
          const label = typeof mode === 'string' ? mode : JSON.stringify(mode.body);
          a.ok(!ui.verified, label + ': not verified');
          a.ok(!/official email verified/i.test(ui.status), label + ': never says verified, got "' + ui.status + '"');
        }
        await openGovRequest(page, 'government');
        await nf.setValue(page, 'verification-official-email', 'clerk@city.galloway.gov');
        await nf.setValue(page, 'verification-email-code', '123456');
        await nf.withWorker(page, '/email/signup-verify', { status: 200, body: { valid: true } }, async () => { await nf.tap(page, 'btn-verification-verify-email-code'); });
        const ok = await govStatus(page);
        a.ok(ok.verified && /verified/i.test(ok.status), 'valid === true verifies: ' + ok.status);
        await page.evaluate(() => { if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal(); });
      }
    },
    {
      name: 'Gov/Org Submit request: a successful Firestore write reaches verificationRequests and shows Pending review',
      accounts: ['personal'],
      covers: ['el:#btn-submit-verification-request', 'handler:submitVerificationRequest', 'el:#verification-website-url'],
      async run({ page, a }) {
        await setPlus(page);
        await page.evaluate(installPixlyMockFirestore, {});
        try {
          await openGovRequest(page, 'government');
          await nf.setValue(page, 'verification-website-url', 'https://city.galloway.gov/staff');
          await nf.tap(page, 'btn-submit-verification-request', 500);
          const r = await page.evaluate(() => ({
            ui: (document.getElementById('verification-form-status') || {}).textContent || '',
            paths: window.__pfs.writes.map((w) => w.path)
          }));
          const u = await page.evaluate(() => normalizeUsername(state.currentUser.username));
          a.ok(r.paths.includes('verificationRequests/' + u), 'verificationRequests/{username} is written: ' + r.paths.join(', '));
          a.ok(/pending review/i.test(r.ui), 'Shows Pending review after the write: ' + r.ui);
        } finally {
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
          await page.evaluate(() => {
            if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal();
            state.currentUser.verificationStatus = ''; state.currentUser.verificationType = '';
            if (window._verificationRequests) delete window._verificationRequests[normalizeUsername(state.currentUser.username)];
          });
        }
      }
    },
    {
      name: 'Gov/Org Submit request: when the Firestore write fails, the app must not say Pending review',
      accounts: ['personal'],
      covers: ['el:#btn-submit-verification-request', 'handler:submitVerificationRequest'],
      async run({ page, a }) {
        await setPlus(page);
        await page.evaluate(installPixlyMockFirestore, {});
        try {
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          await openGovRequest(page, 'government');
          await nf.setValue(page, 'verification-website-url', 'https://city.galloway.gov/staff');
          await nf.tap(page, 'btn-submit-verification-request', 500);
          const r = await page.evaluate(() => ({
            ui: (document.getElementById('verification-form-status') || {}).textContent || '',
            written: window.__pfs.writes.length
          }));
          a.equal(r.written, 0, 'The mock rejected every write');
          a.ok(!/pending review/i.test(r.ui), 'Must not say Pending review when nothing was saved, got "' + r.ui + '"');
          a.ok(/couldn.t send|nothing was submitted/i.test(r.ui), 'Shows an error, got "' + r.ui + '"');
          a.ok(await page.evaluate(() => { const m = document.getElementById('modal-verification-request'); return !!m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none'; }), 'The form stays open');
          a.ok(await page.evaluate(() => !state.currentUser.verificationStatus), 'The account is not marked pending');
        } finally {
          await page.evaluate(() => { if (window.__pfs) window.__pfs.failWrites = false; }).catch(() => {});
          await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
          await page.evaluate(() => {
            if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal();
            state.currentUser.verificationStatus = ''; state.currentUser.verificationType = '';
            if (window._verificationRequests) delete window._verificationRequests[normalizeUsername(state.currentUser.username)];
          });
        }
      }
    },
    {
      name: 'Organization EIN check: a failed EIN lookup (500, offline) never records an EIN match',
      accounts: ['personal'],
      covers: ['el:#verification-org-ein', 'handler:checkOrganizationEinAndStrip'],
      async run({ page, a }) {
        await setPlus(page);
        for (const mode of ['http500', 'badJson', 'network']) {
          await openGovRequest(page, 'organization');
          await nf.setValue(page, 'verification-org-ein', '12-3456789');
          const res = await nf.withWorker(page, '/business-verification/ein-check', mode, async (r) => {
            const out = await page.evaluate(() => checkOrganizationEinAndStrip());
            return { out, calls: r.calls.length };
          });
          a.equal(res.calls, 1, mode + ': EIN check was attempted');
          a.ok(res.out && res.out.match !== true && res.out.nameMatch !== true, mode + ': no EIN match is recorded: ' + JSON.stringify(res.out));
          const left = await page.evaluate(() => (document.getElementById('verification-org-ein') || {}).value || '');
          a.equal(left, '', mode + ': the EIN is cleared from the form after the check');
        }
        await openGovRequest(page, 'organization');
        await nf.setValue(page, 'verification-org-ein', '12-3456789');
        const good = await nf.withWorker(page, '/business-verification/ein-check', { status: 200, body: { ok: true, einCheck: { checked: true, match: true, nameMatch: true } } }, async () => page.evaluate(() => checkOrganizationEinAndStrip()));
        a.ok(good && good.match === true, 'A real match is returned on success');
        await page.evaluate(() => { if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal(); });
      }
    }
  ]
};
