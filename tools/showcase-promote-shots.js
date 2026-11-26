'use strict';

// 390px screenshots for the Showcase + Promote branch. Local fixtures only; no Firestore, no Stripe.
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const h = require(REPO + '/tests/helpers/harness');
const fx = require(REPO + '/tests/helpers/showcase-promote-fixtures');
const OUT = process.env.SHOT_OUT || '/workspace/pixlynote/showcase-promote-shots';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await h.launchSession({ port: Number(process.env.SHOT_PORT || 8432) });
  const errors = [];
  try {
    const page = await h.newPage(session, { width: 390, height: 844 });
    page.on('pageerror', (e) => errors.push(String(e)));
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.personal);
    await fx.seedShowcaseAndPromos(page, { owner: 'reg_personal' });
    const shot = async (name) => { await h.hideToasts(page); await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, name) }); };

    // 1. Showcase badge in the feed
    await page.evaluate(() => { switchMainTab('feed'); renderFeed(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const el = document.querySelector('#posts-stream article[data-post-id="1764100000201"]');
      if (el) el.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -70);
    });
    await shot('1-showcase-badge-feed.png');

    // 2. Showcase badge + disclosure on the profile
    await page.evaluate(() => { viewUserProfile('morning_pour'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { if (typeof paintStatusBadgesForUser === 'function') paintStatusBadgesForUser({ username: 'morning_pour' }, ['user-profile-verified-badge'], []); window.scrollTo(0, 0); });
    await shot('2-showcase-badge-profile.png');

    // 3. Promote button on my own post (next to Edit / Delete)
    
    await page.evaluate(() => { switchMainTab('profile'); openPostDetailModal(3002); });
    await page.waitForTimeout(250);
    await shot('3-promote-button-own-post.png');

    // 4-7. Promote modal at $5 / $25 / $100 / $500
    await page.evaluate(() => { closePostDetailModal(); openPromoteModal('post', 3002); });
    for (const [i, amt] of [[4, 5], [5, 25], [6, 100], [7, 500]]) {
      await page.click('#btn-promote-preset-' + amt);
      if (amt === 100) {
        await page.selectOption('#promote-cta-label', 'Shop now');
        await page.fill('#promote-cta-url', 'https://example.com/shop');
      }
      await page.evaluate(() => { const m = document.querySelector('#modal-promote > div'); if (m) m.scrollTop = 0; });
      await shot(i + '-promote-modal-$' + amt + '.png');
      if (amt === 500) {
        await page.evaluate(() => { const m = document.querySelector('#modal-promote > div'); if (m) m.scrollTop = m.scrollHeight; });
        await shot(i + 'b-promote-modal-$' + amt + '-bottom.png');
      }
    }
    await page.evaluate(() => closePromoteModal());

    // 8. Promoted post in the feed with its label and CTA
    await page.evaluate(() => { switchMainTab('feed'); renderFeed(); window.scrollTo(0, 0); });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const el = document.querySelector('#posts-stream article[data-promo-key="post_1764100000301"]');
      if (el) el.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -70);
    });
    await shot('8-promoted-post-feed.png');

    // 9. Insights drawer on my promoted post
    await page.evaluate(() => { switchMainTab('profile'); openPostDetailModal(3001); });
    await page.waitForTimeout(250);
    await shot('9a-insights-button-own-promoted-post.png');
    await page.evaluate(() => { handlePromoteButtonClick('post'); });
    await page.waitForTimeout(250);
    await shot('9-promoted-insights-drawer.png');
    // 10: Billing History (Account Center > Your Account > History), sandbox records
    await page.evaluate(() => { if (typeof closePromoteInsights === 'function') closePromoteInsights(); if (typeof closePostDetailModal === 'function') closePostDetailModal(); });
    await fx.openBillingHistory(page, h, fx.billingFixture());
    await shot('10-billing-history.png');
    // 11: @pixlynote admin metrics: totals exclude Showcase accounts, separate Showcase tile
    await page.evaluate(() => { if (typeof closeAccountCenterModal === 'function') closeAccountCenterModal(); });
    await h.loginAs(page, h.ACCOUNTS.pixlynote);
    await page.evaluate(() => {
      window._pixlyAccounts = Object.assign({}, window._pixlyAccounts || {});
      ['morning_pour', 'city_sketches', 'trail_notes'].forEach((u) => { window._pixlyAccounts['sc_' + u] = { username: u, fullName: u, isShowcase: true }; });
    });
    await h.openOwnerMenu(page);
    await page.evaluate(async () => {
      await refreshDrawerUserMetrics(true);
      const el = document.getElementById('drawer-pixlynote-metrics');
      if (el) el.scrollIntoView({ block: 'start' });
    });
    await shot('11-admin-metrics-showcase-tile.png');
  } finally {
    await session.close();
  }
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
  console.log('saved to', OUT);
})();
