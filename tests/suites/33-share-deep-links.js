'use strict';

/**
 * Feed/post Share must copy a deep link (https://pixlynote.com/?post=<id>)
 * that opens that exact post. Same check for other share/copy paths.
 */

const fs = require('fs');
const path = require('path');

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const POST_ID = 8801;

function indexSource() {
  return fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
}

async function seedSharePost(page) {
  await page.evaluate(({ img, id }) => {
    const mk = {
      id,
      author: 'tag_spammer',
      authorName: 'Tag Spammer',
      authorAvatar: img,
      image: img,
      caption: 'QA test post',
      tags: ['#qa'],
      likes: 0,
      comments: [],
      createdAtMs: Date.now()
    };
    state.following = (state.following || []).concat([{ username: 'tag_spammer', fullName: 'Tag Spammer', isFollowing: true }]);
    state.posts = (state.posts || []).filter((p) => Number(p.id) !== Number(id));
    state.posts.unshift(mk);
    if (typeof renderFeed === 'function') renderFeed();
  }, { img: IMG, id: POST_ID });
}

async function hookClipboard(page) {
  await page.evaluate(() => {
    window._pixlyClip = '';
    window._pixlyLastCopiedLink = '';
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (t) => { window._pixlyClip = String(t); return Promise.resolve(); } }
      });
    } catch (e) {
      try { navigator.clipboard.writeText = (t) => { window._pixlyClip = String(t); return Promise.resolve(); }; } catch (e2) {}
    }
  });
}

