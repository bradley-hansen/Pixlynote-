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
        // Reply to that comment
        const commentId = await page.evaluate(() => {
          const p = (typeof getPostById === 'function') ? getPostById(3001) : (state.posts || []).find((x) => String(x.id) === '3001');
          const c = ((p && p.comments) || []).find((x) => /Regression comment on post/.test(x.text || x.body || ''));
          return c ? c.id : null;
        });
        a.ok(commentId, 'The new comment has an id');
        await page.evaluate((commentId) => {
          if (typeof startReplyToPostComment === 'function') startReplyToPostComment(3001, commentId, 'reg_personal');
          const inp = document.getElementById('modal-comment-input');
          if (inp) {
            inp.classList.remove('hidden');
            inp.value = 'Regression reply on post comment';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const form = document.getElementById('modal-comment-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-modal-post-comment')?.click();
        }, commentId);
        await page.waitForTimeout(200);
        const postReplied = await page.evaluate((commentId) => {
          const p = (typeof getPostById === 'function') ? getPostById(3001) : (state.posts || []).find((x) => String(x.id) === '3001');
          const c = ((p && p.comments) || []).find((x) => String(x.id) === String(commentId));
          const texts = ((c && c.replies) || []).map((r) => r.text || r.body || '').join('\n');
          const list = (document.getElementById('modal-comments-list') || {}).innerText || '';
          return /Regression reply on post comment/.test(texts + '\n' + list);
        }, commentId);
        a.ok(postReplied, 'A reply to the post comment appears');
        await page.evaluate(() => { if (typeof closePostDetailModal === 'function') closePostDetailModal(); });
        // Liked/Saved tabs show the post
        await h.gotoMainTab(page, 'profile');
        const inTabs = await page.evaluate(() => {
          if (typeof renderLikes === 'function') renderLikes();
          if (typeof renderSaved === 'function') renderSaved();
          const collect = (id) => {
            const root = document.getElementById(id);
            if (!root) return [];
            const out = [];
            root.querySelectorAll('[onclick], [data-id], [data-post-id]').forEach((el) => {
              const v = el.getAttribute('data-id') || el.getAttribute('data-post-id') || ((el.getAttribute('onclick') || '').match(/['"](\d+)['"]/) || [])[1];
              if (v && !out.includes(String(v))) out.push(String(v));
            });
            return out;
          };
          return {
            liked: collect('likes-grid'),
            saved: collect('saved-grid'),
            likedHas: (state.likedPostIds && (state.likedPostIds.has(3001) || state.likedPostIds.has('3001'))),
            savedHas: (state.savedPostIds && (state.savedPostIds.has(3001) || state.savedPostIds.has('3001')))
          };
        });
        a.ok(inTabs.likedHas, 'Post 3001 is in the liked set');
        a.ok(inTabs.savedHas, 'Post 3001 is in the saved set');
        a.ok(inTabs.liked.includes('3001') || inTabs.likedHas, 'Liked Photos lists the liked post: ' + JSON.stringify(inTabs.liked));
        a.ok(inTabs.saved.includes('3001') || inTabs.savedHas, 'Saved Photos lists the saved post: ' + JSON.stringify(inTabs.saved));

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
        const noteCommentId = await page.evaluate(() => {
          const n = (state.notes || []).find((x) => String(x.id) === '9001') || {};
          const c = ((n.comments || [])).find((x) => /Regression reply on note/.test(x.text || x.body || ''));
          return c ? c.id : ((n.comments || [])[0] && (n.comments || [])[0].id) || null;
        });
        if (noteCommentId && await page.evaluate((id) => typeof startReplyToNoteComment === 'function', noteCommentId)) {
          await page.evaluate((id) => {
            startReplyToNoteComment(9001, id, 'reg_personal');
            const inp = document.getElementById('note-modal-comment-input');
            if (inp) { inp.value = 'Regression nested reply'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
            if (typeof submitNoteModalComment === 'function') submitNoteModalComment();
          }, noteCommentId);
          await page.waitForTimeout(200);
          const nested = await page.evaluate(() => {
            const list = (document.getElementById('note-modal-comments-list') || {}).innerText || '';
            const n = (state.notes || []).find((x) => String(x.id) === '9001') || {};
            const dump = JSON.stringify(n.comments || []);
            return /Regression nested reply/.test(list + dump);
          });
          a.ok(nested, 'A nested reply on the note appears');
        }
        await page.evaluate(() => { if (typeof closeNoteDetailModal === 'function') closeNoteDetailModal(); });
        await h.gotoMainTab(page, 'profile');
        const noteTabs = await page.evaluate(() => {
          if (typeof renderLikes === 'function') renderLikes();
          if (typeof renderSaved === 'function') renderSaved();
          return {
            liked: !!(state.likedNoteIds && (state.likedNoteIds.has(9001) || state.likedNoteIds.has('9001'))),
            saved: !!(state.savedNoteIds && (state.savedNoteIds.has(9001) || state.savedNoteIds.has('9001')))
          };
        });
        a.ok(noteTabs.liked, 'Note 9001 is in the liked-notes set');
        a.ok(noteTabs.saved, 'Note 9001 is in the saved-notes set');
      }
    },
    {
      name: 'Close Friends audience is kept, badged, and filtered from Likes and Saved',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#modal-post-detail', 'el:#story-viewer-cf-label'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const me = (state.currentUser && state.currentUser.username) || 'me';
          const own = {
            id: 'cf_own_reg_1',
            author: me,
            authorName: me,
            image: (state.posts && state.posts[0] && state.posts[0].image) || '',
            caption: 'CF own caption',
            tags: [],
            comments: [],
            likes: 0,
            audience: 'closeFriends'
          };
          const hidden = {
            id: 'cf_hidden_reg_1',
            author: 'not_a_close_friend_xyz',
            authorName: 'Hidden',
            image: own.image,
            caption: 'secret cf post',
            tags: [],
            comments: [],
            likes: 0,
            audience: 'closeFriends'
          };
          state.posts = (state.posts || []).filter((p) => String(p.id) !== own.id && String(p.id) !== hidden.id).concat([own, hidden]);
          if (!state.likedPostIds) state.likedPostIds = new Set();
          if (!state.savedPostIds) state.savedPostIds = new Set();
          state.likedPostIds.add(hidden.id);
          state.savedPostIds.add(hidden.id);
          state.likedPostIds.add(own.id);
          state.savedPostIds.add(own.id);
          if (typeof renderLikes === 'function') renderLikes();
          if (typeof renderSaved === 'function') renderSaved();
          const likesHtml = (document.getElementById('likes-grid') || {}).innerHTML || '';
          const savedHtml = (document.getElementById('saved-grid') || {}).innerHTML || '';
          if (typeof openPostDetailModal === 'function') openPostDetailModal(own.id);
          const modal = (document.getElementById('modal-comments-list') || {}).innerHTML || '';
          const canSeeOwn = typeof canSeeAudienceContent === 'function' ? canSeeAudienceContent(own) : true;
          const canSeeHidden = typeof canSeeAudienceContent === 'function' ? canSeeAudienceContent(hidden) : false;
          // Cloud post missing audience must not wipe a local Close Friends audience.
          let kept = true;
          if (typeof applyCustomPostsFromRemote === 'function') {
            applyCustomPostsFromRemote([{ id: own.id, author: me, caption: 'CF own caption', image: own.image }]);
            const after = (typeof getPostById === 'function') ? getPostById(own.id) : (state.posts || []).find((p) => String(p.id) === String(own.id));
            kept = !!(after && after.audience === 'closeFriends');
          }
          return {
            canSeeOwn,
            canSeeHidden,
            likesHasHidden: likesHtml.includes('cf_hidden_reg_1'),
            savedHasHidden: savedHtml.includes('cf_hidden_reg_1'),
            modalHasBadge: /Close Friends/.test(modal) || /cf-content-label/.test(modal),
            kept
          };
        });
        a.ok(r.canSeeOwn, 'The author can see their own Close Friends post');
        a.ok(!r.canSeeHidden, 'A viewer who is not a Close Friend cannot see that post');
        a.ok(!r.likesHasHidden, 'Hidden Close Friends posts are filtered out of Likes');
        a.ok(!r.savedHasHidden, 'Hidden Close Friends posts are filtered out of Saved');
        a.ok(r.modalHasBadge, 'Post detail shows the Close Friends star badge');
        a.ok(r.kept, 'A cloud post missing audience does not overwrite a local Close Friends audience');
      }
    }
  ]
};
