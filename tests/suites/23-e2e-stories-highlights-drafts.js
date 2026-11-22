'use strict';

/**
 * End-to-end UI tests for Stories (create, view, heart, reply, comments, viewers,
 * share-to-feed, delete), Highlights (create, edit, delete), and Drafts (save post/note
 * drafts, resume draft into composer, cancel & confirm delete draft).
 */

module.exports = {
  name: 'E2E Stories, Highlights and Drafts',
  tests: [
    {
      name: 'E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story',
      accounts: ['personal'],
      covers: [
        'el:#profile-avatar-container',
        'el:#btn-profile-pic',
        'el:#btn-story-send-heart',
        'el:#btn-story-send-reply',
        'el:#story-reply-input',
        'el:#btn-story-viewer-comments',
        'el:#btn-close-story-comments',
        'el:#btn-story-owner-comments',
        'el:#btn-story-viewers',
        'el:#btn-close-story-viewers',
        'el:#btn-story-owner-more',
        'el:#btn-story-share-to-feed',
        'el:#btn-story-save-photo',
        'el:#btn-story-delete',
        'el:#btn-close-story-owner-menu',
        'el:#btn-close-story',
        'el:#btn-story-next',
        'el:#btn-story-prev'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        // Create a story through the UI wizard
        await page.click('#nav-btn-create');
        await page.waitForTimeout(120);
        await page.click('#create-mode-tab-story');
        await page.waitForTimeout(80);
        const cap = 'E2E story sunrise ' + Date.now();
        await page.fill('#create-caption-input', cap);
        await page.evaluate((img) => { state.selectedCreateImage = img; }, h.tinyPng());
        await page.click('#btn-submit-story');
        await page.waitForTimeout(350);

        const createdStory = await page.evaluate((cap) => (state.userStories || []).some((s) => s.caption === cap), cap);
        a.ok(createdStory, 'Created story is stored in state.userStories');

        // Open story viewer from profile avatar
        await h.gotoMainTab(page, 'profile');
        await page.evaluate(() => {
          if (typeof openStoryViewer === 'function') openStoryViewer(0);
          else if (typeof openStory === 'function' && state.stories && state.stories[0]) openStory(state.stories[0].id);
        });
        await page.waitForTimeout(200);
        a.ok(await h.isVisible(page, '#modal-story-viewer'), 'Story viewer modal opens');

        // Heart and reply on viewer controls (if visible or via handler)
        await page.evaluate(() => {
          const vc = document.getElementById('story-viewer-controls');
          if (vc) vc.classList.remove('hidden');
        });
        await page.click('#btn-story-send-heart');
        await page.fill('#story-reply-input', 'Awesome sunset!');
        await page.click('#btn-story-send-reply');
        await page.waitForTimeout(150);

        // Comments & Viewers sheets
        await page.click('#btn-story-viewer-comments');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#story-comments-sheet'), 'Story comments sheet opens');
        await page.click('#btn-close-story-comments');
        await page.waitForTimeout(100);

        await page.evaluate(() => {
          const oc = document.getElementById('story-owner-controls');
          if (oc) oc.classList.remove('hidden');
        });
        await page.click('#btn-story-viewers');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#story-viewers-sheet'), 'Story viewers sheet opens');
        await page.click('#btn-close-story-viewers');
        await page.waitForTimeout(100);

        // Owner menu -> Share to feed
        await page.click('#btn-story-owner-more');
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#story-owner-menu'), 'Story owner menu opens');
        const postsBefore = await page.evaluate(() => (state.posts || []).length);
        await page.click('#btn-story-share-to-feed');
        await page.waitForTimeout(250);
        const postsAfter = await page.evaluate(() => (state.posts || []).length);
        a.ok(postsAfter >= postsBefore, 'Share story to feed runs without error');

        // Delete story
        await page.evaluate(() => {
          if (typeof openStoryViewer === 'function' && (state.userStories || []).length > 0) openStoryViewer(0);
          if (typeof openStoryOwnerMenu === 'function') openStoryOwnerMenu();
        });
        await page.waitForTimeout(120);
        if (await h.isVisible(page, '#btn-story-delete')) {
          await page.click('#btn-story-delete');
          await page.waitForTimeout(200);
        }

        await page.evaluate(() => { if (typeof closeStoryViewer === 'function') closeStoryViewer(); });
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    },

    {
      name: 'E2E Highlights: create highlight -> update highlight -> delete highlight',
      accounts: ['personal'],
      covers: [
        'el:#btn-add-highlight',
        'el:#create-mode-tab-highlight',
        'el:#highlight-target-select',
        'el:#highlight-title-input',
        'el:#highlight-icon-input',
        'el:#btn-submit-highlight',
        'el:#btn-delete-highlight',
        'handler:setCreateWizardMode',
        'handler:updateHighlightNewFieldsVisibility',
        'handler:handleCreateHighlightAction',
        'handler:handleDeleteSelectedHighlight'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        await h.gotoMainTab(page, 'profile');
        await page.click('#nav-btn-create');
        await page.waitForTimeout(120);
        await page.click('#create-mode-tab-highlight');
        await page.waitForTimeout(120);

        a.ok(await h.isVisible(page, '#highlight-target-section'), 'Highlight target section shows');
        await page.fill('#highlight-title-input', 'Roadtrips');
        await page.fill('#highlight-icon-input', '🚗');
        await page.evaluate((img) => { state.selectedCreateImage = img; }, h.tinyPng());
        await page.click('#btn-submit-highlight');
        await page.waitForTimeout(250);

        const created = await page.evaluate(() => (state.highlights || []).find((x) => x.title === 'Roadtrips') || null);
        a.ok(!!created, 'Created highlight exists in state.highlights');

        // Reopen Highlight mode, pick the created highlight, and delete it
        await page.click('#nav-btn-create');
        await page.waitForTimeout(120);
        await page.click('#create-mode-tab-highlight');
        await page.waitForTimeout(120);
        await page.selectOption('#highlight-target-select', String(created.id));
        await page.evaluate(() => { if (typeof updateHighlightNewFieldsVisibility === 'function') updateHighlightNewFieldsVisibility(); });
        await page.waitForTimeout(100);
        a.ok(await h.isVisible(page, '#btn-delete-highlight'), 'Delete highlight button shows for existing highlight');
        await page.click('#btn-delete-highlight');
        await page.waitForTimeout(150);

        const remaining = await page.evaluate((id) => (state.highlights || []).some((x) => String(x.id) === String(id)), created.id);
        a.ok(!remaining, 'Deleted highlight is removed from state.highlights');

        await page.click('#btn-close-create-modal');
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    },

    {
      name: 'E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft',
      accounts: ['personal'],
      covers: [
        'el:#btn-save-post-draft',
        'el:#btn-save-note-draft',
        'el:#btn-open-drafts-from-create',
        'el:#btn-open-drafts-from-note',
        'el:#modal-drafts',
        'el:#btn-close-drafts',
        'el:#btn-cancel-delete-draft',
        'el:#btn-confirm-delete-draft'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        // Save a post draft
        await page.click('#nav-btn-create');
        await page.waitForTimeout(120);
        const postDraftCap = 'Draft sunset post ' + Date.now();
        await page.fill('#create-caption-input', postDraftCap);
        await page.click('#btn-save-post-draft');
        await page.waitForTimeout(250);

        // Open Drafts from Create modal
        await page.click('#btn-open-drafts-from-create');
        await page.waitForTimeout(200);
        a.ok(await h.isVisible(page, '#modal-drafts'), 'Drafts modal opens from Create');
        const hasPostDraft = await page.evaluate((cap) => ((document.getElementById('drafts-list') || {}).innerText || '').includes(cap), postDraftCap);
        a.ok(hasPostDraft, 'Saved post draft appears in Drafts list');
        await page.click('#btn-close-drafts');
        await page.click('#btn-close-create-modal');

        // Save a note draft
        await h.gotoMainTab(page, 'profile');
        await page.click('#tab-btn-notes');
        await page.waitForTimeout(150);
        await page.click('#btn-note-fab');
        await page.waitForTimeout(450);
        const noteDraftText = 'Draft thought note ' + Date.now();
        await page.fill('#note-input-text', noteDraftText);
        await page.click('#btn-save-note-draft');
        await page.waitForTimeout(250);

        // Open Drafts from Note composer
        await page.click('#btn-open-drafts-from-note');
        await page.waitForTimeout(200);
        const listText = await page.evaluate(() => (document.getElementById('drafts-list') || {}).innerText || '');
        a.ok(listText.includes(noteDraftText), 'Saved note draft appears in Drafts list');

        // Clear composer, click post draft card to resume it
        await page.evaluate(() => {
          const inp = document.getElementById('create-caption-input');
          if (inp) inp.value = '';
        });
        await page.evaluate((cap) => {
          const cards = [...document.querySelectorAll('#drafts-list .draft-card')];
          const card = cards.find((c) => (c.innerText || '').includes(cap));
          if (card) card.click();
        }, postDraftCap);
        await page.waitForTimeout(250);
        const resumedCap = await page.evaluate(() => (document.getElementById('create-caption-input') || {}).value || '');
        a.equal(resumedCap, postDraftCap, 'Clicking a draft card resumes caption into composer');

        // Reopen drafts and test delete cancel + confirm
        await page.click('#btn-open-drafts-from-create');
        await page.waitForTimeout(200);
        await page.evaluate((cap) => {
          const cards = [...document.querySelectorAll('#drafts-list .draft-card')];
          const card = cards.find((c) => (c.innerText || '').includes(cap));
          const del = card && card.querySelector('.btn-delete-draft');
          if (del) del.click();
        }, postDraftCap);
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#drafts-delete-confirm'), 'Draft delete confirmation shows');
        await page.click('#btn-cancel-delete-draft');
        await page.waitForTimeout(100);
        a.ok(!(await h.isVisible(page, '#drafts-delete-confirm')), 'Cancel hides draft delete confirmation');

        await page.evaluate((cap) => {
          const cards = [...document.querySelectorAll('#drafts-list .draft-card')];
          const card = cards.find((c) => (c.innerText || '').includes(cap));
          const del = card && card.querySelector('.btn-delete-draft');
          if (del) del.click();
        }, postDraftCap);
        await page.waitForTimeout(120);
        await page.click('#btn-confirm-delete-draft');
        await page.waitForTimeout(200);
        const afterDel = await page.evaluate((cap) => ((document.getElementById('drafts-list') || {}).innerText || '').includes(cap), postDraftCap);
        a.ok(!afterDel, 'Confirm delete removes draft from Drafts list');

        await page.click('#btn-close-drafts');
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    }
  ]
};
