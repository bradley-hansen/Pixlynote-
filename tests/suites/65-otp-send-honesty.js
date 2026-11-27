'use strict';

const { VERIFY_CODE } = require('../helpers/harness');

function govOrgCase(kind, email) {
  const label = kind === 'organization' ? 'Organization' : 'Government';
  return {
    name: label + ' request email-code Send, Resend, and Verify: success, email_taken, rate limit, and network failure never show success on failure',
    accounts: ['personal'],
    covers: kind === 'government' ? [
      'el:#btn-verification-send-email-code',
      'el:#btn-verification-resend-email-code',
      'el:#btn-verification-verify-email-code',
      'el:#verification-official-email',
      'el:#verification-email-code',
      'el:#verification-email-code-wrap',
      'handler:sendVerificationEmailCode',
      'handler:verifyVerificationEmailCode'
    ] : ['el:#btn-verification-type-organization'],
    async run(ctx) {
      const { page, a } = ctx;
      const r = await page.evaluate(async ({ kind, email }) => {
        function statusText() {
          return ((document.getElementById('verification-form-status') || {}).textContent || '').trim();
        }
        function snapshot() {
          const wrap = document.getElementById('verification-email-code-wrap');
          const panel = document.getElementById('verification-email-verify-panel');
          const st = window._verificationEmailState || null;
          const hidden = !wrap || wrap.classList.contains('hidden');
          return {
            status: statusText(),
            wrapHidden: hidden,
            wrapShown: !hidden,
            panelShown: !!(panel && !panel.classList.contains('hidden')),
            codeSent: !!(st && st.codeSent),
            verified: !!(st && st.verified),
            email: (st && st.email) || '',
            isError: (function () {
              const el = document.getElementById('verification-form-status');
              return !!(el && /\btext-rose-700\b/.test(el.className));
            })(),
            isSuccess: (function () {
              const el = document.getElementById('verification-form-status');
              return !!(el && /\btext-emerald-700\b/.test(el.className));
            })()
          };
        }
        function looksLikeSendSuccess(s) {
          return /we sent a 6-digit code/i.test(s.status) || (s.codeSent && s.isSuccess && /sent/i.test(s.status));
        }
        function looksLikeVerifySuccess(s) {
          return s.verified || /official email verified/i.test(s.status);
        }
        async function clickAndWait(id, prev) {
          const btn = document.getElementById(id);
          if (!btn) throw new Error('missing ' + id);
          btn.click();
          for (let i = 0; i < 40; i++) {
            if (window.__govOrgEmailCalls && window.__govOrgEmailCalls.length > prev) {
              await new Promise(function (r) { setTimeout(r, 20); });
              return;
            }
            await new Promise(function (r) { setTimeout(r, 25); });
          }
          throw new Error(id + ' did not call the worker path');
        }

        if (state.currentUser) {
          state.currentUser.isPlus = true;
          state.currentUser.isVerified = true;
          state.currentUser.subscriptionStatus = 'active';
          state.currentUser.verificationStatus = '';
          state.currentUser.verificationType = '';
        }
        window._verificationEmailState = null;
        if (typeof openVerificationRequestModal === 'function') openVerificationRequestModal(kind);
        const emailInp = document.getElementById('verification-official-email');
        if (emailInp) {
          emailInp.value = email;
          emailInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof syncVerificationEmailUi === 'function') syncVerificationEmailUi();

        const modal = document.getElementById('modal-verification-request');
        const modalOpen = !!(modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none');
        const typeBtn = document.getElementById(kind === 'organization' ? 'btn-verification-type-organization' : 'btn-verification-type-government');
        const typeSelected = !!(typeBtn && /\bfont-bold\b/.test(typeBtn.className));
        const resendOnclick = ((document.getElementById('btn-verification-resend-email-code') || {}).getAttribute('onclick') || '');
        const sendOnclick = ((document.getElementById('btn-verification-send-email-code') || {}).getAttribute('onclick') || '');

        const orig = window.postSignupVerify;
        const calls = (window.__govOrgEmailCalls = []);
        function install(handler) {
          window.postSignupVerify = async function (path, payload) {
            calls.push({ path: path, payload: payload || {} });
            return handler(path, payload || {});
          };
        }

        install(async function () { throw new Error('network down'); });
        await sendVerificationEmailCode();
        const sendNetwork = snapshot();

        install(async function () {
          return { ok: false, status: 409, data: { sent: false, error: 'email_taken', message: 'This email is already on an account' } };
        });
        await sendVerificationEmailCode();
        const sendTaken = snapshot();

        install(async function () {
          return { ok: false, status: 429, data: { error: 'rate_limited', retry_after: 30 } };
        });
        await sendVerificationEmailCode();
        const sendRate = snapshot();

        install(async function (path) {
          if (path === '/email') return { ok: true, status: 200, data: { ok: true, sent: true, type: 'signup_code' } };
          return { ok: true, status: 200, data: { valid: false } };
        });
        await sendVerificationEmailCode();
        const sendOk = snapshot();
        const sendCall = calls.filter((c) => c.path === '/email').pop();

        // Resend via the Resend button
        let n = calls.length;
        install(async function (path) {
          if (path === '/email') return { ok: true, status: 200, data: { ok: true, sent: true, type: 'signup_code' } };
          return { ok: true, status: 200, data: { valid: false } };
        });
        await clickAndWait('btn-verification-resend-email-code', n);
        const resendOk = snapshot();
        const resendCall = calls.filter((c) => c.path === '/email').pop();

        n = calls.length;
        install(async function () {
          return { ok: false, status: 409, data: { sent: false, error: 'email_taken', message: 'This email is already on an account' } };
        });
        await clickAndWait('btn-verification-resend-email-code', n);
        const resendTaken = snapshot();

        n = calls.length;
        install(async function () {
          return { ok: false, status: 429, data: { error: 'rate_limited', retry_after: 30 } };
        });
        await clickAndWait('btn-verification-resend-email-code', n);
        const resendRate = snapshot();

        n = calls.length;
        install(async function () { throw new Error('network down'); });
        await clickAndWait('btn-verification-resend-email-code', n);
        const resendNetwork = snapshot();

        // Restore a sent state, then verify paths
        install(async function (path) {
          if (path === '/email') return { ok: true, status: 200, data: { ok: true, sent: true, type: 'signup_code' } };
          return { ok: true, status: 200, data: { valid: false } };
        });
        await sendVerificationEmailCode();
        const codeInp = document.getElementById('verification-email-code');
        if (codeInp) codeInp.value = '000000';
        install(async function (path) {
          if (path === '/email/signup-verify') return { ok: true, status: 200, data: { valid: false, error: 'wrong_code' } };
          return { ok: true, status: 200, data: { ok: true, sent: true } };
        });
        await verifyVerificationEmailCode();
        const verifyBad = snapshot();

        if (codeInp) codeInp.value = '123456';
        install(async function () { throw new Error('network down'); });
        await verifyVerificationEmailCode();
        const verifyNetwork = snapshot();

        install(async function (path) {
          if (path === '/email/signup-verify') return { ok: false, status: 429, data: { error: 'rate_limited' } };
          return { ok: true, status: 200, data: { ok: true, sent: true } };
        });
        await verifyVerificationEmailCode();
        const verifyRate = snapshot();

        install(async function (path) {
          if (path === '/email/signup-verify') return { ok: true, status: 200, data: { valid: true } };
          return { ok: true, status: 200, data: { ok: true, sent: true } };
        });
        await verifyVerificationEmailCode();
        const verifyOk = snapshot();

        window.postSignupVerify = orig;
        if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal();
        return {
          kind, email, modalOpen, typeSelected, sendOnclick, resendOnclick,
          sendNetwork, sendTaken, sendRate, sendOk, sendCall,
          resendOk, resendTaken, resendRate, resendNetwork, resendCall,
          verifyBad, verifyNetwork, verifyRate, verifyOk,
          flags: {
            sendNetworkSuccess: looksLikeSendSuccess(sendNetwork),
            sendTakenSuccess: looksLikeSendSuccess(sendTaken),
            sendRateSuccess: looksLikeSendSuccess(sendRate),
            resendTakenSuccess: looksLikeSendSuccess(resendTaken),
            resendRateSuccess: looksLikeSendSuccess(resendRate),
            resendNetworkSuccess: looksLikeSendSuccess(resendNetwork),
            verifyBadSuccess: looksLikeVerifySuccess(verifyBad),
            verifyNetworkSuccess: looksLikeVerifySuccess(verifyNetwork),
            verifyRateSuccess: looksLikeVerifySuccess(verifyRate)
          }
        };
      }, { kind, email });

      a.ok(r.modalOpen && r.typeSelected, label + ' request modal opens with the correct type selected');
      a.ok(/sendVerificationEmailCode\s*\(/.test(r.sendOnclick), label + ' Send code is wired to sendVerificationEmailCode');
      a.ok(/sendVerificationEmailCode\s*\(/.test(r.resendOnclick), label + ' Resend is wired to the same send path');

      a.ok(/could not send the verification code/i.test(r.sendNetwork.status), label + ' Send network failure is honest: ' + r.sendNetwork.status);
      a.ok(!r.flags.sendNetworkSuccess && r.sendNetwork.wrapHidden && !r.sendNetwork.codeSent && r.sendNetwork.isError, label + ' Send network failure does not show success or reveal the code input');

      a.ok(/already on an account/i.test(r.sendTaken.status), label + ' Send email_taken is honest: ' + r.sendTaken.status);
      a.ok(!r.flags.sendTakenSuccess && r.sendTaken.wrapHidden && !r.sendTaken.codeSent && r.sendTaken.isError, label + ' Send email_taken does not show success or reveal the code input');

      a.ok(/too many attempts|try again later/i.test(r.sendRate.status), label + ' Send rate limit is honest: ' + r.sendRate.status);
      a.ok(!r.flags.sendRateSuccess && r.sendRate.wrapHidden && !r.sendRate.codeSent && r.sendRate.isError, label + ' Send rate limit does not show success or reveal the code input');

      a.ok(r.sendOk.status === 'We sent a 6-digit code to ' + email + '.', label + ' Send success shows the sent message: ' + r.sendOk.status);
      a.ok(r.sendOk.wrapShown && r.sendOk.codeSent && r.sendOk.isSuccess && !r.sendOk.verified, label + ' Send success reveals the code input');
      a.ok(r.sendCall && r.sendCall.payload.type === 'signup_code' && r.sendCall.payload.to === email, label + ' Send posts signup_code to the official email');

      a.ok(r.resendOk.status === 'We sent a 6-digit code to ' + email + '.', label + ' Resend success shows the sent message: ' + r.resendOk.status);
      a.ok(r.resendOk.wrapShown && r.resendOk.codeSent && r.resendCall && r.resendCall.payload.to === email, label + ' Resend success uses the same send path');

      a.ok(/already on an account/i.test(r.resendTaken.status) && !r.flags.resendTakenSuccess, label + ' Resend email_taken does not show success: ' + r.resendTaken.status);
      a.ok(/too many attempts|try again later/i.test(r.resendRate.status) && !r.flags.resendRateSuccess, label + ' Resend rate limit does not show success: ' + r.resendRate.status);
      a.ok(/could not send the verification code/i.test(r.resendNetwork.status) && !r.flags.resendNetworkSuccess, label + ' Resend network failure does not show success: ' + r.resendNetwork.status);

      a.ok(/not valid|try again or resend/i.test(r.verifyBad.status) && !r.flags.verifyBadSuccess, label + ' Verify wrong code is honest: ' + r.verifyBad.status);
      a.ok(/could not verify the code/i.test(r.verifyNetwork.status) && !r.flags.verifyNetworkSuccess, label + ' Verify network failure does not show verified: ' + r.verifyNetwork.status);
      a.ok(!r.flags.verifyRateSuccess && !r.verifyRate.verified, label + ' Verify rate limit does not show verified: ' + r.verifyRate.status);
      a.ok(r.verifyOk.status === 'Official email verified.' && r.verifyOk.verified && r.verifyOk.isSuccess, label + ' Verify success still works: ' + r.verifyOk.status);
    }
  };
}

module.exports = {
  name: 'OTP send-code honesty audit',
  tests: [
    govOrgCase('government', 'clerk@city.galloway.gov'),
    govOrgCase('organization', 'director@nps.gov'),
    {
      name: 'Sign-up email and phone Resend plus worker failure paths stay honest',
      accounts: ['signed-out'],
      covers: ['handler:sendSignupEmailCode', 'handler:sendSignupPhoneCode', 'handler:verifySignupEmailCode', 'handler:verifySignupPhoneCode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openSignupForm(page);
        const email = 'free.audit.' + Date.now() + '@example.test';
        await page.fill('#login-email', email);
        await page.evaluate(() => {
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
        });
        await page.waitForTimeout(80);
        const emailR = await page.evaluate(async () => {
          function snap() {
            const st = document.getElementById('signup-email-verify-status');
            const wrap = document.getElementById('signup-email-code-wrap');
            const v = (state && state.signupVerify) || {};
            return {
              status: st ? (st.textContent || '').trim() : '',
              wrapShown: !!(wrap && !wrap.classList.contains('hidden')),
              codeSent: !!v.emailCodeSent,
              verified: !!v.emailVerified
            };
          }
          const orig = window.__otpOrigFetch || window.fetch.bind(window);
          window.__otpOrigFetch = orig;
          const calls = (window.__otpFetchCalls = []);
          function install(routeFn) {
            window.fetch = async function (url, opts) {
              const u = String(url || '');
              const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
              if (/\/email(?:\/|\?|$)|\/sms\//.test(u)) {
                let payload = null;
                try { payload = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
                calls.push({ path: path, payload: payload });
                const r = await routeFn(path, payload);
                if (r && r.throw) throw new Error(r.throw);
                if (r) return new Response(JSON.stringify(r.body || {}), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
              }
              return orig(url, opts);
            };
          }
          async function clickWait(id, prev) {
            document.getElementById(id).click();
            for (let i = 0; i < 40; i++) {
              if (calls.length > prev) { await new Promise((r) => setTimeout(r, 20)); return; }
              await new Promise((r) => setTimeout(r, 25));
            }
            throw new Error(id + ' did not call the worker');
          }
          let n = calls.length;
          install(async function () { return { throw: 'network down' }; });
          await clickWait('btn-signup-send-email-code', n);
          const network = snap();
          n = calls.length;
          install(async function () { return { status: 409, body: { error: 'email_taken' } }; });
          await clickWait('btn-signup-send-email-code', n);
          const taken = snap();
          n = calls.length;
          install(async function () { return { status: 429, body: { error: 'rate_limited' } }; });
          await clickWait('btn-signup-send-email-code', n);
          const rate = snap();
          n = calls.length;
          install(async function (path) {
            if (path === '/email' || path.endsWith('/email')) return { status: 200, body: { ok: true, sent: true, type: 'signup_code' } };
            return { status: 200, body: { valid: true } };
          });
          await clickWait('btn-signup-send-email-code', n);
          const ok = snap();
          n = calls.length;
          await clickWait('btn-signup-resend-email-code', n);
          const resendOk = snap();
          n = calls.length;
          install(async function () { return { status: 409, body: { error: 'email_taken' } }; });
          await clickWait('btn-signup-resend-email-code', n);
          const resendTaken = snap();
          n = calls.length;
          install(async function (path) {
            if (/signup-verify/.test(path)) return { status: 200, body: { valid: false, error: 'wrong_code' } };
            return { status: 200, body: { ok: true, sent: true, type: 'signup_code' } };
          });
          await clickWait('btn-signup-resend-email-code', n);
          document.getElementById('signup-email-code').value = '000000';
          n = calls.length;
          await clickWait('btn-signup-verify-email-code', n);
          const verifyBad = snap();
          window.fetch = orig;
          return { network, taken, rate, ok, resendOk, resendTaken, verifyBad, resendCalls: resendOk.codeSent };
        });

        a.ok(/could not send the verification code/i.test(emailR.network.status) && !emailR.network.codeSent && !emailR.network.wrapShown, 'Sign-up email network failure is honest: ' + emailR.network.status);
        a.ok(/already on an account/i.test(emailR.taken.status) && !emailR.taken.codeSent, 'Sign-up email email_taken is honest: ' + emailR.taken.status);
        a.ok(/too many codes sent|too many attempts/i.test(emailR.rate.status) && !emailR.rate.codeSent, 'Sign-up email rate limit is honest: ' + emailR.rate.status);
        a.ok(/we sent a 6-digit code/i.test(emailR.ok.status) && emailR.ok.wrapShown, 'Sign-up email send success still works: ' + emailR.ok.status);
        a.ok(emailR.resendCalls && /we sent a 6-digit code/i.test(emailR.resendOk.status), 'Sign-up email Resend success works: ' + emailR.resendOk.status);
        a.ok(/already on an account/i.test(emailR.resendTaken.status) && !/we sent a 6-digit code/i.test(emailR.resendTaken.status), 'Sign-up email Resend email_taken does not show success: ' + emailR.resendTaken.status);
        a.ok(/incorrect 6-digit code|not valid/i.test(emailR.verifyBad.status) && !emailR.verifyBad.verified, 'Sign-up email verify failure is honest: ' + emailR.verifyBad.status);

        await page.fill('#signup-phone', '2025550109');
        await page.evaluate(() => {
          document.getElementById('signup-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
        });
        await page.waitForTimeout(80);
        const phoneR = await page.evaluate(async () => {
          function snap() {
            const st = document.getElementById('signup-phone-verify-status');
            const wrap = document.getElementById('signup-phone-code-wrap');
            const v = (state && state.signupVerify) || {};
            return {
              status: st ? (st.textContent || '').trim() : '',
              wrapShown: !!(wrap && !wrap.classList.contains('hidden')),
              codeSent: !!v.phoneCodeSent,
              verified: !!v.phoneVerified
            };
          }
          const orig = window.__otpOrigFetch || window.fetch.bind(window);
          window.__otpOrigFetch = orig;
          const calls = (window.__otpFetchCalls = []);
          function install(routeFn) {
            window.fetch = async function (url, opts) {
              const u = String(url || '');
              const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
              if (/\/email(?:\/|\?|$)|\/sms\//.test(u)) {
                let payload = null;
                try { payload = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
                calls.push({ path: path, payload: payload });
                const r = await routeFn(path, payload);
                if (r && r.throw) throw new Error(r.throw);
                if (r) return new Response(JSON.stringify(r.body || {}), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
              }
              return orig(url, opts);
            };
          }
          async function clickWait(id, prev) {
            document.getElementById(id).click();
            for (let i = 0; i < 40; i++) {
              if (calls.length > prev) { await new Promise((r) => setTimeout(r, 20)); return; }
              await new Promise((r) => setTimeout(r, 25));
            }
            throw new Error(id + ' did not call the worker');
          }
          let n = calls.length;
          install(async function () { return { throw: 'network down' }; });
          await clickWait('btn-signup-send-phone-code', n);
          const network = snap();
          n = calls.length;
          install(async function () { return { status: 429, body: { error: 'rate_limited' } }; });
          await clickWait('btn-signup-send-phone-code', n);
          const rate = snap();
          n = calls.length;
          install(async function (path) {
            if (/\/sms\/send/.test(path)) return { status: 200, body: { ok: true } };
            if (/\/sms\/check/.test(path)) return { status: 200, body: { valid: false, error: 'wrong_code' } };
            return { status: 200, body: {} };
          });
          await clickWait('btn-signup-send-phone-code', n);
          const ok = snap();
          n = calls.length;
          await clickWait('btn-signup-resend-phone-code', n);
          const resendOk = snap();
          document.getElementById('signup-phone-code').value = '000000';
          n = calls.length;
          await clickWait('btn-signup-verify-phone-code', n);
          const verifyBad = snap();
          window.fetch = orig;
          return { network, rate, ok, resendOk, verifyBad, resendCalls: resendOk.codeSent };
        });
        a.ok(/could not verify that code|could not send|try again/i.test(phoneR.network.status) && !phoneR.network.codeSent, 'Sign-up phone network failure is honest: ' + phoneR.network.status);
        a.ok(/too many attempts|too many codes/i.test(phoneR.rate.status) && !phoneR.rate.codeSent, 'Sign-up phone rate limit is honest: ' + phoneR.rate.status);
        a.ok(phoneR.ok.wrapShown && phoneR.ok.codeSent, 'Sign-up phone send success still works: ' + phoneR.ok.status);
        a.ok(phoneR.resendCalls && phoneR.resendOk.codeSent, 'Sign-up phone Resend calls the send path');
        a.ok(/incorrect|not valid|try again/i.test(phoneR.verifyBad.status) && !phoneR.verifyBad.verified, 'Sign-up phone verify failure is honest: ' + phoneR.verifyBad.status);
      }
    },
    {
      name: 'Edit Profile email and phone Resend plus worker email_taken and rate limit stay honest',
      accounts: ['personal'],
      covers: ['handler:sendEditEmailCode', 'handler:sendEditPhoneCode', 'el:#btn-edit-resend-email-code', 'el:#btn-edit-resend-phone-code'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.loginAs(page, account);
        await h.openEditProfile(page);
        const newEmail = 'audit.' + account.username + '@example.test';
        await page.fill('#edit-profile-email', newEmail);
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof scheduleEditContactCheck === 'function') scheduleEditContactCheck();
        });
        await page.waitForTimeout(200);
        const emailR = await page.evaluate(async () => {
          function snap() {
            const st = document.getElementById('edit-profile-email-verify-status');
            const err = document.getElementById('edit-profile-email-error');
            const wrap = document.getElementById('edit-profile-email-code-wrap');
            const v = (state && state.editProfileVerify) || {};
            return {
              status: ((st && st.textContent) || '') + ' ' + ((err && err.textContent) || ''),
              wrapShown: !!(wrap && !wrap.classList.contains('hidden')),
              codeSent: !!v.emailCodeSent,
              verified: !!v.emailVerified
            };
          }
          const orig = window.__otpOrigFetch || window.fetch.bind(window);
          window.__otpOrigFetch = orig;
          const calls = (window.__otpFetchCalls = []);
          function install(routeFn) {
            window.fetch = async function (url, opts) {
              const u = String(url || '');
              const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
              if (/\/email(?:\/|\?|$)|\/sms\//.test(u)) {
                let payload = null;
                try { payload = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
                calls.push({ path: path, payload: payload });
                const r = await routeFn(path, payload);
                if (r && r.throw) throw new Error(r.throw);
                if (r) return new Response(JSON.stringify(r.body || {}), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
              }
              return orig(url, opts);
            };
          }
          if (state.editProfileVerify) state.editProfileVerify.emailTaken = false;
          install(async function () { return { status: 409, body: { error: 'email_taken' } }; });
          await window.sendEditEmailCode();
          const taken = snap();
          if (state.editProfileVerify) state.editProfileVerify.emailTaken = false;
          install(async function () { return { status: 429, body: { error: 'rate_limited' } }; });
          await window.sendEditEmailCode();
          const rate = snap();
          if (state.editProfileVerify) state.editProfileVerify.emailTaken = false;
          install(async function () { return { throw: 'network down' }; });
          await window.sendEditEmailCode();
          const network = snap();
          install(async function (path) {
            if (/signup-verify/.test(path)) return { status: 200, body: { valid: true } };
            return { status: 200, body: { ok: true, sent: true } };
          });
          await window.sendEditEmailCode();
          const ok = snap();
          const n = calls.length;
          document.getElementById('btn-edit-resend-email-code').click();
          for (let i = 0; i < 40 && calls.length === n; i++) await new Promise((r) => setTimeout(r, 25));
          const resendOk = snap();
          window.fetch = orig;
          return { taken, rate, network, ok, resendOk, resendCalls: calls.length > n };
        });
        a.ok(/already taken/i.test(emailR.taken.status) && !emailR.taken.codeSent && !/we sent a 6-digit code/i.test(emailR.taken.status), 'Edit email email_taken is honest: ' + emailR.taken.status);
        a.ok(/too many codes sent|try again later/i.test(emailR.rate.status) && !emailR.rate.codeSent, 'Edit email rate limit is honest: ' + emailR.rate.status);
        a.ok(/could not send the verification code/i.test(emailR.network.status) && !emailR.network.codeSent, 'Edit email network failure is honest: ' + emailR.network.status);
        a.ok(/we sent a 6-digit code/i.test(emailR.ok.status) && emailR.ok.wrapShown, 'Edit email send success still works: ' + emailR.ok.status);
        a.ok(emailR.resendCalls && /we sent a 6-digit code/i.test(emailR.resendOk.status), 'Edit email Resend success works: ' + emailR.resendOk.status);

        await page.fill('#edit-profile-phone', '2025550188');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);
        const phoneR = await page.evaluate(async () => {
          function snap() {
            const st = document.getElementById('edit-profile-phone-verify-status');
            const err = document.getElementById('edit-profile-phone-error');
            const wrap = document.getElementById('edit-profile-phone-code-wrap');
            const v = (state && state.editProfileVerify) || {};
            return {
              status: ((st && st.textContent) || '') + ' ' + ((err && err.textContent) || ''),
              wrapShown: !!(wrap && !wrap.classList.contains('hidden')),
              codeSent: !!v.phoneCodeSent
            };
          }
          const orig = window.__otpOrigFetch || window.fetch.bind(window);
          window.__otpOrigFetch = orig;
          const calls = (window.__otpFetchCalls = []);
          function install(routeFn) {
            window.fetch = async function (url, opts) {
              const u = String(url || '');
              const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
              if (/\/email(?:\/|\?|$)|\/sms\//.test(u)) {
                let payload = null;
                try { payload = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
                calls.push({ path: path, payload: payload });
                const r = await routeFn(path, payload);
                if (r && r.throw) throw new Error(r.throw);
                if (r) return new Response(JSON.stringify(r.body || {}), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
              }
              return orig(url, opts);
            };
          }
          if (state.editProfileVerify) state.editProfileVerify.phoneTaken = false;
          install(async function () { return { status: 429, body: { error: 'rate_limited' } }; });
          await window.sendEditPhoneCode();
          const rate = snap();
          install(async function (path) {
            if (/\/sms\/send/.test(path)) return { status: 200, body: { ok: true } };
            return { status: 200, body: { valid: true } };
          });
          await window.sendEditPhoneCode();
          const ok = snap();
          const n = calls.length;
          document.getElementById('btn-edit-resend-phone-code').click();
          for (let i = 0; i < 40 && calls.length === n; i++) await new Promise((r) => setTimeout(r, 25));
          const resendOk = snap();
          window.fetch = orig;
          return { rate, ok, resendOk, resendCalls: calls.length > n };
        });
        a.ok(/too many codes sent|try again later/i.test(phoneR.rate.status) && !phoneR.rate.codeSent, 'Edit phone rate limit is honest: ' + phoneR.rate.status);
        a.ok(/we sent a 6-digit code/i.test(phoneR.ok.status) && phoneR.ok.wrapShown, 'Edit phone send success still works: ' + phoneR.ok.status);
        a.ok(phoneR.resendCalls && /we sent a 6-digit code/i.test(phoneR.resendOk.status), 'Edit phone Resend success works: ' + phoneR.resendOk.status);
      }
    },
    {
      name: 'Forgot password Send Reset Code stays honest on worker failure and does not advance',
      accounts: ['signed-out'],
      covers: ['el:#btn-forgot-send-code', 'el:#form-forgot-step-1', 'el:#form-forgot-step-2'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openLoginForm(page);
        await page.click('#btn-forgot-password');
        await page.waitForTimeout(120);
        const forgotOpen = await h.isVisible(page, '#modal-forgot-password');
        a.ok(forgotOpen, 'Forgot password modal can be opened');
        await page.fill('#forgot-identifier', h.ACCOUNTS.personal.email);
        const fail = await page.evaluate(async () => {
          const orig = window.fetch.bind(window);
          window.fetch = async function (url, opts) {
            const u = String(url || '');
            if (/\/email(?:\/|\?|$)/.test(u) && !/reset-verify|signup-verify/.test(u)) {
              return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
            }
            return orig(url, opts);
          };
          document.getElementById('btn-forgot-send-code').click();
          for (let i = 0; i < 40; i++) {
            const st = ((document.getElementById('forgot-step1-status') || {}).textContent || '').trim();
            if (st) break;
            await new Promise((r) => setTimeout(r, 25));
          }
          window.fetch = orig;
          const step1 = document.getElementById('form-forgot-step-1');
          const step2 = document.getElementById('form-forgot-step-2');
          return {
            status: ((document.getElementById('forgot-step1-status') || {}).textContent || '').trim(),
            step1Hidden: !!(step1 && step1.classList.contains('hidden')),
            step2Shown: !!(step2 && !step2.classList.contains('hidden'))
          };
        });
        a.ok(/could not send|too many emails|try again later/i.test(fail.status), 'Forgot send failure is honest: ' + fail.status);
        a.ok(!fail.step2Shown, 'Forgot send failure does not advance to the code step');
      }
    }
  ]
};
