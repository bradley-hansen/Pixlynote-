'use strict';

/**
 * Showcase accounts + Promote Post (spec t994u). Local fixtures only: nothing is written to Firestore,
 * the Worker is mocked, and Stripe is never contacted.
 */
const fs = require('fs');
const path = require('path');
const fx = require('../helpers/showcase-promote-fixtures');

async function start(ctx, opts) {
  const { page, h, account } = ctx;
  const port = Number(new URL(page.url()).port);
  await h.loadApp(page, { port });
  await h.loginAs(page, account);
  await fx.seedShowcaseAndPromos(page, opts);
  await h.hideToasts(page).catch(() => {});
}
async function routeWorker(page, pathRe, handler) {
  const calls = [];
  await page.route(pathRe, async (route) => {
    const req = route.request();
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    calls.push({ url: req.url(), method: req.method(), body });
    const data = await handler(body, req);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return calls;
}

module.exports = {
  name: 'Showcase accounts and Promote Post',
  tests: [
    {
      name: 'Showcase badge shows in the feed and on the profile from the user doc only, with the disclosure',
      accounts: ['personal'],
      covers: ['el:#profile-showcase-pill', 'el:#profile-showcase-disclosure', 'el:#user-profile-showcase-pill', 'el:#user-profile-showcase-disclosure', 'el:#note-modal-showcase-pill',
        'handler:isShowcaseAccount', 'handler:paintShowcaseForUser'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await start(ctx, { promoteOwn: false, promoteOther: false });
        await page.evaluate(() => { switchMainTab('feed'); if (typeof setFeedTab === 'function') setFeedTab('foryou'); renderFeed(); });
        const feed = await page.evaluate(() => {
          const art = document.querySelector('#posts-stream article[data-post-id="1764100000201"]');
          const pill = art && art.querySelector('[data-showcase-pill]');
          const other = document.querySelector('#posts-stream article[data-post-id="3002"] [data-showcase-pill]');
          return { has: !!pill, text: pill && pill.textContent, bg: pill && getComputedStyle(pill).backgroundColor, other: !!other };
        });
        a.ok(feed.has && /Showcase/i.test(feed.text), 'Showcase post shows the Showcase pill in the feed');
        a.ok(feed.bg === 'rgb(243, 244, 246)', 'The pill is muted gray, not a verification color');
        a.ok(!feed.other, 'Regular accounts do not get the pill');
        await page.evaluate(() => viewUserProfile('morning_pour'));
        await page.waitForTimeout(250);
        const prof = await page.evaluate(() => ({
          pill: (() => { const el = document.getElementById('user-profile-showcase-pill'); return !!el && el.offsetParent !== null; })(),
          disc: (document.getElementById('user-profile-showcase-disclosure') || {}).textContent || ''
        }));
        a.ok(prof.pill, 'Profile header shows the Showcase pill');
        a.ok(/Official Pixlynote Showcase Account/.test(prof.disc) && /Curated by the Pixlynote Team/.test(prof.disc), 'Profile shows the Showcase disclosure under the bio');
        const spoof = await page.evaluate(() => {
          // A post copy (or a local object) claiming isShowcase must not produce the badge.
          const fake = { username: 'fresh_creator', isShowcase: true };
          return { obj: isShowcaseAccount(fake), str: isShowcaseAccount('fresh_creator'), html: creatorStatusBadgesHtml({ username: 'fresh_creator', isShowcase: true }) };
        });
        a.ok(!spoof.obj && !spoof.str && !/data-showcase-pill/.test(spoof.html), 'isShowcase on a post copy is ignored; only the user doc counts');
      }
    },
    {
      name: 'Admin metrics exclude Showcase accounts from the totals and show them in a separate Showcase tile',
      accounts: ['pixlynote'],
      covers: ['el:#metric-showcase-users', 'el:#metric-showcase-tile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await h.openOwnerMenu(page);
        const read = () => page.evaluate(async () => {
          await refreshDrawerUserMetrics(true);
          const n = (id) => parseInt(String((document.getElementById(id) || {}).textContent || '0').replace(/[^\d]/g, ''), 10) || 0;
          return { total: n('metric-total-users'), personal: n('metric-personal-users'), business: n('metric-business-users'), plus: n('metric-plus-users'), showcase: n('metric-showcase-users'),
            list: (document.getElementById('drawer-metrics-accounts-list') || {}).innerText || '' };
        });
        const base = await read();
        await page.evaluate(() => {
          window._pixlyAccounts = Object.assign({}, window._pixlyAccounts || {}, {
            sc_flag: { username: 'morning_pour', fullName: 'Morning Pour', isShowcase: true, isPlus: true },
            sc_type: { username: 'city_sketches', fullName: 'City Sketches', accountType: 'showcase' },
            sc_dir: { username: 'trail_notes', fullName: 'Trail Notes', accountType: 'business' },
            real_one: { username: 'real_new_person', fullName: 'Real New Person' }
          });
          const dir = window._exploreUserDir || { users: new Map() };
          if (!dir.users || typeof dir.users.set !== 'function') dir.users = new Map();
          dir.users.set('trail_notes', { username: 'trail_notes', isShowcase: true });
          window._exploreUserDir = dir;
        });
        const after = await read();
        a.ok(after.total === base.total + 1, 'Total counts only the real new account (' + base.total + ' -> ' + after.total + ')');
        a.ok(after.personal === base.personal + 1 && after.business === base.business && after.plus === base.plus, 'Personal, Business and Plus exclude Showcase accounts');
        a.ok(after.showcase === base.showcase + 3, 'Showcase tile counts the 3 Showcase accounts');
        a.ok(!/@morning_pour|@city_sketches|@trail_notes/.test(after.list) && /3 Showcase accounts not counted/.test(after.list), 'Showcase accounts are left out of the counted list, with a note');
        const tile = await page.evaluate(() => { const t = document.getElementById('metric-showcase-tile'); return !!t && t.offsetParent !== null && getComputedStyle(t).backgroundColor; });
        a.ok(tile === 'rgb(243, 244, 246)', 'The Showcase tile is visible and gray');
      }
    },
    {
      name: 'A signed-in Showcase account never adds post views, note views, or promoted impressions',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx);
        const r = await page.evaluate(() => {
          const me = state.currentUser.username;
          const before = canCountPostView(1764100000201);
          window._exploreUserDir.users.set(me, Object.assign({}, window._exploreUserDir.users.get(me) || { username: me }, { isShowcase: true }));
          try { sessionStorage.removeItem('pixly_promo_seen'); } catch (e) {}
          return { before, post: canCountPostView(1764100000201), imp: recordPromotedImpression('post_1764100000301', 'kiln_and_co'),
            note: typeof canCountNoteView === 'function' ? canCountNoteView('1') : false };
        });
        a.ok(r.before === true, 'A regular account counts a view');
        a.ok(r.post === false && r.note === false && r.imp === false, 'A Showcase account adds no views or impressions');
      }
    },
    {
      name: 'A Showcase account cannot like posts, notes, comments or stories, or connect with anyone; unliking still works',
      accounts: ['personal'],
      covers: ['handler:showcaseEngageBlocked'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx, { promoteOwn: false, promoteOther: false });
        const r = await page.evaluate(async () => {
          const me = state.currentUser.username;
          const post = getPostById(2123) || getPostById(1764100000201);
          post.isLiked = false; post.likedBy = (post.likedBy || []).filter((u) => u !== me); if (state.likedPostIds) state.likedPostIds.delete(String(post.id));
          window._exploreUserDir.users.set(me, Object.assign({ username: me, following: [], likedPostIds: [], likedNoteIds: [] }, window._exploreUserDir.users.get(me) || {}, { isShowcase: true }));
          const before = { likes: post.likes || 0, isLiked: !!post.isLiked };
          togglePostLike(post.id);
          togglePostLike(post.id, true);
          const afterPost = { isLiked: !!post.isLiked, likes: post.likes || 0 };
          const note = getNoteById(9001);
          let noteLiked = false;
          if (note) { note.isLiked = false; if (state.likedNoteIds) { state.likedNoteIds.delete(9001); state.likedNoteIds.delete('9001'); } toggleLikeNote(9001); noteLiked = !!(state.likedNoteIds && (state.likedNoteIds.has(9001) || state.likedNoteIds.has('9001'))); }
          const target = 'kiln_and_co';
          const wasFollowing = isUserFollowingCreator(target);
          applyLocalFollowToggle(target, true);
          const followed = isUserFollowingCreator(target);
          const req = await sendConnectRequest(target);
          // An existing like can still be removed (cleanup), never added.
          post.isLiked = true; post.likedBy = (post.likedBy || []).concat([me]); state.likedPostIds = state.likedPostIds || new Set(); state.likedPostIds.add(String(post.id));
          togglePostLike(post.id);
          const unliked = !post.isLiked;
          return { before, afterPost, noteLiked, wasFollowing, followed, req, unliked, blockedFn: showcaseEngageBlocked() };
        });
        a.ok(!r.afterPost.isLiked && r.afterPost.likes === r.before.likes, 'Post like (tap and double-tap) is blocked');
        a.ok(!r.noteLiked, 'Note like is blocked');
        a.ok(!r.wasFollowing && !r.followed && r.req === false, 'Connect / follow and connect requests are blocked');
        a.ok(r.unliked, 'Removing an existing like still works');
        a.ok(r.blockedFn === true, 'Showcase engagement guard is on for Showcase accounts');
        const regular = await page.evaluate(() => {
          const me = state.currentUser.username;
          window._exploreUserDir.users.set(me, Object.assign({}, window._exploreUserDir.users.get(me), { isShowcase: false }));
          return showcaseEngageBlocked();
        });
        a.ok(regular === false, 'Regular accounts are not affected');
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
        const guarded = ['function togglePostLike', 'function toggleLikeNote(', 'function toggleLikePostComment', 'function toggleLikeNoteComment', 'function applyLocalFollowToggle', 'async function sendConnectRequest']
          .every((f) => { const i = src.indexOf(f); return i >= 0 && src.slice(i, i + 1400).includes('showcaseEngageBlocked()'); });
        a.ok(guarded && /if \(nowLiked && \(typeof showcaseEngageBlocked === 'function' && showcaseEngageBlocked\(\)\)\) return;/.test(src), 'Every like / connect entry point (incl. story hearts and comment likes) is guarded');
      }
    },
    {
      name: 'Showcase accounts cannot start DMs or share to people who never wrote first',
      accounts: ['personal'],
      covers: ['handler:showcaseDmBlocked', 'handler:showcaseShareBlocked'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx, { promoteOwn: false, promoteOther: false });
        const r = await page.evaluate(() => {
          const me = state.currentUser.username;
          const before = { notShowcase: showcaseDmBlocked({ chat: [] }) };
          window._exploreUserDir.users.set(me, Object.assign({}, window._exploreUserDir.users.get(me) || { username: me }, { isShowcase: true }));
          return Object.assign(before, {
            cold: showcaseDmBlocked({ user: 'fresh_creator', chat: [] }),
            ownOnly: showcaseDmBlocked({ user: 'fresh_creator', chat: [{ sender: 'me', text: 'hi' }] }),
            reply: showcaseDmBlocked({ user: 'fresh_creator', chat: [{ sender: 'fresh_creator', text: 'hello?' }] }),
            share: showcaseShareBlocked(['fresh_creator'])
          });
        });
        a.ok(r.notShowcase === false, 'Regular accounts are never blocked');
        a.ok(r.cold === true && r.ownOnly === true, 'A Showcase account cannot open a cold DM');
        a.ok(r.reply === false, 'A Showcase account can reply to someone who wrote first');
        a.ok(r.share === true, 'A Showcase account cannot share posts into cold DMs');
      }
    },
    {
      name: 'Promote appears only on your own posts and notes, next to Edit and Delete, and not in read-only access',
      accounts: ['personal'],
      covers: ['el:#btn-modal-promote-post', 'el:#btn-note-modal-promote', 'handler:paintPromoteButton', 'handler:handlePromoteButtonClick'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx, { promoteOwn: false });
        await page.evaluate(() => openPostDetailModal(3002));
        await page.waitForTimeout(150);
        const own = await page.evaluate(() => {
          const p = document.getElementById('btn-modal-promote-post');
          const e = document.getElementById('btn-modal-edit-post');
          return { vis: !!p && p.offsetParent !== null, text: p && p.textContent.trim(), sib: !!(p && e && p.parentElement === e.parentElement) };
        });
        a.ok(own.vis && /Promote/.test(own.text), 'Own post shows Promote');
        a.ok(own.sib, 'Promote sits in the same row as Edit');
        await page.evaluate(() => { closePostDetailModal && closePostDetailModal(); openPostDetailModal(1764100000201); });
        await page.waitForTimeout(150);
        const other = await page.evaluate(() => { const p = document.getElementById('btn-modal-promote-post'); return !!p && p.offsetParent !== null; });
        a.ok(!other, 'Someone else\'s post has no Promote button');
        await page.evaluate(() => { closePostDetailModal && closePostDetailModal(); openNoteDetailModal(9001); });
        await page.waitForTimeout(150);
        const note = await page.evaluate(() => { const p = document.getElementById('btn-note-modal-promote'); return !!p && p.offsetParent !== null; });
        a.ok(note, 'Own note shows Promote');
        await page.click('#btn-note-modal-promote');
        await page.waitForTimeout(120);
        const opened = await page.evaluate(() => { const m = document.getElementById('modal-promote'); return !!m && !m.classList.contains('hidden') && (window._promoteTarget || {}).kind; });
        a.ok(opened === 'note', 'Promote on a note opens the Promote modal for that note');
        await page.evaluate(() => { closePromoteModal(); if (typeof closeNoteDetailModal === 'function') closeNoteDetailModal(); document.body.classList.add('privileged-read-only'); openPostDetailModal(3002); });
        await page.waitForTimeout(150);
        const ro = await page.evaluate(() => { const p = document.getElementById('btn-modal-promote-post'); const r = !!p && p.offsetParent !== null; document.body.classList.remove('privileged-read-only'); return r; });
        a.ok(!ro, 'Privileged read-only sessions do not see Promote');
      }
    },
    {
      name: 'Promote slider and presets compute duration, guaranteed views and placement; CTA only from $100',
      accounts: ['personal'],
      covers: ['el:#modal-promote', 'el:#btn-close-promote', 'el:#promote-amount-slider', 'el:#btn-promote-preset-5', 'el:#btn-promote-preset-25', 'el:#btn-promote-preset-100', 'el:#btn-promote-preset-500',
        'el:#promote-duration', 'el:#promote-views', 'el:#promote-placement', 'el:#promote-cta-section', 'el:#promote-cta-label', 'el:#promote-cta-url', 'el:#promote-guarantee',
        'listener:#promote-amount-slider:input', 'handler:openPromoteModal', 'handler:closePromoteModal', 'handler:setPromoteAmount', 'handler:promotePlan'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx, { promoteOwn: false });
        await page.evaluate(() => openPromoteModal('post', 3002));
        const read = () => page.evaluate(() => {
          const m = document.getElementById('modal-promote');
          const t = (id) => (document.getElementById(id) || {}).textContent || '';
          const cta = document.getElementById('promote-cta-section');
          return { amount: m.getAttribute('data-amount'), hours: m.getAttribute('data-duration-hours'), views: m.getAttribute('data-target-impressions'), tier: m.getAttribute('data-tier'),
            dur: t('promote-duration'), v: t('promote-views'), place: t('promote-placement'), g: t('promote-guarantee-text'), btn: t('btn-promote-checkout'),
            cta: !!cta && !cta.classList.contains('hidden') && cta.offsetParent !== null };
        });
        const expect = { 5: ['24', '250', 'feed', '24 hours', '250'], 25: ['72', '1500', 'explore', '3 days', '1,500'], 100: ['168', '7000', 'cta', '7 days', '7,000'], 500: ['720', '50000', 'cta', '30 days', '50,000'] };
        const r25 = await read();
        a.ok(r25.amount === '25', 'Modal opens at $25');
        for (const amt of [5, 25, 100, 500]) {
          await page.click('#btn-promote-preset-' + amt);
          const r = await read();
          const e = expect[amt];
          a.ok(r.hours === e[0] && r.views === e[1] && r.tier === e[2], `$${amt}: ${e[3]}, ${e[1]} views, ${e[2]} tier`);
          a.ok(r.dur.includes(e[3]) && r.v.includes(e[4]) && r.g.includes(e[4]), `$${amt}: duration, views and Delivery Guarantee text match`);
          a.ok(r.btn.includes('$' + amt), `$${amt}: checkout button shows the amount`);
          a.ok(r.cta === (amt >= 100), `$${amt}: CTA section ${amt >= 100 ? 'shown' : 'hidden'}`);
        }
        await page.evaluate(() => { const s = document.getElementById('promote-amount-slider'); s.value = '60'; s.dispatchEvent(new Event('input', { bubbles: true })); });
        const mid = await read();
        a.ok(mid.amount === '60' && Number(mid.hours) > 72 && Number(mid.hours) < 168 && Number(mid.views) > 1500 && Number(mid.views) < 7000 && Number(mid.hours) % 24 === 0, 'Slider in between interpolates');
        const copy = await page.evaluate(() => document.getElementById('modal-promote').innerText);
        a.ok(/views only/i.test(copy) && /never buys likes, comments, or followers/i.test(copy), 'Modal says Promote buys views only');
        a.ok(!/guaranteed (likes|followers|comments)/i.test(copy), 'No promise of likes, comments or followers');
        a.ok(/no refunds/i.test(copy) && /keeps running at no extra cost/i.test(copy) && !/refunded|money back/i.test(copy), 'Copy: all purchases final, no refunds; the free extension is the only make-good');
        const parity = await page.evaluate(() => JSON.stringify(window.PROMOTE_ANCHORS));
        const patch = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'promote', 'patch_worker.py'), 'utf8');
        const wa = (patch.match(/PROMOTE_ANCHORS\s*=\s*(\[\s*\[[^;]*\]\s*\])/) || [])[1] || '';
        a.ok(wa.replace(/\s+/g, '') === parity, 'Client and Worker pricing anchors are identical');
        await page.click('#btn-close-promote');
        a.ok(await page.evaluate(() => document.getElementById('modal-promote').classList.contains('hidden')), 'Close hides the modal');
      }
    },
    {
      name: 'Checkout goes to Stripe only via the Worker; errors never mark anything promoted',
      accounts: ['personal'],
      covers: ['el:#btn-promote-checkout', 'el:#promote-error', 'handler:startPromoteCheckout', 'handler:handlePromoteReturn'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx, { promoteOwn: false });
        let reply = { ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_abc' };
        const calls = await routeWorker(page, /\/promote\/checkout/, () => reply);
        await page.evaluate(() => {
          window.__pixlyNav = [];
          window.__pixlyPromoteIdToken = async () => 'test-id-token-not-real-0123456789';
          window.__pixlyPromoteNavigate = (u) => window.__pixlyNav.push(u);
          openPromoteModal('post', 3002); setPromoteAmount(100);
          document.getElementById('promote-cta-label').value = 'Shop now';
          document.getElementById('promote-cta-url').value = 'https://example.com/shop';
        });
        await page.click('#btn-promote-checkout');
        await page.waitForTimeout(300);
        const ok = await page.evaluate(() => ({ nav: window.__pixlyNav.slice(), promo: !!(window._pixlyPromos.get('post_3002') || {}).isPromoted, post: !!(getPostById(3002) || {}).isPromoted }));
        a.ok(calls.length === 1, 'One checkout request to the Worker');
        const b = calls[0].body;
        a.ok(b.username === 'reg_personal' && b.kind === 'post' && String(b.id) === '3002' && b.amount === 100 && b.ctaLabel === 'Shop now' && b.ctaUrl === 'https://example.com/shop' && !!b.idToken, 'Request carries the item, amount, CTA and a Firebase ID token');
        a.ok(!('durationHours' in b) && !('targetImpressions' in b), 'The browser never sends duration or views (the Worker computes them)');
        a.ok(ok.nav.length === 1 && /^https:\/\/checkout\.stripe\.com\//.test(ok.nav[0]), 'Redirects to Stripe Checkout');
        a.ok(!ok.promo && !ok.post, 'Starting checkout marks nothing promoted');
        await page.waitForFunction(() => !document.getElementById('btn-promote-checkout').disabled, null, { timeout: 6000 });
        a.ok(true, 'If the redirect does not happen, the checkout button becomes usable again');

        for (const [r, re] of [[{ ok: false, error: 'stripe_not_configured' }, /weren't charged/i], [{ ok: false, error: 'not_owner' }, /own posts/i], [{ ok: true, url: 'https://evil.example/pay' }, /weren't charged/i], [null, /weren't charged/i]]) {
          reply = r;
          await page.evaluate(() => { window.__pixlyNav = []; });
          await page.click('#btn-promote-checkout');
          await page.waitForTimeout(250);
          const st = await page.evaluate(() => ({ nav: window.__pixlyNav.length, err: (document.getElementById('promote-error') || {}).textContent || '', dis: document.getElementById('btn-promote-checkout').disabled, promo: !!(window._pixlyPromos.get('post_3002') || {}).isPromoted }));
          a.ok(st.nav === 0 && re.test(st.err) && !st.dis && !st.promo, 'Worker reply ' + JSON.stringify(r) + ': no redirect, clear error, button usable, nothing promoted');
        }
        await page.evaluate(() => { document.getElementById('promote-cta-url').value = 'http://example.com'; window.__pixlyNav = []; });
        const before = calls.length;
        await page.click('#btn-promote-checkout');
        await page.waitForTimeout(150);
        a.ok(calls.length === before, 'A non-https CTA link is rejected before checkout');
        await page.evaluate(() => { window.__pixlyPromoteIdToken = null; document.getElementById('promote-cta-url').value = 'https://example.com'; });
        await page.click('#btn-promote-checkout');
        await page.waitForTimeout(150);
        a.ok(calls.length === before && /sign in/i.test(await page.evaluate(() => document.getElementById('promote-error').textContent)), 'No ID token: asks to sign in, no checkout');

        const ret = await page.evaluate(() => ({ s: handlePromoteReturn('?promote=success'), c: handlePromoteReturn('?promote=cancel'), n: handlePromoteReturn('?session_id=cs_test_x'), promo: !!(window._pixlyPromos.get('post_3002') || {}).isPromoted }));
        a.ok(/Payment received/.test(ret.s) && /weren't charged/.test(ret.c) && ret.n === '', 'Return URL shows the right message and ignores Plus session_id');
        a.ok(!ret.promo, 'Returning from Stripe marks nothing promoted (only the signed webhook does)');
      }
    },
    {
      name: 'Promoted posts appear in the feed with a Promoted label and CTA; impressions count once per session, never your own',
      accounts: ['personal'],
      covers: ['handler:applyPromotedFeedSlots', 'handler:recordPromotedImpression', 'handler:observePromotedImpressions', 'handler:ingestPromotionDoc'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx);
        const imps = await routeWorker(page, /\/promote\/impression/, (b) => ({ ok: true, counted: true, count: 900 }));
        await page.evaluate(() => { try { sessionStorage.removeItem('pixly_promo_seen'); } catch (e) {} switchMainTab('feed'); if (typeof setFeedTab === 'function') setFeedTab('foryou'); renderFeed(); window.scrollTo(0, 0); });
        const f = await page.evaluate(() => {
          const art = document.querySelector('#posts-stream article[data-promo-key="post_1764100000301"]');
          const own = document.querySelector('#posts-stream article[data-promo-key="post_3001"]');
          const cta = art && art.querySelector('.promoted-cta-btn');
          return { has: !!art, label: art && /Promoted/.test(art.innerText), cta: cta && cta.textContent.trim(), href: cta && cta.getAttribute('href'), rel: cta && cta.getAttribute('rel'), own: !!own,
            idx: Array.from(document.querySelectorAll('#posts-stream > article')).indexOf(art) };
        });
        if (!f.has) {
          const dbg = await page.evaluate(() => ({ tab: state.feedTab, act: activePromotions().map((r) => r.key), inj: Array.from(window._promoFeedInjected || []), main: (document.querySelector('[id^="tab-"]:not(.hidden)') || {}).id }));
          a.ok(false, 'Promoted post missing; debug ' + JSON.stringify(dbg));
        }
        a.ok(f.has && f.label, 'Promoted post is in the feed with a Promoted label');
        a.ok(f.idx >= 0 && f.idx <= 3, 'Promoted post is placed near the top');
        a.ok(/Shop now/.test(f.cta || '') && f.href === 'https://example.com/shop' && /noopener/.test(f.rel || ''), 'CTA button links out safely');
        a.ok(!f.own, 'Your own promotion does not take a promoted slot in your own feed');
        await page.waitForTimeout(1600);
        const n1 = imps.length;
        a.ok(n1 === 1 && imps[0].body.key === 'post_1764100000301' && /^[A-Za-z0-9_-]{8,64}$/.test(imps[0].body.sid), 'One impression after 1s in view, with a session id');
        await page.evaluate(() => { renderFeed(); });
        await page.waitForTimeout(1500);
        a.ok(imps.length === 1, 'Re-render in the same session does not count again');
        const own = await page.evaluate(() => recordPromotedImpression('post_3001', state.currentUser.username));
        a.ok(own === false && imps.length === 1, 'Viewing your own promoted post never counts');
        const expired = await page.evaluate(() => {
          const r = window._pixlyPromos.get('post_1764100000301');
          r.promotedUntil = Date.now() - 1000; r.promotedImpressionsCount = r.targetImpressions;
          renderFeed();
          return !!document.querySelector('#posts-stream article[data-promo-key="post_1764100000301"]');
        });
        a.ok(!expired, 'Ends only when time is up AND the target is met: then it leaves the feed');
        const extended = await page.evaluate(() => {
          const r = window._pixlyPromos.get('post_1764100000301');
          r.promotedImpressionsCount = r.targetImpressions - 1;
          renderFeed();
          return !!document.querySelector('#posts-stream article[data-promo-key="post_1764100000301"]');
        });
        a.ok(extended, 'Time is up but views are short: it keeps running at no extra cost');
        const hidden = await page.evaluate(() => {
          const r = window._pixlyPromos.get('post_1764100000301');
          r.promotedUntil = Date.now() + 86400000;
          window._exploreUserDir.users.set('kiln_and_co', Object.assign({}, window._exploreUserDir.users.get('kiln_and_co'), { isPrivate: true }));
          window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
          window._remoteUserProfilesCache.kiln_and_co = Object.assign({}, window._remoteUserProfilesCache.kiln_and_co || {}, { isPrivate: true });
          renderFeed();
          return !!document.querySelector('#posts-stream article[data-promo-key="post_1764100000301"]');
        });
        a.ok(!hidden, 'A promoted post from an account that went private is not shown');
      }
    },
    {
      name: 'Promoted Insights shows delivered vs guaranteed views, status and time left, only to the author',
      accounts: ['personal'],
      covers: ['el:#modal-promote-insights', 'el:#btn-close-promote-insights', 'el:#promote-insights-views', 'el:#promote-insights-status', 'el:#promote-insights-bar', 'el:#promote-insights-time',
        'el:#promote-insights-placement', 'el:#promote-insights-cta', 'handler:openPromoteInsights', 'handler:closePromoteInsights', 'handler:promoteInsightsModel'],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx);
        await routeWorker(page, /\/promote\/stats/, () => ({ ok: true, found: true, count: 1300, target: 7000, active: true }));
        await page.evaluate(() => openPostDetailModal(3001));
        await page.waitForTimeout(150);
        const btn = await page.evaluate(() => (document.getElementById('btn-modal-promote-post') || {}).textContent || '');
        a.ok(/Insights/.test(btn), 'An already-promoted own post shows Insights instead of Promote');
        await page.click('#btn-modal-promote-post');
        await page.waitForTimeout(400);
        const ins = await page.evaluate(() => ({
          open: !document.getElementById('modal-promote-insights').classList.contains('hidden'),
          views: document.getElementById('promote-insights-views').textContent,
          status: document.getElementById('promote-insights-status').textContent,
          time: document.getElementById('promote-insights-time').textContent,
          cta: document.getElementById('promote-insights-cta').textContent,
          bar: document.getElementById('promote-insights-bar').style.width
        }));
        a.ok(ins.open, 'Insights drawer opens');
        a.ok(/1,300 \/ 7,000 views/.test(ins.views), 'Shows live delivered vs guaranteed views (from Worker stats)');
        a.ok(ins.status === 'Active' && /2d \d+h left/.test(ins.time), 'Shows Active and time left');
        a.ok(/Learn more/.test(ins.cta) && /^\d+%$/.test(ins.bar), 'Shows the CTA and a progress bar');
        const states = await page.evaluate(() => {
          const now = Date.now();
          return {
            ext: promoteInsightsModel({ isPromoted: true, promotedUntil: now - 1, promotedImpressionsCount: 100, targetImpressions: 250 }, now),
            done: promoteInsightsModel({ isPromoted: false, promotedUntil: now - 1, promotedImpressionsCount: 260, targetImpressions: 250 }, now)
          };
        });
        a.ok(states.ext.status === 'Extended at no extra cost' && /150 views still to deliver/.test(states.ext.time), 'Past the end with views short: Extended at no extra cost');
        a.ok(states.done.status === 'Completed' && states.done.pct === 100, 'Finished: Completed');
        await page.click('#btn-close-promote-insights');
        const other = await page.evaluate(() => { closePostDetailModal && closePostDetailModal(); return openPromoteInsights('post', 1764100000301); });
        a.ok(other === false, 'Insights for someone else\'s promotion are refused');
      }
    },
    {
      name: 'Approved Promote tiers (t1022u): $5 24h/250, $25 3 days/1,500, $100 7 days/7,000, $500 30 days/50,000',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx, { promoteOwn: false, promoteOther: false });
        const t = await page.evaluate(() => [5, 25, 100, 500, 4, 501].map((x) => promotePlan(x)));
        a.ok(t[0].durationHours === 24 && t[0].targetImpressions === 250 && t[0].tier === 'feed', '$5: 24 hours, at least 250 views, main feed');
        a.ok(t[1].durationHours === 72 && t[1].targetImpressions === 1500 && t[1].tier === 'explore', '$25: 3 days, at least 1,500 views, adds Explore/Trending');
        a.ok(t[2].durationHours === 168 && t[2].targetImpressions === 7000 && t[2].tier === 'cta', '$100: 7 days, at least 7,000 views, Explore + CTA button');
        a.ok(t[3].durationHours === 720 && t[3].targetImpressions === 50000 && t[3].tier === 'cta', '$500: 30 days, at least 50,000 views, Explore + CTA button');
        const days = await page.evaluate(() => { for (let x = 5; x <= 500; x++) { const q = promotePlan(x); if (q.durationHours >= 48 && q.durationHours % 24) return x; if (q.targetImpressions % 50) return -x; } return 0; });
        a.ok(days === 0, 'Between tiers: whole days from 2 days up, views in steps of 50');
        a.ok(t[4] === null && t[5] === null, 'Outside $5-$500 is refused');
        const mono = await page.evaluate(() => { let p = promotePlan(5); for (let x = 6; x <= 500; x++) { const q = promotePlan(x); if (q.durationHours < p.durationHours || q.targetImpressions < p.targetImpressions) return x; p = q; } return 0; });
        a.ok(mono === 0, 'Paying more never buys less time or fewer views');
      }
    },
    {
      name: 'After publishing a public post, a Promote prompt is offered',
      accounts: ['personal'],
      covers: [],
      async run(ctx) {
        const { page, a } = ctx;
        await start(ctx, { promoteOwn: false, promoteOther: false });
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
        a.ok(/showToastWithAction\('Photo posted to your profile grid!', 'Promote', function \(\) \{ openPromoteModal\('post', newPostId\); \}/.test(src), 'Publish success toast offers Promote for the new post');
        const r = await page.evaluate(() => {
          state.posts.push({ id: 3101, author: state.currentUser.username, image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', caption: 'new', audience: 'public', comments: [], likes: 0 });
          return openPromoteModal('post', 3101) !== false && !document.getElementById('modal-promote').classList.contains('hidden') && String((window._promoteTarget || {}).id) === '3101';
        });
        a.ok(r, 'The prompt opens Promote for the post just published');
      }
    }
  ]
};
