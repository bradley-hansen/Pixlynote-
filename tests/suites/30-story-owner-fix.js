'use strict';

/**
 * Connected-user stories must never inherit the owner's isUser flag.
 * Viewing another user's story (even if stored with isUser:true) shows
 * viewer controls (heart, reply). Your own story still shows owner controls.
 */

const TINY_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const STORY_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#0ea5e9"/></linearGradient></defs><rect width="390" height="844" fill="url(#g)"/><text x="195" y="420" text-anchor="middle" fill="white" font-size="28" font-family="sans-serif">gemini.bughunter</text></svg>'
);

function isShownFn() {
  return (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return !el.classList.contains('hidden') && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
}

module.exports = {
  name: 'Story owner vs viewer controls',
  tests: [
    {
      name: 'Unit: isOwnStoryObj and collectActiveStoriesForUser ignore isUser on another user\'s slides',
      accounts: ['personal'],
      covers: ['handler:isOwnStoryObj', 'handler:collectActiveStoriesForUser', 'handler:isPinnedFeedStory', 'handler:storyOwnerOf'],
      async run(ctx) {
        const { page, a, account } = ctx;
        const unit = await page.evaluate(({ me, img }) => {
          const out = {};
          const cur = (state.currentUser && state.currentUser.username) || me;
          out.foreignWithFlag = isOwnStoryObj({
            id: 's-foreign',
            isUser: true,
            isEmptyPlaceholder: true,
            username: 'gemini.bughunter',
            author: 'gemini.bughunter',
            image: img
          });
          out.ownLabel = isOwnStoryObj({ id: 's-own-label', isUser: true, username: 'Your Story', image: img });
          out.ownUsername = isOwnStoryObj({ id: 's-own-user', isUser: true, username: cur, author: cur, image: img });
          out.ownFlagOnly = isOwnStoryObj({ id: 's-own-flag', isUser: true, image: img });
          out.foreignNoFlag = isOwnStoryObj({ id: 's-plain', username: 'gemini.bughunter', author: 'gemini.bughunter', image: img });
          out.nullStory = isOwnStoryObj(null);

          window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
          window._remoteUserProfilesCache['gemini.bughunter'] = {
            username: 'gemini.bughunter',
            userStories: [{
              id: 'gb-1',
              image: img,
              caption: 'Stored as owner',
              isUser: true,
              isEmptyPlaceholder: false,
              timestamp: Date.now() - 60000,
              viewers: [{ username: 'a' }, { username: 'b' }, { username: 'c' }]
            }]
          };
          const slides = collectActiveStoriesForUser('gemini.bughunter');
          out.collected = slides.map((s) => ({
            id: s.id,
            username: s.username,
            author: s.author,
            hasIsUser: 'isUser' in s,
            isUser: s.isUser,
            hasPlaceholder: 'isEmptyPlaceholder' in s,
            isEmptyPlaceholder: s.isEmptyPlaceholder,
            image: !!s.image
          }));
          out.pinnedForeign = isPinnedFeedStory(slides[0] || { isUser: true, username: 'gemini.bughunter', author: 'gemini.bughunter' });
          out.ownerOfForeign = storyOwnerOf(Object.assign({ isUser: true }, slides[0] || { username: 'gemini.bughunter', author: 'gemini.bughunter' }));
          out.pinnedOwn = isPinnedFeedStory({ isUser: true, username: 'Your Story', author: cur, image: img });
          return out;
        }, { me: account.username, img: TINY_IMG });

        a.equal(unit.foreignWithFlag, false, 'isOwnStoryObj is false for another user even when isUser:true');
        a.equal(unit.ownLabel, true, 'isOwnStoryObj is true for "Your Story"');
        a.equal(unit.ownUsername, true, 'isOwnStoryObj is true when username/author match the current user');
        a.equal(unit.ownFlagOnly, true, 'isOwnStoryObj falls back to isUser when no foreign identity is present');
        a.equal(unit.foreignNoFlag, false, 'isOwnStoryObj is false for a connected user without isUser');
        a.equal(unit.nullStory, false, 'isOwnStoryObj is false for null');
        a.ok(unit.collected.length === 1 && unit.collected[0].image, 'collectActiveStoriesForUser returns the connected slide');
        a.ok(!unit.collected[0].hasIsUser && unit.collected[0].isUser === undefined, 'collected slide does not keep isUser: ' + JSON.stringify(unit.collected[0]));
        a.ok(!unit.collected[0].hasPlaceholder && unit.collected[0].isEmptyPlaceholder === undefined, 'collected slide does not keep isEmptyPlaceholder');
        a.equal(unit.collected[0].author, 'gemini.bughunter', 'collected slide author is the connected user');
        a.equal(unit.collected[0].username, 'gemini.bughunter', 'collected slide username is the connected user');
        a.equal(unit.pinnedForeign, false, 'connected slide is not a pinned own-story entry');
        a.equal(unit.ownerOfForeign, 'gemini.bughunter', 'storyOwnerOf uses the connected username, not the viewer');
        a.equal(unit.pinnedOwn, true, 'the viewer\'s own story stays pinned');
      }
    },
    {
      name: 'E2E: a connected user\'s stored isUser:true story shows viewer heart/reply, not owner controls; own story still shows owner controls',
      accounts: ['personal'],
      covers: [
        'el:#story-viewer-controls',
        'el:#story-reply-input',
        'el:#btn-story-send-reply',
        'el:#btn-story-send-heart',
        'el:#story-owner-controls',
        'el:#story-owner-menu',
        'el:#btn-story-owner-more',
        'el:#btn-story-viewers',
        'el:#btn-story-delete',
        'handler:isOwnStoryObj',
        'handler:openStoryViewer',
        'handler:displayStorySlide',
        'handler:collectActiveStoriesForUser'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');

        await page.evaluate(({ me, img }) => {
          const conn = 'gemini.bughunter';
          const slide = {
            id: 'gb-story-1',
            image: img,
            caption: 'Hunting bugs',
            isUser: true,
            isEmptyPlaceholder: false,
            timestamp: Date.now() - 120000,
            time: '2m ago',
            audience: 'everyone',
            comments: [],
            viewers: [{ username: 'a' }, { username: 'b' }, { username: 'c' }]
          };
          try { localStorage.setItem('pixly_user_stories_' + conn, JSON.stringify([slide])); } catch (e) {}
          window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
          window._remoteUserProfilesCache[conn] = {
            username: conn,
            fullName: 'Gemini Bug Hunter',
            avatar: img,
            userStories: [slide]
          };
          window._exploreUserDir = window._exploreUserDir || { at: Date.now(), users: new Map() };
          if (!window._exploreUserDir.users) window._exploreUserDir.users = new Map();
          window._exploreUserDir.users.set(conn, { username: conn, fullName: 'Gemini Bug Hunter', avatar: img, userStories: [slide] });
          state.following = [{ id: 901, username: conn, fullName: 'Gemini Bug Hunter', avatar: img, isFollowing: true, explicit: true, followedAt: Date.now() }];
          if (!Array.isArray(state.userStories) || state.userStories.length === 0) {
            state.userStories = [{
              id: 'own-story-1',
              image: img,
              caption: 'My own story',
              isUser: true,
              timestamp: Date.now() - 30000,
              audience: 'everyone',
              comments: []
            }];
          }
          if (typeof persistState === 'function') persistState();
          if (typeof renderStories === 'function') renderStories();
        }, { me: account.username, img: STORY_IMG });

        await page.waitForSelector('#stories-container .story-trigger[data-story-user="gemini.bughunter"]', { timeout: 4000 });
        await page.click('#stories-container .story-trigger[data-story-user="gemini.bughunter"]');
        await page.waitForSelector('#modal-story-viewer:not(.hidden)', { timeout: 4000 });
        await page.evaluate(() => { state.storyPaused = true; if (state.activeStoryTimer) clearInterval(state.activeStoryTimer); });

        const viewed = await page.evaluate((isShown) => {
          const shown = eval('(' + isShown + ')');
          return {
            isOwn: typeof isOwnStoryObj === 'function' ? isOwnStoryObj(state.activeStory) : null,
            activeUser: (state.activeStory && (state.activeStory.username || state.activeStory.author)) || '',
            activeIsUser: !!(state.activeStory && state.activeStory.isUser),
            viewer: shown('story-viewer-controls'),
            reply: shown('story-reply-input'),
            heart: shown('btn-story-send-heart'),
            owner: shown('story-owner-controls'),
            ownerMenu: shown('story-owner-menu'),
            viewersCount: shown('story-viewers-count') && !document.getElementById('story-owner-controls').classList.contains('hidden'),
            header: ((document.getElementById('story-viewer-username') || {}).textContent || '').trim()
          };
        }, isShownFn().toString());

        a.equal(viewed.isOwn, false, 'Active connected story is not treated as own');
        a.ok(/gemini\.bughunter/i.test(viewed.activeUser + ' ' + viewed.header), 'Viewer is on gemini.bughunter\'s story: ' + JSON.stringify(viewed));
        a.equal(viewed.activeIsUser, false, 'Active connected slide does not carry isUser');
        a.ok(viewed.viewer, 'Viewer controls (heart/reply bar) are visible');
        a.ok(viewed.reply, 'Reply input is visible');
        a.ok(viewed.heart, 'Heart/like button is visible');
        a.ok(!viewed.owner, 'Owner controls (views/share/...) are hidden on a connected story');
        a.ok(!viewed.ownerMenu, 'Owner menu stays hidden');

        // Like works
        await page.click('#btn-story-send-heart');
        await page.waitForTimeout(120);
        const liked = await page.evaluate(() => ({
          isLiked: !!(state.activeStory && state.activeStory.isLiked),
          heartClass: (document.getElementById('btn-story-send-heart') || {}).className || '',
          keyInSet: !!(state.likedStoryIds && state.likedStoryIds.has(getStoryLikeKey(state.activeStory)))
        }));
        a.ok(liked.isLiked && liked.keyInSet, 'Heart/like records a like on the connected story: ' + JSON.stringify(liked));
        a.ok(/text-rose-500/.test(liked.heartClass), 'Heart icon paints liked state');

        // Reply works
        await page.fill('#story-reply-input', 'Nice catch!');
        await page.click('#btn-story-send-reply');
        await page.waitForTimeout(200);
        const replied = await page.evaluate(() => {
          const comments = (state.activeStory && state.activeStory.comments) || [];
          return {
            count: comments.length,
            text: comments.map((c) => c.text).join(' | '),
            countLabel: ((document.getElementById('story-viewer-comments-count') || {}).textContent || '').trim()
          };
        });
        a.ok(replied.count >= 1 && /Nice catch!/.test(replied.text), 'Reply is stored on the connected story: ' + JSON.stringify(replied));

        // Owner menu must stay closed / refuse to open
        await page.evaluate(() => {
          const btn = document.getElementById('btn-story-owner-more');
          if (btn) btn.click();
        });
        await page.waitForTimeout(80);
        const menuStillHidden = await page.evaluate(() => {
          const menu = document.getElementById('story-owner-menu');
          return !menu || menu.classList.contains('hidden') || getComputedStyle(menu).display === 'none';
        });
        a.ok(menuStillHidden, 'Owner menu cannot be opened on a connected user\'s story');

        await page.click('#btn-close-story');
        await page.waitForTimeout(120);

        // Own story still shows owner controls
        await page.evaluate(() => {
          if (typeof openStoryViewer === 'function') openStoryViewer(0);
        });
        await page.waitForSelector('#modal-story-viewer:not(.hidden)', { timeout: 4000 });
        await page.evaluate(() => { state.storyPaused = true; if (state.activeStoryTimer) clearInterval(state.activeStoryTimer); });
        const own = await page.evaluate((isShown) => {
          const shown = eval('(' + isShown + ')');
          return {
            isOwn: typeof isOwnStoryObj === 'function' ? isOwnStoryObj(state.activeStory) : null,
            owner: shown('story-owner-controls'),
            viewers: shown('btn-story-viewers'),
            more: shown('btn-story-owner-more'),
            viewer: shown('story-viewer-controls'),
            reply: shown('story-reply-input')
          };
        }, isShownFn().toString());
        a.equal(own.isOwn, true, 'Own story is treated as own');
        a.ok(own.owner, 'Own story shows owner controls');
        a.ok(own.viewers, 'Own story shows viewers count button');
        a.ok(own.more, 'Own story shows the owner more (...) button');
        a.ok(!own.viewer && !own.reply, 'Own story hides the viewer heart/reply bar');

        await page.click('#btn-close-story');
      }
    }
  ]
};
