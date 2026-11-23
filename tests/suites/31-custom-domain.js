'use strict';

/**
 * Custom domain: user-facing share/copy links must use https://pixlynote.com
 * and must not fall back to bradley-hansen.github.io.
 */

const fs = require('fs');
const path = require('path');

function indexSource() {
  return fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
}

function cnameSource() {
  return fs.readFileSync(path.join(__dirname, '../../CNAME'), 'utf8').trim();
}

module.exports = {
  name: 'Custom domain share links',
  tests: [
    {
      name: 'Unit: share/copy URL builders use https://pixlynote.com and index.html has no stale github.io site links',
      accounts: ['personal'],
      covers: ['handler:buildPostShareUrl', 'handler:buildProfileShareUrl', 'handler:buildNoteShareUrl'],
      async run(ctx) {
        const { page, a } = ctx;

        a.equal(cnameSource(), 'pixlynote.com', 'CNAME file points at pixlynote.com');

        const src = indexSource();
        const stale = [];
        src.split('\n').forEach((line, i) => {
          if (/github\.io/i.test(line)) stale.push({ line: i + 1, text: line.trim().slice(0, 200) });
        });
        a.equal(stale.length, 0, 'index.html has no github.io URLs (share, fallback, or help examples): ' + JSON.stringify(stale));

        const urls = await page.evaluate(() => ({
          origin: window.PIXLYNOTE_SITE_ORIGIN,
          post: buildPostShareUrl('8801'),
          postSafe: buildPostShareUrl('ab_c-1'),
          profile: buildProfileShareUrl('Gemini.Bughunter'),
          note: buildNoteShareUrl('maya_lens', 'n1'),
          locationOrigin: window.location.origin
        }));
        a.equal(urls.origin, 'https://pixlynote.com', 'PIXLYNOTE_SITE_ORIGIN is the canonical domain');
        a.equal(urls.post, 'https://pixlynote.com/?post=8801', 'Post share URL is canonical: ' + urls.post);
        a.equal(urls.postSafe, 'https://pixlynote.com/?post=ab_c-1', 'Post share URL encodes the id: ' + urls.postSafe);
        a.equal(urls.profile, 'https://pixlynote.com/@gemini.bughunter', 'Profile share URL is canonical: ' + urls.profile);
        a.equal(urls.note, 'https://pixlynote.com/@maya_lens/note/n1', 'Note share URL is canonical: ' + urls.note);
        a.ok(/github\.io/i.test(urls.locationOrigin) === false, 'Test page is not github.io (got ' + urls.locationOrigin + ')');
        a.ok(!/github\.io/i.test(JSON.stringify(urls)), 'Built share URLs do not include github.io: ' + JSON.stringify(urls));
        a.ok(urls.post.indexOf(urls.locationOrigin) === -1, 'Post share URL is canonical, not the current origin (' + urls.locationOrigin + ')');
      }
    },
    {
      name: 'E2E: Copy link / copyPostLink writes a pixlynote.com URL, never github.io',
      accounts: ['personal'],
      covers: ['handler:copyPostLink'],
      async run(ctx) {
        const { page, a } = ctx;
        const result = await page.evaluate(async () => {
          const copied = [];
          try {
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: { writeText: (t) => { copied.push(t); return Promise.resolve(); } }
            });
          } catch (e) {}
          await copyPostLink('share-test-42');
          return {
            copied,
            last: window._pixlyLastCopiedLink || '',
            built: buildPostShareUrl('share-test-42')
          };
        });
        a.equal(result.built, 'https://pixlynote.com/?post=share-test-42', 'buildPostShareUrl is canonical');
        a.equal(result.last, 'https://pixlynote.com/?post=share-test-42', 'copyPostLink stored the canonical URL');
        a.ok(result.copied.length >= 1 && result.copied[0] === 'https://pixlynote.com/?post=share-test-42',
          'Clipboard received the canonical post URL, not github.io: ' + JSON.stringify(result));
        a.ok(!/github\.io/i.test(JSON.stringify(result)), 'No github.io in copied post link: ' + JSON.stringify(result));
      }
    }
  ]
};