module.exports = {
  name: 'Share deep links',
  tests: [
    {
      name: 'Share deep link: Unit: share URL builders include the item id and handlers no longer copy location.href',
      accounts: ['personal'],
      covers: ['handler:buildPostShareUrl', 'handler:buildProfileShareUrl', 'handler:buildNoteShareUrl', 'handler:buildStoryShareUrl', 'handler:openSharedPostFromUrl'],
      async run(ctx) {
        const { page, a } = ctx;
        const src = indexSource();
        const bad = [];
        src.split('\n').forEach((line, i) => {
          if (/copyToClipboard\s*\(\s*window\.location\.href/.test(line) || /clipboard\.writeText\s*\(\s*window\.location\.href/.test(line)) {
            bad.push({ line: i + 1, text: line.trim().slice(0, 180) });
          }
        });
        a.equal(bad.length, 0, 'No share/copy path still uses window.location.href: ' + JSON.stringify(bad));

        const urls = await page.evaluate(() => ({
          post: buildPostShareUrl('8801'),
          profile: buildProfileShareUrl('gemini.bughunter'),
          note: buildNoteShareUrl('maya_lens', 'n1'),
          story: typeof buildStoryShareUrl === 'function'
            ? buildStoryShareUrl({ id: 'st-42', author: 'gemini.bughunter' })
            : '',
          opener: typeof openSharedPostFromUrl
        }));
        a.equal(urls.post, 'https://pixlynote.com/?post=8801', 'Post share URL includes ?post=<id>: ' + urls.post);
        a.ok(/[?&]post=8801(?:&|$)/.test(urls.post), 'Post identifier is a query param');
        a.ok(urls.post.indexOf('https://pixlynote.com/') === 0 && urls.post.length > 'https://pixlynote.com/'.length, 'Post URL is more than the site origin');
        a.equal(urls.profile, 'https://pixlynote.com/@gemini.bughunter', 'Profile share URL includes the username: ' + urls.profile);
        a.equal(urls.note, 'https://pixlynote.com/@maya_lens/note/n1', 'Note share URL includes author and note id: ' + urls.note);
        a.ok(urls.story.indexOf('https://pixlynote.com/?story=st-42') === 0, 'Story share URL includes ?story=<id>: ' + urls.story);
        a.ok(/[?&]user=gemini\.bughunter/.test(urls.story), 'Story share URL includes the owner: ' + urls.story);
        a.equal(urls.opener, 'function', 'openSharedPostFromUrl is available to resolve a shared post URL');
      }
    },
    {
      name: 'Share deep link: E2E: feed Share copies a URL that includes ?post=<id>',
      accounts: ['personal'],
      covers: ['el:.btn-share-post', 'handler:copyPostLink', 'handler:buildPostShareUrl'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await page.setViewportSize({ width: 390, height: 844 });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await seedSharePost(page);
        await h.gotoMainTab(page, 'feed');
        await hookClipboard(page);
        const clicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('.btn-share-post[data-post-id="8801"]'));
          const vis = btns.find((b) => {
            const r = b.getBoundingClientRect();
            const cs = getComputedStyle(b);
            return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
          });
          const btn = vis || btns[0];
          if (!btn) return { ok: false, count: 0 };
          try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
          btn.click();
          return { ok: true, count: btns.length, usedVisible: !!vis };
        });
        a.ok(clicked.ok, 'Feed Share button is present for the seeded post: ' + JSON.stringify(clicked));
        await page.waitForTimeout(200);
        const result = await page.evaluate(() => ({
          last: window._pixlyLastCopiedLink || '',
          clip: window._pixlyClip || '',
          href: window.location.href
        }));
        const copied = result.last || result.clip;
        a.equal(copied, 'https://pixlynote.com/?post=8801', 'Feed Share copies the post deep link, not the current page: ' + JSON.stringify(result));
        a.ok(copied.indexOf('?post=8801') !== -1, 'Copied URL includes the post identifier');
        a.ok(copied !== 'https://pixlynote.com/' && copied !== 'https://pixlynote.com', 'Copied URL is not the bare site origin');
        a.ok(copied !== result.href, 'Copied URL is not window.location.href (' + result.href + ')');
      }
    },
    {
      name: 'Share deep link: E2E: opening a shared ?post= URL lands on that post',
      accounts: ['personal'],
      covers: ['handler:openSharedPostFromUrl', 'handler:openPostDetailModal'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await page.setViewportSize({ width: 390, height: 844 });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await page.goto('http://127.0.0.1:' + port + '/index.html?post=' + POST_ID, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction(() => !!(window.state && typeof openSharedPostFromUrl === 'function'), { timeout: 20000 });
        await seedSharePost(page);
        await page.evaluate(() => { if (typeof openSharedPostFromUrl === 'function') openSharedPostFromUrl(); });
        await page.waitForFunction(() => {
          const m = document.getElementById('modal-post-detail');
          if (!m) return false;
          const hidden = m.classList.contains('hidden') || getComputedStyle(m).display === 'none';
          return !hidden && String(state.currentModalPostId) === '8801';
        }, { timeout: 15000 });
        const view = await page.evaluate(() => ({
          id: state.currentModalPostId,
          author: (document.getElementById('modal-post-author') || {}).textContent || '',
          caption: (document.getElementById('modal-post-caption') || {}).textContent || '',
          hidden: document.getElementById('modal-post-detail').classList.contains('hidden'),
          display: getComputedStyle(document.getElementById('modal-post-detail')).display
        }));
        a.ok(!view.hidden && view.display !== 'none', 'Post detail modal is visible: ' + JSON.stringify(view));
        a.ok(String(view.id) === '8801', 'Opened post id is 8801: ' + JSON.stringify(view));
        a.ok(/tag_spammer/i.test(view.author), 'Opened post shows the expected author: ' + view.author);
      }
    },
    {
      name: 'Share deep link: E2E: post-detail Share also copies ?post=<id>',
      accounts: ['personal'],
      covers: ['el:#btn-modal-share', 'handler:copyPostLink'],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const port = Number(new URL(page.url()).port);
        await page.setViewportSize({ width: 390, height: 844 });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        await seedSharePost(page);
        await page.evaluate((id) => { openPostDetailModal(id); }, POST_ID);
        await page.waitForFunction(() => {
          const m = document.getElementById('modal-post-detail');
          return m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none';
        }, { timeout: 8000 });
        await hookClipboard(page);
        await page.click('#btn-modal-share');
        await page.waitForTimeout(200);
        const copied = await page.evaluate(() => window._pixlyLastCopiedLink || window._pixlyClip || '');
        a.equal(copied, 'https://pixlynote.com/?post=8801', 'Modal Share copies the post deep link: ' + copied);
      }
    }
  ]
};
