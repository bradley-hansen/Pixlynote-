'use strict';

/**
 * Shared snapshot / stamp / assert helpers so write-path tests can prove
 * existing user data is never blanked or overwritten with empty values.
 */

const AV = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const IDENTITY_KEYS = ['username', 'fullName', 'email', 'phone', 'accountType'];
const PROFILE_KEYS = ['bio', 'link', 'avatar', 'dbaName', 'businessIndustry', 'businessStreet', 'businessCity', 'businessState', 'businessPostal', 'businessHours', 'businessSupportEmail'];
const MEMBERSHIP_KEYS = ['isPlus', 'isBusinessPlus', 'isVerified', 'subscriptionStatus', 'stripeSessionId', 'stripeBusinessSessionId', 'verificationType', 'verificationStatus', 'governmentBadgeColor', 'businessVerificationStatus'];

function snapshotScript() {
  return `(function () {
    const u = (window.state && state.currentUser) || {};
    const arr = (v) => Array.from(v instanceof Set ? v : (v || []));
    const post = (typeof getPostById === 'function') ? getPostById(3001) : ((state.posts || []).find((x) => String(x.id) === '3001'));
    const note = (state.notes || []).find((x) => String(x.id) === '9001');
    return {
      isLoggedIn: !!(window.state && state.isLoggedIn),
      username: u.username || '',
      fullName: u.fullName || '',
      email: u.email || '',
      phone: u.phone || '',
      bio: u.bio || '',
      link: u.link || '',
      accountType: u.accountType || '',
      avatar: u.avatar || '',
      dbaName: u.dbaName || '',
      businessIndustry: u.businessIndustry || '',
      businessStreet: u.businessStreet || '',
      businessCity: u.businessCity || '',
      businessState: u.businessState || '',
      businessPostal: u.businessPostal || '',
      businessHours: u.businessHours || '',
      businessSupportEmail: u.businessSupportEmail || '',
      isPlus: u.isPlus === true,
      isBusinessPlus: u.isBusinessPlus === true,
      isVerified: u.isVerified === true,
      subscriptionStatus: u.subscriptionStatus || '',
      stripeSessionId: u.stripeSessionId || '',
      stripeBusinessSessionId: u.stripeBusinessSessionId || '',
      verificationType: u.verificationType || '',
      verificationStatus: u.verificationStatus || '',
      governmentBadgeColor: u.governmentBadgeColor || '',
      businessVerificationStatus: u.businessVerificationStatus || '',
      likedPostIds: arr(state.likedPostIds).map(String).sort(),
      savedPostIds: arr(state.savedPostIds).map(String).sort(),
      likedNoteIds: arr(state.likedNoteIds).map(String).sort(),
      savedNoteIds: arr(state.savedNoteIds).map(String).sort(),
      following: (state.following || []).map((f) => (f && f.username) || f).filter(Boolean).sort(),
      postCaption: (post && post.caption) || '',
      postCommentCount: ((post && post.comments) || []).length,
      noteText: (note && (note.text || note.body)) || '',
      noteCommentCount: ((note && note.comments) || []).length,
      // Story bar discovery bubbles (other public users / no-story filler) come and go with the directory; they are not the user's data.
      storyCount: (state.stories || []).filter((st) => !(st && (st.isDiscoverStory || st.isDiscoverFill))).length,
      storedPhone: (function () {
        try {
          const raw = localStorage.getItem('pixly_account_' + String(u.username || '').toLowerCase());
          return raw ? (JSON.parse(raw).phone || '') : '';
        } catch (e) { return ''; }
      })(),
      storedEmail: (function () {
        try {
          const raw = localStorage.getItem('pixly_account_' + String(u.username || '').toLowerCase());
          return raw ? (JSON.parse(raw).email || '') : '';
        } catch (e) { return ''; }
      })()
    };
  })()`;
}

async function snapshot(page) {
  return page.evaluate(snapshotScript());
}

function fieldsFor(account, variant) {
  const base = {
    fullName: 'Guard ' + account.username,
    email: account.email,
    phone: '+1 (202) 555-0147',
    bio: 'Protected bio for ' + account.username,
    link: 'https://example.test/guard-' + account.username,
    accountType: account.accountType || 'personal',
    avatar: AV,
    isPlus: false,
    isBusinessPlus: false,
    isVerified: false,
    subscriptionStatus: '',
    stripeSessionId: '',
    stripeBusinessSessionId: '',
    verificationType: '',
    verificationStatus: '',
    governmentBadgeColor: '',
    businessVerificationStatus: ''
  };
  if ((account.accountType || '') === 'business' || variant === 'organization' || variant === 'business-plus') {
    Object.assign(base, {
      accountType: 'business',
      dbaName: 'Guard Trade ' + account.username,
      businessIndustry: 'software_tech',
      businessStreet: '10 Guard Ave',
      businessCity: 'Austin',
      businessState: 'TX',
      businessPostal: '78701',
      businessHours: 'Mon–Fri 9–5',
      businessSupportEmail: 'support.' + account.username + '@example.test'
    });
  }
  if (variant === 'plus') {
    Object.assign(base, {
      isPlus: true,
      isVerified: true,
      subscriptionStatus: 'active',
      stripeSessionId: 'cs_test_GUARDPLUS01'
    });
  }
  if (variant === 'business-plus') {
    Object.assign(base, {
      accountType: 'business',
      isBusinessPlus: true,
      isPlus: false,
      subscriptionStatus: 'active',
      stripeBusinessSessionId: 'cs_test_GUARDBIZ01'
    });
  }
  if (variant === 'government') {
    Object.assign(base, {
      accountType: 'personal',
      isPlus: true,
      isVerified: true,
      verificationType: 'government',
      verificationStatus: 'approved',
      governmentBadgeColor: 'navy',
      subscriptionStatus: 'active',
      stripeSessionId: 'cs_test_GUARDGOV01'
    });
  }
  if (variant === 'organization') {
    Object.assign(base, {
      accountType: 'business',
      isBusinessPlus: true,
      isVerified: true,
      verificationType: 'organization',
      verificationStatus: 'approved',
      businessVerificationStatus: 'approved',
      subscriptionStatus: 'active',
      stripeBusinessSessionId: 'cs_test_GUARDORG01'
    });
  }
  return base;
}

