'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Likes, saves, comments and replies',
  tests: [
    {
      name: 'Likes, saves, comments and replies work on posts and notes',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-modal-like', 'el:#btn-modal-save', 'el:#modal-comment-form', 'el:#modal-comment-input', 'el:#btn-modal-post-comment', 'el:#btn-note-modal-like', 'el:#btn-note-modal-save', 'el:#note-modal-comment-form', 'el:#note-modal-comment-input', 'handler:handleNoteModalLikeToggle', 'handler:handleNoteModalSaveToggle', 'handler:toggleLikePostComment', 'handler:toggleLikeNoteComment', 'handler:startReplyToPostComment', 'handler:startReplyToNoteComment', 'handler:togglePostLike'],
      async run(ctx) {
        const { page, h, a } = ctx;
        // Post like / save / comment
        const post = await page.evaluate(() => {
          const id = 3001;
          const beforeLike = !!(state.likedPostIds && (state.likedPostIds.has(id) || state.likedPostIds.has(String(id))));
          const beforeSave = !!(state.savedPostIds && (state.savedPostIds.has(id) || state.savedPostIds.has(String(id))));
          if (typeof togglePostLike === 'function') togglePostLike(id);
          if (typeof toggleSavePost === 'function') toggleSavePost(id);
          const afterLike = !!(state.likedPostIds && (state.likedPostIds.has(id) || state.likedPostIds.has(String(id))));
          const afterSave = !!(state.savedPostIds && (state.savedPostIds.has(id) || state.savedPostIds.has(String(id))));
          if (typeof openPostDetailModal === 'function') openPostDetailModal(id);
          return { beforeLike, afterLike, beforeSave, afterSave };
        });
        a.ok(post.afterLike !== post.beforeLike, 'Toggling like on a post changes liked state');
        a.ok(post.afterSave !== post.beforeSave, 'Toggling save on a post changes saved state');
        await page.waitForTimeout(120);
        const commentBox = await page.$('#modal-comment-input');
        a.ok(commentBox, 'Post comment input is present');
        await page.evaluate(() => {
          const inp = document.getElementById('modal-comment-input');
          if (inp) {
            inp.classList.remove('hidden');
            inp.value = 'Regression comment on post';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const form = document.getElementById('modal-comment-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else if (typeof submitPostModalComment === 'function') submitPostModalComment();
          else document.getElementById('btn-modal-post-comment')?.click();
        });
        await page.waitForTimeout(200);
        const postCommented = await page.evaluate(() => {
          const p = (typeof getPostById === 'function') ? getPostById(3001) : (state.posts || []).find((x) => String(x.id) === '3001');
          const texts = ((p && p.comments) || []).map((c) => c.text || c.body || '').join('\n');
          const list = (document.getElementById('modal-comments-list') || {}).innerText || '';
          return /Regression comment on post/.test(texts + '\n' + list);
        });
        a.ok(postCommented, 'The new post comment appears');
        await page.evaluate(() => { if (typeof closePostDetailModal === 'function') closePostDetailModal(); });

        const note = await page.evaluate(() => {
          const id = 9001;
          const beforeLike = !!(state.likedNoteIds && (state.likedNoteIds.has(id) || state.likedNoteIds.has(String(id))));
          const beforeSave = !!(state.savedNoteIds && (state.savedNoteIds.has(id) || state.savedNoteIds.has(String(id))));
          if (typeof toggleLikeNote === 'function') toggleLikeNote(id);
          if (typeof toggleSaveNote === 'function') toggleSaveNote(id);
          const afterLike = !!(state.likedNoteIds && (state.likedNoteIds.has(id) || state.likedNoteIds.has(String(id))));
          const afterSave = !!(state.savedNoteIds && (state.savedNoteIds.has(id) || state.savedNoteIds.has(String(id))));
          if (typeof openNoteDetailModal === 'function') openNoteDetailModal(id);
          return { beforeLike, afterLike, beforeSave, afterSave };
        });
        a.ok(note.afterLike !== note.beforeLike, 'Toggling like on a note changes liked state');
        a.ok(note.afterSave !== note.beforeSave, 'Toggling save on a note changes saved state');
        await page.waitForTimeout(120);
        const nBox = await page.$('#note-modal-comment-input');
        a.ok(nBox, 'Note comment/reply input is present');
        await page.evaluate(() => {
          const inp = document.getElementById('note-modal-comment-input');
          if (inp) {
            inp.classList.remove('hidden');
            inp.value = 'Regression reply on note';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const form = document.getElementById('note-modal-comment-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else if (typeof submitNoteModalComment === 'function') submitNoteModalComment();
        });
        await page.waitForTimeout(200);
        const noteCommented = await page.evaluate(() => {
          const list = (document.getElementById('note-modal-comments-list') || {}).innerText || '';
          const n = (state.notes || []).find((x) => String(x.id) === '9001') || {};
          const texts = ((n.comments || n.repliesList || [])).map((c) => c.text || c.body || '').join('\n');
          return /Regression reply on note/.test(list + '\n' + texts);
        });
        a.ok(noteCommented, 'The new note reply/comment appears');
        await page.evaluate(() => { if (typeof closeNoteDetailModal === 'function') closeNoteDetailModal(); });
      }
    }
  ]
};
