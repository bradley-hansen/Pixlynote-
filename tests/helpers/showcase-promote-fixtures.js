'use strict';

// Local fixtures for Showcase + Promote tests and screenshots. Nothing touches Firestore or Stripe.
const IMG = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="290" cy="120" r="50" fill="#fde68a" opacity=".85"/></svg>'
).toString('base64');
const IMG2 = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#0ea5e9"/><rect y="260" width="400" height="140" fill="#0369a1"/><circle cx="110" cy="110" r="40" fill="#fef08a"/></svg>'
).toString('base64');

async function seedShowcaseAndPromos(page, opts) {
  const o = Object.assign({ owner: 'reg_personal', promoteOwn: true, promoteOther: true, showcase: true }, opts || {});
  await page.evaluate(({ o, IMG, IMG2 }) => {
    const now = Date.now();
    const dir = window._exploreUserDir || { users: new Map(), notes: new Map() };
    if (!dir.users || typeof dir.users.set !== 'function') dir.users = new Map();
    if (o.showcase) {
      dir.users.set('morning_pour', { username: 'morning_pour', fullName: 'Morning Pour', bio: 'Coffee, sunrise, repeat.', avatar: IMG, accountType: 'personal', isShowcase: true,
        likedPostIds: [], likedNoteIds: [], deletedNoteIds: [], deletedPostIds: [], following: [], deactivated: false });
      window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
      window._remoteUserProfilesCache.morning_pour = Object.assign({}, window._remoteUserProfilesCache.morning_pour || {}, { username: 'morning_pour', fullName: 'Morning Pour', bio: 'Coffee, sunrise, repeat.', avatar: IMG, isShowcase: true });
    }
    dir.users.set('kiln_and_co', Object.assign({ username: 'kiln_and_co', fullName: 'Kiln & Co', bio: 'Small-batch pottery', avatar: IMG2, accountType: 'personal',
      likedPostIds: [], likedNoteIds: [], deletedNoteIds: [], deletedPostIds: [], following: [], deactivated: false }, dir.users.get('kiln_and_co') || {}));
    window._exploreUserDir = dir;
    state.following = Array.isArray(state.following) ? state.following : [];
    if (o.showcase && !state.following.some((f) => f.username === 'morning_pour')) state.following.push({ username: 'morning_pour', fullName: 'Morning Pour', avatar: IMG, isFollowing: true });
    const mk = (id, author, caption, image, extra) => Object.assign({ id, author, authorName: author, authorAvatar: image, image, caption, location: '', tags: [], likes: 0, isLiked: false, timestamp: '1 HOUR AGO', comments: [], audience: 'public', createdAtMs: now - 3600000 }, extra || {});
    const add = (p) => {
      if (!state.posts.some((x) => String(x.id) === String(p.id))) state.posts.push(p);
      if (Number(p.id) >= 2000 && !state.explorePosts.some((x) => String(x.id) === String(p.id))) state.explorePosts.push(p);
    };
    if (o.showcase) add(mk(1764100000201, 'morning_pour', 'First light over the boardwalk ☕', IMG, { createdAtMs: now - 60000 }));
    const own = state.posts.find((p) => String(p.id) === '3001');
    if (own) { own.image = IMG; own.caption = 'My own photo'; own.audience = 'public'; }
    add(mk(3002, o.owner, 'Sunset at the pier', IMG2, { createdAtMs: now - 120000 }));
    window._pixlyPromos = new Map();
    if (o.promoteOther) {
      ingestPromotionDoc('post', 1764100000301, Object.assign(mk(1764100000301, 'kiln_and_co', 'New pottery drop this weekend', IMG2), {
        isPromoted: true, promotedUntil: now + 5 * 86400000, targetImpressions: 7500, promotedImpressionsCount: 812,
        ctaLabel: 'Shop now', ctaUrl: 'https://example.com/shop', promotionTier: 'cta', promotedAt: now - 86400000, authorPrivate: false
      }));
    }
    if (o.promoteOwn) {
      ingestPromotionDoc('post', 3001, { id: 3001, author: o.owner, isPromoted: true, promotedUntil: now + 2 * 86400000 + 5 * 3600000,
        targetImpressions: 7500, promotedImpressionsCount: 1234, ctaLabel: 'Learn more', ctaUrl: 'https://example.com', promotionTier: 'cta', promotedAt: now - 5 * 86400000 });
    }
  }, { o, IMG, IMG2 });
}

module.exports = { IMG, IMG2, seedShowcaseAndPromos };

// Billing History records as the Worker's Stripe webhook writes them (sandbox / test mode).
function billingFixture(now) {
  const day = 86400000;
  now = now || Date.now();
  return [
    { id: 'cs_test_promo_100', data: { kind: 'promote', item: 'Promote post (7 days, at least 7,500 views)', amountCents: 10000, currency: 'usd', status: 'paid', createdAt: now - 2 * day, livemode: false } },
    { id: 'in_test_renew_1', data: { kind: 'subscription', item: 'Pixlynote subscription renewal', amountCents: 499, currency: 'usd', status: 'paid', createdAt: now - 9 * day, livemode: false } },
    { id: 'cs_test_promo_5', data: { kind: 'promote', item: 'Promote note (24 hours, at least 250 views)', amountCents: 500, currency: 'usd', status: 'refunded', createdAt: now - 20 * day, livemode: false } },
    { id: 'in_test_fail_1', data: { kind: 'subscription', item: 'Pixlynote subscription renewal', amountCents: 499, currency: 'usd', status: 'failed', createdAt: now - 39 * day, livemode: false } },
    { id: 'cs_test_sub_1', data: { kind: 'subscription', item: 'Pixlynote subscription', amountCents: 499, currency: 'usd', status: 'paid', createdAt: now - 40 * day, livemode: false } }
  ];
}
module.exports.billingFixture = billingFixture;

async function openBillingHistory(page, h, records) {
  await page.evaluate((recs) => { window.__pixlyBillingFixture = async () => recs; }, records);
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
    if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    else if (typeof openAccountCenter === 'function') openAccountCenter();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const b = document.getElementById('btn-ac-open-your-account'); if (b) b.click(); });
  await page.waitForTimeout(120);
  await page.click('#btn-ac-tab-billing-history');
  await page.waitForTimeout(200);
}
module.exports.openBillingHistory = openBillingHistory;
