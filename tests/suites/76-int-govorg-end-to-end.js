'use strict';

/**
 * Government and Organization verification requests, end to end, driven by real taps
 * (Playwright click/fill on the visible controls, so a hidden, covered or dead button fails).
 *
 * Every step that talks to the Worker or Firestore is checked for success AND failure:
 * open -> type tab -> entity name -> official email -> Send code -> Resend -> wrong code ->
 * right code -> (EIN for Organization) -> Submit -> Pending review, plus every validation and
 * network failure path. The UI must never say a code was sent, an email was verified, or a
 * request is pending when that did not happen.
 *
 * The Worker is answered locally by page routes and Firestore is the in-page mock
 * (tests/helpers/mock-firestore.js). No real email, no Firestore writes.
 */

const nf = require('../helpers/net-fail');
const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const PENDING = 'Pending review, usually approved within 24 hours.';
const GOV_EMAIL = 'clerk@city.galloway.gov';
const GOOD_CODE = '123456';

const TYPES = {
  government: { tab: '#btn-edit-account-government', typeBtn: '#btn-verification-type-government', name: 'City of Galloway' },
  organization: { tab: '#btn-edit-account-organization', typeBtn: '#btn-verification-type-organization', name: 'Harbor Civic League' }
};

async function resetVerification(page, opts) {
  await page.evaluate((opts) => {
    const u = state.currentUser;
    if (!u) return;
    if (opts.plus) {
      if (u.accountType === 'business' || String(u.username || '').toLowerCase() === 'pixlynote') {
        u.isBusinessPlus = true;
      }
      u.isPlus = true;
      u.isVerified = true;
      u.subscriptionStatus = 'active';
    } else {
      u.isPlus = false; u.isBusinessPlus = false; u.isVerified = false; u.subscriptionStatus = '';
    }
    ['verificationType', 'verificationStatus', 'verificationEntityName', 'verificationEmail', 'verificationEmailVerified',
      'verificationUrl', 'verificationNotes', 'verificationNeedsManualReview', 'verificationRequestedAt', 'verificationUpdatedAt',
      'verificationBaseAccountType', 'verificationApprovedAt'].forEach((k) => { delete u[k]; });
    u.verificationStatus = '';
    u.verificationType = '';
    window._verificationEmailState = null;
    window._verificationWrites = [];
    if (window._verificationRequests) delete window._verificationRequests[normalizeUsername(u.username)];
    ['modal-verification-request', 'modal-verification-paywall', 'modal-verification-badges'].forEach((id) => {
      if (typeof hideModalEl === 'function') { try { hideModalEl(id); } catch (e) {} }
    });
  }, opts || {});
}

const me = (page) => page.evaluate(() => normalizeUsername(state.currentUser.username));

// Worker stand-in for the email code: /email sends, /email/signup-verify accepts only GOOD_CODE.
async function routeEmailWorker(page, opts) {
  const o = Object.assign({ send: { status: 200, body: { ok: true } } }, opts || {});
  const sends = [];
  const verifies = [];
  const sendRe = nf.pathRegex('/email');
  const verifyRe = nf.pathRegex('/email/signup-verify');
  const fulfil = (route, spec) => {
    const s = typeof spec === 'string' ? nf.FAILURES[spec] : spec;
    if (s.abort) return route.abort('failed');
    if (s.raw !== undefined) return route.fulfill({ status: s.status || 200, contentType: 'text/html', body: s.raw, headers: { 'Access-Control-Allow-Origin': '*' } });
    return route.fulfill({ status: s.status || 200, contentType: 'application/json', body: JSON.stringify(s.body || {}), headers: { 'Access-Control-Allow-Origin': '*' } });
  };
  const state = { send: o.send, hold: null };
  const sendH = async (route) => {
    let body = null;
    try { body = JSON.parse(route.request().postData() || 'null'); } catch (e) {}
    sends.push(body);
    if (state.hold) await state.hold;
    return fulfil(route, state.send);
  };
  const verifyH = async (route) => {
    let body = null;
    try { body = JSON.parse(route.request().postData() || 'null'); } catch (e) {}
    verifies.push(body);
    if (o.verify) return fulfil(route, o.verify);
    return fulfil(route, { status: 200, body: { valid: !!(body && body.code === GOOD_CODE) } });
  };
  await page.route(sendRe, sendH);
  await page.route(verifyRe, verifyH);
  return {
    sends, verifies,
    setSend(spec) { state.send = spec; },
    hold() { let release; state.hold = new Promise((r) => { release = r; }); return () => { state.hold = null; release(); }; },
    async restore() { await page.unroute(sendRe, sendH).catch(() => {}); await page.unroute(verifyRe, verifyH).catch(() => {}); }
  };
}

