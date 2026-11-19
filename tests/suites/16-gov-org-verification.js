'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const PAYWALL = 'An active Pixlynote Plus or Business Plus subscription is required before applying for Government or Organization verification';
const PENDING = 'Pending review, usually approved within 24 hours.';

function coversAll() {
  return [
    'el:#btn-ac-tab-verification',
    'el:#btn-edit-account-government',
    'el:#btn-edit-account-organization',
    'el:#btn-edit-request-verification',
    'el:#edit-gov-pending-pill',
    'el:#edit-org-pending-pill',
    'el:#edit-profile-category-tabs',
    'el:#modal-verification-paywall',
    'el:#verification-paywall-message',
    'el:#btn-verification-paywall-subscribe',
    'el:#btn-close-verification-paywall',
    'el:#modal-verification-request',
    'el:#btn-close-verification-request',
    'el:#btn-verification-type-government',
    'el:#btn-verification-type-organization',
    'el:#verification-entity-name',
    'el:#verification-official-email',
    'el:#btn-verification-send-email-code',
    'el:#verification-email-code',
    'el:#btn-verification-verify-email-code',
    'el:#btn-verification-resend-email-code',
    'el:#verification-website-url',
    'el:#verification-notes',
    'el:#btn-submit-verification-request',
    'el:#modal-verification-badges',
    'el:#btn-close-verification-badges',
    'el:#btn-gov-badge-slate',
    'el:#btn-gov-badge-navy',
    'el:#drawer-pixlynote-verifications',
    'el:#btn-refresh-verification-requests',
    'el:#verification-requests-count',
    'el:#drawer-verification-requests-list',
    'el:#verification-pending-banner',
    'el:#verification-form-status',
    'el:#verification-type-tabs',
    'el:#verification-email-verify-panel',
    'el:#verification-email-code-wrap',
    'el:#verification-email-verified-badge',
    'el:#verification-gov-color-toggle',
    'el:#verification-badges-preview',
    'handler:openVerificationAndBadges',
    'handler:openVerificationPaywall',
    'handler:closeVerificationPaywall',
    'handler:goToSubscriptionFromVerificationPaywall',
    'handler:openVerificationRequestModal',
    'handler:closeVerificationRequestModal',
    'handler:setVerificationRequestType',
    'handler:sendVerificationEmailCode',
    'handler:verifyVerificationEmailCode',
    'handler:submitVerificationRequest',
    'handler:closeVerificationBadgesModal',
    'handler:setGovernmentBadgeColor',
    'handler:refreshVerificationRequests',
    'handler:approveVerificationRequest',
    'handler:rejectVerificationRequest',
    'handler:handleEditProfileOfficialTab',
    'el:#modal-account-type-switch',
    'el:#account-type-switch-title',
    'el:#account-type-switch-copy',
    'el:#btn-account-type-switch-confirm',
    'el:#btn-account-type-switch-keep',
    'el:#btn-close-account-type-switch',
    'handler:openAccountTypeSwitchConfirm',
    'handler:closeAccountTypeSwitchConfirm',
    'handler:confirmAccountTypeSwitch',
    'handler:cancelStripeSubscriptionForAccount',
    'handler:restoreGovOrgVerificationIfEligible',
    'handler:syncGovOrgVerificationWithSubscription',
    'handler:userHasMatchingPlusSubscription',
    'listener:#btn-ac-tab-verification:click',
    'listener:#btn-edit-account-government:click',
    'listener:#btn-edit-account-organization:click',
    'el:#modal-post-author-badges',
    'el:#story-viewer-badges',
    'el:#dm-active-badges',
    'handler:authorStatusBadgesHtml',
    'handler:paintAuthorBadgeMount',
    'handler:lookupCreatorFlags',
    'handler:isViewedCreatorCheckmarkShown',
    'listener:#btn-edit-request-verification:click'
  ];
}

