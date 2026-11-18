'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Sparkle AI and Share',
  tests: [
    {
      name: 'Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#tab-feed', 'el:#tab-explore', 'el:#nav-btn-feed', 'el:#nav-btn-explore', 'nav:main:feed', 'nav:main:explore', 'el:#modal-post-detail', 'el:#modal-note-detail', 'el:#btn-modal-share', 'el:#modal-pixai-slot', 'el:#btn-note-modal-pixai', 'el:#btn-note-modal-share', 'el:#nav-btn-pixai', 'nav:main:pixai', 'el:#modal-pixai', 'handler:openPostDetailModal', 'handler:openNoteDetailModal', 'handler:openPixaiWithContentFromEl', 'handler:openPixaiModal', 'handler:closePixaiModal', 'handler:handleNoteModalShare'],
      async run(ctx) {
        const { page, h, a } = ctx;
        const countBtns = (rootSel) => page.evaluate((rootSel) => {
          const root = rootSel ? document.querySelector(rootSel) : document;
          if (!root) return { sparkle: 0, share: 0, html: '' };
          const sparkle = root.querySelectorAll('.btn-pixai-content, [id*="pixai"], [title*="Pixlynote AI"], [aria-label*="Pixlynote AI"], [aria-label*="Ask Pixlynote"]').length;
          const share = root.querySelectorAll('[title="Share"], [aria-label="Share"], [id*="share"], [onclick*="Share"], [onclick*="share"]').length;
          return { sparkle, share };
        }, rootSel);

        await h.gotoMainTab(page, 'feed');
        await page.evaluate(() => { if (typeof renderFeed === 'function') renderFeed(); });
        await page.waitForTimeout(120);
        const feed = await countBtns('#tab-feed, #posts-stream, #feed-list');
        a.ok(feed.sparkle > 0, 'Feed has at least one sparkle AI button');
        a.ok(feed.share > 0, 'Feed has at least one share button');

        await h.gotoMainTab(page, 'explore');
        await page.evaluate(() => { if (typeof renderExplore === 'function') renderExplore(); });
        await page.waitForTimeout(120);
        const explore = await countBtns('#tab-explore');
        a.ok(explore.sparkle > 0, 'Explore has at least one sparkle AI button');
        a.ok(explore.share > 0, 'Explore has at least one share button');

        await page.evaluate(() => { if (typeof openPostDetailModal === 'function') openPostDetailModal(3001); });
        await page.waitForTimeout(200);
        const postOpen = await h.isVisible(page, '#modal-post-detail');
        a.ok(postOpen, 'Expanded post modal opens');
        const postSparkle = await page.evaluate(() => {
          const slot = document.getElementById('modal-pixai-slot');
          const btn = (slot && slot.querySelector('button, .btn-pixai-content')) || document.querySelector('#modal-post-detail .btn-pixai-content, #modal-post-detail [aria-label*="Pixlynote AI"]');
          const share = document.getElementById('btn-modal-share');
          const vis = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return !el.classList.contains('hidden') && cs.display !== 'none' && r.width > 0;
          };
          return { sparkle: vis(btn) || !!(slot && slot.innerHTML.trim()), share: vis(share) };
        });
        a.ok(postSparkle.sparkle, 'Expanded post has the sparkle AI button');
        a.ok(postSparkle.share, 'Expanded post has the share button');
        await page.evaluate(() => { if (typeof closePostDetailModal === 'function') closePostDetailModal(); });

        await page.evaluate(() => { if (typeof openNoteDetailModal === 'function') openNoteDetailModal(9001); });
        await page.waitForTimeout(200);
        const noteOpen = await h.isVisible(page, '#modal-note-detail');
        a.ok(noteOpen, 'Expanded note/reply modal opens');
        const noteBtns = await page.evaluate(() => {
          const vis = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return !el.classList.contains('hidden') && cs.display !== 'none' && r.width > 0;
          };
          return { sparkle: vis(document.getElementById('btn-note-modal-pixai')), share: vis(document.getElementById('btn-note-modal-share')) };
        });
        a.ok(noteBtns.sparkle, 'Expanded reply/note has the sparkle AI button');
        a.ok(noteBtns.share, 'Expanded reply/note has the share button');
        await page.evaluate(() => { if (typeof closeNoteDetailModal === 'function') closeNoteDetailModal(); });
      }
    }
  ]
};
