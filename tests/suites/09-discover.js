'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Discover Creators',
  tests: [
    {
      name: 'Discover Creators shows only unconnected users, including in search',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#modal-discover-creators', 'el:#btn-close-discover-creators-modal', 'el:#discover-creators-search-input', 'el:#discover-creators-list-container', 'handler:openDiscoverCreatorsModal', 'listener:#discover-creators-search-input:input'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await page.evaluate(() => {
          if (typeof openDiscoverCreatorsModal === 'function') openDiscoverCreatorsModal();
        });
        await page.waitForTimeout(200);
        const open = await h.isVisible(page, '#modal-discover-creators');
        a.ok(open, 'Discover Creators modal opens');
        const listed = await page.evaluate(() => {
          const root = document.getElementById('discover-creators-list-container');
          const text = (root && (root.innerText || '')) || '';
          return { text, hasConnected: /@connected_user\b/.test(text), hasFresh: /@fresh_creator\b/.test(text), hasAnother: /@another_new\b/.test(text) };
        });
        a.ok(!listed.hasConnected, 'Already-connected users are not listed: ' + listed.text.slice(0, 200));
        a.ok(listed.hasFresh && listed.hasAnother, 'Unconnected users are listed: ' + listed.text.slice(0, 200));

        const searchEl = await page.$('#discover-creators-search-input');
        a.ok(searchEl, 'Search input exists');
        await page.fill('#discover-creators-search-input', 'connected_user');
        await page.evaluate(() => {
          const el = document.getElementById('discover-creators-search-input');
          el && el.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof renderDiscoverCreatorsList === 'function') renderDiscoverCreatorsList(el ? el.value : 'connected_user');
        });
        await page.waitForTimeout(120);
        const searched = await page.evaluate(() => (document.getElementById('discover-creators-list-container') || {}).innerText || '');
        a.ok(!/@connected_user\b/.test(searched), 'Search does not surface an already-connected user: ' + searched.slice(0, 200));

        await page.fill('#discover-creators-search-input', 'fresh');
        await page.evaluate(() => {
          const el = document.getElementById('discover-creators-search-input');
          el && el.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof renderDiscoverCreatorsList === 'function') renderDiscoverCreatorsList(el ? el.value : 'fresh');
        });
        await page.waitForTimeout(120);
        const fresh = await page.evaluate(() => (document.getElementById('discover-creators-list-container') || {}).innerText || '');
        a.ok(/@fresh_creator\b/.test(fresh), 'Search finds an unconnected user: ' + fresh.slice(0, 200));
        await page.evaluate(() => { if (typeof closeDiscoverCreatorsModal === 'function') closeDiscoverCreatorsModal(); });
      }
    }
  ]
};
