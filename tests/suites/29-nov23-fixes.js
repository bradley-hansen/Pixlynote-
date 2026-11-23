'use strict';

/**
 * Unit + UI E2E tests for Nov 23 fixes (branch grokbot/nov23-fixes):
 * 1. Government (Slate #64748B / Navy #1E3A8A) and Organization (Teal #14B8A6) unit + E2E gating/badges/signup-upgrade
 * 2. Subtle Beta indicator (#nav-beta-pill + #own-info-app-release in About) with mobile non-overlap check
 * 3. Story bar includes connected users with active stories only (no empty avatars); viewed sorts after unviewed
 * 4. Business sign-up fields prefilled into Edit Profile Business Package section (and preserved across reload)
 * 5. Disconnect confirm dropdown ("Disconnect @user?") on all Connected buttons (Cancel keeps, Disconnect removes)
 * 6. Connections fixes: (a) stale outbound follower edges / self leakage cleaned up; (b) Close Friends caret Connect action & clean state transitions
 * 7. Help Center in right-side (⋮) menu above Info/About with FAQs and Submit feedback (/support/feedback + mailto fallback)
 * 8. Account switcher adding 2nd/3rd/4th accounts while already signed in (login + signup + re-add + cancel mid-add)
 */

const { ALL_ACCOUNT_KEYS, VERIFY_CODE } = require('../helpers/harness');

const TINY_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function installMockFsFn() {
  return function ({ seed }) {
    if (!window.__mockFs) {
      const state = { users: {}, edges: {}, delayMs: 0, edgeListeners: [] };
      const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
      const norm = (u) => String(u || '').trim().replace(/^@+/, '').toLowerCase();
      window.__mockFs = state;
      window.__mockFsRead = () => clone({ users: state.users, edges: state.edges });
      window.__mockFsSetDelay = (ms) => { state.delayMs = Number(ms) || 0; };

      const colRef = (parts) => ({ kind: 'col', parts: parts.slice() });
      const docRef = (parts) => ({ kind: 'doc', parts: parts.slice(), id: parts[parts.length - 1] });
      const snapDoc = (id, data) => ({ id, exists: () => data !== undefined && data !== null, data: () => clone(data) });
      const snapCol = (map) => {
        const docs = Object.keys(map || {}).map((id) => snapDoc(id, map[id]));
        return { docs, size: docs.length, forEach: (cb) => docs.forEach(cb) };
      };
      const emitEdges = (target) => {
        const t = norm(target);
        const m = state.edges[t] || {};
        state.edgeListeners.forEach((l) => {
          if (norm(l.target) === t) { try { l.cb(snapCol(m)); } catch (e) {} }
        });
      };

      const fb = {
        db: { __mock: true },
        collection: function () { return colRef(Array.prototype.slice.call(arguments, 1)); },
        doc: function () { return docRef(Array.prototype.slice.call(arguments, 1)); },
        query: (ref) => ref,
        where: () => ({}),
        orderBy: () => ({}),
        limit: () => ({}),
        getDoc: async (ref) => {
          const p = ref.parts || [];
          if (p[0] === 'users' && p.length === 2) return snapDoc(norm(p[1]), state.users[norm(p[1])]);
          if (p[0] === 'users' && p.length === 4 && p[2] === 'followers') {
            const t = norm(p[1]); const f = norm(p[3]);
            return snapDoc(f, (state.edges[t] || {})[f]);
          }
          return snapDoc(p[p.length - 1] || 'x', undefined);
        },
        getDocs: async (ref) => {
          const p = ref.parts || [];
          if (p[0] === 'users' && p.length === 1) return snapCol(state.users);
          if (p[0] === 'users' && p.length === 3 && p[2] === 'followers') return snapCol(state.edges[norm(p[1])] || {});
          return snapCol({});
        },
        setDoc: async (ref, data, opts) => {
          const p = ref.parts || [];
          if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
          if (p[0] === 'users' && p.length === 2) {
            const u = norm(p[1]);
            state.users[u] = opts && opts.merge ? Object.assign({}, state.users[u] || {}, clone(data)) : clone(data);
          } else if (p[0] === 'users' && p.length === 4 && p[2] === 'followers') {
            const t = norm(p[1]); const f = norm(p[3]);
            if (!state.edges[t]) state.edges[t] = {};
            state.edges[t][f] = clone(data);
            emitEdges(t);
          }
        },
        deleteDoc: async (ref) => {
          const p = ref.parts || [];
          if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
          if (p[0] === 'users' && p.length === 4 && p[2] === 'followers') {
            const t = norm(p[1]); const f = norm(p[3]);
            if (state.edges[t]) delete state.edges[t][f];
            emitEdges(t);
          }
        },
        onSnapshot: (ref, cb) => {
          const p = ref && ref.parts ? ref.parts : [];
          if (p[0] === 'users' && p.length === 3 && p[2] === 'followers') {
            const t = norm(p[1]);
            const rec = { target: t, cb };
            state.edgeListeners.push(rec);
            setTimeout(() => { try { cb(snapCol(state.edges[t] || {})); } catch (e) {} }, 10);
            return () => { const i = state.edgeListeners.indexOf(rec); if (i >= 0) state.edgeListeners.splice(i, 1); };
          }
          return () => {};
        },
        writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} })
      };
      window.firebase = fb;
      window.firebaseReady = true;
    }
    if (seed) {
      const s = window.__mockFs;
      s.users = {};
      s.edges = {};
      const norm = (u) => String(u || '').trim().replace(/^@+/, '').toLowerCase();
      if (seed.users) Object.keys(seed.users).forEach((k) => { s.users[norm(k)] = JSON.parse(JSON.stringify(seed.users[k])); });
      if (seed.edges) Object.keys(seed.edges).forEach((t) => {
        s.edges[norm(t)] = {};
        Object.keys(seed.edges[t] || {}).forEach((f) => { s.edges[norm(t)][norm(f)] = JSON.parse(JSON.stringify(seed.edges[t][f])); });
      });
    }
  };
}

async function freshMobile(page, h, account) {
  const port = Number(new URL(page.url()).port);
  await page.setViewportSize({ width: 390, height: 844 });
  await h.loadApp(page, { port });
  if (account) await h.loginAs(page, account);
  return port;
}