module.exports = {
  name: 'Government and Organization verification',
  tests: [
    {
      name: 'Edit Profile has four category tabs and the paywall appears without Plus',
      accounts: ALL_ACCOUNT_KEYS,
      covers: coversAll(),
      async run(ctx) {
        const { page, a, h, account } = ctx;
        await h.openEditProfile(page);
        const tabs = await page.evaluate(() => {
          const ids = ['btn-edit-account-personal', 'btn-edit-account-business', 'btn-edit-account-government', 'btn-edit-account-organization'];
          const present = ids.map((id) => !!document.getElementById(id));
          const labels = ids.map((id) => ((document.getElementById(id) || {}).innerText || '').replace(/\s+/g, ' ').trim());
          const link = document.getElementById('btn-edit-request-verification');
          return { present, labels, hasLink: !!(link && /Request verification/i.test(link.textContent || '')) };
        });
        a.ok(tabs.present.every(Boolean), 'Personal, Business, Government, and Organization tabs exist');
        a.ok(/Personal/i.test(tabs.labels[0]) && /Business/i.test(tabs.labels[1]), 'Personal and Business tabs are labeled');
        a.ok(/Government/i.test(tabs.labels[2]) && /Organization/i.test(tabs.labels[3]), 'Government and Organization tabs are labeled');
        a.ok(tabs.hasLink, 'Request verification → helper link is under Account Category');

        const wall = await page.evaluate(() => {
          if (state.currentUser) {
            state.currentUser.isPlus = false;
            state.currentUser.isBusinessPlus = false;
            state.currentUser.isVerified = false;
          }
          if (typeof handleEditProfileOfficialTab === 'function') handleEditProfileOfficialTab('government');
          const modal = document.getElementById('modal-verification-paywall');
          const msg = (document.getElementById('verification-paywall-message') || {}).textContent || '';
          const open = !!(modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none');
          return { open, msg };
        });
        a.ok(wall.open, 'Government tab without Plus opens the paywall');
        a.ok(wall.msg.trim() === PAYWALL, 'Paywall uses the required Plus subscription message');

        const fromLink = await page.evaluate(() => {
          if (typeof closeVerificationPaywall === 'function') closeVerificationPaywall();
          const btn = document.getElementById('btn-edit-request-verification');
          if (btn) btn.click();
          const modal = document.getElementById('modal-verification-paywall');
          return !!(modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none');
        });
        a.ok(fromLink, 'Request verification → also opens the paywall when Plus is off');

        const sub = await page.evaluate(() => {
          const btn = document.getElementById('btn-verification-paywall-subscribe');
          if (btn) btn.click();
          const pay = document.getElementById('modal-verification-paywall');
          const subModal = document.getElementById('modal-subscription');
          return {
            payClosed: !pay || pay.classList.contains('hidden') || getComputedStyle(pay).display === 'none',
            subOpen: !!(subModal && !subModal.classList.contains('hidden') && getComputedStyle(subModal).display !== 'none')
          };
        });
        a.ok(sub.payClosed && sub.subOpen, 'Paywall button goes straight to Subscription');
        await page.evaluate(() => { if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal(); if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
      }
    },
    {
      name: 'Account Center Verification & badges row uses the same eligibility gate',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-ac-tab-verification', 'listener:#btn-ac-tab-verification:click'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          if (state.currentUser) {
            state.currentUser.isPlus = false;
            state.currentUser.isBusinessPlus = false;
          }
          if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
          if (typeof setAccountCenterView === 'function') setAccountCenterView('yourAccount');
          const row = document.getElementById('btn-ac-tab-verification');
          const your = document.getElementById('ac-view-your-account');
          const visibleRow = !!(row && your && !your.classList.contains('hidden'));
          const label = (row && row.innerText) || '';
          if (row) row.click();
          const modal = document.getElementById('modal-verification-paywall');
          const open = !!(modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none');
          const msg = (document.getElementById('verification-paywall-message') || {}).textContent || '';
          return { visibleRow, label, open, msg };
        });
        a.ok(r.visibleRow && /Verification/i.test(r.label) && /badges/i.test(r.label), 'Your Account has a Verification & badges row');
        a.ok(r.open && r.msg.trim() === PAYWALL, 'The Account Center row opens the same paywall without Plus');
        await page.evaluate(() => { if (typeof closeVerificationPaywall === 'function') closeVerificationPaywall(); });
      }
    },
    {
      name: 'With Plus, the request modal validates fields and requires a verified official email',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#modal-verification-request', 'el:#btn-submit-verification-request', 'el:#btn-verification-send-email-code', 'el:#btn-verification-verify-email-code'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          if (state.currentUser) {
            state.currentUser.isPlus = true;
            state.currentUser.isVerified = true;
            state.currentUser.subscriptionStatus = 'active';
            state.currentUser.verificationStatus = '';
            state.currentUser.verificationType = '';
          }
          if (typeof openVerificationRequestModal === 'function') openVerificationRequestModal('government');
          const modal = document.getElementById('modal-verification-request');
          const open = !!(modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none');
          const preselected = ((document.getElementById('btn-verification-type-government') || {}).className || '').includes('font-bold');
          const results = {};
          const status = () => ((document.getElementById('verification-form-status') || {}).textContent || '');
          await (typeof submitVerificationRequest === 'function' ? submitVerificationRequest() : Promise.resolve());
          results.empty = status();
          const name = document.getElementById('verification-entity-name');
          if (name) name.value = 'City of Galloway';
          await submitVerificationRequest();
          results.noContact = status();
          const email = document.getElementById('verification-official-email');
          if (email) email.value = 'clerk@city.galloway.gov';
          if (typeof syncVerificationEmailUi === 'function') syncVerificationEmailUi();
          await submitVerificationRequest();
          results.unverified = status();
          if (typeof sendVerificationEmailCode === 'function') await sendVerificationEmailCode();
          const code = document.getElementById('verification-email-code');
          if (code) code.value = '000000';
          if (typeof verifyVerificationEmailCode === 'function') await verifyVerificationEmailCode();
          results.badCode = status();
          if (code) code.value = '123456';
          await verifyVerificationEmailCode();
          results.goodCode = status();
          const verified = !!(window._verificationEmailState && window._verificationEmailState.verified);
          const notes = document.getElementById('verification-notes');
          if (notes) notes.value = 'https://city.galloway.gov/staff/@handle';
          const ok = await submitVerificationRequest();
          results.submitted = status();
          const writes = (window._verificationWrites || []).slice();
          const rec = (window._verificationRequests || {})[(state.currentUser.username || '').toLowerCase()] || null;
          const pendingPill = !document.getElementById('edit-gov-pending-pill').classList.contains('hidden');
          return {
            open, preselected, results, verified, ok, writes, rec,
            userStatus: state.currentUser.verificationStatus,
            userType: state.currentUser.verificationType,
            accountType: state.currentUser.accountType,
            pendingPill
          };
        });
        a.ok(r.open && r.preselected, 'Plus opens the request modal with Government preselected');
        a.ok(/entity or agency name/i.test(r.results.empty), 'Empty form requires an entity name (or earlier type/name check)');
        a.ok(/email or a public website/i.test(r.results.noContact), 'A .gov/.mil email or website URL is required');
        a.ok(/Verify the official email/i.test(r.results.unverified), 'An unverified official email is blocked');
        a.ok(r.verified, 'The 123456 email code verifies the official address');
        a.ok(r.ok && r.results.submitted.includes(PENDING), 'Submit shows: Pending review, usually approved within 24 hours.');
        a.ok(r.userStatus === 'pending' && r.userType === 'government', 'users/{username} verificationType/status are set to pending government');
        a.ok(r.rec && r.rec.status === 'pending' && r.rec.emailVerified === true, 'verificationRequests/{username} is written as pending with a verified email');
        a.ok(r.writes.some((w) => (w.collection === 'verificationRequests' || (w.path || '').startsWith('verificationRequests/')) && (w.data && (w.data.status === 'pending' || w.data.verificationStatus === 'pending'))), 'A DB write is recorded for the request');
        a.ok(r.accountType === 'personal' || r.accountType === 'business', 'Until approved, the account keeps its current Personal or Business type');
        a.ok(r.pendingPill, 'The Government tab shows a pending state after submit');
        await page.evaluate(() => { if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal(); });
      }
    },
    {
      name: 'A website URL can be submitted without a code and is flagged for manual review',
      accounts: ['personal', 'business'],
      covers: ['el:#verification-website-url'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          if (state.currentUser) {
            state.currentUser.isPlus = true;
            state.currentUser.isVerified = true;
            state.currentUser.verificationStatus = '';
            state.currentUser.verificationType = '';
          }
          window._verificationWrites = [];
          if (typeof openVerificationRequestModal === 'function') openVerificationRequestModal('organization');
          const orgOn = ((document.getElementById('btn-verification-type-organization') || {}).className || '').includes('font-bold');
          document.getElementById('verification-entity-name').value = 'Harbor Civic League';
          document.getElementById('verification-official-email').value = '';
          document.getElementById('verification-website-url').value = 'https://www.harborcivicleague.org/staff';
          document.getElementById('verification-notes').value = 'Directory lists @handle';
          window._verificationEmailState = { email: '', verified: false, codeSent: false };
          const ok = await submitVerificationRequest();
          const rec = (window._verificationRequests || {})[(state.currentUser.username || '').toLowerCase()] || null;
          return { ok, orgOn, rec, status: (document.getElementById('verification-form-status') || {}).textContent || '', type: state.currentUser.verificationType };
        });
        a.ok(r.orgOn, 'Organization tab preselects Organization / Non-Profit');
        a.ok(r.ok && r.rec && r.rec.needsManualReview === true && r.rec.emailVerified === false, 'Website-only requests are submitted and flagged for manual review');
        a.ok(r.status.includes(PENDING), 'Website-only submit still shows the 24-hour pending message');
        a.ok(r.type === 'organization', 'The stored request type is organization');
        await page.evaluate(() => { if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal(); });
      }
    },
    {
      name: 'Admin Verification Requests is only on the @pixlynote owner menu, and Approve/Reject notify the requester',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#drawer-pixlynote-verifications', 'el:#btn-refresh-verification-requests', 'handler:approveVerificationRequest', 'handler:rejectVerificationRequest'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        await h.openOwnerMenu(page);
        const vis = await page.evaluate(() => {
          const el = document.getElementById('drawer-pixlynote-verifications');
          if (!el) return { exists: false, hidden: true };
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const hidden = el.classList.contains('hidden') || cs.display === 'none' || r.height < 1;
          const list = document.querySelector('#profile-drawer-card .flex-1.overflow-y-auto');
          const kids = list ? Array.from(list.children) : [];
          return {
            exists: true,
            hidden,
            metIdx: kids.findIndex((n) => n.id === 'drawer-pixlynote-metrics'),
            deIdx: kids.findIndex((n) => n.id === 'drawer-pixlynote-deactivations'),
            verIdx: kids.findIndex((n) => n.id === 'drawer-pixlynote-verifications'),
            profileIdx: kids.findIndex((n) => (n.getAttribute('onclick') || '').includes('handleDrawerProfileClick'))
          };
        });
        if (account.username === 'pixlynote') {
          a.ok(vis.exists && !vis.hidden, 'Verification Requests card is visible only on the @pixlynote owner menu');
          a.ok(vis.metIdx >= 0 && vis.deIdx > vis.metIdx && vis.verIdx > vis.deIdx && vis.profileIdx > vis.verIdx, 'The card sits at the top next to User Base Metrics and Pending Deactivations');
          const decision = await page.evaluate(async () => {
            const notifs = [];
            const prev = window.addNotificationForUser;
            window.addNotificationForUser = (u, n) => { notifs.push({ u, n }); return Promise.resolve(); };
            window._verificationRequests = {};
            window._verificationRequests['gov_applicant'] = {
              username: 'gov_applicant', type: 'government', entityName: 'City of Galloway',
              email: 'clerk@galloway.gov', emailVerified: true, status: 'pending', requestedAt: Date.now() - 86400000
            };
            window._verificationRequests['org_applicant'] = {
              username: 'org_applicant', type: 'organization', entityName: 'Harbor Civic League',
              url: 'https://example.org', emailVerified: false, needsManualReview: true, status: 'pending', requestedAt: Date.now() - 86400000
            };
            if (typeof refreshVerificationRequests === 'function') await refreshVerificationRequests(true);
            const count = (document.getElementById('verification-requests-count') || {}).textContent || '';
            const listEl = document.getElementById('drawer-verification-requests-list');
            const listText = (listEl && (listEl.textContent || listEl.innerHTML)) || '';
            const hasApprove = !!document.querySelector('#drawer-verification-requests-list button[onclick*="approveVerificationRequest"]');
            const hasReject = !!document.querySelector('#drawer-verification-requests-list button[onclick*="rejectVerificationRequest"]');
            await approveVerificationRequest('gov_applicant');
            await rejectVerificationRequest('org_applicant');
            window.addNotificationForUser = prev;
            return {
              count, listText, hasApprove, hasReject, notifs,
              gov: window._verificationRequests.gov_applicant,
              org: window._verificationRequests.org_applicant
            };
          });
          a.ok((Number(decision.count) >= 2) && /gov_applicant/.test(decision.listText) && /org_applicant/.test(decision.listText), 'Pending requests are listed for review');
          a.ok(decision.hasApprove && decision.hasReject, 'Each request has Approve and Reject');
          a.ok(decision.gov && decision.gov.status === 'approved', 'Approve sets the request status to approved');
          a.ok(decision.org && decision.org.status === 'rejected', 'Reject sets the request status to rejected');
          a.ok(decision.notifs.some((x) => x.u === 'gov_applicant' && x.n && /approved/i.test(x.n.text)), 'Approval notifies the requester');
          a.ok(decision.notifs.some((x) => x.u === 'org_applicant' && x.n && /not approved/i.test(x.n.text)), 'Rejection notifies the requester');
        } else {
          a.ok(!vis.exists || vis.hidden, 'Verification Requests is hidden for @' + account.username);
        }
      }
    },
    {
      name: 'Approved badges use slate/navy or org green, hide on Plus lapse, and reapply prefills as pending',
      accounts: ['personal', 'business'],
      covers: ['el:#btn-gov-badge-slate', 'el:#btn-gov-badge-navy', 'el:#profile-verified-badge'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const out = {};
          const u = state.currentUser;
          const bizBase = (typeof baseAccountType === 'function' ? baseAccountType(u) : u.accountType) === 'business';
          u.accountType = bizBase ? 'business' : 'personal';
          if (bizBase) { u.isBusinessPlus = true; u.isPlus = false; u.isVerified = false; }
          else { u.isPlus = true; u.isVerified = true; u.isBusinessPlus = false; }
          u.verificationType = 'government';
          u.verificationStatus = 'approved';
          u.governmentBadgeColor = 'slate';
          if (typeof paintStatusBadgesForUser === 'function') paintStatusBadgesForUser(u, ['profile-verified-badge'], ['profile-associated-avatar']);
          const badge = document.getElementById('profile-verified-badge');
          out.slateShown = !!(badge && !badge.classList.contains('hidden'));
          out.slateColor = badge ? (badge.getAttribute('data-badge-color') || badge.style.color) : '';
          out.slateHtml = (typeof creatorStatusBadgesHtml === 'function') ? creatorStatusBadgesHtml(u) : '';
          if (typeof setGovernmentBadgeColor === 'function') setGovernmentBadgeColor('navy');
          out.navyColor = badge ? (badge.getAttribute('data-badge-color') || badge.style.color) : '';
          out.navyHtml = creatorStatusBadgesHtml(u);
          out.navyStored = u.governmentBadgeColor;
          u.verificationType = 'organization';
          u.governmentBadgeColor = 'slate';
          if (typeof paintStatusBadgesForUser === 'function') paintStatusBadgesForUser(u, ['profile-verified-badge'], ['profile-associated-avatar']);
          out.orgColor = badge ? (badge.getAttribute('data-badge-color') || badge.style.color) : '';
          out.orgHtml = creatorStatusBadgesHtml(u);
          out.orgLabel = (typeof displayedCategoryLabel === 'function') ? displayedCategoryLabel(u) : '';
          // Plus-only blue still used when not official
          const plusOnly = { username: 'plus_check_demo', isPlus: true, isVerified: true, isBusinessPlus: false };
          out.blueHtml = creatorStatusBadgesHtml(plusOnly);
          const biz = { username: 'harbor_coffee', isBusinessPlus: true, isPlus: false, accountType: 'business' };
          out.greenHtml = creatorStatusBadgesHtml(biz);
          // Lapse hides the badge but keeps verificationType and the approval on file
          u.isPlus = false;
          u.isVerified = false;
          u.isBusinessPlus = false;
          if (typeof syncGovOrgVerificationWithSubscription === 'function') syncGovOrgVerificationWithSubscription(u.username);
          out.lapsedStatus = u.verificationStatus;
          out.lapsedType = u.verificationType;
          out.lapsedAccountType = u.accountType || (typeof baseAccountType === 'function' ? baseAccountType(u) : '');
          out.badgeHiddenAfterLapse = !isGovOrOrgBadgeShown(u);
          out.displayedAfterLapse = displayedAccountCategory(u);
          out.approvalOnFile = typeof verificationApprovalOnFile === 'function' && verificationApprovalOnFile(u);
          // Matching plan auto-restores the badge — no reapply
          if (bizBase) { u.isBusinessPlus = true; u.isPlus = false; u.isVerified = false; }
          else { u.isPlus = true; u.isVerified = true; u.isBusinessPlus = false; }
          if (typeof restoreGovOrgVerificationIfEligible === 'function') restoreGovOrgVerificationIfEligible(u.username);
          out.restoredStatus = u.verificationStatus;
          out.badgeShownAfterResub = isGovOrOrgBadgeShown(u);
          out.accountTypeStillBase = displayedAccountCategory(u) === 'personal' || displayedAccountCategory(u) === 'business';
          out.verificationTypeStillOrg = u.verificationType === 'organization';
          // Rejected approvals do not auto-restore
          const savedVer = { type: u.verificationType, status: u.verificationStatus };
          u.verificationType = 'government';
          u.verificationStatus = 'rejected';
          const rejectedRestored = (typeof restoreGovOrgVerificationIfEligible === 'function') ? restoreGovOrgVerificationIfEligible(u.username) : false;
          out.rejectedStillHidden = !isGovOrOrgBadgeShown(u) && !rejectedRestored;
          out.rejectedStatus = u.verificationStatus;
          u.verificationType = savedVer.type;
          u.verificationStatus = savedVer.status;
          if (typeof openVerificationRequestModal === 'function') {
            const prevStatus = u.verificationStatus;
            u.verificationStatus = 'rejected';
            u.verificationType = 'government';
            openVerificationRequestModal('government');
            out.reapplyBanner = (document.getElementById('verification-pending-banner') || {}).textContent || '';
            u.verificationStatus = prevStatus;
            u.verificationType = 'organization';
          }
          return out;
        });
        const hex = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
        a.ok(r.slateShown && (hex(r.slateColor) === '#64748b' || /#64748B/i.test(r.slateHtml)), 'Approved Government default check is Civic Slate Gray #64748B');
        a.ok(hex(r.navyColor) === '#1e3a8a' || /#1E3A8A/i.test(r.navyHtml), 'The Government toggle can switch the check to Deep Navy #1E3A8A');
        a.ok(r.navyStored === 'navy', 'Chosen navy color is stored on the user');
        a.ok(hex(r.orgColor) === '#10b981' || /#10B981/i.test(r.orgHtml), 'Organization check is #10B981');
        a.ok(r.orgLabel === 'Organization', 'The approved Organization tab/label is the active type');
        a.ok(/text-sky-500/.test(r.blueHtml), 'The blue Plus check still renders for Plus accounts without official verification');
        a.ok(/text-emerald-500/.test(r.greenHtml), 'The green Business Plus check still renders when official verification is not shown');
        a.ok(r.lapsedStatus === 'lapsed' && r.lapsedType === 'organization' && r.badgeHiddenAfterLapse, 'Lapsing Plus hides the official badge and keeps the verification record as lapsed');
        a.ok(r.displayedAfterLapse === 'personal' || r.displayedAfterLapse === 'business', 'After lapse the account type stays Personal or Business');
        a.ok(r.approvalOnFile, 'The approval stays on file after lapse');
        a.ok(r.restoredStatus === 'approved' && r.badgeShownAfterResub, 'Resubscribing to the matching plan automatically restores the approved badge with no reapply');
        a.ok(r.accountTypeStillBase && r.verificationTypeStillOrg, 'verificationType stays organization and accountType stays personal or business');
        a.ok(r.rejectedStillHidden && r.rejectedStatus === 'rejected', 'A rejected request does not auto-restore and still requires a reapply');
        a.ok(/not approved|reapply|revoked/i.test(r.reapplyBanner), 'Reapply copy is shown only after a rejection or revocation');
        await page.evaluate(() => { if (typeof closeVerificationRequestModal === 'function') closeVerificationRequestModal(); });
      }
    },
    {
      name: 'Switching Personal Plus to Business cancels Plus, hides an approved gov badge, and restores it after Business Plus',
      accounts: ['personal'],
      covers: ['el:#modal-account-type-switch', 'el:#btn-account-type-switch-confirm', 'el:#pixly-stripe-business-buy-btn', 'handler:confirmAccountTypeSwitch', 'handler:cancelStripeSubscriptionForAccount', 'handler:restoreGovOrgVerificationIfEligible'],
      async run(ctx) {
        const { page, a } = ctx;
        const pre = await page.evaluate(() => {
          const u = state.currentUser;
          u.accountType = 'personal';
          u.isPlus = true;
          u.isVerified = true;
          u.isBusinessPlus = false;
          u.verificationType = 'government';
          u.verificationStatus = 'approved';
          u.governmentBadgeColor = 'slate';
          u.stripeSessionId = 'cs_test_abcdefghijklmnopqrstuvwxyz';
          u.stripeSubscriptionId = 'sub_testplusabcdefghijklmnopqrstuv';
          window.__pixlyCancelSubscriptionCalls = [];
          if (typeof openEditProfileModal === 'function') openEditProfileModal();
          if (typeof setEditProfileAccountCategory === 'function') setEditProfileAccountCategory('business');
          const modal = document.getElementById('modal-account-type-switch');
          const copy = (document.getElementById('account-type-switch-copy') || {}).textContent || '';
          return {
            modalOpen: !!(modal && !modal.classList.contains('hidden') && modal.style.display !== 'none'),
            copy,
            stillPersonal: (window._editingAccountType || u.accountType) === 'personal',
            stillPlus: u.isPlus === true,
            badgeBefore: isGovOrOrgBadgeShown(u)
          };
        });
        a.ok(pre.modalOpen, 'Switching Personal with Plus to Business opens the confirm prompt');
        a.ok(/plus doesn.t apply to business|will be canceled/i.test(pre.copy), 'The prompt says Plus does not apply to business accounts and will be canceled');
        a.ok(/Business Plus/i.test(pre.copy), 'The prompt offers Business Plus checkout');
        a.ok(/automatically|on file|do not need to reapply/i.test(pre.copy), 'The prompt says an approved badge returns automatically after the matching plan');
        a.ok(pre.stillPersonal && pre.stillPlus && pre.badgeBefore, 'Confirm has not switched or canceled yet');

        const afterConfirm = await page.evaluate(() => {
          if (typeof confirmAccountTypeSwitch === 'function') confirmAccountTypeSwitch();
          const modal = document.getElementById('modal-account-type-switch');
          return {
            editing: window._editingAccountType,
            pending: window._pendingSubscriptionCancelOnSave,
            offer: window._offerSubscriptionAfterSave,
            modalClosed: !modal || modal.classList.contains('hidden') || modal.style.display === 'none',
            stillPlus: state.currentUser.isPlus === true
          };
        });
        a.ok(afterConfirm.editing === 'business' && afterConfirm.pending === 'plus' && afterConfirm.offer === 'business', 'Confirm sets Business and a pending Plus cancel, and offers Business Plus');
        a.ok(afterConfirm.modalClosed && afterConfirm.stillPlus, 'Plus stays active until Save');

        const saved = await page.evaluate(async () => {
          const nameInp = document.getElementById('edit-profile-name');
          if (nameInp && !String(nameInp.value || '').trim()) {
            nameInp.value = state.currentUser.fullName || 'Test Account';
            nameInp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const emailInp = document.getElementById('edit-profile-email');
          if (emailInp && !String(emailInp.value || '').trim() && state.currentUser.email) {
            emailInp.value = state.currentUser.email;
            emailInp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          await new Promise((r) => setTimeout(r, 200));
          const u = state.currentUser;
          const subModal = document.getElementById('modal-subscription');
          const bizBtn = document.getElementById('pixly-stripe-business-buy-btn');
          return {
            accountType: u.accountType,
            isPlus: u.isPlus === true,
            isVerified: u.isVerified === true,
            isBusinessPlus: u.isBusinessPlus === true,
            verificationType: u.verificationType,
            verificationStatus: u.verificationStatus,
            badgeShown: isGovOrOrgBadgeShown(u),
            approvalOnFile: verificationApprovalOnFile(u),
            cancelCalls: (window.__pixlyCancelSubscriptionCalls || []).slice(),
            subModalOpen: !!(subModal && !subModal.classList.contains('hidden')),
            bizBtnId: bizBtn ? bizBtn.getAttribute('buy-button-id') : '',
            bizBtnHidden: !bizBtn || bizBtn.classList.contains('hidden'),
            debug: {
              editing: window._editingAccountType,
              pending: window._pendingSubscriptionCancelOnSave,
              name: (document.getElementById('edit-profile-name') || {}).value || '',
              email: (document.getElementById('edit-profile-email') || {}).value || '',
              canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : null,
              toast: (document.getElementById('toast') || document.querySelector('[id*=toast]') || {}).textContent || window._lastToast || ''
            }
          };
        });
        a.ok(saved.accountType === 'business' && !saved.isPlus, 'Save switches to Business and clears isPlus so the blue check comes off immediately');
        a.ok(saved.verificationType === 'government' && saved.verificationStatus === 'lapsed' && !saved.badgeShown && saved.approvalOnFile, 'The gov badge hides and the approval stays on file as lapsed');
        a.ok(saved.cancelCalls.some((c) => c.kind === 'plus' && c.username), 'Save calls the Worker to cancel the Plus subscription');
        a.ok(saved.subModalOpen && saved.bizBtnId === 'buy_btn_1UdKTrFSVMbdmupTOj95P7R5' && !saved.bizBtnHidden, 'Business Plus checkout (buy_btn_1UdKTrFSVMbdmupTOj95P7R5) is offered after save');

        const restored = await page.evaluate(() => {
          const u = state.currentUser;
          if (typeof applyBusinessPlusVerification === 'function') applyBusinessPlusVerification(u.username, 'cs_test_abcdefghijklmnopqrstuvwxyz');
          return {
            isBusinessPlus: u.isBusinessPlus === true,
            isPlus: u.isPlus === true,
            accountType: u.accountType,
            verificationType: u.verificationType,
            verificationStatus: u.verificationStatus,
            badgeShown: isGovOrOrgBadgeShown(u),
            label: (typeof displayedCategoryLabel === 'function') ? displayedCategoryLabel(u) : ''
          };
        });
        a.ok(restored.isBusinessPlus && !restored.isPlus && restored.accountType === 'business', 'Business Plus activates on the Business account and does not set isPlus');
        a.ok(restored.verificationType === 'government' && restored.verificationStatus === 'approved' && restored.badgeShown, 'Buying the matching Business Plus plan automatically restores the approved Government badge');
        a.ok(restored.label === 'Government', 'The official label is Government while the badge is shown, without changing accountType');
        await page.evaluate(() => {
          if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'Switching Business Plus to Personal cancels Business Plus, hides an approved org badge, and restores it after Plus',
      accounts: ['business'],
      covers: ['el:#modal-account-type-switch', 'el:#btn-account-type-switch-confirm', 'el:#pixly-stripe-buy-btn', 'handler:confirmAccountTypeSwitch', 'handler:cancelStripeSubscriptionForAccount', 'handler:restoreGovOrgVerificationIfEligible'],
      async run(ctx) {
        const { page, a } = ctx;
        const pre = await page.evaluate(() => {
          const u = state.currentUser;
          u.accountType = 'business';
          u.isPlus = false;
          u.isVerified = false;
          u.isBusinessPlus = true;
          u.verificationType = 'organization';
          u.verificationStatus = 'approved';
          u.stripeBusinessSessionId = 'cs_test_abcdefghijklmnopqrstuvwxyz';
          u.stripeBusinessSubscriptionId = 'sub_testbizabcdefghijklmnopqrstuv';
          window.__pixlyCancelSubscriptionCalls = [];
          if (typeof openEditProfileModal === 'function') openEditProfileModal();
          if (typeof setEditProfileAccountCategory === 'function') setEditProfileAccountCategory('personal');
          const copy = (document.getElementById('account-type-switch-copy') || {}).textContent || '';
          const modal = document.getElementById('modal-account-type-switch');
          return {
            modalOpen: !!(modal && !modal.classList.contains('hidden') && modal.style.display !== 'none'),
            copy,
            stillBusiness: (window._editingAccountType || u.accountType) === 'business',
            stillBizPlus: u.isBusinessPlus === true
          };
        });
        a.ok(pre.modalOpen, 'Switching Business with Business Plus to Personal opens the confirm prompt');
        a.ok(/Business Plus doesn.t apply to personal|will be canceled/i.test(pre.copy), 'The prompt says Business Plus does not apply to personal accounts and will be canceled');
        a.ok(/Pixlynote Plus/i.test(pre.copy), 'The prompt offers Plus checkout');
        a.ok(pre.stillBusiness && pre.stillBizPlus, 'Confirm has not switched or canceled yet');

        const saved = await page.evaluate(async () => {
          if (typeof confirmAccountTypeSwitch === 'function') confirmAccountTypeSwitch();
          const nameInp = document.getElementById('edit-profile-name');
          if (nameInp && !String(nameInp.value || '').trim()) {
            nameInp.value = state.currentUser.fullName || 'Test Account';
            nameInp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const emailInp = document.getElementById('edit-profile-email');
          if (emailInp && !String(emailInp.value || '').trim() && state.currentUser.email) {
            emailInp.value = state.currentUser.email;
            emailInp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          await new Promise((r) => setTimeout(r, 200));
          const u = state.currentUser;
          const subModal = document.getElementById('modal-subscription');
          const plusBtn = document.getElementById('pixly-stripe-buy-btn');
          return {
            accountType: u.accountType,
            isBusinessPlus: u.isBusinessPlus === true,
            isPlus: u.isPlus === true,
            verificationType: u.verificationType,
            verificationStatus: u.verificationStatus,
            badgeShown: isGovOrOrgBadgeShown(u),
            approvalOnFile: verificationApprovalOnFile(u),
            cancelCalls: (window.__pixlyCancelSubscriptionCalls || []).slice(),
            subModalOpen: !!(subModal && !subModal.classList.contains('hidden')),
            plusBtnHidden: !plusBtn || plusBtn.classList.contains('hidden'),
            plusBtnId: plusBtn ? plusBtn.getAttribute('buy-button-id') : '',
            debug: {
              editing: window._editingAccountType,
              pending: window._pendingSubscriptionCancelOnSave,
              name: (document.getElementById('edit-profile-name') || {}).value || '',
              email: (document.getElementById('edit-profile-email') || {}).value || '',
              canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : null,
              toast: (document.getElementById('toast') || document.querySelector('[id*=toast]') || {}).textContent || window._lastToast || ''
            }
          };
        });
        a.ok(saved.accountType === 'personal' && !saved.isBusinessPlus, 'Save switches to Personal and clears isBusinessPlus so the green check comes off immediately');
        a.ok(saved.verificationType === 'organization' && saved.verificationStatus === 'lapsed' && !saved.badgeShown && saved.approvalOnFile, 'The org badge hides and the approval stays on file');
        a.ok(saved.cancelCalls.some((c) => c.kind === 'business' && c.username), 'Save calls the Worker to cancel the Business Plus subscription');
        a.ok(saved.subModalOpen && !saved.plusBtnHidden, 'Plus checkout is offered after save');

        const restored = await page.evaluate(() => {
          const u = state.currentUser;
          if (typeof applyStripeSessionVerification === 'function') applyStripeSessionVerification(u.username, 'cs_test_abcdefghijklmnopqrstuvwxyz', true);
          return {
            isPlus: u.isPlus === true,
            isBusinessPlus: u.isBusinessPlus === true,
            accountType: u.accountType,
            verificationType: u.verificationType,
            verificationStatus: u.verificationStatus,
            badgeShown: isGovOrOrgBadgeShown(u),
            label: (typeof displayedCategoryLabel === 'function') ? displayedCategoryLabel(u) : ''
          };
        });
        a.ok(restored.isPlus && !restored.isBusinessPlus && restored.accountType === 'personal', 'Plus activates on the Personal account');
        a.ok(restored.verificationType === 'organization' && restored.verificationStatus === 'approved' && restored.badgeShown, 'Buying the matching Plus plan automatically restores the approved Organization badge');
        a.ok(restored.label === 'Organization', 'The official label is Organization while the badge is shown, without changing accountType');
        await page.evaluate(() => {
          if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal();
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'The official badge follows the matching base plan and rejected requests do not auto-restore',
      accounts: ['personal'],
      covers: ['handler:userHasMatchingPlusSubscription', 'handler:restoreGovOrgVerificationIfEligible', 'handler:isGovOrOrgBadgeShown'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const u = state.currentUser;
          u.accountType = 'personal';
          u.isPlus = false;
          u.isVerified = false;
          u.isBusinessPlus = true;
          u.verificationType = 'government';
          u.verificationStatus = 'approved';
          const mismatch = {
            shown: isGovOrOrgBadgeShown(u),
            matching: userHasMatchingPlusSubscription(u),
            accountType: baseAccountType(u),
            verificationType: u.verificationType
          };
          u.isBusinessPlus = false;
          u.isPlus = true;
          u.isVerified = true;
          u.verificationStatus = 'lapsed';
          restoreGovOrgVerificationIfEligible(u.username);
          const matched = {
            shown: isGovOrOrgBadgeShown(u),
            status: u.verificationStatus,
            accountType: baseAccountType(u),
            verificationType: u.verificationType
          };
          u.verificationStatus = 'revoked';
          const revokedShown = isGovOrOrgBadgeShown(u);
          const revokedRestored = restoreGovOrgVerificationIfEligible(u.username);
          return {
            mismatch, matched, revokedShown, revokedRestored, revokedStatus: u.verificationStatus,
            pendingAfterRejectSubmit: null
          };
        });
        a.ok(r.mismatch.accountType === 'personal' && r.mismatch.verificationType === 'government', 'verificationType is separate from accountType personal/business');
        a.ok(!r.mismatch.matching && !r.mismatch.shown, 'A Personal account with only Business Plus does not show the official badge');
        a.ok(r.matched.shown && r.matched.status === 'approved' && r.matched.accountType === 'personal', 'The matching Plus plan on Personal auto-restores the approved badge');
        a.ok(!r.revokedShown && !r.revokedRestored && r.revokedStatus === 'revoked', 'A revoked approval does not auto-restore; the user must reapply');
      }
    },
    {
      name: 'Live author badges render on the viewer\'s own newsfeed cards, comments, notes, and other surfaces',
      accounts: ['personal'],
      covers: ['handler:authorStatusBadgesHtml', 'handler:lookupCreatorFlags', 'handler:isViewedCreatorCheckmarkShown', 'el:#modal-post-author-badges', 'el:#story-viewer-badges', 'el:#dm-active-badges', 'el:#posts-stream'],
      async run(ctx) {
        const { page, h, a } = ctx;
        if (h.gotoMainTab) await h.gotoMainTab(page, 'feed');
        const r = await page.evaluate(() => {
          const me = state.currentUser.username;
          const img = (state.posts && state.posts[0] && state.posts[0].image) || (typeof COMMUNITY_IMAGES !== 'undefined' ? COMMUNITY_IMAGES[0] : '');
          const u = state.currentUser;
          u.accountType = 'personal';
          u.isPlus = true;
          u.isVerified = true;
          u.isBusinessPlus = false;
          u.verificationType = '';
          u.verificationStatus = '';
          u.associatedBusiness = { username: 'harbor_coffee', avatar: img };
          window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
          window._remoteUserProfilesCache.plus_neighbor = {
            username: 'plus_neighbor',
            isPlus: true,
            isVerified: true,
            isBusinessPlus: false,
            accountType: 'personal'
          };
          window._remoteUserProfilesCache.stale_neighbor = {
            username: 'stale_neighbor',
            isPlus: false,
            isVerified: false,
            isBusinessPlus: false,
            accountType: 'personal'
          };
          const own = {
            id: 'badge_live_own_1',
            author: me,
            image: img,
            caption: 'My plus post',
            tags: [],
            comments: [{ id: 'c1', user: me, text: 'own comment', isSpam: false, replies: [] }],
            likes: 0,
            createdAtMs: Date.now()
            // deliberately no isPlus / isVerified on the post
          };
          const neighbor = {
            id: 'badge_live_neighbor_1',
            author: 'plus_neighbor',
            image: img,
            caption: 'Neighbor plus post',
            tags: [],
            comments: [],
            likes: 0,
            createdAtMs: Date.now() - 10
          };
          const stale = {
            id: 'badge_stale_1',
            author: 'stale_neighbor',
            image: img,
            caption: 'Stale plus flag',
            tags: [],
            comments: [],
            likes: 0,
            isPlus: true,
            isVerified: true,
            createdAtMs: Date.now() - 20
          };
          state.posts = (state.posts || []).filter((p) => !String(p.id).startsWith('badge_')).concat([own, neighbor, stale]);
          if (typeof renderFeed === 'function') renderFeed();
          const card = (sel) => document.querySelector('.post-card[data-post-id="' + sel + '"]');
          const html = (id) => (card(id) && card(id).innerHTML) || '';
          const ownHtml = html('badge_live_own_1');
          const neighborHtml = html('badge_live_neighbor_1');
          const staleHtml = html('badge_stale_1');
          const hasBlue = (s) => /text-sky-500/.test(s) && /associated-business-avatar|harbor_coffee/.test(s) === false || /text-sky-500/.test(s);
          const ownHasBlue = /text-sky-500/.test(ownHtml);
          const ownHasAssoc = /associated-business-avatar/.test(ownHtml) && /harbor_coffee/.test(ownHtml);
          const ownCommentHasBlue = /own comment[\s\S]{0,200}text-sky-500|text-sky-500[\s\S]{0,400}own comment/.test(ownHtml) || (ownHtml.includes('own comment') && (ownHtml.match(/text-sky-500/g) || []).length >= 2);
          if (typeof openPostDetailModal === 'function') openPostDetailModal('badge_live_own_1');
          const modalBadges = (document.getElementById('modal-post-author-badges') || {}).innerHTML || '';
          const modalCaption = (document.getElementById('modal-comments-list') || {}).innerHTML || '';
          if (typeof closePostDetailModal === 'function') closePostDetailModal();

          const note = { id: 'badge_live_note_1', author: me, authorName: u.fullName || me, text: 'My plus note', time: 'Just now', likes: 0, comments: [] };
          state.notes = (state.notes || []).filter((n) => String(n.id) !== note.id).concat([note]);
          if (typeof renderNotes === 'function') renderNotes();
          const notesHtml = (document.getElementById('notes-list') || document.querySelector('.profile-note-card') || {}).innerHTML || '';
          const noteCard = document.querySelector('.profile-note-card[data-note-id="badge_live_note_1"]');
          const noteHtml = (noteCard && noteCard.innerHTML) || notesHtml;

          if (typeof renderNotifications === 'function') {
            state.notifications = [{ fromUser: me, user: me, text: 'liked your post', time: 'Just now', read: true, type: 'like' }].concat(state.notifications || []);
            renderNotifications(true);
          }
          const notifHtml = (document.getElementById('notifications-list') || document.getElementById('notifications-dropdown') || {}).innerHTML || '';

          if (typeof paintAuthorBadgeMount === 'function') paintAuthorBadgeMount('story-viewer-badges', me);
          const storyHtml = (document.getElementById('story-viewer-badges') || {}).innerHTML || '';
          if (typeof paintAuthorBadgeMount === 'function') paintAuthorBadgeMount('dm-active-badges', me);
          const dmHtml = (document.getElementById('dm-active-badges') || {}).innerHTML || '';

          // Official gov badge uses live verification, not post fields
          u.verificationType = 'government';
          u.verificationStatus = 'approved';
          u.governmentBadgeColor = 'navy';
          if (typeof renderFeed === 'function') renderFeed();
          const govHtml = html('badge_live_own_1');

          // Stale post flags must not win over the live user doc
          const staleShown = /text-sky-500|#10B981|#64748B|#1E3A8A/.test(staleHtml);

          return {
            ownHasBlue,
            ownHasAssoc,
            ownCommentHasBlue,
            neighborHasBlue: /text-sky-500/.test(neighborHtml),
            staleShown,
            modalHasBlue: /text-sky-500/.test(modalBadges),
            modalCaptionHasBlue: /text-sky-500/.test(modalCaption),
            noteHasBlue: /text-sky-500/.test(noteHtml),
            notifHasBlue: /text-sky-500/.test(notifHtml),
            storyHasBlue: /text-sky-500/.test(storyHtml),
            dmHasBlue: /text-sky-500/.test(dmHtml),
            govHasNavy: /#1E3A8A/i.test(govHtml) || /#1e3a8a/i.test(govHtml),
            govNotBlue: !/text-sky-500/.test(govHtml) || /#1E3A8A/i.test(govHtml),
            liveLookupOwn: (typeof lookupCreatorFlags === 'function') ? lookupCreatorFlags({ username: me, isPlus: false, isVerified: false }).isPlus === true : false,
            liveLookupStale: (typeof lookupCreatorFlags === 'function') ? lookupCreatorFlags({ username: 'stale_neighbor', isPlus: true, isVerified: true }).isPlus === false : false
          };
        });
        a.ok(r.liveLookupOwn, 'lookupCreatorFlags uses the live current user doc, not stale post fields');
        a.ok(r.liveLookupStale, 'lookupCreatorFlags prefers the live cached user doc over stale isPlus on a post');
        a.ok(r.ownHasBlue, 'The viewer\'s own newsfeed post shows the blue Plus check from the live user doc');
        a.ok(r.ownHasAssoc, 'The business associate avatar renders on the viewer\'s own newsfeed card');
        a.ok(r.ownCommentHasBlue, 'A comment by the viewer on their newsfeed card shows the live check');
        a.ok(r.neighborHasBlue, 'Another account\'s newsfeed card shows the check from the live user doc');
        a.ok(!r.staleShown, 'A stale isPlus flag on a post does not show a check when the live user doc has no Plus');
        a.ok(r.modalHasBlue && r.modalCaptionHasBlue, 'The post modal author and caption show the live check');
        a.ok(r.noteHasBlue, 'The viewer\'s own note shows the live check');
        a.ok(r.notifHasBlue, 'Notifications show the live check next to the sender');
        a.ok(r.storyHasBlue, 'The story viewer badge mount paints the live check');
        a.ok(r.dmHasBlue, 'The DM header badge mount paints the live check');
        a.ok(r.govHasNavy && r.govNotBlue, 'An approved Government account shows the navy official check on the newsfeed instead of the blue Plus check');
        await page.evaluate(() => {
          if (typeof closePostDetailModal === 'function') closePostDetailModal();
          const u = state.currentUser;
          if (u) { u.associatedBusiness = null; u.verificationType = ''; u.verificationStatus = ''; }
        });
      }
    }
  ]
};
