'use strict';

module.exports = {
  name: 'Business verification send-code honesty',
  tests: [
    {
      name: 'Business verification Send code and Resend show Code sent only on worker success, and email_taken, rate limit, and network errors stay honest',
      accounts: ['business'],
      covers: [
        'el:#bizver-domain-email',
        'el:#btn-bizver-send-email-code',
        'el:#bizver-email-code-wrap',
        'el:#bizver-email-code',
        'el:#btn-bizver-verify-email-code',
        'el:#btn-bizver-resend-email-code',
        'el:#bizver-email-status',
        'handler:sendBusinessVerificationEmailCode',
        'handler:verifyBusinessVerificationEmailCode'
      ],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          function snapshotUi() {
            const status = document.getElementById('bizver-email-status');
            const wrap = document.getElementById('bizver-email-code-wrap');
            const resend = document.getElementById('btn-bizver-resend-email-code');
            const st = window._bizverEmailState || null;
            const hiddenByClass = !wrap || wrap.classList.contains('hidden');
            return {
              statusText: status ? (status.textContent || '').trim() : '',
              statusHidden: !status || status.classList.contains('hidden'),
              wrapHidden: hiddenByClass,
              wrapShown: !hiddenByClass,
              resendLabel: resend ? (resend.textContent || '').trim() : '',
              resendDisabled: !!(resend && resend.disabled),
              codeSent: !!(st && st.codeSent),
              verified: !!(st && st.verified),
              email: (st && st.email) || ''
            };
          }
          async function clickResendAndWait(prevCount) {
            const btn = document.getElementById('btn-bizver-resend-email-code');
            if (!btn) throw new Error('missing resend button');
            btn.click();
            for (let i = 0; i < 40; i++) {
              if (window.__bizverEmailCalls && window.__bizverEmailCalls.length > prevCount) {
                await new Promise(function (r) { setTimeout(r, 20); });
                return;
              }
              await new Promise(function (r) { setTimeout(r, 25); });
            }
            throw new Error('Resend did not call the send path');
          }

          if (typeof openBusinessVerificationModal === 'function') openBusinessVerificationModal();
          const emailInput = document.getElementById('bizver-domain-email');
          emailInput.value = 'support@pixlynote.com';
          window._bizverEmailState = null;

          const orig = window.postSignupVerify;
          const calls = (window.__bizverEmailCalls = []);
          function install(handler) {
            const fn = async function (path, payload) {
              calls.push({ path: path, payload: payload || {} });
              return handler(path, payload || {});
            };
            window.postSignupVerify = fn;
          }

          install(async function () { throw new Error('network down'); });
          await sendBusinessVerificationEmailCode();
          const afterNetwork = snapshotUi();

          install(async function () {
            return { ok: false, status: 409, data: { sent: false, error: 'email_taken', message: 'This email is already on an account' } };
          });
          await sendBusinessVerificationEmailCode();
          const afterTaken = snapshotUi();

          install(async function () {
            return { ok: false, status: 429, data: { error: 'rate_limited', retry_after: 30 } };
          });
          await sendBusinessVerificationEmailCode();
          const afterRate = snapshotUi();

          install(async function (path) {
            if (path === '/email') return { ok: true, status: 200, data: { ok: true, sent: true, type: 'signup_code' } };
            return { ok: true, status: 200, data: { valid: true } };
          });
          await sendBusinessVerificationEmailCode();
          const afterSuccess = snapshotUi();
          const successCall = calls.filter((c) => c.path === '/email').pop();
          const resendOnclick = ((document.getElementById('btn-bizver-resend-email-code') || {}).getAttribute('onclick') || '');

          // Resend success: click the Resend button next to Verify email
          let n = calls.length;
          install(async function (path) {
            if (path === '/email') return { ok: true, status: 200, data: { ok: true, sent: true, type: 'signup_code' } };
            return { ok: true, status: 200, data: { valid: true } };
          });
          await clickResendAndWait(n);
          const afterResendOk = snapshotUi();
          const resendOkCall = calls.filter((c) => c.path === '/email').pop();

          n = calls.length;
          install(async function () {
            return { ok: false, status: 409, data: { sent: false, error: 'email_taken', message: 'This email is already on an account' } };
          });
          await clickResendAndWait(n);
          const afterResendTaken = snapshotUi();

          n = calls.length;
          install(async function () {
            return { ok: false, status: 429, data: { error: 'rate_limited', retry_after: 30 } };
          });
          await clickResendAndWait(n);
          const afterResendRate = snapshotUi();

          n = calls.length;
          install(async function () { throw new Error('network down'); });
          await clickResendAndWait(n);
          const afterResendNetwork = snapshotUi();

          // Restore a successful send so Verify can run with the wrap visible
          install(async function (path) {
            if (path === '/email') return { ok: true, status: 200, data: { ok: true, sent: true, type: 'signup_code' } };
            return { ok: true, status: 200, data: { valid: true } };
          });
          await sendBusinessVerificationEmailCode();

          const codeInp = document.getElementById('bizver-email-code');
          if (codeInp) codeInp.value = '000000';
          install(async function (path) {
            if (path === '/email/signup-verify') return { ok: true, status: 200, data: { valid: false, error: 'wrong_code' } };
            return { ok: true, status: 200, data: { ok: true, sent: true, type: 'signup_code' } };
          });
          await verifyBusinessVerificationEmailCode();
          const afterBadCode = snapshotUi();

          if (codeInp) codeInp.value = '123456';
          install(async function () { throw new Error('network down'); });
          await verifyBusinessVerificationEmailCode();
          const afterVerifyNetwork = snapshotUi();

          install(async function (path) {
            if (path === '/email/signup-verify') return { ok: false, status: 500, data: { error: 'send_failed' } };
            return { ok: true, status: 200, data: { ok: true, sent: true } };
          });
          await verifyBusinessVerificationEmailCode();
          const afterVerifyFail = snapshotUi();

          install(async function (path) {
            if (path === '/email/signup-verify') return { ok: true, status: 200, data: { valid: true } };
            return { ok: true, status: 200, data: { ok: true, sent: true } };
          });
          await verifyBusinessVerificationEmailCode();
          const afterVerifyOk = snapshotUi();

          window.postSignupVerify = orig;
          return {
            afterNetwork, afterTaken, afterRate, afterSuccess,
            afterResendOk, afterResendTaken, afterResendRate, afterResendNetwork,
            afterBadCode, afterVerifyNetwork, afterVerifyFail, afterVerifyOk,
            resendOnclick,
            successCall: successCall && { path: successCall.path, type: successCall.payload.type, to: successCall.payload.to },
            resendOkCall: resendOkCall && { path: resendOkCall.path, type: resendOkCall.payload.type, to: resendOkCall.payload.to }
          };
        });

        a.ok(r.afterNetwork.statusText === "Couldn't send the code. Please try again.", 'Send network failure shows the retry message: ' + r.afterNetwork.statusText);
        a.ok(r.afterNetwork.wrapHidden, 'Send network failure does not reveal the code input');
        a.ok(!r.afterNetwork.codeSent, 'Send network failure does not mark the code as sent');

        a.ok(r.afterTaken.statusText === 'This email is already on another Pixlynote account.', 'Send email_taken shows the other-account message: ' + r.afterTaken.statusText);
        a.ok(r.afterTaken.wrapHidden, 'Send email_taken does not reveal the code input');
        a.ok(!r.afterTaken.codeSent, 'Send email_taken does not mark the code as sent');

        a.ok(r.afterRate.statusText === 'Too many codes sent. Please try again later.', 'Send rate_limited uses the existing send wording: ' + r.afterRate.statusText);
        a.ok(r.afterRate.wrapHidden, 'Send rate_limited does not reveal the code input');

        a.ok(r.afterSuccess.statusText === 'Code sent. Check your email.', 'Send success shows Code sent: ' + r.afterSuccess.statusText);
        a.ok(r.afterSuccess.wrapShown, 'Send success reveals the code input');
        a.ok(r.afterSuccess.codeSent, 'Send success marks the code as sent');
        a.ok(r.successCall && r.successCall.type === 'signup_code' && r.successCall.to === 'support@pixlynote.com', 'Success posts signup_code to the entered email');

        a.ok(/sendBusinessVerificationEmailCode\s*\(/.test(r.resendOnclick), 'Resend is wired to the same checked send path: ' + r.resendOnclick);
        a.ok(r.afterResendOk.statusText === 'Code sent. Check your email.', 'Resend success shows Code sent: ' + r.afterResendOk.statusText);
        a.ok(r.afterResendOk.wrapShown, 'Resend success keeps the code input visible');
        a.ok(r.afterResendOk.resendLabel === 'Resend', 'Resend label is restored after the request');
        a.ok(!r.afterResendOk.resendDisabled, 'Resend is enabled again after the request');
        a.ok(r.resendOkCall && r.resendOkCall.type === 'signup_code' && r.resendOkCall.to === 'support@pixlynote.com', 'Resend posts the same signup_code payload');

        a.ok(r.afterResendTaken.statusText === 'This email is already on another Pixlynote account.', 'Resend email_taken shows the other-account message: ' + r.afterResendTaken.statusText);
        a.ok(!/Code sent/i.test(r.afterResendTaken.statusText), 'Resend email_taken does not show Code sent');
        a.ok(r.afterResendRate.statusText === 'Too many codes sent. Please try again later.', 'Resend rate_limited uses the existing send wording: ' + r.afterResendRate.statusText);
        a.ok(r.afterResendNetwork.statusText === "Couldn't send the code. Please try again.", 'Resend network failure shows the retry message: ' + r.afterResendNetwork.statusText);

        a.ok(r.afterBadCode.statusText === 'That code was not valid.', 'Wrong code is reported honestly: ' + r.afterBadCode.statusText);
        a.ok(!r.afterBadCode.verified, 'Wrong code does not mark the email verified');
        a.ok(r.afterVerifyNetwork.statusText === 'Could not verify the code.', 'Verify network failure is not treated as a bad code: ' + r.afterVerifyNetwork.statusText);
        a.ok(!r.afterVerifyNetwork.verified, 'Verify network failure does not mark the email verified');
        a.ok(r.afterVerifyFail.statusText === 'Could not verify the code.', 'Verify server failure is reported honestly: ' + r.afterVerifyFail.statusText);
        a.ok(!r.afterVerifyFail.verified, 'Verify server failure does not mark the email verified');
        a.ok(r.afterVerifyOk.statusText === 'Email verified.', 'Valid code still verifies: ' + r.afterVerifyOk.statusText);
        a.ok(r.afterVerifyOk.verified, 'Valid code marks the email verified');
      }
    }
  ]
};