module.exports = {
  name: 'Nov 23 Fixes',
  tests: [
    // Item 1: Government (Slate / Navy) and Organization (teal #14B8A6) unit + E2E checks
    {
      name: 'Item 1: Government (Slate/Navy) & Organization (#14B8A6) unit helpers, badge colors, gating, and upgrade path work end-to-end',
      accounts: ['personal'],
      covers: [
        'el:#btn-edit-account-government',
        'el:#btn-edit-account-organization',
        'el:#modal-verification-paywall',
        'el:#btn-gov-badge-slate',
        'el:#btn-gov-badge-navy',
        'handler:setGovernmentBadgeColor',
        'handler:handleEditProfileOfficialTab',
        'handler:userHasMatchingPlusSubscription',
        'handler:syncGovOrgVerificationWithSubscription'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await freshMobile(page, h, account);

        // Unit tests against real helper functions
        const unit = await page.evaluate(() => {
          const out = {};
          out.constants = {
            slate: GOV_BADGE_SLATE,
            navy: GOV_BADGE_NAVY,
            org: ORG_BADGE_GREEN
          };
          const govSlateUser = { username: 'civic_dept', accountType: 'personal', isPlus: true, verificationType: 'government', verificationStatus: 'approved', governmentBadgeColor: 'slate' };
          const govNavyUser = { username: 'civic_dept', accountType: 'personal', isPlus: true, verificationType: 'government', verificationStatus: 'approved', governmentBadgeColor: 'navy' };
          const govPendingUser = { username: 'civic_dept', accountType: 'personal', isPlus: true, verificationType: 'government', verificationStatus: 'pending' };
          const orgUser = { username: 'green_alliance', accountType: 'business', isBusinessPlus: true, verificationType: 'organization', verificationStatus: 'approved' };
          const plusActive = { accountType: 'personal', isPlus: true };
          const bizPlusActive = { accountType: 'business', isBusinessPlus: true };
          const plusWrongTier = { accountType: 'business', isPlus: true, isBusinessPlus: false };
          const plusInactive = { accountType: 'personal', isPlus: false };

          out.govSlateColor = govOrgBadgeColorFor(govSlateUser);
          out.govNavyColor = govOrgBadgeColorFor(govNavyUser);
          out.orgColor = govOrgBadgeColorFor(orgUser);
          out.govShown = isGovOrOrgBadgeShown(govSlateUser);
          out.govPendingShown = isGovOrOrgBadgeShown(govPendingUser);
          out.orgShown = isGovOrOrgBadgeShown(orgUser);
          out.govTitle = govOrgBadgeTitleFor(govSlateUser);
          out.orgTitle = govOrgBadgeTitleFor(orgUser);
          out.svgNavy = officialVerifiedSvg(GOV_BADGE_NAVY, 'Verified Government Account', 'w-4 h-4');
          out.svgOrg = officialVerifiedSvg(ORG_BADGE_GREEN, 'Verified Organization Account', 'w-4 h-4');
          out.matchPlus = userHasMatchingPlusSubscription(plusActive);
          out.matchBizPlus = userHasMatchingPlusSubscription(bizPlusActive);
          out.matchWrongTier = userHasMatchingPlusSubscription(plusWrongTier);
          out.matchInactive = userHasMatchingPlusSubscription(plusInactive);
          out.govCatLabel = displayedCategoryLabel(govSlateUser);
          out.orgCatLabel = displayedCategoryLabel(orgUser);
          out.govSubtitle = officialCategorySubtitle(govSlateUser, 'Creator');
          out.orgSubtitle = officialCategorySubtitle(orgUser, 'Creator');
          out.badgeHtmlGov = creatorStatusBadgesHtml(govNavyUser);
          out.badgeHtmlOrg = creatorStatusBadgesHtml(orgUser);
          return out;
        });

        a.equal(unit.constants.slate, '#64748B', 'GOV_BADGE_SLATE is #64748B');
        a.equal(unit.constants.navy, '#1E3A8A', 'GOV_BADGE_NAVY is #1E3A8A');
        a.equal(unit.constants.org, '#14B8A6', 'ORG_BADGE_GREEN is #14B8A6');
        a.equal(unit.govSlateColor, '#64748B', 'govOrgBadgeColorFor returns Slate by default');
        a.equal(unit.govNavyColor, '#1E3A8A', 'govOrgBadgeColorFor returns Navy when set');
        a.equal(unit.orgColor, '#14B8A6', 'govOrgBadgeColorFor returns #14B8A6 for Organization');
        a.ok(unit.govShown && !unit.govPendingShown && unit.orgShown, 'isGovOrOrgBadgeShown gates on approved status');
        a.ok(unit.svgNavy.includes('#1E3A8A') && unit.svgOrg.includes('#14B8A6'), 'officialVerifiedSvg renders exact hex fills');
        a.ok(unit.matchPlus && unit.matchBizPlus && !unit.matchWrongTier && !unit.matchInactive,
          'Matching Plus/Business Plus subscription gating works strictly');
        a.equal(unit.govCatLabel, 'Government', 'displayedCategoryLabel Government');
        a.equal(unit.orgCatLabel, 'Organization', 'displayedCategoryLabel Organization');
        a.equal(unit.govSubtitle, 'Government', 'officialCategorySubtitle Government');
        a.equal(unit.orgSubtitle, 'Organization', 'officialCategorySubtitle Organization');
        a.ok(unit.badgeHtmlGov.includes('#1E3A8A') && unit.badgeHtmlOrg.includes('#14B8A6'), 'creatorStatusBadgesHtml renders Gov Navy & Org Teal badges');

        // E2E gating & upgrade flow: unsubscribed user blocked at paywall -> subscribed Plus user switches Navy/Slate & lapses safely
        await h.openEditProfile(page);
        await page.click('#btn-edit-account-government');
        await page.waitForSelector('#modal-verification-paywall:not(.hidden)', { timeout: 3000 });
        const paywallText = await page.textContent('#verification-paywall-message');
        a.ok(paywallText.includes('Pixlynote Plus or Business Plus'), 'Paywall gates Government account upgrade without Plus');
        await page.click('#btn-close-verification-paywall');

        // Grant active Plus + approved Gov verification -> color toggle, lapse, and Org badge rendering
        const badgeCheck = await page.evaluate(() => {
          const readProfileBadge = () => {
            const el = document.getElementById('profile-verified-badge');
            return el ? { shown: !el.classList.contains('hidden'), color: el.getAttribute('data-badge-color') || el.style.color || '' } : {};
          };
          state.currentUser.accountType = 'personal';
          state.currentUser.isPlus = true;
          state.currentUser.isVerified = true;
          state.currentUser.verificationType = 'government';
          state.currentUser.verificationStatus = 'approved';
          state.currentUser.verificationEntityName = 'City Civic Dept';
          state.currentUser.verificationEmail = 'press@city.gov';
          setGovernmentBadgeColor('navy');
          renderProfile();
          const navyBadge = readProfileBadge();
          setGovernmentBadgeColor('slate');
          renderProfile();
          const slateBadge = readProfileBadge();

          // Simulate subscription lapse -> revokes live Gov badge (lapsed status)
          state.currentUser.isPlus = false;
          state.currentUser.isVerified = false;
          syncGovOrgVerificationWithSubscription();
          const lapsed = {
            shown: isGovOrOrgBadgeShown(state.currentUser),
            status: state.currentUser.verificationStatus,
            onFile: verificationApprovalOnFile(state.currentUser)
          };

          // Organization account badge rendering
          state.currentUser.isPlus = true;
          state.currentUser.isVerified = true;
          state.currentUser.verificationType = 'organization';
          state.currentUser.verificationStatus = 'approved';
          renderProfile();
          const orgBadge = readProfileBadge();
          return { navyBadge, slateBadge, lapsed, orgBadge };
        });

        a.ok(badgeCheck.navyBadge.shown && badgeCheck.navyBadge.color === '#1E3A8A', 'Profile header badge renders Navy #1E3A8A: ' + JSON.stringify(badgeCheck.navyBadge));
        a.ok(badgeCheck.slateBadge.shown && badgeCheck.slateBadge.color === '#64748B', 'Profile header badge switches to Slate #64748B: ' + JSON.stringify(badgeCheck.slateBadge));
        a.ok(!badgeCheck.lapsed.shown, 'Canceled Plus hides Gov badge');
        a.equal(badgeCheck.lapsed.status, 'lapsed', 'Verification status becomes lapsed on cancel');
        a.ok(badgeCheck.lapsed.onFile, 'Approval remains on file for instant restore on resubscribe');
        a.ok(badgeCheck.orgBadge.shown && badgeCheck.orgBadge.color === '#14B8A6', 'Profile header badge renders Organization teal #14B8A6: ' + JSON.stringify(badgeCheck.orgBadge));
      }
    },

    // Item 2: Beta indicator
    {
      name: 'Item 2: Subtle Beta pill next to logo does not overlap on mobile and About shows Beta release line',
      accounts: ['personal'],
      covers: ['el:#nav-beta-pill', 'el:#own-info-app-release'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await freshMobile(page, h, account);

        const layout = await page.evaluate(() => {
          const pill = document.getElementById('nav-beta-pill');
          const brand = document.getElementById('nav-brand-btn');
          const navRight = document.getElementById('nav-right-controls');
          if (!pill || !brand) return null;
          const pr = pill.getBoundingClientRect();
          const br = brand.getBoundingClientRect();
          const rr = navRight ? navRight.getBoundingClientRect() : null;
          return {
            text: pill.textContent.trim(),
            visible: pr.width > 0 && pr.height > 0 && getComputedStyle(pill).display !== 'none',
            insideBrand: pr.left >= br.left - 1 && pr.right <= br.right + 1,
            noOverlapRight: !rr || pr.right <= rr.left + 1,
            withinViewport: pr.right <= window.innerWidth
          };
        });
        a.ok(layout && layout.visible, 'Beta pill is visible in header');
        a.equal(layout.text.toLowerCase(), 'beta', 'Beta pill text says Beta');
        a.ok(layout.insideBrand && layout.noOverlapRight && layout.withinViewport,
          'Beta pill fits cleanly beside Pixlynote logo without overlapping mobile controls: ' + JSON.stringify(layout));

        await h.openOwnerMenu(page);
        await page.click('#btn-drawer-info-about');
        await page.waitForSelector('#profile-info-container:not(.hidden)', { timeout: 3000 });
        const releaseLine = (await page.textContent('#own-info-app-release')).trim();
        a.ok(/beta/i.test(releaseLine), 'About/Info section includes Beta release indicator: ' + releaseLine);
      }
    },

    // Item 3: Story bar includes connected users
    {
      name: 'Item 3: Story bar includes connected users with active stories, hides connections without stories, and sorts viewed after unviewed',
      accounts: ['personal'],
      covers: ['el:#stories-container', 'handler:openStory', 'handler:buildConnectedStoryEntries', 'handler:sortFeedStoriesByViewed'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await freshMobile(page, h, account);
        const installFn = installMockFsFn();
        const now = Date.now();

        await page.evaluate(installFn, {
          seed: {
            users: {
              [account.username]: {
                username: account.username,
                fullName: account.fullName,
                following: [
                  { id: 1, username: 'conn_viewed_user', fullName: 'Conn Viewed User', isFollowing: true, explicit: true, followedAt: Date.now() },
                  { id: 2, username: 'conn_quiet_user', fullName: 'Conn Quiet User', isFollowing: true, explicit: true, followedAt: Date.now() },
                  { id: 3, username: 'conn_story_user', fullName: 'Conn Story User', isFollowing: true, explicit: true, followedAt: Date.now() }
                ]
              },
              conn_story_user: {
                username: 'conn_story_user',
                fullName: 'Conn Story User',
                avatar: TINY_IMG,
                userStories: [
                  { id: 'cs-1', image: TINY_IMG, time: '10m ago', timestamp: now - 600000, createdAtMs: now - 600000, caption: 'Connected slide 1', audience: 'everyone', likes: 0, likedByMe: false, views: [] },
                  { id: 'cs-2', image: TINY_IMG, time: '5m ago', timestamp: now - 300000, createdAtMs: now - 300000, caption: 'Connected slide 2', audience: 'everyone', likes: 0, likedByMe: false, views: [] }
                ]
              },
              conn_viewed_user: {
                username: 'conn_viewed_user',
                fullName: 'Conn Viewed User',
                avatar: TINY_IMG,
                userStories: [
                  { id: 'cv-1', image: TINY_IMG, time: '20m ago', timestamp: now - 1200000, createdAtMs: now - 1200000, caption: 'Already seen', audience: 'everyone', likes: 0, likedByMe: false, views: [] }
                ]
              },
              conn_quiet_user: {
                username: 'conn_quiet_user',
                fullName: 'Conn Quiet User',
                avatar: TINY_IMG,
                userStories: []
              },
              unconnected_stranger: {
                username: 'unconnected_stranger',
                fullName: 'Unconnected Stranger',
                avatar: TINY_IMG,
                userStories: [
                  { id: 'us-1', image: TINY_IMG, time: '2m ago', timestamp: now - 120000, createdAtMs: now - 120000, caption: 'Should not appear', audience: 'everyone', likes: 0, likedByMe: false, views: [] }
                ]
              }
            },
            edges: {
              conn_story_user: { [account.username]: { username: account.username, followedAt: Date.now() } },
              conn_viewed_user: { [account.username]: { username: account.username, followedAt: Date.now() } },
              conn_quiet_user: { [account.username]: { username: account.username, followedAt: Date.now() } }
            }
          }
        });

        await h.gotoMainTab(page, 'feed');
        await page.evaluate(async () => {
          state.following = [
            { id: 1, username: 'conn_viewed_user', fullName: 'Conn Viewed User', isFollowing: true, explicit: true, followedAt: Date.now() },
            { id: 2, username: 'conn_quiet_user', fullName: 'Conn Quiet User', isFollowing: true, explicit: true, followedAt: Date.now() },
            { id: 3, username: 'conn_story_user', fullName: 'Conn Story User', isFollowing: true, explicit: true, followedAt: Date.now() }
          ];
          window._exploreUserDir = null;
          if (typeof loadExploreUserDirectory === 'function') await loadExploreUserDirectory(true);
          if (typeof renderStories === 'function') renderStories();
          const viewedEntry = (state.stories || []).find((s) => normalizeUsername(s.username || s.author || '') === 'conn_viewed_user');
          if (viewedEntry && typeof markStoryViewed === 'function') {
            (viewedEntry.userStories || [viewedEntry]).forEach((st) => markStoryViewed(st));
          }
          if (typeof renderStories === 'function') renderStories();
        });

        const bar = await page.evaluate(() =>
          Array.from(document.querySelectorAll('#stories-container .story-trigger')).map((el) => ({
            userAttr: (el.getAttribute('data-story-user') || '').replace(/^@/, '').toLowerCase(),
            ring: ((el.querySelector('[data-story-ring]') || {}).getAttribute('data-story-ring') || '')
          }))
        );
        const names = bar.map((x) => x.userAttr);
        a.ok(names.includes('conn_story_user'), 'Connected user with an active story appears in the story bar: ' + JSON.stringify(names));
        a.ok(!names.includes('conn_quiet_user'), 'Connected user with no active story is absent from the story bar: ' + JSON.stringify(names));
        a.ok(!names.includes('unconnected_stranger') && !names.includes('elena_eats'),
          'Unconnected demo/stranger users do not appear in the story bar: ' + JSON.stringify(names));
        a.ok(names.includes('conn_viewed_user'), 'Connected user whose story has been viewed still appears: ' + JSON.stringify(names));
        const unviewedIdx = names.indexOf('conn_story_user');
        const viewedIdx = names.indexOf('conn_viewed_user');
        a.ok(unviewedIdx !== -1 && viewedIdx !== -1 && unviewedIdx < viewedIdx,
          'Viewed stories sort after unviewed stories (to the right): ' + JSON.stringify(bar));
        const viewedRing = (bar.find((x) => x.userAttr === 'conn_viewed_user') || {}).ring;
        const unviewedRing = (bar.find((x) => x.userAttr === 'conn_story_user') || {}).ring;
        a.equal(unviewedRing, 'unviewed', 'Unseen connected story has an unviewed ring');
        a.equal(viewedRing, 'viewed', 'Seen connected story has a viewed ring');

        // Tapping connected user with active stories opens multi-slide story viewer
        await page.click('#stories-container .story-trigger[data-story-user="conn_story_user"]');
        await page.waitForSelector('#modal-story-viewer:not(.hidden)', { timeout: 3000 });
        const sv = await page.evaluate(() => ({
          user: (document.getElementById('story-viewer-username') || {}).textContent.trim(),
          caption: (document.getElementById('story-viewer-caption') || {}).textContent.trim()
        }));
        a.equal(sv.user, 'conn_story_user', 'Story viewer opens connected user story');
        a.equal(sv.caption, 'Connected slide 1', 'First slide caption shown');
        await page.click('#btn-story-next');
        await page.waitForTimeout(80);
        const cap2 = (await page.textContent('#story-viewer-caption')).trim();
        a.equal(cap2, 'Connected slide 2', 'Next slide advances to second story');
        await page.click('#btn-close-story');

        await page.evaluate(() => { delete window.firebase; window.firebaseReady = false; delete window.__mockFs; });
        await h.loadApp(page, { port });
      }
    },

    // Item 4: Business sign-up prefills Edit Profile Business Package section
    {
      name: 'Item 4: Business sign-up fields prefill Edit Profile Business Package section immediately and after reload',
      accounts: ['signed-out'],
      covers: [
        'el:#btn-account-type-business',
        'el:#signup-dba-name',
        'el:#signup-business-industry',
        'el:#signup-business-industry-other',
        'el:#edit-profile-name',
        'el:#edit-profile-dba-name',
        'el:#edit-profile-business-industry',
        'el:#edit-profile-business-hours'
      ],
      async run(ctx) {
        const { page, h, a } = ctx;
        const port = await freshMobile(page, h, null);
        const installFn = installMockFsFn();
        await page.evaluate(installFn, { seed: { users: {}, edges: {} } });

        await h.openSignupForm(page);
        await page.click('#btn-account-type-business');
        await page.waitForSelector('#signup-business-fields:not(.hidden)', { timeout: 3000 });

        const uniq = 'bizprefill_' + (Date.now() % 100000);
        await page.fill('#login-fullname', 'Sunrise Roasters LLC');
        await page.fill('#signup-dba-name', 'Sunrise Coffee');
        await page.selectOption('#signup-business-industry', 'other');
        await page.waitForSelector('#signup-business-industry-other-wrap:not(.hidden)', { timeout: 3000 });
        await page.fill('#signup-business-industry-other', 'Specialty Micro-Roastery');
        await page.fill('#signup-username', uniq);
        await page.fill('#login-email', uniq + '@example.test');
        await page.fill('#signup-password', 'StrongPass123!');
        await page.evaluate(() => {
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('signup-username')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
          if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
        });
        await page.click('#btn-signup-send-email-code');
        await page.waitForTimeout(150);
        await page.fill('#signup-email-code', VERIFY_CODE);
        await page.click('#btn-signup-verify-email-code');
        await page.waitForTimeout(150);

        await page.click('#btn-signup-to-step2');
        await page.waitForSelector('#signup-step-2:not(.hidden)', { timeout: 3000 });
        await page.fill('#signup-bio', 'Small-batch coffee roasted daily.');
        await page.fill('#signup-link', 'https://sunriseroasters.example');
        await page.click('#btn-signup-complete');
        await page.waitForSelector('#main-view:not(.hidden)', { timeout: 10000 });

        await h.openEditProfile(page);
        const vals1 = await page.evaluate(() => ({
          businessName: document.getElementById('edit-profile-name').value,
          dbaName: document.getElementById('edit-profile-dba-name').value,
          industry: document.getElementById('edit-profile-business-industry').value,
          industryOther: document.getElementById('edit-profile-business-industry-other').value,
          bio: document.getElementById('edit-profile-bio').value,
          link: document.getElementById('edit-profile-link').value
        }));
        a.equal(vals1.businessName, 'Sunrise Roasters LLC', 'Edit Profile Business Name prefilled');
        a.equal(vals1.dbaName, 'Sunrise Coffee', 'Edit Profile DBA prefilled');
        a.equal(vals1.industry, 'other', 'Edit Profile Industry prefilled');
        a.equal(vals1.industryOther, 'Specialty Micro-Roastery', 'Edit Profile Custom Industry prefilled');
        a.equal(vals1.bio, 'Small-batch coffee roasted daily.', 'Edit Profile Bio prefilled');
        a.equal(vals1.link, 'https://sunriseroasters.example/', 'Edit Profile Website prefilled');

        // Reload page and confirm persistence didn't strip businessIndustry / businessName / businessIndustryOther
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof openEditProfileModal === 'function' && window.state && state.isLoggedIn, null, { timeout: 30000 });
        await h.installAppStubs(page);
        await h.openEditProfile(page);
        const vals2 = await page.evaluate(() => ({
          businessName: document.getElementById('edit-profile-name').value,
          dbaName: document.getElementById('edit-profile-dba-name').value,
          industry: document.getElementById('edit-profile-business-industry').value,
          industryOther: document.getElementById('edit-profile-business-industry-other').value
        }));
        a.equal(vals2.businessName, 'Sunrise Roasters LLC', 'Business Name survives reload');
        a.equal(vals2.dbaName, 'Sunrise Coffee', 'DBA survives reload');
        a.equal(vals2.industry, 'other', 'Business Industry survives reload');
        a.equal(vals2.industryOther, 'Specialty Micro-Roastery', 'Custom Industry survives reload');

        // User can continue and finish remaining Business Package fields
        await page.fill('#edit-profile-business-hours', 'Mon-Fri 7am-5pm');
        await page.fill('#edit-profile-support-email', 'hello@sunriseroasters.example');
        await page.click('#btn-save-edit-profile');
        await page.waitForTimeout(150);
        const saved = await page.evaluate(() => ({
          hours: state.currentUser.businessHours,
          support: state.currentUser.businessSupportEmail,
          industry: state.currentUser.businessIndustry
        }));
        a.equal(saved.hours, 'Mon-Fri 7am-5pm', 'Remaining business hours field saved');
        a.equal(saved.support, 'hello@sunriseroasters.example', 'Business support email saved');
        a.equal(saved.industry, 'other', 'Business industry retained on save');

        await h.resetToSignedOut(page, { port });
      }
    },

    // Item 5: Disconnect confirmation dropdown across Connected buttons
    {
      name: 'Item 5: Tapping Connected shows Disconnect confirm dropdown (Cancel preserves, Disconnect removes) on profile & lists',
      accounts: ['personal'],
      covers: [
        'el:#menu-disconnect-confirm',
        'el:#btn-disconnect-cancel',
        'el:#btn-disconnect-confirm',
        'handler:openDisconnectConfirm',
        'handler:closeDisconnectConfirm'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await freshMobile(page, h, account);

        // Seed connected target via UI on elena_eats
        await page.evaluate(() => {
          state.following = [{ id: 101, username: 'elena_eats', fullName: 'Elena Rostova', isFollowing: true, explicit: true, followedAt: Date.now() }];
          persistState();
          if (typeof viewUserProfile === 'function') viewUserProfile('elena_eats', 'explore');
        });
        await page.waitForSelector('#btn-user-profile-follow', { timeout: 3000 });
        a.equal((await page.textContent('#user-profile-follow-text')).trim(), 'Connected', 'Initially Connected on profile');

        // Tap Connected -> confirm popover appears, Cancel keeps connection
        await page.click('#btn-user-profile-follow');
        await page.waitForSelector('#menu-disconnect-confirm:not(.hidden)', { timeout: 3000 });
        a.equal((await page.textContent('#disconnect-confirm-title')).trim(), 'Disconnect @elena_eats?', 'Popover asks Disconnect @elena_eats?');
        a.equal((await page.textContent('#user-profile-follow-text')).trim(), 'Connected', 'Connection is NOT removed before confirm');
        await page.click('#btn-disconnect-cancel');
        await page.waitForTimeout(80);
        const hiddenAfterCancel = await page.evaluate(() => document.getElementById('menu-disconnect-confirm').classList.contains('hidden'));
        a.ok(hiddenAfterCancel, 'Cancel hides disconnect confirm menu');
        a.equal((await page.textContent('#user-profile-follow-text')).trim(), 'Connected', 'Cancel preserves Connected state');

        // Tap Connected again -> click Disconnect -> removes connection
        await page.click('#btn-user-profile-follow');
        await page.waitForSelector('#menu-disconnect-confirm:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-disconnect-confirm');
        await page.waitForTimeout(100);
        a.equal((await page.textContent('#user-profile-follow-text')).trim(), 'Connect', 'Confirm disconnects and flips to Connect');
        const stillFollowing = await page.evaluate(() => isUserFollowingCreator('elena_eats'));
        a.ok(!stillFollowing, 'elena_eats removed from state.following');

        // Also verify Connected list modal requires confirmation before disconnecting
        await page.evaluate(() => {
          state.following = [{ id: 102, username: 'city_vibe', fullName: 'City Vibe', isFollowing: true, explicit: true, followedAt: Date.now() }];
          persistState();
          if (typeof switchMainTab === 'function') switchMainTab('profile');
          if (typeof openFollowingModal === 'function') openFollowingModal();
        });
        await page.waitForSelector('.btn-toggle-following-user[data-username="city_vibe"]', { timeout: 3000 });
        await page.click('.btn-toggle-following-user[data-username="city_vibe"]');
        await page.waitForSelector('#menu-disconnect-confirm:not(.hidden)', { timeout: 3000 });
        a.equal((await page.textContent('#disconnect-confirm-title')).trim(), 'Disconnect @city_vibe?', 'Connected modal row opens Disconnect @city_vibe?');
        await page.click('#btn-disconnect-confirm');
        await page.waitForTimeout(100);
        const cityFollowing = await page.evaluate(() => isUserFollowingCreator('city_vibe'));
        a.ok(!cityFollowing, 'Connected modal Disconnect removes connection on confirm');
      }
    },

    // Item 6: Connections leakage fix (6a) + Close Friends caret Connect button (6b)
    {
      name: 'Item 6: Stale outbound follower edges are cleaned up (6a) and Close Friends caret includes Connect action (6b)',
      accounts: ['personal'],
      covers: [
        'el:#btn-cf-menu-connect',
        'listener:#btn-cf-menu-connect:click',
        'handler:reconcileMyConnectionEdges',
        'handler:reconcileViewedConnectionsWithLocal'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await freshMobile(page, h, account);
        const installFn = installMockFsFn();
        const me = account.username.toLowerCase();

        // 6a: Simulate me having empty Connected list, while stale edge exists in other_user's followers/{me}
        await page.evaluate(installFn, {
          seed: {
            users: {
              [me]: { username: me, fullName: account.fullName, following: [] },
              other_user: { username: 'other_user', fullName: 'Other User', following: [] }
            },
            edges: {
              other_user: {
                [me]: { username: me, fullName: account.fullName, followedAt: 1000 },
                real_fan: { username: 'real_fan', fullName: 'Real Fan', followedAt: 1000 }
              }
            }
          }
        });

        await page.evaluate(async () => {
          state.following = [];
          window._connReconciledFor = null;
          window._followingHydratedFor = state.currentUser.username.toLowerCase();
          window._explicitUnfollowTargets = {};
          if (typeof reconcileMyConnectionEdges === 'function') await reconcileMyConnectionEdges();
          if (typeof viewUserProfile === 'function') await viewUserProfile('other_user', 'explore');
        });
        await page.waitForTimeout(250);

        const cleanCheck = await page.evaluate(() => {
          const fs = window.__mockFsRead();
          const viewedConns = (window._viewedConn && window._viewedConn.connections) ? window._viewedConn.connections.map((c) => c.username) : [];
          const count = (document.getElementById('user-profile-followers-count') || {}).textContent.trim();
          return { edgeExists: Boolean(fs.edges.other_user && fs.edges.other_user[state.currentUser.username.toLowerCase()]), viewedConns, count };
        });
        a.ok(!cleanCheck.edgeExists, 'Stale outbound edge users/other_user/followers/me was deleted by reconciliation');
        a.ok(!cleanCheck.viewedConns.includes(me) && cleanCheck.viewedConns.includes('real_fan'),
          'Viewed Connections excludes self when not connected and preserves real_fan: ' + JSON.stringify(cleanCheck.viewedConns));
        a.equal(cleanCheck.count, '1', 'Viewed profile Connections count matches real list (1)');

        // 6b: Close Friends-only vs Connected states & caret Connect button
        await page.evaluate(() => {
          if (typeof viewUserProfile === 'function') viewUserProfile('other_user', 'explore');
        });
        await page.waitForSelector('#btn-user-profile-cf-caret', { timeout: 3000 });

        // State 1 -> 2: Neither -> Add to Close Friends
        await page.click('#btn-user-profile-cf-caret');
        await page.waitForSelector('#menu-user-profile-cf:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-cf-menu-toggle');
        await page.waitForTimeout(80);
        const cfOnly = await page.evaluate(() => ({
          isCf: isCloseFriend('other_user'),
          isConnected: isUserFollowingCreator('other_user'),
          btnText: (document.getElementById('user-profile-follow-text') || {}).textContent.trim(),
          btnClass: (document.getElementById('btn-user-profile-follow') || {}).className || ''
        }));
        a.ok(cfOnly.isCf && !cfOnly.isConnected, 'Close Friends toggled ON without forcing Connected');
        a.equal(cfOnly.btnText, 'Connect', 'Close Friends-only state keeps label Connect');
        a.ok(cfOnly.btnClass.includes('emerald'), 'Close Friends-only state uses green styling');

        // Reopen caret -> Connect button is visible -> click Connect -> State 4 (Connected + CF)
        await page.click('#btn-user-profile-cf-caret');
        await page.waitForSelector('#btn-cf-menu-connect:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-cf-menu-connect');
        await page.waitForTimeout(100);
        const bothOn = await page.evaluate(() => ({
          isCf: isCloseFriend('other_user'),
          isConnected: isUserFollowingCreator('other_user'),
          btnText: (document.getElementById('user-profile-follow-text') || {}).textContent.trim()
        }));
        a.ok(bothOn.isCf && bothOn.isConnected && bothOn.btnText === 'Connected',
          'Caret Connect completes the connection while keeping Close Friends');

        // Reopen caret when already Connected -> Connect option is hidden
        await page.click('#btn-user-profile-cf-caret');
        await page.waitForSelector('#menu-user-profile-cf:not(.hidden)', { timeout: 3000 });
        const connectHidden = await page.evaluate(() => document.getElementById('btn-cf-menu-connect').classList.contains('hidden'));
        a.ok(connectHidden, 'Caret Connect option hides once already Connected');

        await page.evaluate(() => { delete window.firebase; window.firebaseReady = false; delete window.__mockFs; });
        await h.loadApp(page, { port });
      }
    },

    // Item 7: Help Center in right-side (⋮) menu above Info/About
    {
      name: 'Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#btn-drawer-help-center',
        'el:#modal-help-center',
        'el:#btn-close-help-center',
        'el:#btn-help-center-feedback',
        'el:#help-center-support-mailto',
        'href:mailto:support@pixlynote.com?subject=Pixlynote%20Support',
        'handler:openHelpCenterModal',
        'handler:closeHelpCenterModal',
        'handler:openHelpCenterFeedback'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await freshMobile(page, h, account);

        await h.openOwnerMenu(page);
        const orderOk = await page.evaluate(() => {
          const hc = document.getElementById('btn-drawer-help-center');
          const info = document.getElementById('btn-drawer-info-about');
          if (!hc || !info) return false;
          return !!(hc.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        a.ok(orderOk, 'Help Center menu item sits directly above Info / About in right-side drawer');

        await page.click('#btn-drawer-help-center');
        await page.waitForSelector('#modal-help-center:not(.hidden)', { timeout: 3000 });

        const hcData = await page.evaluate(() => {
          const faqs = document.querySelectorAll('#help-center-faq-list > div').length;
          const mailto = document.getElementById('help-center-support-mailto');
          return { faqs, href: mailto ? mailto.getAttribute('href') : '' };
        });
        a.ok(hcData.faqs >= 4, 'Help Center displays Pixlynote FAQs (' + hcData.faqs + ')');
        a.ok((hcData.href || '').startsWith('mailto:support@pixlynote.com'), 'Help Center includes support@pixlynote.com mailto fallback: ' + hcData.href);

        // Intercept /support/feedback and click Submit feedback from Help Center
        let posted = null;
        await page.route('**/support/feedback', async (route) => {
          posted = route.request().postDataJSON();
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        });

        await page.click('#btn-help-center-feedback');
        await page.waitForSelector('#modal-submit-feedback:not(.hidden)', { timeout: 3000 });
        await page.fill('#feedback-message', 'Help Center feedback test from @' + account.username);
        await page.click('#btn-feedback-send');
        await page.waitForTimeout(150);
        a.ok(posted && posted.message.includes('Help Center feedback test'), 'Submit feedback posts to /support/feedback');

        await page.unroute('**/support/feedback').catch(() => {});
      }
    },

    // Item 8: Account switcher adding accounts while signed in (2nd, 3rd, 4th, signup, re-add existing, cancel mid-add)
    {
      name: 'Item 8: Switcher preserves existing accounts when adding 2nd/3rd/4th via login or signup, re-adding existing, or canceling mid-add',
      accounts: ['personal'],
      covers: [
        'el:#btn-header-profile',
        'el:#btn-switcher-login',
        'el:#btn-switcher-signup',
        'el:#btn-auth-return-session',
        'el:#header-account-count-badge',
        'handler:openAuthFromSwitcher',
        'handler:registerSessionAccount',
        'handler:renderAccountSwitcherList',
        'handler:updateChatHeadBadge'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await freshMobile(page, h, account);

        // Reset session switcher to just the signed-in account, then seed 2nd & 3rd accounts (3 total)
        await page.evaluate(({ biz, pixly, acct }) => {
          sessionStorage.removeItem('pixly_current_session_accounts');
          if (typeof registerSessionAccount === 'function' && typeof sessionAccountSnapshot === 'function') {
            registerSessionAccount(sessionAccountSnapshot(state.currentUser));
          }
          const seedAcct = (acc) => {
            const key = acc.username.toLowerCase();
            window._pixlyAccounts = window._pixlyAccounts || {};
            window._pixlyAccounts[key] = acc;
            const accts = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
            accts[key] = acc;
            localStorage.setItem('pixly_accounts', JSON.stringify(accts));
            localStorage.setItem('pixly_account_' + key, JSON.stringify(acc));
          };
          seedAcct({ username: biz.username, fullName: biz.fullName, email: biz.email, phone: biz.phone, accountType: 'business', dbaName: 'Reg Biz DBA', passwordHash: '' });
          seedAcct({ username: pixly.username, fullName: pixly.fullName, email: pixly.email, phone: pixly.phone, accountType: 'business', passwordHash: '' });
          // Pre-hash TestPass123! via hashPassword so handleLoginAction verifies it via real login UI
          return Promise.all([
            hashPassword(biz.password).then((pw) => {
              localStorage.setItem('pixly_user_password_' + biz.username.toLowerCase(), pw);
              if (typeof registerSessionAccount === 'function') {
                registerSessionAccount({ username: biz.username, fullName: biz.fullName, email: biz.email, phone: biz.phone, accountType: 'business' });
              }
            }),
            hashPassword(pixly.password).then((pw) => {
              localStorage.setItem('pixly_user_password_' + pixly.username.toLowerCase(), pw);
              if (typeof registerSessionAccount === 'function') {
                registerSessionAccount({ username: pixly.username, fullName: pixly.fullName, email: pixly.email, phone: pixly.phone, accountType: 'business' });
              }
            }),
            hashPassword('FourthPass123!').then((pw) => {
              seedAcct({ username: 'acct_fourth', fullName: 'Fourth Account', email: 'fourth@example.test', accountType: 'personal', passwordHash: pw });
              localStorage.setItem('pixly_user_password_acct_fourth', pw);
            }),
            hashPassword(acct.password).then((pw) => {
              localStorage.setItem('pixly_user_password_' + acct.username.toLowerCase(), pw);
            })
          ]);
        }, { biz: h.ACCOUNTS.business, pixly: h.ACCOUNTS.pixlynote, acct: account });

        // Verify starting state has 3 accounts in switcher + badge = 3
        await page.click('#btn-header-profile');
        await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
        const startRows = await page.evaluate(() => ({
          rows: Array.from(document.querySelectorAll('.account-switcher-row')).map((el) => el.dataset.username.toLowerCase()),
          badge: (document.getElementById('header-account-count-badge') || {}).textContent.trim()
        }));
        a.equal(startRows.rows.length, 3, 'Starts with 3 accounts in switcher: ' + JSON.stringify(startRows));
        a.equal(startRows.badge, '3', 'Badge shows 3');

        // 1. Add 4th account via "Log into another account" while signed in with 3 accounts
        await page.click('#btn-switcher-login');
        await page.waitForSelector('#auth-login-container:not(.hidden)', { timeout: 3000 });
        await page.fill('#login-username', 'acct_fourth');
        await page.fill('#login-password', 'FourthPass123!');
        await page.click('#btn-auth-submit');
        await page.waitForFunction(() => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === 'acct_fourth'), null, { timeout: 5000 });

        await page.click('#btn-header-profile');
        await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
        const after4th = await page.evaluate(() => ({
          cur: state.currentUser.username,
          rows: Array.from(document.querySelectorAll('.account-switcher-row')).map((el) => el.dataset.username.toLowerCase()),
          badge: (document.getElementById('header-account-count-badge') || {}).textContent.trim()
        }));
        a.equal(after4th.cur, 'acct_fourth', 'Signed into 4th account');
        a.equal(after4th.rows.length, 4, 'All 4 accounts are in switcher (no loss): ' + JSON.stringify(after4th.rows));
        a.ok(after4th.rows.includes(account.username) && after4th.rows.includes(h.ACCOUNTS.business.username) && after4th.rows.includes('pixlynote') && after4th.rows.includes('acct_fourth'),
          'All 4 specific usernames preserved: ' + JSON.stringify(after4th.rows));
        a.equal(after4th.badge, '4', 'Chat-head badge updated to 4');

        // 2. Re-add an existing account (reg_business) via "Log into another account" -> no duplicate & keeps DBA
        await page.click('#btn-switcher-login');
        await page.waitForSelector('#auth-login-container:not(.hidden)', { timeout: 3000 });
        await page.fill('#login-username', h.ACCOUNTS.business.username);
        await page.fill('#login-password', h.ACCOUNTS.business.password);
        await page.click('#btn-auth-submit');
        await page.waitForFunction((u) => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === u), h.ACCOUNTS.business.username, { timeout: 5000 });

        await page.click('#btn-header-profile');
        await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
        const afterReadd = await page.evaluate(() => ({
          rows: Array.from(document.querySelectorAll('.account-switcher-row')).map((el) => el.dataset.username.toLowerCase()),
          dba: state.currentUser.dbaName,
          badge: (document.getElementById('header-account-count-badge') || {}).textContent.trim()
        }));
        a.equal(afterReadd.rows.length, 4, 'Re-adding existing account does not duplicate or drop others: ' + JSON.stringify(afterReadd.rows));
        a.equal(afterReadd.dba, 'Reg Biz DBA', 'Re-adding existing business account preserves stored DBA');
        a.equal(afterReadd.badge, '4', 'Badge stays 4');

        // 3. Add a 5th account via "Create a new account" while signed in
        await page.click('#btn-switcher-signup');
        await page.waitForSelector('#auth-signup-container:not(.hidden)', { timeout: 3000 });
        const fifthU = 'acct_fifth_' + (Date.now() % 10000);
        await page.fill('#login-fullname', 'Fifth User');
        await page.fill('#signup-username', fifthU);
        await page.fill('#login-email', fifthU + '@example.test');
        await page.fill('#signup-password', 'FifthPass123!');
        await page.evaluate(() => {
          document.getElementById('login-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('signup-username')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncSignupVerifyUi === 'function') syncSignupVerifyUi();
          if (typeof updateSignUpValidationState === 'function') updateSignUpValidationState();
        });
        await page.click('#btn-signup-send-email-code');
        await page.waitForTimeout(150);
        await page.fill('#signup-email-code', VERIFY_CODE);
        await page.click('#btn-signup-verify-email-code');
        await page.waitForTimeout(150);
        await page.click('#btn-signup-to-step2');
        await page.waitForSelector('#signup-step-2:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-signup-complete');
        await page.waitForFunction((u) => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === u), fifthU, { timeout: 5000 });

        await page.click('#btn-header-profile');
        await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
        const after5th = await page.evaluate(() => ({
          rows: Array.from(document.querySelectorAll('.account-switcher-row')).map((el) => el.dataset.username.toLowerCase()),
          badge: (document.getElementById('header-account-count-badge') || {}).textContent.trim()
        }));
        a.equal(after5th.rows.length, 5, 'Creating a 5th account while signed in keeps all 5 in switcher: ' + JSON.stringify(after5th.rows));
        a.equal(after5th.badge, '5', 'Chat-head badge shows 5');

        // 4. Cancel mid-add via "Return to session" -> re-entering password restores all 5 accounts cleanly
        await page.click('#btn-switcher-login');
        await page.waitForSelector('#btn-auth-return-session:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-auth-return-session');
        await page.waitForTimeout(120);
        a.equal(await page.inputValue('#login-username'), fifthU, 'Return-to-session prefills returning username');
        await page.fill('#login-password', 'FifthPass123!');
        await page.click('#btn-auth-submit');
        await page.waitForFunction((u) => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === u), fifthU, { timeout: 5000 });

        await page.click('#btn-header-profile');
        await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
        const afterCancelReturn = await page.evaluate(() => ({
          rows: Array.from(document.querySelectorAll('.account-switcher-row')).map((el) => el.dataset.username.toLowerCase()),
          badge: (document.getElementById('header-account-count-badge') || {}).textContent.trim()
        }));
        a.equal(afterCancelReturn.rows.length, 5, 'Canceling mid-add and returning preserves all 5 accounts: ' + JSON.stringify(afterCancelReturn.rows));
        a.equal(afterCancelReturn.badge, '5', 'Badge stays 5 after return-to-session');
        await page.click('#btn-close-account-switcher');

        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    },
    // Item 8b: Tapping saved account B (and B -> C) in switcher switches active uid, username, and avatar cleanly and survives reload
    {
      name: 'Item 8b: Switching A -> B and B -> C via switcher sets active uid, username, and avatar immediately and after reload',
      accounts: ['personal'],
      covers: [
        'el:#modal-account-switcher',
        'el:#modal-switch-password',
        'el:#btn-confirm-switch-password',
        'handler:requestAccountSwitchWithAuth',
        'handler:confirmSwitchWithPassword',
        'handler:performLogin'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = await freshMobile(page, h, account);

        const mkSvg = (color) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="' + color + '"/></svg>');
        const avA = mkSvg('#111827');
        const avB = mkSvg('#7c3aed');
        const avC = mkSvg('#0d9488');
        const acctA = { username: account.username, uid: 'uid_' + account.username, fullName: account.fullName, email: account.email, phone: '5555550101', accountType: 'personal', avatar: avA, password: account.password };
        const acctB = { username: h.ACCOUNTS.business.username, uid: 'uid_' + h.ACCOUNTS.business.username, fullName: h.ACCOUNTS.business.fullName, email: h.ACCOUNTS.business.email, phone: '5555550101', accountType: 'business', avatar: avB, password: h.ACCOUNTS.business.password };
        const acctC = { username: 'creator_c_switch', uid: 'uid_creator_c_switch', fullName: 'Creator C', email: 'creatorc@example.test', phone: '5555550199', accountType: 'personal', avatar: avC, password: 'SwitchPassC123!' };

        const installFn = installMockFsFn();
        await page.evaluate(installFn, {
          seed: {
            users: {
              [acctA.username]: { uid: acctA.uid, username: acctA.username, fullName: acctA.fullName, avatar: acctA.avatar, photoURL: acctA.avatar, accountType: 'personal' },
              [acctB.username]: { uid: acctB.uid, username: acctB.username, fullName: acctB.fullName, avatar: acctB.avatar, photoURL: acctB.avatar, accountType: 'business' },
              [acctC.username]: { uid: acctC.uid, username: acctC.username, fullName: acctC.fullName, avatar: acctC.avatar, photoURL: acctC.avatar, accountType: 'personal' }
            },
            edges: {}
          }
        });

        await page.evaluate(async ({ acctA, acctB, acctC }) => {
          const setupAcc = async (rec, setActive) => {
            const k = rec.username.toLowerCase();
            const pwHash = await hashPassword(rec.password);
            const full = { uid: rec.uid, username: rec.username, fullName: rec.fullName, email: rec.email, phone: rec.phone, accountType: rec.accountType, avatar: rec.avatar, passwordHash: pwHash };
            window._pixlyAccounts = window._pixlyAccounts || {};
            window._pixlyAccounts[k] = full;
            const accts = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
            accts[k] = full;
            // Deliberately point shared phone alias at acctA to ensure alias lookup cannot hijack B
            if (rec.username === acctA.username && rec.phone) accts[rec.phone] = full;
            localStorage.setItem('pixly_accounts', JSON.stringify(accts));
            localStorage.setItem('pixly_account_' + k, JSON.stringify(full));
            localStorage.setItem('pixly_user_password_' + k, pwHash);
            if (setActive) {
              state.currentUser.uid = rec.uid;
              state.currentUser.avatar = rec.avatar;
              if (typeof paintSignedInChromeAvatars === 'function') paintSignedInChromeAvatars();
              saveUserProfile();
            }
            if (typeof registerSessionAccount === 'function') {
              registerSessionAccount({ uid: rec.uid, username: rec.username, fullName: rec.fullName, email: rec.email, phone: rec.phone, avatar: rec.avatar, accountType: rec.accountType });
            }
          };
          await setupAcc(acctA, true);
          await setupAcc(acctB, false);
          await setupAcc(acctC, false);
        }, { acctA, acctB, acctC });

        const readActive = async () => page.evaluate(() => {
          if (typeof switchMainTab === 'function') switchMainTab('profile');
          if (typeof renderProfile === 'function') renderProfile();
          return {
            loggedIn: !!(window.state && state.isLoggedIn),
            uid: (window.state && state.currentUser && state.currentUser.uid) || '',
            username: (window.state && state.currentUser && state.currentUser.username) || '',
            avatar: (window.state && state.currentUser && state.currentUser.avatar) || '',
            headerAvatar: (document.getElementById('header-avatar') && document.getElementById('header-avatar').getAttribute('src')) || '',
            profileAvatar: (document.getElementById('profile-page-avatar') && document.getElementById('profile-page-avatar').getAttribute('src')) || '',
            profileUsername: ((document.getElementById('profile-page-username') || {}).textContent || '').trim().replace(/^@/, '')
          };
        });

        const tapSwitchTo = async (target) => {
          await page.click('#btn-header-profile');
          await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
          await page.click('.account-switcher-row[data-username="' + target.username + '"]');
          await page.waitForSelector('#modal-switch-password:not(.hidden)', { timeout: 3000 });
          await page.fill('#switch-password-input', target.password);
          await page.click('#btn-confirm-switch-password');
          await page.waitForFunction((u) => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === u), target.username, { timeout: 6000 });
          await page.waitForTimeout(150);
        };

        // Switch A -> B while signed in (with simulated stale getDoc/hydration for A attempting to race)
        await page.evaluate((uA) => {
          if (typeof window.hydrateActiveAccountFromFirestore === 'function') {
            window.hydrateActiveAccountFromFirestore(uA);
          }
        }, acctA.username);
        await tapSwitchTo(acctB);

        let stB = await readActive();
        a.equal(stB.loggedIn, true, 'A->B: signed in');
        a.equal(stB.uid, acctB.uid, 'A->B: active uid equals B');
        a.equal(stB.username, acctB.username, 'A->B: active username equals B');
        a.equal(stB.profileUsername, acctB.username, 'A->B: profile heading equals B');
        a.equal(stB.avatar, acctB.avatar, 'A->B: currentUser avatar equals B');
        a.equal(stB.headerAvatar, acctB.avatar, 'A->B: header avatar equals B');
        a.equal(stB.profileAvatar, acctB.avatar, 'A->B: profile avatar equals B');

        // Reload page while signed in as B -> must remain B (never revert to A)
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#main-view:not(.hidden)', { timeout: 8000 });
        await page.waitForTimeout(200);
        const stBReload = await readActive();
        a.equal(stBReload.loggedIn, true, 'A->B reload: still signed in');
        a.equal(stBReload.uid, acctB.uid, 'A->B reload: active uid stays B');
        a.equal(stBReload.username, acctB.username, 'A->B reload: active username stays B');
        a.equal(stBReload.avatar, acctB.avatar, 'A->B reload: currentUser avatar stays B');
        a.equal(stBReload.headerAvatar, acctB.avatar, 'A->B reload: header avatar stays B');
        a.equal(stBReload.profileAvatar, acctB.avatar, 'A->B reload: profile avatar stays B');

        // Switch B -> C while signed in
        await tapSwitchTo(acctC);
        let stC = await readActive();
        a.equal(stC.loggedIn, true, 'B->C: signed in');
        a.equal(stC.uid, acctC.uid, 'B->C: active uid equals C');
        a.equal(stC.username, acctC.username, 'B->C: active username equals C');
        a.equal(stC.profileUsername, acctC.username, 'B->C: profile heading equals C');
        a.equal(stC.avatar, acctC.avatar, 'B->C: currentUser avatar equals C');
        a.equal(stC.headerAvatar, acctC.avatar, 'B->C: header avatar equals C');
        a.equal(stC.profileAvatar, acctC.avatar, 'B->C: profile avatar equals C');

        // Reload page while signed in as C -> must remain C
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#main-view:not(.hidden)', { timeout: 8000 });
        await page.waitForTimeout(200);
        const stCReload = await readActive();
        a.equal(stCReload.loggedIn, true, 'B->C reload: still signed in');
        a.equal(stCReload.uid, acctC.uid, 'B->C reload: active uid stays C');
        a.equal(stCReload.username, acctC.username, 'B->C reload: active username stays C');
        a.equal(stCReload.avatar, acctC.avatar, 'B->C reload: currentUser avatar stays C');
        a.equal(stCReload.headerAvatar, acctC.avatar, 'B->C reload: header avatar stays C');
        a.equal(stCReload.profileAvatar, acctC.avatar, 'B->C reload: profile avatar stays C');

        // After cold reload while already signed in (auto-login detached #login-form), "Log into another account" must still log into D without native GET reload back to C
        const avD = mkSvg('#e11d48');
        const pwHashD = await page.evaluate(() => hashPassword('SwitchPassD123!'));
        await page.evaluate(({ pwHashD, avD }) => {
          const recD = { uid: 'uid_acct_d_reload', username: 'acct_d_reload', fullName: 'Account D', email: 'acctd@example.test', accountType: 'personal', avatar: avD, passwordHash: pwHashD };
          const accts = JSON.parse(localStorage.getItem('pixly_accounts') || '{}');
          accts[recD.username] = recD;
          localStorage.setItem('pixly_accounts', JSON.stringify(accts));
          localStorage.setItem('pixly_account_' + recD.username, JSON.stringify(recD));
          localStorage.setItem('pixly_user_password_' + recD.username, pwHashD);
        }, { pwHashD, avD });
        await page.click('#btn-header-profile');
        await page.waitForSelector('#modal-account-switcher:not(.hidden)', { timeout: 3000 });
        await page.click('#btn-switcher-login');
        await page.waitForSelector('#auth-login-container:not(.hidden)', { timeout: 3000 });
        await page.fill('#login-username', 'acct_d_reload');
        await page.fill('#login-password', 'SwitchPassD123!');
        await page.click('#btn-auth-submit');
        await page.waitForFunction(() => !!(window.state && state.isLoggedIn && state.currentUser && state.currentUser.username === 'acct_d_reload'), null, { timeout: 6000 });
        const stD = await readActive();
        a.equal(stD.username, 'acct_d_reload', 'Post-reload Log into another account switches to D without reverting to C');
        a.equal(stD.uid, 'uid_acct_d_reload', 'Post-reload Log into another account sets D uid');
        a.equal(stD.avatar, avD, 'Post-reload Log into another account sets D currentUser avatar');
        a.equal(stD.headerAvatar, avD, 'Post-reload Log into another account sets D header avatar');
        a.equal(stD.profileAvatar, avD, 'Post-reload Log into another account sets D profile avatar');

        await page.evaluate(() => { delete window.firebase; window.firebaseReady = false; delete window.__mockFs; });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    }
  ]
};
