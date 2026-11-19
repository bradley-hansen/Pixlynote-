'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

function coversAll() {
  return [
    'el:#signup-business-fields',
    'el:#signup-dba-note',
    'el:#signup-dba-name',
    'el:#signup-business-industry',
    'el:#signup-business-industry-other',
    'el:#signup-business-industry-other-wrap',
    'el:#signup-website-group',
    'el:#signup-link',
    'el:#lbl-signup-username',
    'el:#edit-profile-business-info-banner',
    'el:#btn-edit-complete-business-info',
    'el:#btn-dismiss-business-info-banner',
    'el:#edit-profile-business-fields',
    'el:#edit-profile-dba-name',
    'el:#edit-profile-business-industry',
    'el:#edit-profile-business-industry-other',
    'el:#edit-profile-business-industry-other-wrap',
    'el:#edit-profile-business-street',
    'el:#edit-profile-business-city',
    'el:#edit-profile-business-state',
    'el:#edit-profile-business-postal',
    'el:#edit-profile-address-visibility',
    'el:#edit-profile-business-hours',
    'el:#edit-profile-support-email',
    'el:#edit-profile-support-email-error',
    'el:#profile-contact',
    'el:#profile-contact-website',
    'el:#profile-contact-hours',
    'el:#profile-contact-address',
    'el:#profile-contact-support',
    'el:#btn-profile-complete-business-info',
    'el:#user-profile-contact',
    'el:#user-profile-contact-website',
    'el:#user-profile-contact-hours',
    'el:#user-profile-contact-address',
    'el:#user-profile-contact-support',
    'el:#verification-org-ein-wrap',
    'el:#verification-org-ein',
    'el:#business-verification-status-panel',
    'el:#business-verification-status-label',
    'el:#business-verification-status-note',
    'el:#btn-open-business-verification',
    'el:#modal-business-verification',
    'el:#btn-close-business-verification',
    'el:#business-verification-form',
    'el:#business-verification-form-banner',
    'el:#bizver-legal-name',
    'el:#bizver-dba-name',
    'el:#bizver-entity-type',
    'el:#bizver-country',
    'el:#lbl-bizver-tax-id',
    'el:#bizver-tax-id',
    'el:#bizver-tax-hint',
    'el:#bizver-registration-number',
    'el:#bizver-file-articles',
    'el:#bizver-file-tax-letter',
    'el:#bizver-file-address-proof',
    'el:#bizver-file-photo-id',
    'el:#bizver-domain-email',
    'el:#btn-bizver-send-email-code',
    'el:#bizver-email-code-wrap',
    'el:#bizver-email-code',
    'el:#btn-bizver-verify-email-code',
    'el:#btn-bizver-resend-email-code',
    'el:#bizver-email-status',
    'el:#bizver-trademark',
    'el:#bizver-rep-name',
    'el:#bizver-rep-title',
    'el:#business-verification-form-status',
    'el:#btn-submit-business-verification',
    'el:#drawer-business-verification-admin',
    'el:#business-verification-admin-count',
    'el:#btn-refresh-business-verifications',
    'el:#business-verification-admin-token-wrap',
    'el:#business-verification-admin-token',
    'el:#drawer-business-verification-list',
    'el:#business-plus-verification-gate',
    'el:#btn-subscription-open-business-verification',
    'handler:normalizeWebsiteUrl',
    'handler:isValidSupportEmail',
    'handler:publicProfileDisplayName',
    'handler:normalizeBusinessIndustry',
    'handler:visibleBusinessAddress',
    'handler:normalizeBusinessVerificationStatus',
    'handler:businessVerificationStatusLabel',
    'handler:businessVerificationAllowsCheckout',
    'handler:isBusinessInfoIncomplete',
    'handler:stripSensitiveVerificationFields',
    'handler:publicSafeUserFields',
    'handler:syncBusinessIndustryOther',
    'handler:paintProfileContact',
    'handler:paintBusinessVerificationStatusUi',
    'handler:openBusinessVerificationModal',
    'handler:closeBusinessVerificationModal',
    'handler:submitBusinessVerificationApplication',
    'handler:sendBusinessVerificationEmailCode',
    'handler:verifyBusinessVerificationEmailCode',
    'handler:syncBizVerTaxLabel',
    'handler:refreshBusinessVerificationAdmin',
    'handler:decideBusinessVerification',
    'handler:promptBusinessVerificationMoreInfo',
    'handler:promptBusinessVerificationReject',
    'handler:openCompleteBusinessInfo',
    'handler:isValidUsEin',
    'handler:updateBusinessPlusCheckoutGate',
    'handler:interceptBusinessPlusCheckout',
    'handler:maybeMarkBusinessVerificationLegacyExempt',
    'handler:checkOrganizationEinAndStrip',
    'handler:isBusinessPlusShown',
    'listener:#btn-edit-complete-business-info:click',
    'listener:#btn-dismiss-business-info-banner:click',
    'listener:#btn-profile-complete-business-info:click',
    'listener:#btn-open-business-verification:click',
    'listener:#btn-submit-business-verification:click',
    'listener:#btn-subscription-open-business-verification:click',
    'handler:compressVerificationImage',
    'handler:prepareVerificationUpload',
    'handler:isVerificationPdf',
    'handler:isVerificationImage'
  ];
}