async function stamp(page, fields) {
  return page.evaluate((f) => {
    const u = state.currentUser || (state.currentUser = {});
    Object.keys(f).forEach((k) => { u[k] = f[k]; });
    if (typeof markStoredProfileFieldsLoaded === 'function') markStoredProfileFieldsLoaded(u, u);
    try {
      const key = 'pixly_account_' + String(u.username || '').toLowerCase();
      const raw = localStorage.getItem(key);
      const rec = raw ? JSON.parse(raw) : { username: u.username };
      ['email', 'phone', 'fullName', 'accountType', 'bio', 'link'].forEach((k) => {
        if (f[k] !== undefined) rec[k] = f[k];
      });
      localStorage.setItem(key, JSON.stringify(rec));
    } catch (e) {}
    if (typeof persistState === 'function') persistState();
    if (typeof persistCurrentUserSubscription === 'function') persistCurrentUserSubscription();
  }, fields);
}

function assertNotBlanked(a, before, after, label, allowChange) {
  const allow = new Set(allowChange || []);
  IDENTITY_KEYS.forEach((k) => {
    if (allow.has(k)) return;
    a.equal(after[k], before[k], label + ' keeps ' + k);
  });
  PROFILE_KEYS.forEach((k) => {
    if (allow.has(k)) return;
    if (before[k]) {
      a.ok(!!after[k], label + ' does not blank ' + k + ' (was ' + JSON.stringify(before[k]).slice(0, 80) + ')');
      // Avatar may be replaced by an account-default image (for example the official
      // @pixlynote emblem) on render. That is not a blank, so only require it stays set.
      if (k !== 'avatar') {
        a.equal(after[k], before[k], label + ' does not overwrite ' + k);
      }
    }
  });
  MEMBERSHIP_KEYS.forEach((k) => {
    if (allow.has(k)) return;
    if (before[k] === true) a.equal(after[k], true, label + ' keeps ' + k);
    else if (before[k]) a.equal(after[k], before[k], label + ' keeps ' + k);
  });
  if (before.storedPhone) a.ok(after.storedPhone, label + ' keeps the stored account phone');
  if (before.storedEmail) a.ok(after.storedEmail, label + ' keeps the stored account email');
  if (!allow.has('postCaption') && before.postCaption) {
    a.equal(after.postCaption, before.postCaption, label + ' does not overwrite an existing post caption');
  }
  if (!allow.has('noteText') && before.noteText) {
    a.equal(after.noteText, before.noteText, label + ' does not overwrite an existing note');
  }
  if (!allow.has('storyCount')) {
    a.ok(after.storyCount >= before.storyCount, label + ' does not delete existing stories');
  }
}

async function seedActiveStory(page, account) {
  return page.evaluate(({ account, img }) => {
    const u = (account && account.username) || ((state.currentUser && state.currentUser.username) || 'reg_personal');
    const story = {
      id: 'story-reg-1',
      image: img,
      avatar: img,
      timestamp: Date.now(),
      createdAt: Date.now(),
      comments: [],
      isUser: true,
      author: u,
      username: u,
      authorName: (account && account.fullName) || u,
      caption: 'Regression story'
    };
    state.userStories = [story];
    state.hasActiveUserStory = true;
    state.stories = state.stories || [];
    state.stories[0] = Object.assign({}, story, { isUser: true });
    try { localStorage.setItem('pixly_user_stories_' + String(u).toLowerCase(), JSON.stringify([story])); } catch (e) {}
    return true;
  }, { account: account || {}, img: AV });
}

async function closeAll(page, h) {
  await page.evaluate(() => {
    const closers = [
      'closeEditProfileModal', 'closeEditProfile', 'closePostDetailModal', 'closeNoteDetailModal',
      'closeMessagesModal', 'closeDmShareModal', 'closePixaiModal', 'closeStoryViewer',
      'closeCreatePostModal', 'closeDiscoverCreatorsModal', 'closeSubscriptionModal',
      'closeTermsPoliciesModal', 'closeSubmitFeedbackModal', 'closeProfileMenu',
      'closeAccountCenterModal', 'closeAccountSwitcher', 'closeHelpCenterModal',
      'closeFollowersModal', 'closeFollowingModal', 'closeDraftsPage', 'closeDisconnectConfirm'
    ];
    closers.forEach((fn) => { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {} });
  });
  try { await h.closeOverlays(page); } catch (e) {}
  try { await h.hideToasts(page); } catch (e) {}
}

module.exports = {
  AV,
  IDENTITY_KEYS,
  PROFILE_KEYS,
  MEMBERSHIP_KEYS,
  snapshot,
  stamp,
  fieldsFor,
  assertNotBlanked,
  closeAll,
  seedActiveStory
};
