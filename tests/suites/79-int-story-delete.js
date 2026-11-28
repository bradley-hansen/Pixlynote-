'use strict';

/**
 * Story owner menu Delete, by real taps, for success AND a failed cloud write.
 * Firestore is the in-page mock (tests/helpers/mock-firestore.js); nothing reaches production.
 */

const { installPixlyMockFirestore, uninstallPixlyMockFirestore } = require('../helpers/mock-firestore');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function withStory(page, h, fn) {
  const me = await page.evaluate(() => normalizeUsername(state.currentUser.username));
  const story = await page.evaluate((png) => {
    window.__sdSnap = { stories: JSON.parse(JSON.stringify(state.userStories || [])), toast: window.showToast };
    const s = { id: 'int79_' + Date.now(), username: state.currentUser.username, image: png, caption: 'int79', timestamp: Date.now(), createdAt: Date.now(), viewers: [] };
    state.userStories = [s];
    window.__sdToasts = [];
    const orig = window.showToast;
    window.showToast = function (m) { window.__sdToasts.push(String(m || '')); try { return orig.apply(this, arguments); } catch (e) {} };
    return s;
  }, PNG);
  await page.evaluate(installPixlyMockFirestore, { ['users/' + me]: { username: me, userStories: [story], story } });
  try {
    await fn(me, story);
  } finally {
    await page.evaluate(uninstallPixlyMockFirestore).catch(() => {});
    await page.evaluate(() => {
      try { if (typeof closeStoryViewer === 'function') closeStoryViewer(); } catch (e) {}
      const s = window.__sdSnap; if (!s) return;
      state.userStories = s.stories;
      window.showToast = s.toast;
      try { localStorage.setItem('pixly_user_stories_' + normalizeUsername(state.currentUser.username), JSON.stringify(state.userStories)); } catch (e) {}
      try { if (typeof renderStories === 'function') renderStories(); } catch (e) {}
    }).catch(() => {});
  }
}

async function tapDelete(page, h, a) {
  await page.evaluate(() => openStoryViewer(0));
  await page.waitForTimeout(250);
  a.ok(await h.isVisible(page, '#modal-story-viewer'), 'Your story opens');
  await page.click('#btn-story-owner-more', { timeout: 5000 });
  await page.waitForTimeout(150);
  a.ok(await h.isVisible(page, '#story-owner-menu'), 'The owner menu opens');
  await page.click('#btn-story-delete', { timeout: 5000 });
  await page.waitForTimeout(500);
}

const read = (page, me, id) => page.evaluate(({ me, id }) => {
  const cloud = (window.__pfs && window.__pfs.docs['users/' + me]) || {};
  return {
    local: (state.userStories || []).some((s) => String(s.id) === id),
    cloud: (cloud.userStories || []).some((s) => String(s.id) === id),
    viewerOpen: (() => { const m = document.getElementById('modal-story-viewer'); return !!(m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none'); })(),
    toasts: (window.__sdToasts || []).slice(),
    writes: (window.__pfs && window.__pfs.writes || []).length
  };
}, { me, id: String(id) });

module.exports = {
  name: 'Interaction: Story Delete by taps',
  tests: [
    {
      name: 'Story Delete by tap: removes the story here and in the cloud, closes the viewer, says Story deleted',
      accounts: ['personal'],
      covers: ['listener:#btn-story-delete:click', 'el:#btn-story-delete', 'el:#btn-story-owner-more'],
      async run({ page, h, a }) {
        await withStory(page, h, async (me, story) => {
          await tapDelete(page, h, a);
          const r = await read(page, me, story.id);
          a.ok(!r.local, 'The story is gone from this device');
          a.ok(!r.cloud && r.writes >= 1, 'The cloud copy no longer has the story: ' + JSON.stringify(r));
          a.ok(!r.viewerOpen, 'The viewer closes');
          a.ok(r.toasts.some((t) => /story deleted/i.test(t)), 'Says Story deleted: ' + JSON.stringify(r.toasts));
        });
      }
    },
    {
      name: 'Story Delete by tap: when the cloud write fails, the app shows an error and keeps the story',
      accounts: ['personal'],
      covers: ['listener:#btn-story-delete:click', 'el:#btn-story-delete'],
      async run({ page, h, a }) {
        await withStory(page, h, async (me, story) => {
          await page.evaluate(() => { window.__pfs.failWrites = true; });
          await tapDelete(page, h, a);
          const r = await read(page, me, story.id);
          if (!r.cloud) throw new Error('PRECONDITION (not the bug): the mock was told to fail writes but the cloud copy changed: ' + JSON.stringify(r));
          a.ok(!r.toasts.some((t) => /story deleted/i.test(t)), 'Must not say Story deleted when the cloud still has it, got ' + JSON.stringify(r.toasts));
          a.ok(r.toasts.some((t) => /couldn.t delete the story/i.test(t)), 'Shows an error: ' + JSON.stringify(r.toasts));
          a.ok(r.local, 'The story is still in your stories on this device');
        });
      }
    }
  ]
};