const formUi = (page) => page.evaluate(() => {
  const vis = (id) => {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('hidden')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const st = document.getElementById('verification-form-status');
  const s = window._verificationEmailState || {};
  return {
    modalOpen: vis('modal-verification-request'),
    paywallOpen: vis('modal-verification-paywall'),
    status: st ? (st.textContent || '').trim() : '',
    statusIsError: !!(st && /rose/.test(st.className)),
    sendVisible: vis('btn-verification-send-email-code'),
    codeBoxVisible: vis('verification-email-code-wrap'),
    verifiedBadge: vis('verification-email-verified-badge'),
    einVisible: vis('verification-org-ein-wrap'),
    banner: vis('verification-pending-banner') ? (document.getElementById('verification-pending-banner').textContent || '').trim() : '',
    govSelected: /font-bold/.test((document.getElementById('btn-verification-type-government') || {}).className || ''),
    orgSelected: /font-bold/.test((document.getElementById('btn-verification-type-organization') || {}).className || ''),
    codeSent: !!s.codeSent,
    verified: !!s.verified,
    userStatus: (state.currentUser && state.currentUser.verificationStatus) || '',
    userType: (state.currentUser && state.currentUser.verificationType) || ''
  };
});

// Firestore writes that belong to verification: verificationRequests/* and users/* writes that carry verification fields.
const fsWrites = (page) => page.evaluate(() => (window.__pfs ? window.__pfs.writes.slice() : []).filter((x) =>
  /^verificationRequests\//.test(x.path) || (/^users\/[^/]+$/.test(x.path) && x.data && Object.keys(x.data).some((k) => /^verification|^governmentBadgeColor$/.test(k)))));

async function applyPlus(page, on) {
  await page.evaluate((on) => {
    const u = state.currentUser;
    if (!u) return;
    const biz = u.accountType === 'business' || String(u.username || '').toLowerCase() === 'pixlynote';
    u.isPlus = !!on; u.isBusinessPlus = !!(on && biz); u.isVerified = !!on; u.subscriptionStatus = on ? 'active' : '';
  }, on);
}

// Opening Edit Profile re-reads the account from (mock) Firestore, so the Plus flags are applied again afterwards.
async function openFromEditProfile(page, h, type, plus) {
  await h.openEditProfile(page);
  await applyPlus(page, plus !== false);
  await page.click(TYPES[type].tab);
  await page.waitForTimeout(200);
}

async function withMockFs(page, seed, fn) {
  await page.evaluate(installPixlyMockFirestore, seed || {});
  try { return await fn(); } finally {
    await page.evaluate(() => { if (window.__pfs) window.__pfs.failWrites = false; }).catch(() => {});
    await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
  }
}

async function cleanup(page, h) {
  await resetVerification(page, {});
  await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') { try { closeEditProfileModal(); } catch (e) {} } }).catch(() => {});
  if (h && h.closeOverlays) await h.closeOverlays(page).catch(() => {});
}

function e2eTest(type) {
  const T = TYPES[type];
  const label = type === 'government' ? 'Government' : 'Organization';
  return {
    name: label + ' request end to end by taps: tab opens the form, Send code, Resend, wrong code, right code, ' + (type === 'organization' ? 'EIN check, ' : '') + 'Submit writes verificationRequests and shows Pending review',
    accounts: ['personal', 'business'],
    covers: [
      'el:' + T.tab, 'el:' + T.typeBtn, 'handler:handleEditProfileOfficialTab', 'handler:openVerificationRequestModal',
      'el:#verification-entity-name', 'el:#verification-official-email', 'el:#btn-verification-send-email-code',
      'el:#btn-verification-resend-email-code', 'el:#verification-email-code', 'el:#btn-verification-verify-email-code',
      'el:#verification-email-verified-badge', 'el:#verification-notes', 'el:#btn-submit-verification-request',
      'el:#verification-pending-banner', 'el:#btn-close-verification-request', 'handler:sendVerificationEmailCode',
      'handler:verifyVerificationEmailCode', 'handler:submitVerificationRequest', 'handler:closeVerificationRequestModal'
    ].concat(type === 'organization' ? ['el:#verification-org-ein', 'el:#verification-org-ein-wrap', 'handler:checkOrganizationEinAndStrip'] : []),
    async run({ page, h, a }) {
      await resetVerification(page, { plus: true });
      const u = await me(page);
      const w = await routeEmailWorker(page);
      const ein = type === 'organization'
        ? await nf.routeWorker(page, '/business-verification/ein-check', { status: 200, body: { ok: true, einCheck: { checked: true, match: true, nameMatch: true, formatOk: true } } })
        : null;
      try {
        await withMockFs(page, {}, async () => {
          // 1. Open from the Edit Profile tab.
          await openFromEditProfile(page, h, type);
          let ui = await formUi(page);
          a.ok(ui.modalOpen, label + ' tab opens the request form');
          a.ok(type === 'government' ? ui.govSelected && !ui.orgSelected : ui.orgSelected && !ui.govSelected, label + ' is preselected');
          a.equal(ui.einVisible, type === 'organization', 'EIN field shows only for Organization');
          a.ok(!ui.sendVisible && !ui.codeBoxVisible, 'No Send code button or code box before an official email is typed');

          // 2. Fill. A non-.gov email never offers Send code.
          await page.fill('#verification-entity-name', T.name);
          await page.fill('#verification-official-email', 'clerk@gmail.com');
          ui = await formUi(page);
          a.ok(!ui.sendVisible, 'A non-.gov/.mil email does not show Send code');
          await page.fill('#verification-official-email', GOV_EMAIL);
          ui = await formUi(page);
          a.ok(ui.sendVisible, 'An official .gov email shows Send code');

          // 3. Submit before verifying is blocked and writes nothing.
          await page.click('#btn-submit-verification-request');
          await page.waitForTimeout(250);
          ui = await formUi(page);
          a.ok(ui.statusIsError && /verify the official email/i.test(ui.status), 'Submit before verifying is blocked: ' + ui.status);
          a.equal((await fsWrites(page)).length, 0, 'Nothing is written before the email is verified');

          // 4. Send code.
          await page.click('#btn-verification-send-email-code');
          await page.waitForTimeout(350);
          ui = await formUi(page);
          a.equal(w.sends.length, 1, 'Send code makes exactly one Worker request');
          a.ok(w.sends[0] && w.sends[0].to === GOV_EMAIL && w.sends[0].type === 'signup_code', 'The request carries the official email: ' + JSON.stringify(w.sends[0]));
          a.ok(!ui.statusIsError && ui.status === 'We sent a 6-digit code to ' + GOV_EMAIL + '.', 'Says We sent a 6-digit code only after the Worker said ok: ' + ui.status);
          a.ok(ui.codeSent && ui.codeBoxVisible, 'The code box appears after a real send');

          // 5. Resend.
          await page.click('#btn-verification-resend-email-code');
          await page.waitForTimeout(350);
          ui = await formUi(page);
          a.equal(w.sends.length, 2, 'Resend makes a second Worker request');
          a.ok(w.sends[1] && w.sends[1].to === GOV_EMAIL, 'Resend goes to the same email');
          a.ok(/we sent a 6-digit code/i.test(ui.status) && !ui.statusIsError, 'Resend confirms the new code: ' + ui.status);

          // 6. Wrong code.
          await page.fill('#verification-email-code', '000000');
          await page.click('#btn-verification-verify-email-code');
          await page.waitForTimeout(300);
          ui = await formUi(page);
          a.equal(w.verifies.length, 1, 'Verify makes one Worker request');
          a.ok(!ui.verified && !ui.verifiedBadge && ui.statusIsError && /not valid/i.test(ui.status), 'A wrong code stays unverified: ' + ui.status);

          // 7. Right code.
          await page.fill('#verification-email-code', GOOD_CODE);
          await page.click('#btn-verification-verify-email-code');
          await page.waitForTimeout(300);
          ui = await formUi(page);
          a.ok(ui.verified && ui.verifiedBadge && /official email verified/i.test(ui.status), 'The right code verifies and shows the Verified badge: ' + ui.status);
          a.ok(!ui.sendVisible && !ui.codeBoxVisible, 'Send code and the code box go away once verified');

          // 8. EIN (Organization).
          if (type === 'organization') await page.fill('#verification-org-ein', '12-3456789');
          await page.fill('#verification-notes', 'Staff directory lists @' + u);

          // 9. Submit.
          await page.click('#btn-submit-verification-request');
          await page.waitForTimeout(500);
          ui = await formUi(page);
          a.ok(!ui.statusIsError && ui.status === PENDING, 'Submit shows Pending review: ' + ui.status);
          a.equal(ui.banner, PENDING, 'The pending banner is shown');
          a.ok(ui.userStatus === 'pending' && ui.userType === type, 'The account is pending ' + type);
          const writes = await fsWrites(page);
          const req = writes.find((x) => x.path === 'verificationRequests/' + u);
          const usr = writes.filter((x) => x.path === 'users/' + u && x.data && x.data.verificationStatus).pop();
          a.ok(req, 'verificationRequests/' + u + ' is written: ' + writes.map((x) => x.path).join(', '));
          a.ok(req.data.status === 'pending' && req.data.type === type && req.data.entityName === T.name && req.data.email === GOV_EMAIL && req.data.emailVerified === true && req.data.needsManualReview === false,
            'The request document has the right fields: ' + JSON.stringify(req.data));
          a.ok(usr && usr.data.verificationStatus === 'pending' && usr.data.verificationType === type, 'users/' + u + ' is marked pending ' + type);
          a.ok(!JSON.stringify(writes).includes(GOOD_CODE), 'The email code is never stored');
          if (type === 'organization') {
            a.equal(ein.calls.length, 1, 'The EIN is checked once with the Worker');
            a.ok(req.data.organizationEinSubmitted === true && req.data.organizationEinMatch === true, 'The EIN result is stored as a yes/no only');
            a.ok(!/123456789|12-3456789/.test(JSON.stringify(writes)), 'The EIN itself is never written to Firestore');
            a.equal(await page.inputValue('#verification-org-ein'), '', 'The EIN is cleared from the form');
          }

          // 10. Close.
          await page.click('#btn-close-verification-request');
          await page.waitForTimeout(200);
          a.ok(!(await formUi(page)).modalOpen, 'The X closes the form');
        });
      } finally {
        await w.restore();
        if (ein) await ein.restore();
        await cleanup(page, h);
      }
    }
  };
}

function sendFailTest(type) {
  const label = type === 'government' ? 'Government' : 'Organization';
  return {
    name: label + ' Send code and Resend by taps: 403 email taken, 500, rate limit, bad gateway and offline show a red error, never We sent, and a retry that works then sends',
    accounts: ['personal'],
    covers: ['el:#btn-verification-send-email-code', 'el:#btn-verification-resend-email-code', 'el:#verification-form-status', 'handler:sendVerificationEmailCode'],
    async run({ page, h, a }) {
      await resetVerification(page, { plus: true });
      const w = await routeEmailWorker(page);
      try {
        for (const mode of ['http403', 'http500', 'http429', 'badJson', 'network']) {
          // Send code.
          await page.evaluate((t) => openVerificationRequestModal(t), type);
          await page.evaluate(() => { window._verificationEmailState = null; });
          await page.fill('#verification-entity-name', TYPES[type].name);
          await page.fill('#verification-official-email', GOV_EMAIL);
          w.setSend(mode);
          const before = w.sends.length;
          await page.click('#btn-verification-send-email-code');
          await page.waitForTimeout(350);
          let ui = await formUi(page);
          a.equal(w.sends.length, before + 1, mode + ': Send code tried once');
          a.ok(ui.statusIsError && ui.status && !nf.SUCCESS_WORDS.test(ui.status), mode + ': Send code shows a red error, got "' + ui.status + '"');
          a.ok(!ui.codeSent && !ui.codeBoxVisible, mode + ': no code box after a failed send');
          const btn = await page.evaluate(() => { const b = document.getElementById('btn-verification-send-email-code'); return { disabled: b.disabled, text: b.textContent.trim() }; });
          a.ok(!btn.disabled && btn.text === 'Send code', mode + ': Send code is usable again after the failure: ' + JSON.stringify(btn));

          // Resend after a good first send.
          w.setSend({ status: 200, body: { ok: true } });
          await page.click('#btn-verification-send-email-code');
          await page.waitForTimeout(350);
          a.ok((await formUi(page)).codeBoxVisible, mode + ': a good send shows the code box');
          w.setSend(mode);
          const b2 = w.sends.length;
          await page.click('#btn-verification-resend-email-code');
          await page.waitForTimeout(350);
          ui = await formUi(page);
          a.equal(w.sends.length, b2 + 1, mode + ': Resend tried once');
          a.ok(ui.statusIsError && !/we sent/i.test(ui.status), mode + ': a failed Resend replaces We sent with a red error, got "' + ui.status + '"');
          const rs = await page.evaluate(() => document.getElementById('btn-verification-resend-email-code').disabled);
          a.ok(!rs, mode + ': Resend is usable again after the failure');
        }
      } finally {
        await w.restore();
        await cleanup(page, h);
      }
    }
  };
}

module.exports = {
  name: 'Government and Organization requests end to end',
  tests: [
    e2eTest('government'),
    e2eTest('organization'),
    sendFailTest('government'),
    sendFailTest('organization'),
    {
      name: 'Gov/Org Send code: while the send is in flight, Send code and Resend are disabled so a double tap cannot send twice',
      accounts: ['personal'],
      covers: ['el:#btn-verification-send-email-code', 'el:#btn-verification-resend-email-code'],
      async run({ page, h, a }) {
        await resetVerification(page, { plus: true });
        const w = await routeEmailWorker(page);
        try {
          await page.evaluate(() => openVerificationRequestModal('government'));
          await page.fill('#verification-entity-name', 'City of Galloway');
          await page.fill('#verification-official-email', GOV_EMAIL);
          const release = w.hold();
          await page.click('#btn-verification-send-email-code');
          await page.waitForTimeout(150);
          const mid = await page.evaluate(() => {
            const b = document.getElementById('btn-verification-send-email-code');
            const r = document.getElementById('btn-verification-resend-email-code');
            return { disabled: b.disabled, text: b.textContent.trim(), resendDisabled: r.disabled, status: (document.getElementById('verification-form-status').textContent || '').trim() };
          });
          await page.evaluate(() => document.getElementById('btn-verification-send-email-code').click());
          release();
          await page.waitForTimeout(400);
          a.ok(mid.disabled && mid.text === 'Sending...' && mid.resendDisabled, 'In flight: Send code says Sending... and both buttons are disabled: ' + JSON.stringify(mid));
          a.ok(!/we sent/i.test(mid.status), 'Nothing says We sent while the request is still in flight');
          a.equal(w.sends.length, 1, 'A second tap during the send does not send again');
          a.ok(/we sent/i.test((await formUi(page)).status), 'After the Worker answers ok, it says We sent');
        } finally {
          await w.restore();
          await cleanup(page, h);
        }
      }
    },
    {
      name: 'Gov/Org form validation by taps: missing name, no contact, non-.gov email, bad website, bad code length, email changed after verifying, and a bad EIN are all blocked with nothing written',
      accounts: ['personal', 'business'],
      covers: ['el:#verification-entity-name', 'el:#verification-official-email', 'el:#verification-website-url', 'el:#verification-org-ein', 'el:#btn-submit-verification-request', 'el:#btn-verification-verify-email-code', 'el:#btn-verification-type-government', 'el:#btn-verification-type-organization', 'handler:setVerificationRequestType', 'handler:submitVerificationRequest'],
      async run({ page, h, a }) {
        await resetVerification(page, { plus: true });
        const w = await routeEmailWorker(page);
        const ein = await nf.routeWorker(page, '/business-verification/ein-check', { status: 200, body: { ok: true, einCheck: { checked: true, match: true } } });
        try {
          await withMockFs(page, {}, async () => {
            const submit = async () => { await page.click('#btn-submit-verification-request'); await page.waitForTimeout(250); return formUi(page); };
            await page.evaluate(() => openVerificationRequestModal('government'));
            // Type tabs switch and show/hide the EIN field.
            await page.click('#btn-verification-type-organization');
            let ui = await formUi(page);
            a.ok(ui.orgSelected && ui.einVisible, 'Organization tab selects Organization and shows EIN');
            await page.click('#btn-verification-type-government');
            ui = await formUi(page);
            a.ok(ui.govSelected && !ui.einVisible, 'Government tab selects Government and hides EIN');

            ui = await submit();
            a.ok(ui.statusIsError && /entity or agency name/i.test(ui.status), 'Missing name is blocked: ' + ui.status);
            await page.fill('#verification-entity-name', 'City of Galloway');
            ui = await submit();
            a.ok(ui.statusIsError && /email or a public website/i.test(ui.status), 'No email and no website is blocked: ' + ui.status);
            await page.fill('#verification-official-email', 'clerk@gmail.com');
            ui = await submit();
            a.ok(ui.statusIsError && /\.gov or \.mil/i.test(ui.status), 'A non-.gov email is blocked: ' + ui.status);
            await page.evaluate(() => sendVerificationEmailCode());
            await page.waitForTimeout(150);
            ui = await formUi(page);
            a.equal(w.sends.length, 0, 'Send code never calls the Worker for a non-.gov email');
            a.ok(ui.statusIsError && /official \.gov or \.mil/i.test(ui.status), 'Send code for a non-.gov email explains why: ' + ui.status);
            await page.fill('#verification-official-email', '');
            await page.fill('#verification-website-url', 'not a website');
            ui = await submit();
            a.ok(ui.statusIsError && /public http\(s\) website/i.test(ui.status), 'A bad website URL is blocked: ' + ui.status);
            await page.fill('#verification-website-url', '');

            // Bad code length never calls the Worker.
            await page.fill('#verification-official-email', GOV_EMAIL);
            await page.click('#btn-verification-send-email-code');
            await page.waitForTimeout(300);
            await page.fill('#verification-email-code', '12345');
            await page.click('#btn-verification-verify-email-code');
            await page.waitForTimeout(200);
            ui = await formUi(page);
            a.equal(w.verifies.length, 0, 'A 5-digit code never calls the Worker');
            a.ok(ui.statusIsError && /6-digit code/i.test(ui.status) && !ui.verified, 'A 5-digit code asks for 6 digits: ' + ui.status);

            // Verify, then change the email: must verify again.
            await page.fill('#verification-email-code', GOOD_CODE);
            await page.click('#btn-verification-verify-email-code');
            await page.waitForTimeout(300);
            a.ok((await formUi(page)).verifiedBadge, 'Verified badge after the right code');
            await page.fill('#verification-official-email', 'mayor@city.galloway.gov');
            ui = await formUi(page);
            a.ok(!ui.verifiedBadge && ui.sendVisible, 'Changing the email removes Verified and offers Send code again');
            ui = await submit();
            a.ok(ui.statusIsError && /verify the official email/i.test(ui.status), 'A changed, unverified email is blocked: ' + ui.status);

            // Organization: bad EIN format is blocked before any lookup.
            await page.click('#btn-verification-type-organization');
            await page.fill('#verification-official-email', '');
            await page.fill('#verification-website-url', 'https://www.harborcivicleague.org/staff');
            await page.fill('#verification-org-ein', '12-34');
            ui = await submit();
            a.ok(ui.statusIsError && /XX-XXXXXXX/.test(ui.status), 'A bad EIN is blocked: ' + ui.status);
            a.equal(ein.calls.length, 0, 'A bad EIN is never sent to the Worker');
            a.ok(!ui.userStatus, 'The account is not marked pending after any blocked submit');
            a.equal((await fsWrites(page)).length, 0, 'No Firestore write from any blocked submit');
          });
        } finally {
          await w.restore();
          await ein.restore();
          await cleanup(page, h);
        }
      }
    },
    {
      name: 'Gov/Org without Plus: the Government and Organization tabs open the paywall, and Submit opens the paywall instead of writing',
      accounts: ['personal', 'business'],
      covers: ['el:#btn-edit-account-government', 'el:#btn-edit-account-organization', 'el:#modal-verification-paywall', 'el:#btn-close-verification-paywall', 'handler:openVerificationPaywall', 'handler:closeVerificationPaywall'],
      async run({ page, h, a }) {
        try {
          await withMockFs(page, {}, async () => {
            for (const type of ['government', 'organization']) {
              await resetVerification(page, {});
              await openFromEditProfile(page, h, type, false);
              let ui = await formUi(page);
              a.ok(ui.paywallOpen && !ui.modalOpen, type + ' tab without Plus opens the paywall, not the form');
              await page.click('#btn-close-verification-paywall');
              await page.waitForTimeout(150);
              a.ok(!(await formUi(page)).paywallOpen, 'The paywall X closes it');
              const out = await page.evaluate(() => submitVerificationRequest());
              ui = await formUi(page);
              a.ok(out === false && ui.paywallOpen && !ui.userStatus, 'Submit without Plus opens the paywall and does not mark pending');
              a.equal((await fsWrites(page)).length, 0, 'Nothing is written without Plus');
            }
          });
        } finally {
          await cleanup(page, h);
        }
      }
    },
    {
      name: 'Gov/Org request form: tapping the dark backdrop closes it, tapping inside the card does not',
      accounts: ['personal'],
      covers: ['el:#modal-verification-request'],
      async run({ page, h, a }) {
        await resetVerification(page, { plus: true });
        try {
          await page.evaluate(() => openVerificationRequestModal('government'));
          await page.click('#verification-entity-name');
          a.ok((await formUi(page)).modalOpen, 'A tap inside keeps the form open');
          await page.mouse.click(4, 4);
          await page.waitForTimeout(200);
          a.ok(!(await formUi(page)).modalOpen, 'A tap on the backdrop closes the form');
        } finally {
          await cleanup(page, h);
        }
      }
    },
    {
      name: 'Gov/Org with an approval already on file: Submit says it is already approved and writes nothing',
      accounts: ['personal'],
      covers: ['el:#btn-submit-verification-request', 'handler:submitVerificationRequest'],
      async run({ page, h, a }) {
        await resetVerification(page, { plus: true });
        try {
          await withMockFs(page, {}, async () => {
            await page.evaluate(() => openVerificationRequestModal('government'));
            await page.evaluate(() => {
              state.currentUser.verificationType = 'government';
              state.currentUser.verificationStatus = 'approved';
              state.currentUser.verificationApprovedAt = Date.now();
              state.currentUser.verificationBaseAccountType = 'personal';
            });
            await page.click('#btn-submit-verification-request');
            await page.waitForTimeout(250);
            const ui = await formUi(page);
            a.ok(/already approved|still on file/i.test(ui.status), 'Says the approval is on file: ' + ui.status);
            a.ok(!/pending review/i.test(ui.status), 'Does not say Pending review');
            a.equal((await fsWrites(page)).filter((x) => /^verificationRequests\//.test(x.path)).length, 0, 'No new request is written');
          });
        } finally {
          await cleanup(page, h);
        }
      }
    },
    {
      name: 'Organization Submit with an official email: when the Firestore write fails, the app must not say Pending review',
      accounts: ['business'],
      covers: ['el:#btn-submit-verification-request', 'handler:submitVerificationRequest'],
      knownBug: 'BUG-3 Gov/Org "Submit request" shows "Pending review, usually approved within 24 hours." even when the verificationRequests write fails (writeVerificationDocs swallows the error), so the request never reaches the admin list',
      async run({ page, h, a }) {
        await resetVerification(page, { plus: true });
        const w = await routeEmailWorker(page);
        try {
          await withMockFs(page, {}, async () => {
            await applyPlus(page, true);
            await page.evaluate(() => openVerificationRequestModal('organization'));
            await page.fill('#verification-entity-name', 'Harbor Civic League');
            await page.fill('#verification-official-email', GOV_EMAIL);
            await page.click('#btn-verification-send-email-code');
            await page.waitForTimeout(300);
            await page.fill('#verification-email-code', GOOD_CODE);
            await page.click('#btn-verification-verify-email-code');
            await page.waitForTimeout(300);
            const pre = await formUi(page);
            if (!(pre.modalOpen && pre.verified)) throw new Error('PRECONDITION (not the bug): the form did not open or the email did not verify: ' + JSON.stringify(pre));
            if (await page.evaluate(() => verificationApprovalOnFile(state.currentUser))) throw new Error('PRECONDITION (not the bug): an approval from an earlier test is still on file');
            await page.evaluate(() => { window.__pfs.failWrites = true; });
            await page.click('#btn-submit-verification-request');
            await page.waitForTimeout(500);
            const ui = await formUi(page);
            a.equal((await fsWrites(page)).length, 0, 'The mock rejected every write');
            if (!/pending review/i.test(ui.status) && !ui.statusIsError) throw new Error('PRECONDITION (not the bug): submit ended with an unexpected message: "' + ui.status + '"');
            a.ok(!/pending review/i.test(ui.status) && ui.userStatus !== 'pending', 'Must not say Pending review or mark the account pending when nothing was saved, got "' + ui.status + '" / ' + ui.userStatus);
            a.ok(ui.statusIsError, 'A failed save shows a red error');
          });
        } finally {
          await w.restore();
          await cleanup(page, h);
        }
      }
    },
    {
      name: 'Gov/Org Submit when Firebase is not connected: the app must not say Pending review for a request that only exists on this device',
      accounts: ['personal'],
      covers: ['el:#btn-submit-verification-request', 'handler:submitVerificationRequest'],
      knownBug: 'BUG-6 Gov/Org "Submit request" shows "Pending review, usually approved within 24 hours." when Firebase is not connected (writeVerificationDocs returns written:true, local:true), so the request is only saved in this browser and never reaches the admin list',
      async run({ page, h, a }) {
        await resetVerification(page, { plus: true });
        try {
          const ready = await page.evaluate(() => { const r = window.firebaseReady; window.__keepFbReady = r; window.firebaseReady = false; return r; });
          await page.evaluate(() => openVerificationRequestModal('government'));
          await page.fill('#verification-entity-name', 'City of Galloway');
          await page.fill('#verification-website-url', 'https://city.galloway.gov/staff');
          await page.click('#btn-submit-verification-request');
          await page.waitForTimeout(400);
          const ui = await formUi(page);
          await page.evaluate((r) => { window.firebaseReady = r; }, ready);
          a.ok(!/pending review/i.test(ui.status), 'Must not say Pending review when the request could not be sent, got "' + ui.status + '"');
        } finally {
          await cleanup(page, h);
        }
      }
    }
  ]
};
