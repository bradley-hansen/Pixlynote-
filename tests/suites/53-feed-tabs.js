'use strict';

/**
 * Home feed ForYou / Connected tabs.
 * ForYou is the existing newsfeed. Connected shows only posts from active connections
 * (the same list the story bar uses). Fake posts are injected in the page; nothing is written to Firestore.
 */

const TINY_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function tabStyle(page) {
  return page.evaluate(() => {
    const styleOf = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const tabs = document.getElementById('feed-source-tabs');
      const stories = document.querySelector('#tab-feed .bg-white.border');
      const stream = document.getElementById('posts-stream');
      return {
        text: (el.textContent || '').trim(),
        selected: el.getAttribute('aria-selected'),
        fontSize: cs.fontSize,
        fontWeight: String(cs.fontWeight),
        color: cs.color,
        textDecorationLine: cs.textDecorationLine,
        bg: cs.backgroundColor,
        underline: !!el.className.split(/\s+/).some((c) => /underline|border-b|rounded-full|rounded-pill|bg-violet|bg-neutral-100/.test(c))
      };
    };
    const tabs = document.getElementById('feed-source-tabs');
    const stories = document.querySelector('#tab-feed > div');
    const stream = document.getElementById('posts-stream');
    const sectionKids = Array.from(document.querySelectorAll('#tab-feed > *')).map((el) => el.id || el.className.split(/\s+/)[0]);
    const tabBox = tabs ? tabs.getBoundingClientRect() : null;
    const storiesBox = stories ? stories.getBoundingClientRect() : null;
    const streamBox = stream ? stream.getBoundingClientRect() : null;
    const tabCs = tabs ? getComputedStyle(tabs) : null;
    return {
      sectionKids,
      justify: tabCs && tabCs.justifyContent,
      left: tabBox && Math.round(tabBox.left),
      storiesBottom: storiesBox && Math.round(storiesBox.bottom),
      tabTop: tabBox && Math.round(tabBox.top),
      tabBottom: tabBox && Math.round(tabBox.bottom),
      streamTop: streamBox && Math.round(streamBox.top),
      foryou: styleOf('btn-feed-tab-foryou'),
      connected: styleOf('btn-feed-tab-connected'),
      tab: (typeof getFeedTab === 'function') ? getFeedTab() : null
    };
  });
}

function feedPostAuthors(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#posts-stream article.post-card'))
      .map((el) => {
        const id = el.getAttribute('data-post-id');
        const authorEl = el.querySelector('.open-author-profile[data-author], [data-author]');
        return { id, author: authorEl ? authorEl.getAttribute('data-author') : '' };
      })
  );
}

async function seedFeed(page, { me, following, posts }) {
  await page.evaluate(({ me, following, posts, img }) => {
    const now = Date.now();
    state.following = (following || []).map((f, i) => ({
      id: 700 + i,
      username: f.username,
      fullName: f.username,
      isFollowing: f.isFollowing !== false,
      explicit: true,
      followedAt: now,
      deactivated: !!f.deactivated
    }));
    const dir = (window._exploreUserDir && window._exploreUserDir.users) || new Map();
    (following || []).forEach((f) => {
      dir.set(f.username, {
        username: f.username, fullName: f.username, avatar: img, accountType: 'personal',
        deactivated: f.deactivated === true, isPrivate: false, following: [],
        likedPostIds: [], likedNoteIds: [], deletedNoteIds: new Set(), followersCount: 0, followingCount: 0
      });
    });
    window._exploreUserDir = Object.assign({}, window._exploreUserDir || {}, { users: dir, at: now });
    const mk = (p, i) => Object.assign({
      id: p.id,
      author: p.author,
      authorName: p.author,
      authorAvatar: img,
      image: img,
      caption: p.caption || (p.author + ' post'),
      tags: ['#test'],
      likes: 0,
      isLiked: false,
      createdAtMs: now - (i * 1000),
      timestamp: '1m ago',
      comments: [],
      audience: 'everyone'
    }, p);
    state.posts = (posts || []).map(mk);
    state.explorePosts = [];
    if (typeof setFeedTab === 'function') setFeedTab('foryou');
    else if (typeof renderFeed === 'function') renderFeed();
  }, { me, following, posts, img: TINY_IMG });
}

