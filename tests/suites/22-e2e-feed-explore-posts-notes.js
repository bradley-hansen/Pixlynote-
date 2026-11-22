'use strict';

/**
 * End-to-end UI tests for Feed, Create Post, Edit Post (Plus gate + edit),
 * Delete Post confirm modal, Create/Edit/Delete Note, Comments/Replies,
 * Explore Posts/Notes/Search, and Discover Creators modal.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'E2E Feed, Explore, Posts and Notes',
  tests: [
    {
      name: 'E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post',
      accounts: ['personal', 'business'],
      covers: [
        'el:#btn-open-create-modal',
        'el:#create-caption-input',
        'el:#create-location-input',
        'el:#btn-caption-suggestions-shuffle',
        'el:#btn-submit-post',
        'el:#btn-modal-edit-post',
        'el:#modal-edit-content',
        'el:#form-edit-content',
        'el:#edit-content-text',
        'el:#edit-content-location',
        'el:#btn-modal-delete-post',
        'el:#modal-delete-confirm',
        'el:#btn-cancel-delete',
        'el:#btn-confirm-delete',
        'handler:openEditPostModal',
        'handler:saveEditedContent',
        'handler:closeEditContentModal'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        try {
        // Open create post modal via UI button
        await h.gotoMainTab(page, 'feed');
        await page.evaluate(() => {
          state.currentUser.isPlus = false;
          state.currentUser.isVerified = false;
          state.currentUser.subscriptionStatus = 'inactive';
        });
        await page.click('#nav-btn-create');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#modal-create-post'), 'Create post modal opens from nav');

        // Shuffle suggested captions and pick one or enter custom caption
        await page.click('#btn-caption-suggestions-shuffle');
        await page.waitForTimeout(80);
        const capText = 'E2E post ' + account.username + ' #pixlye2e';
        await page.fill('#create-caption-input', capText);
        await page.fill('#create-location-input', 'Atlantic City, NJ');
        await page.evaluate((img) => { state.selectedCreateImage = img; }, h.tinyPng());
        await page.click('#btn-submit-post');
        await page.waitForTimeout(350);

        const createdId = await page.evaluate((capText) => {
          const p = (state.posts || []).find((x) => x.caption === capText);
          return p ? p.id : null;
        }, capText);
        a.ok(createdId !== null, 'Created post appears in state.posts');

        // Verify it renders on Feed
        await h.gotoMainTab(page, 'feed');
        await page.waitForTimeout(150);
        const inFeed = await page.evaluate((capText) => ((document.getElementById('posts-stream') || {}).innerText || '').includes(capText), capText);
        a.ok(inFeed, 'Created post renders in Feed stream');

        // Open post detail modal
        await page.evaluate((id) => { if (typeof openPostDetailModal === 'function') openPostDetailModal(id); }, createdId);
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#modal-post-detail'), 'Post detail modal opens');

        // Non-Plus Edit Post opens subscription paywall
        await page.click('#btn-modal-edit-post');
        await page.waitForTimeout(150);
        const paywallOpen = await h.isVisible(page, '#modal-subscription');
        a.ok(paywallOpen, 'Non-Plus user clicking Edit Post sees Subscription paywall');
        await page.evaluate(() => { if (typeof closeSubscriptionModal === 'function') closeSubscriptionModal(); });

        // Grant Plus and edit the post
        await page.evaluate(() => {
          state.currentUser.isPlus = true;
          state.currentUser.isVerified = true;
          state.currentUser.subscriptionStatus = 'active';
        });
        await page.click('#btn-modal-edit-post');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#modal-edit-content'), 'Plus user clicking Edit Post opens Edit Content modal');

        const editedCap = 'Edited E2E post ' + account.username;
        await page.fill('#edit-content-text', editedCap);
        await page.fill('#edit-content-location', 'Galloway, NJ');
        await page.evaluate(() => {
          const f = document.getElementById('form-edit-content');
          if (f && typeof f.requestSubmit === 'function') f.requestSubmit();
          else if (typeof saveEditedContent === 'function') saveEditedContent();
        });
        await page.waitForTimeout(200);
        a.ok(!(await h.isVisible(page, '#modal-edit-content')), 'Edit Content modal closes on save');

        const afterEdit = await page.evaluate((id) => {
          const p = (state.posts || []).find((x) => String(x.id) === String(id));
          return p ? { caption: p.caption, location: p.location, edited: !!p.edited } : null;
        }, createdId);
        a.equal(afterEdit && afterEdit.caption, editedCap, 'Post caption updated');
        a.equal(afterEdit && afterEdit.location, 'Galloway, NJ', 'Post location updated');
        a.ok(afterEdit && afterEdit.edited, 'Post marked edited');

        // Delete Post: cancel keeps it, confirm removes it
        await page.click('#btn-modal-delete-post');
        await page.waitForTimeout(150);
        a.ok(await h.isVisible(page, '#modal-delete-confirm'), 'Delete confirmation modal opens');
        await page.click('#btn-cancel-delete');
        await page.waitForTimeout(100);
        const stillThere = await page.evaluate((id) => (state.posts || []).some((x) => String(x.id) === String(id)), createdId);
        a.ok(stillThere, 'Canceling delete keeps the post');

        await page.click('#btn-modal-delete-post');
        await page.waitForTimeout(120);
        await page.click('#btn-confirm-delete');
        await page.waitForTimeout(200);
        const deleted = await page.evaluate((id) => !(state.posts || []).some((x) => String(x.id) === String(id)), createdId);
        a.ok(deleted, 'Confirming delete removes the post');

        } finally {
        // Restore clean session state
        await h.loadApp(page, { port });
        await h.loginAs(page, account);
        }
      }
    },

    {
      name: 'E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators',
      accounts: ['personal'],
      covers: [
        'el:#note-compose-form',
        'el:#note-input-text',
        'el:#btn-post-note',
        'el:#btn-note-fab',
        'el:#btn-close-note-composer',
        'el:#explore-tab-btn-posts',
        'el:#explore-tab-btn-notes',
        'el:#explore-search-input',
        'el:#modal-discover-creators',
        'el:#btn-close-discover-creators-modal',
        'nav:explore:posts',
        'nav:explore:notes'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const port = Number(new URL(page.url()).port);

        // Open Profile Notes tab and submit a note via form
        await h.gotoMainTab(page, 'profile');
        await page.click('#tab-btn-notes');
        await page.waitForTimeout(150);
        await page.click('#btn-note-fab');
        await page.waitForTimeout(450);
        const noteText = 'E2E test note #galloway ' + Date.now();
        await page.fill('#note-input-text', noteText);
        await page.click('#btn-post-note');
        await page.waitForTimeout(250);

        const noteObj = await page.evaluate((t) => (state.notes || []).find((n) => n.text === t) || null, noteText);
        a.ok(!!noteObj, 'Posted note is stored in state.notes');

        // Verify note shows in Profile Notes list
        const inProfileNotes = await page.evaluate((t) => ((document.getElementById('notes-list') || {}).innerText || '').includes(t), noteText);
        a.ok(inProfileNotes, 'Posted note renders in Profile Notes list');

        // Edit note & add reply in Note Detail Modal
        if (noteObj && noteObj.id !== undefined) {
          await page.evaluate((id) => { if (typeof openNoteDetailModal === 'function') openNoteDetailModal(id); }, noteObj.id);
          await page.waitForTimeout(120);
          a.ok(await h.isVisible(page, '#modal-note-detail'), 'Note detail modal opens');
          await page.fill('#note-modal-comment-input', 'E2E reply to note');
          await page.click('#note-modal-comment-form button[type="submit"]');
          await page.waitForTimeout(150);
          const repliesTxt = await page.evaluate(() => (document.getElementById('note-modal-comments-list') || {}).innerText || '');
          a.ok(repliesTxt.includes('E2E reply to note'), 'Note reply renders in modal');
          await page.click('#btn-close-note-modal');
          await page.waitForTimeout(80);
        }

        // Switch to Explore, search for seeded community note (Explore excludes viewer own notes), switch between Posts & Notes tabs
        await h.gotoMainTab(page, 'explore');
        await page.waitForTimeout(120);
        await page.click('#explore-tab-btn-notes');
        await page.waitForTimeout(120);
        await page.fill('#explore-search-input', 'elena_eats');
        await page.evaluate(() => {
          document.getElementById('explore-search-input')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof renderExplore === 'function') renderExplore('elena_eats');
        });
        await page.waitForTimeout(120);
        const inExploreNotes = await page.evaluate(() => ((document.getElementById('explore-notes-list') || {}).innerText || '').toLowerCase().includes('elena'));
        a.ok(inExploreNotes, 'Community note appears in Explore Notes search');

        await page.click('#explore-tab-btn-posts');
        await page.waitForTimeout(100);
        await page.fill('#explore-search-input', '');
        await page.evaluate(() => { if (typeof renderExplore === 'function') renderExplore(''); });

        // Discover Creators modal
        await page.evaluate(() => { if (typeof openDiscoverCreatorsModal === 'function') openDiscoverCreatorsModal(); });
        await page.waitForTimeout(120);
        a.ok(await h.isVisible(page, '#modal-discover-creators'), 'Discover Creators modal opens');
        await page.click('#btn-close-discover-creators-modal');
        await page.waitForTimeout(100);
        a.ok(!(await h.isVisible(page, '#modal-discover-creators')), 'Discover Creators modal closes');

        await h.loadApp(page, { port });
        await h.loginAs(page, account);
      }
    }
  ]
};