module.exports = {
  name: 'Business info and Business verification',
  tests: [
    {
      name: 'Everything for business info and verification exists',
      accounts: ALL_ACCOUNT_KEYS,
      covers: coversAll(),
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate((ids) => {
          const missing = ids.filter((id) => !document.getElementById(id));
          const handlers = [
            'normalizeWebsiteUrl', 'isValidSupportEmail', 'publicProfileDisplayName', 'normalizeBusinessIndustry',
            'visibleBusinessAddress', 'normalizeBusinessVerificationStatus', 'businessVerificationStatusLabel',
            'businessVerificationAllowsCheckout', 'isBusinessInfoIncomplete', 'stripSensitiveVerificationFields',
            'publicSafeUserFields', 'syncBusinessIndustryOther', 'paintProfileContact', 'paintBusinessVerificationStatusUi',
            'openBusinessVerificationModal', 'closeBusinessVerificationModal', 'submitBusinessVerificationApplication',
            'sendBusinessVerificationEmailCode', 'verifyBusinessVerificationEmailCode', 'syncBizVerTaxLabel',
            'refreshBusinessVerificationAdmin', 'decideBusinessVerification', 'openCompleteBusinessInfo', 'isValidUsEin',
            'updateBusinessPlusCheckoutGate', 'interceptBusinessPlusCheckout', 'maybeMarkBusinessVerificationLegacyExempt',
            'checkOrganizationEinAndStrip', 'isBusinessPlusShown', 'compressVerificationImage', 'prepareVerificationUpload'
          ];
          const missingFns = handlers.filter((n) => typeof window[n] !== 'function' && typeof eval('typeof ' + n) !== 'function');
          const industry = Array.from(document.querySelectorAll('#signup-business-industry option, #edit-profile-business-industry option'))
            .map((o) => o.value).filter(Boolean);
          const unique = Array.from(new Set(industry));
          return { missing, missingFns, unique };
        }, coversAll().filter((c) => c.startsWith('el:#')).map((c) => c.slice(4)));
        a.equal(r.missing.join(','), '', 'All required elements exist (missing: ' + r.missing.join(', ') + ')');
        a.equal(r.missingFns.join(','), '', 'All required handlers exist (missing: ' + r.missingFns.join(', ') + ')');
        const expected = ['software_tech', 'retail', 'local_restaurant', 'creator_media', 'services', 'other'];
        a.equal(r.unique.join(','), expected.join(','), 'Industry dropdowns use exactly the six buckets');
      }
    },
    {
      name: 'normalizeWebsiteUrl prepends https and blocks javascript/data and other non-http schemes',
      accounts: ['business'],
      covers: ['handler:normalizeWebsiteUrl'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const n = window.normalizeWebsiteUrl;
          return {
            empty: n(''),
            bare: n('example.com/shop'),
            https: n('https://brand.test/a'),
            js: n('javascript:alert(1)'),
            jsWs: n('  javascript:alert(1)'),
            data: n('data:text/html,hi'),
            file: n('file:///etc/passwd'),
            vbs: n('vbscript:msgbox(1)'),
            blob: n('blob:https://example.com/1'),
            protoRel: n('javascript:alert(1)//example.com'),
          };
        });
        a.ok(r.empty.ok && r.empty.empty, 'Blank URL is allowed and empty');
        a.ok(r.bare.ok && r.bare.href === 'https://example.com/shop', 'Bare host is normalized to https://');
        a.ok(r.https.ok && r.https.href.indexOf('https://brand.test/a') === 0, 'Existing https is kept');
        a.ok(!r.js.ok && r.js.error === 'blocked_scheme' && !r.js.href, 'javascript: is blocked');
        a.ok(!r.jsWs.ok && !r.jsWs.href, 'Leading-space javascript: is blocked');
        a.ok(!r.data.ok && !r.data.href, 'data: is blocked');
        a.ok(!r.file.ok && !r.file.href, 'file: is blocked');
        a.ok(!r.vbs.ok && !r.vbs.href, 'vbscript: is blocked');
        a.ok(!r.blob.ok && !r.blob.href, 'blob: is blocked');
      }
    },
    {
      name: 'Address visibility, hours, and support email follow the public rules',
      accounts: ['business'],
      covers: ['handler:visibleBusinessAddress', 'handler:isValidSupportEmail', 'handler:paintProfileContact', 'el:#profile-contact', 'el:#profile-contact-website'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const user = {
            link: 'javascript:alert(1)',
            businessStreet: '123 Main St',
            businessCity: 'Galloway',
            businessState: 'NJ',
            businessPostal: '08205',
            businessAddressVisibility: 'city_state',
            businessHours: 'Mon–Fri 9am–5pm EST',
            businessSupportEmail: 'support@brand.test'
          };
          const city = visibleBusinessAddress(user);
          user.businessAddressVisibility = 'full';
          const full = visibleBusinessAddress(user);
          user.businessAddressVisibility = 'hidden';
          const hidden = visibleBusinessAddress(user);
          const badEmail = isValidSupportEmail('not-an-email');
          const goodEmail = isValidSupportEmail('support@brand.test');
          user.businessAddressVisibility = 'city_state';
          user.link = 'brand.test';
          paintProfileContact('profile', user);
          const wrap = document.getElementById('profile-contact');
          const web = document.getElementById('profile-contact-website');
          const hours = document.getElementById('profile-contact-hours');
          const addr = document.getElementById('profile-contact-address');
          const sup = document.getElementById('profile-contact-support');
          return {
            city, full, hidden,
            badEmail: badEmail.ok,
            goodEmail: goodEmail.ok && goodEmail.value,
            contactVisible: !!(wrap && !wrap.classList.contains('hidden')),
            href: web ? web.getAttribute('href') : '',
            rel: web ? web.getAttribute('rel') : '',
            target: web ? web.getAttribute('target') : '',
            hours: hours ? hours.textContent : '',
            addr: addr ? addr.textContent : '',
            support: sup ? sup.textContent : ''
          };
        });
        a.equal(r.city, 'Galloway, NJ', 'Default visibility is city and state only');
        a.ok(r.full.indexOf('123 Main St') !== -1 && r.full.indexOf('Galloway') !== -1, 'Full address includes the street');
        a.equal(r.hidden, '', 'Hidden visibility shows nothing');
        a.ok(!r.badEmail, 'Invalid support email is rejected');
        a.equal(r.goodEmail, 'support@brand.test', 'Valid support email is accepted');
        a.ok(r.contactVisible, 'Contact section is shown when fields exist');
        a.ok(r.href.indexOf('https://brand.test') === 0, 'Contact website is https');
        a.ok(/noopener/.test(r.rel) && /nofollow/.test(r.rel), 'Website uses rel=noopener nofollow');
        a.equal(r.target, '_blank', 'Website opens in a new tab');
        a.ok(/Mon/.test(r.hours), 'Hours appear below the bio in Contact');
        a.equal(r.addr, 'Galloway, NJ', 'Contact address respects visibility');
        a.equal(r.support, 'support@brand.test', 'Support email is shown publicly');
      }
    },
    {
      name: 'Status labels, checkout gate, and green-check rules including legacy Plus',
      accounts: ['business'],
      covers: ['handler:businessVerificationStatusLabel', 'handler:businessVerificationAllowsCheckout', 'handler:isBusinessPlusShown', 'handler:updateBusinessPlusCheckoutGate', 'el:#business-plus-verification-gate', 'el:#btn-subscription-open-business-verification'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const labels = ['', 'pending', 'more_info', 'approved', 'rejected'].map((s) => businessVerificationStatusLabel(s));
          const checkout = {
            none: businessVerificationAllowsCheckout({}),
            pending: businessVerificationAllowsCheckout({ businessVerificationStatus: 'pending' }),
            approved: businessVerificationAllowsCheckout({ businessVerificationStatus: 'approved' }),
            more: businessVerificationAllowsCheckout({ businessVerificationStatus: 'more_info' }),
            rejected: businessVerificationAllowsCheckout({ businessVerificationStatus: 'rejected' })
          };
          const u = (state.currentUser.username || 'reg_business');
          function shown(fields) {
            state.currentUser = Object.assign({}, state.currentUser, {
              username: u,
              accountType: 'business',
              isBusinessPlus: false,
              businessVerificationStatus: '',
              businessVerificationLegacyExempt: false
            }, fields);
            return isBusinessPlusShown(state.currentUser);
          }
          const checks = {
            plusApproved: shown({ isBusinessPlus: true, businessVerificationStatus: 'approved' }),
            plusPendingNew: shown({ isBusinessPlus: true, businessVerificationStatus: 'pending', businessVerificationLegacyExempt: false }),
            plusPendingLegacy: shown({ isBusinessPlus: true, businessVerificationStatus: 'pending', businessVerificationLegacyExempt: true }),
            plusNone: shown({ isBusinessPlus: true, businessVerificationStatus: '' }),
            plusRejected: shown({ isBusinessPlus: true, businessVerificationStatus: 'rejected' }),
            approvedNoPlus: shown({ isBusinessPlus: false, businessVerificationStatus: 'approved' })
          };
          state.currentUser.isBusinessPlus = false;
          state.currentUser.businessVerificationStatus = '';
          if (typeof openSubscriptionModal === 'function') openSubscriptionModal();
          if (typeof updateBusinessPlusCheckoutGate === 'function') updateBusinessPlusCheckoutGate();
          const gate = document.getElementById('business-plus-verification-gate');
          const buy = document.getElementById('pixly-stripe-business-buy-btn');
          const gateOpen = !!(gate && !gate.classList.contains('hidden') && gate.style.display !== 'none');
          if (buy) buy.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
          const app = document.getElementById('modal-business-verification');
          const appOpen = !!(app && !app.classList.contains('hidden') && app.style.display !== 'none');
          if (typeof closeBusinessVerificationModal === 'function') closeBusinessVerificationModal();
          if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
          return { labels, checkout, checks, gateOpen, appOpen };
        });
        a.equal(r.labels.join('|'), 'Not Submitted|Pending Review|More Info Needed|Approved / Verified|Rejected', 'Status labels match the five states');
        a.ok(!r.checkout.none && !r.checkout.rejected, 'Not submitted and rejected cannot check out');
        a.ok(r.checkout.pending && r.checkout.approved && r.checkout.more, 'Pending, approved, and more-info can check out');
        a.ok(r.checks.plusApproved, 'Approved + Business Plus shows the green check');
        a.ok(!r.checks.plusPendingNew, 'A new pending application does not show the check until approved');
        a.ok(r.checks.plusPendingLegacy, 'Legacy Business Plus keeps the check while the new application is pending');
        a.ok(r.checks.plusNone, 'Existing Business Plus with no application keeps the check');
        a.ok(!r.checks.plusRejected, 'A rejected application hides the check even if Plus is still on');
        a.ok(!r.checks.approvedNoPlus, 'Approval without Business Plus does not show the check');
        a.ok(r.gateOpen, 'Subscription modal shows the verification gate before checkout');
        a.ok(r.appOpen, 'Tapping Business Plus without an application opens the form first');
      }
    },
    {
      name: 'Sensitive verification fields never appear in Firestore writes or leftover public state',
      accounts: ['business'],
      covers: ['handler:stripSensitiveVerificationFields', 'handler:publicSafeUserFields', 'handler:submitBusinessVerificationApplication', 'el:#btn-submit-business-verification'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          const dirty = {
            username: 'reg_business',
            fullName: 'Brand',
            ein: '12-3456789',
            taxId: '12-3456789',
            legalBusinessName: 'Brand LLC',
            authorizedRepName: 'Jane Doe',
            registrationNumber: 'SR-1',
            photoId: 'secret',
            businessIndustry: 'retail',
            businessVerificationStatus: 'pending'
          };
          const safe = publicSafeUserFields(dirty);
          const keys = Object.keys(safe);
          const sensitiveHit = (window.SENSITIVE_VERIFICATION_FIELDS || []).filter((k) => k in safe && safe[k]);
          window.__pixlyUserDocWrites = [];
          state.currentUser = Object.assign({}, state.currentUser, { accountType: 'business', username: 'reg_business', isBusinessPlus: false });
          if (typeof openBusinessVerificationModal === 'function') openBusinessVerificationModal();
          document.getElementById('bizver-legal-name').value = 'Brand LLC';
          document.getElementById('bizver-dba-name').value = 'Brand';
          document.getElementById('bizver-entity-type').value = 'llc';
          document.getElementById('bizver-country').value = 'US';
          document.getElementById('bizver-tax-id').value = '12-3456789';
          document.getElementById('bizver-registration-number').value = 'SR-99';
          document.getElementById('bizver-rep-name').value = 'Jane Doe';
          document.getElementById('bizver-rep-title').value = 'Owner';
          const bin = new Uint8Array([37, 80, 68, 70, 45, 49]); // %PDF-1
          const file = new File([bin], 'articles.pdf', { type: 'application/pdf' });
          const idFile = new File([bin], 'id.png', { type: 'image/png' });
          const dt1 = new DataTransfer(); dt1.items.add(file);
          const dt2 = new DataTransfer(); dt2.items.add(idFile);
          document.getElementById('bizver-file-articles').files = dt1.files;
          document.getElementById('bizver-file-photo-id').files = dt2.files;
          const ok = await submitBusinessVerificationApplication();
          const leftover = {
            tax: (document.getElementById('bizver-tax-id') || {}).value || '',
            legal: (document.getElementById('bizver-legal-name') || {}).value || '',
            rep: (document.getElementById('bizver-rep-name') || {}).value || '',
            userEin: state.currentUser.ein || state.currentUser.taxId || state.currentUser.legalBusinessName || ''
          };
          const writes = (window.__pixlyUserDocWrites || []).map((w) => w.data);
          const badWrite = writes.some((d) => (window.SENSITIVE_VERIFICATION_FIELDS || []).some((k) => d && d[k]));
          return {
            ok, keys, sensitiveHit, leftover,
            status: state.currentUser.businessVerificationStatus,
            badWrite,
            writeSample: writes[writes.length - 1] || null
          };
        });
        a.equal(r.sensitiveHit.join(','), '', 'publicSafeUserFields drops tax IDs, legal names, and IDs');
        a.ok(r.ok, 'Mock worker accepts the application submit');
        a.equal(r.status, 'pending', 'Only the public pending status is stored on the user');
        a.equal(r.leftover.tax, '', 'Tax ID is cleared from the form after submit');
        a.equal(r.leftover.legal, '', 'Legal name is cleared from the form after submit');
        a.equal(r.leftover.rep, '', 'Representative name is cleared from the form after submit');
        a.equal(r.leftover.userEin, '', 'Sensitive fields are not left on currentUser');
        a.ok(!r.badWrite, 'No Firestore/user-doc write includes sensitive fields');
      }
    },
    {
      name: 'Edit Profile business fields, complete-info prompt, and Other industry input',
      accounts: ['business'],
      covers: ['el:#edit-profile-business-fields', 'el:#btn-edit-complete-business-info', 'el:#btn-profile-complete-business-info', 'el:#edit-profile-business-industry', 'listener:#btn-edit-complete-business-info:click', 'listener:#btn-dismiss-business-info-banner:click', 'listener:#btn-profile-complete-business-info:click'],
      async run(ctx) {
        const { page, a, h } = ctx;
        const before = await page.evaluate(() => {
          if (state.currentUser) {
            state.currentUser.accountType = 'business';
            state.currentUser.businessIndustry = '';
            try { localStorage.removeItem('pixly_biz_info_prompt_dismissed_' + String(state.currentUser.username || '').toLowerCase()); } catch (e) {}
          }
          if (typeof renderProfile === 'function') renderProfile();
          const link = document.getElementById('btn-profile-complete-business-info');
          return { linkShown: !!(link && !link.classList.contains('hidden')) };
        });
        a.ok(before.linkShown, 'Own profile links to Complete your business info when industry is missing');
        await h.openEditProfile(page);
        const form = await page.evaluate(() => {
          if (typeof applyEditProfileCategoryFields === 'function') applyEditProfileCategoryFields('business');
          const fields = document.getElementById('edit-profile-business-fields');
          const banner = document.getElementById('edit-profile-business-info-banner');
          const label = (document.getElementById('lbl-edit-profile-name') || {}).textContent || '';
          const industry = document.getElementById('edit-profile-business-industry');
          if (industry) industry.value = 'other';
          if (typeof syncBusinessIndustryOther === 'function') syncBusinessIndustryOther('edit');
          const otherWrap = document.getElementById('edit-profile-business-industry-other-wrap');
          return {
            fieldsShown: !!(fields && !fields.classList.contains('hidden')),
            bannerShown: !!(banner && !banner.classList.contains('hidden')),
            label,
            otherShown: !!(otherWrap && !otherWrap.classList.contains('hidden'))
          };
        });
        a.ok(form.fieldsShown, 'Edit Profile shows the business-only fields');
        a.ok(form.bannerShown, 'A dismissible complete-info banner is shown when industry is missing');
        a.equal(form.label, 'Display Name', 'Business Edit Profile reuses the name field as Display Name');
        a.ok(form.otherShown, 'Choosing Other reveals the optional short text input');
        await page.evaluate(() => {
          const btn = document.getElementById('btn-dismiss-business-info-banner');
          if (btn) btn.click();
        });
        const dismissed = await page.evaluate(() => {
          const banner = document.getElementById('edit-profile-business-info-banner');
          return !banner || banner.classList.contains('hidden');
        });
        a.ok(dismissed, 'The complete-info banner can be dismissed');
        await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
      }

    },
    {
      name: 'Verification image uploads are compressed to about 1.5 MB and 2000px; PDFs are unchanged',
      accounts: ['business'],
      covers: ['handler:compressVerificationImage', 'handler:prepareVerificationUpload', 'handler:isVerificationPdf', 'handler:isVerificationImage'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          const maxBytes = window.VERIFICATION_IMAGE_MAX_BYTES || Math.round(1.5 * 1024 * 1024);
          const maxEdge = window.VERIFICATION_IMAGE_MAX_EDGE || 2000;
          const pdfBytes = new Uint8Array(40 * 1024);
          pdfBytes[0] = 0x25; pdfBytes[1] = 0x50; pdfBytes[2] = 0x44; pdfBytes[3] = 0x46; pdfBytes[4] = 0x2d; pdfBytes[5] = 0x31;
          const pdf = new File([pdfBytes], 'articles.pdf', { type: 'application/pdf' });
          const pdfOut = await compressVerificationImage(pdf);
          const canvas = document.createElement('canvas');
          canvas.width = 3000;
          canvas.height = 2400;
          const ctx = canvas.getContext('2d');
          const img = ctx.createImageData(canvas.width, canvas.height);
          const data = img.data;
          for (let i = 0; i < data.length; i += 4) {
            const n = ((i * 1103515245) + 12345) >>> 0;
            data[i] = n & 255;
            data[i + 1] = (n >>> 8) & 255;
            data[i + 2] = (n >>> 16) & 255;
            data[i + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
          const pngBlob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
          const bigPng = new File([pngBlob], 'id-photo.png', { type: 'image/png' });
          const out = await compressVerificationImage(bigPng);
          const outUrl = URL.createObjectURL(out);
          const dims = await new Promise(function (resolve, reject) {
            const im = new Image();
            im.onload = function () { resolve({ w: im.naturalWidth, h: im.naturalHeight }); };
            im.onerror = function () { reject(new Error('out_decode_failed')); };
            im.src = outUrl;
          }).catch(function () { return { w: 0, h: 0 }; });
          try { URL.revokeObjectURL(outUrl); } catch (e) {}
          return {
            isPdf: isVerificationPdf(pdf) === true,
            isImg: isVerificationImage(bigPng) === true,
            pdfUnchangedType: pdfOut && pdfOut.type === 'application/pdf',
            pdfUnchangedSize: pdfOut && pdfOut.size === pdf.size,
            pdfUnchangedName: pdfOut && pdfOut.name === 'articles.pdf',
            originalSize: bigPng.size,
            outSize: out && out.size,
            outType: out && out.type,
            outName: out && out.name,
            w: dims.w,
            h: dims.h,
            maxBytes: maxBytes,
            maxEdge: maxEdge
          };
        });
        a.ok(r.isPdf && r.isImg, 'PDF and image helpers classify file types correctly');
        a.ok(r.pdfUnchangedType && r.pdfUnchangedSize && r.pdfUnchangedName, 'PDFs are left unchanged');
        a.ok(r.originalSize > r.maxBytes, 'The test photo starts larger than 1.5 MB (got ' + r.originalSize + ')');
        a.ok(r.outSize > 0 && r.outSize <= r.maxBytes + 32 * 1024, 'Compressed image is at or under about 1.5 MB (got ' + r.outSize + ')');
        a.ok(r.w > 0 && r.h > 0 && Math.max(r.w, r.h) <= r.maxEdge, 'Long edge is at most 2000px (got ' + r.w + 'x' + r.h + ')');
        a.ok(r.w >= 640 && r.h >= 500, 'The photo stays large enough to remain legible');
        a.ok(/image\/(jpeg|png)/.test(r.outType || ''), 'Compressed output is a regular image type');
      }
    }
  ]
};