module.exports = {
  name: 'Feed ForYou and Connected tabs',
  tests: [
    {
      name: 'Feed tabs: ForYou is the default, sits under the story bar, and uses large bold type; Connected is smaller gray text',
      accounts: ['personal'],
      covers: ['el:#btn-feed-tab-foryou', 'el:#btn-feed-tab-connected', 'el:#feed-source-tabs', 'handler:setFeedTab', 'handler:getFeedTab', 'handler:paintFeedTabs'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        const ui = await tabStyle(page);
        a.ok(ui.foryou && ui.connected, 'both tabs are on the feed: ' + JSON.stringify(ui));
        a.equal(ui.foryou.text, 'ForYou', 'left tab is labeled ForYou');
        a.equal(ui.connected.text, 'Connected', 'right tab is labeled Connected');
        a.equal(ui.tab, 'foryou', 'ForYou is the default tab');
        a.equal(ui.foryou.selected, 'true', 'ForYou is selected');
        a.equal(ui.connected.selected, 'false', 'Connected is not selected');
        a.equal(ui.foryou.fontSize, '26px', 'active ForYou is 26px: ' + JSON.stringify(ui.foryou));
        a.ok(['700', 'bold'].includes(ui.foryou.fontWeight), 'active ForYou is bold: ' + ui.foryou.fontWeight);
        a.equal(ui.connected.fontSize, '18px', 'inactive Connected is 18px');
        a.ok(['400', 'normal'].includes(ui.connected.fontWeight), 'inactive Connected is regular: ' + ui.connected.fontWeight);
        a.ok(ui.storiesBottom <= ui.tabTop, 'tabs sit below the story bar card: ' + JSON.stringify(ui));
        a.ok(ui.tabBottom <= ui.streamTop, 'tabs sit above the first post / stream: ' + JSON.stringify(ui));
        const kids = ui.sectionKids;
        const iStories = kids.findIndex((k) => k === '' || true);
        const tabIdx = kids.indexOf('feed-source-tabs');
        const streamIdx = kids.indexOf('posts-stream');
        a.ok(tabIdx !== -1 && streamIdx === tabIdx + 1, 'tabs are directly above the posts stream: ' + JSON.stringify(kids));
        a.ok(tabIdx > 0, 'tabs come after the story bar card: ' + JSON.stringify(kids));
        a.ok(ui.justify === 'flex-start' || ui.justify === 'start', 'tabs are left aligned: ' + ui.justify);
        a.ok(ui.foryou.textDecorationLine === 'none' && !ui.foryou.underline, 'no underline or pill on ForYou');
        a.ok(ui.connected.textDecorationLine === 'none' && !ui.connected.underline, 'no underline or pill on Connected');
      }
    },
    {
      name: 'Feed tabs: ForYou keeps the current newsfeed; Connected shows only posts from active connections',
      accounts: ['personal'],
      covers: ['el:#btn-feed-tab-foryou', 'el:#btn-feed-tab-connected', 'handler:setFeedTab', 'handler:getConnectedFeedAuthorSet'],
      async run({ page, h, a, account }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        await seedFeed(page, {
          me: account.username,
          following: [
            { username: 'maya_hikes' },
            { username: 'quiet_friend' },
            { username: 'blocked_pal' },
            { username: 'gone_user', deactivated: true }
          ],
          posts: [
            { id: 'ft-own', author: account.username, caption: 'my post' },
            { id: 'ft-maya', author: 'maya_hikes', caption: 'maya trail' },
            { id: 'ft-quiet', author: 'quiet_friend', caption: 'quiet hello' },
            { id: 'ft-stranger', author: 'seoul_bites', caption: 'not a connection' },
            { id: 'ft-gone', author: 'gone_user', caption: 'deactivated' },
            { id: 'ft-blocked', author: 'blocked_pal', caption: 'blocked' }
          ]
        });
        await page.evaluate(() => {
          if (typeof blockUser === 'function') blockUser('blocked_pal');
          setFeedTab('foryou');
        });
        const foryou = await feedPostAuthors(page);
        const fyIds = foryou.map((x) => String(x.id));
        a.ok(fyIds.includes('ft-own') && fyIds.includes('ft-maya') && fyIds.includes('ft-quiet') && fyIds.includes('ft-stranger'),
          'ForYou still shows own, connection, and other visible posts: ' + JSON.stringify(fyIds));
        a.ok(!fyIds.includes('ft-blocked'), 'ForYou still hides blocked authors: ' + JSON.stringify(fyIds));

        await page.click('#btn-feed-tab-connected');
        await page.waitForTimeout(80);
        const after = await tabStyle(page);
        a.equal(after.tab, 'connected', 'tapping Connected switches the tab');
        a.equal(after.connected.selected, 'true', 'Connected is selected');
        a.equal(after.foryou.selected, 'false', 'ForYou is no longer selected');
        a.equal(after.connected.fontSize, '26px', 'tapped Connected becomes 26px');
        a.ok(['700', 'bold'].includes(after.connected.fontWeight), 'tapped Connected becomes bold');
        a.equal(after.foryou.fontSize, '18px', 'ForYou becomes 18px when inactive');
        a.ok(['400', 'normal'].includes(after.foryou.fontWeight), 'ForYou becomes regular when inactive');

        const connected = await feedPostAuthors(page);
        const cIds = connected.map((x) => String(x.id)).sort();
        a.equal(JSON.stringify(cIds), JSON.stringify(['ft-maya', 'ft-quiet'].sort()),
          'Connected shows only posts from active connections: ' + JSON.stringify(connected));
        a.ok(!cIds.includes('ft-own') && !cIds.includes('ft-stranger') && !cIds.includes('ft-gone') && !cIds.includes('ft-blocked'),
          'own, unconnected, deactivated, and blocked posts stay off Connected');
        a.ok(!(await page.$('#feed-suggested-creators-list')), 'Connected does not fill with suggested creators');

        await page.click('#btn-feed-tab-foryou');
        await page.waitForTimeout(80);
        const back = await feedPostAuthors(page);
        a.equal(JSON.stringify(back.map((x) => String(x.id)).sort()), JSON.stringify(fyIds.slice().sort()),
          'switching back to ForYou restores the original newsfeed');
      }
    },
    {
      name: 'Feed tabs: Connected with no connections or no posts shows a short empty message, not random posts',
      accounts: ['personal'],
      covers: ['el:#btn-feed-tab-connected', 'el:#feed-connected-empty'],
      async run({ page, h, a, account }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        await seedFeed(page, {
          me: account.username,
          following: [],
          posts: [
            { id: 'ft-own2', author: account.username, caption: 'solo' },
            { id: 'ft-rand', author: 'seoul_bites', caption: 'random' }
          ]
        });
        await page.click('#btn-feed-tab-connected');
        await page.waitForTimeout(80);
        const none = await page.evaluate(() => ({
          text: ((document.getElementById('feed-connected-empty') || {}).innerText || '').trim(),
          cards: document.querySelectorAll('#posts-stream article.post-card').length,
          suggested: !!document.getElementById('feed-suggested-creators-list')
        }));
        a.ok(none.text, 'empty message is shown when there are no connections');
        a.match(none.text, /not connected/i, 'message mentions having no connections: ' + JSON.stringify(none.text));
        a.equal(none.cards, 0, 'no posts are shown');
        a.equal(none.suggested, false, 'suggested / random creators are not used');

        await seedFeed(page, {
          me: account.username,
          following: [{ username: 'maya_hikes' }],
          posts: [
            { id: 'ft-own3', author: account.username, caption: 'solo' },
            { id: 'ft-rand3', author: 'seoul_bites', caption: 'random' }
          ]
        });
        await page.click('#btn-feed-tab-connected');
        await page.waitForTimeout(80);
        const quiet = await page.evaluate(() => ({
          text: ((document.getElementById('feed-connected-empty') || {}).innerText || '').trim(),
          cards: document.querySelectorAll('#posts-stream article.post-card').length,
          suggested: !!document.getElementById('feed-suggested-creators-list')
        }));
        a.ok(quiet.text, 'empty message is shown when connections have no posts');
        a.match(quiet.text, /no posts from your connections/i, 'message says there are no posts yet: ' + JSON.stringify(quiet.text));
        a.equal(quiet.cards, 0, 'random posts are not used to fill the tab');
        a.equal(quiet.suggested, false, 'suggested creators are not used');
      }
    },
    {
      name: 'Feed tabs: the chosen tab is kept for the session across a feed redraw',
      accounts: ['personal'],
      covers: ['handler:getFeedTab', 'handler:setFeedTab'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        await page.click('#btn-feed-tab-connected');
        await page.waitForTimeout(80);
        a.equal(await page.evaluate(() => getFeedTab()), 'connected', 'tab is connected after the tap');
        await page.evaluate(() => { if (typeof renderFeed === 'function') renderFeed(); });
        const after = await tabStyle(page);
        a.equal(after.tab, 'connected', 'a feed redraw keeps Connected selected');
        a.equal(after.connected.fontSize, '26px', 'Connected stays the bold tab after redraw');
        const stored = await page.evaluate(() => sessionStorage.getItem('pixly_feed_tab_' + normalizeUsername(state.currentUser.username)));
        a.equal(stored, 'connected', 'the choice is stored for this session');
      }
    }
  ]
};
