'use strict';

/**
 * Delegate likes (to-do #3, 2026-11-27):
 *  1. Profile Likes (Liked Photos and Liked Notes) show the newest likes first,
 *     ordered by the like's time (not the post's), including after a Firestore
 *     arrayUnion snapshot (oldest-first).
 *  2. A Liked Photos grid tile for a delegate like shows a bottom strip, left
 *     to right: the photo owner's avatar, the Showcase tag (Showcase photos
 *     only), the heart, and the delegate's circular avatar (no "by @handle"
 *     text), with tooltip/aria-label "Done by @handle with Privileged Access".
 *     Ordinary likes keep the existing strip (no delegate avatar). Opening
 *     the photo still shows the "Liked for @x · by @handle" message.
 *  3. The delegate's own Privileged Access screen lists the grants they have
 *     been given (e.g. "You can: Like").
 * Nothing is written to production Firestore (the harness blocks it).
 */

const { ALL_ACCOUNT_KEYS, ACCOUNTS } = require('../helpers/harness');

function viewerFor(account) {
  return account.username === 'pixlynote' ? ACCOUNTS.business : ACCOUNTS.pixlynote;
}

async function openLikesTab(page, h, subtab) {
  await h.gotoMainTab(page, 'profile');
  await page.evaluate((which) => {
    const btn = document.getElementById('tab-btn-likes');
    if (btn) btn.click();
    if (typeof renderLikes === 'function') renderLikes();
    const photos = document.getElementById('likes-subtab-photos');
    const notes = document.getElementById('likes-subtab-notes');
    if (which === 'notes' && notes) notes.click();
    else if (photos) photos.click();
    if (typeof renderLikes === 'function') renderLikes();
  }, subtab || 'photos');
}

async function openPrivilegedAccessView(page, h) {
  await h.openOwnerMenu(page);
  await page.evaluate(() => {
    if (typeof toggleDrawerSettingsInfo === 'function') toggleDrawerSettingsInfo();
    if (typeof handleDrawerAccountCenterClick === 'function') handleDrawerAccountCenterClick();
    else if (typeof openAccountCenter === 'function') openAccountCenter();
  });
  await page.waitForTimeout(200);
  const your = await page.$('#btn-ac-open-your-account');
  if (your) {
    await page.click('#btn-ac-open-your-account');
    await page.waitForTimeout(80);
  }
  await page.click('#btn-ac-tab-privileged-access');
  await page.waitForTimeout(150);
}

function collectLikeOrder(page) {
  return page.evaluate(() => {
    const grid = document.getElementById('likes-grid');
    const notes = document.getElementById('liked-notes-list');
    const postIds = [];
    const noteIds = [];
    if (grid) {
      grid.querySelectorAll('.liked-grid-item[data-post-id], [data-post-id]').forEach((el) => {
        const v = el.getAttribute('data-post-id');
        if (v && !postIds.includes(String(v))) postIds.push(String(v));
      });
    }
    if (notes) {
      notes.querySelectorAll('[data-note-id]').forEach((el) => {
        const v = el.getAttribute('data-note-id');
        if (v && !noteIds.includes(String(v))) noteIds.push(String(v));
      });
    }
    const firstTile = grid && grid.querySelector('.liked-grid-item, [data-post-id]');
    function tileDelegateInfo(el) {
      const strip = el && el.querySelector('.liked-grid-strip');
      const wrap = el && el.querySelector('.liked-grid-delegate');
      const labeled = wrap && (wrap.querySelector('[aria-label], [title]') || wrap);
      const stripOrder = [];
      if (strip) {
        strip.querySelectorAll(':scope > *').forEach((node) => {
          if (node.classList.contains('liked-grid-delegate') || node.querySelector('.liked-grid-delegate-avatar')) stripOrder.push('delegate');
          else if (node.classList.contains('liked-grid-heart') || (node.textContent || '').indexOf('\u2764\ufe0f') !== -1) stripOrder.push('heart');
          else if (node.classList.contains('showcase-pill') || node.getAttribute('data-showcase-pill') || node.querySelector('[data-showcase-pill], .showcase-pill')) stripOrder.push('showcase');
          else if (node.classList.contains('liked-grid-owner-avatar') || (node.tagName === 'IMG' && node.classList.contains('liked-grid-owner-avatar'))) stripOrder.push('owner');
          else if (node.querySelector && node.querySelector('.liked-grid-owner-avatar')) stripOrder.push('owner-group');
        });
      }
      const handleSpan = strip && Array.from(strip.querySelectorAll('span')).find((sp) => /^@/.test((sp.textContent || '').trim()));
      return {
        text: strip ? (strip.textContent || '').replace(/\s+/g, ' ').trim() : (wrap ? (wrap.textContent || '').replace(/\s+/g, ' ').trim() : ''),
        hasImg: !!(wrap && wrap.querySelector('img') && wrap.querySelector('img').getAttribute('src')),
        label: labeled ? (labeled.getAttribute('aria-label') || labeled.getAttribute('title') || '') : '',
        hasHeart: !!(strip && strip.querySelector('.liked-grid-heart')),
        hasShowcase: !!(strip && strip.querySelector('[data-showcase-pill], .showcase-pill')),
        hasAuthorHandle: !!(handleSpan),
        stripOrder
      };
    }
    const badge = firstTile ? tileDelegateInfo(firstTile) : { text: '', hasImg: false, label: '' };
    return {
      postIds,
      noteIds,
      firstPostId: postIds[0] || '',
      firstNoteId: noteIds[0] || '',
      firstDelegate: firstTile ? (firstTile.getAttribute('data-liked-by-delegate') || '') : '',
      firstBadgeText: badge.text,
      firstBadgeHasImg: badge.hasImg,
      firstBadgeLabel: badge.label,
      tilesWithBadge: grid ? Array.from(grid.querySelectorAll('[data-liked-by-delegate]')).map((el) => {
        const info = tileDelegateInfo(el);
        return {
          id: el.getAttribute('data-post-id'),
          by: el.getAttribute('data-liked-by-delegate'),
          text: info.text,
          hasImg: info.hasImg,
          label: info.label,
          hasHeart: info.hasHeart,
          hasShowcase: info.hasShowcase,
          hasAuthorHandle: info.hasAuthorHandle,
          stripOrder: info.stripOrder
        };
      }) : [],
      tiles: grid ? Array.from(grid.querySelectorAll('.liked-grid-item, [data-post-id]')).map((el) => {
        const info = tileDelegateInfo(el);
        return {
          id: el.getAttribute('data-post-id'),
          by: el.getAttribute('data-liked-by-delegate') || '',
          text: info.text,
          hasImg: info.hasImg,
          label: info.label,
          hasHeart: info.hasHeart,
          hasShowcase: info.hasShowcase,
          hasAuthorHandle: info.hasAuthorHandle,
          stripOrder: info.stripOrder
        };
      }) : []
    };
  });
}

module.exports = {
  name: 'Delegate likes: newest first, grid badge, received grants',
  tests: [
    {
      name: 'Delegate likes: Liked Photos and Liked Notes list newest likes first, including after a Firestore arrayUnion snapshot',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#likes-grid',
        'el:#liked-notes-list',
        'el:#tab-btn-likes',
        'el:#likes-subtab-photos',
        'el:#likes-subtab-notes',
        'handler:renderLikes',
        'handler:togglePostLike',
        'handler:toggleLikeNote',
        'handler:applyLikesFromRemote',
        'handler:applyNoteLikesFromRemote',
        'window.togglePostLike',
        'window.toggleLikeNote',
        'window.renderLikes',
        'window.applyLikesFromRemote',
        'window.applyNoteLikesFromRemote'
      ],
      async run(ctx) {
        const { page, a, h } = ctx;
        await h.gotoMainTab(page, 'profile');
        const setup = await page.evaluate(() => {
          state.likedPostIds = new Set();
          state.likedOrder = [];
          state.likedPostAt = {};
          state.likedNoteIds = new Set();
          state.likedNoteOrder = [];
          state.likedNoteAt = {};
          const postA = '2123';
          const postB = '2144';
          const noteA = '9101';
          const noteB = '9102';
          if (typeof togglePostLike !== 'function' || typeof toggleLikeNote !== 'function') {
            return { ok: false, reason: 'missing toggle' };
          }
          togglePostLike(postA);
          togglePostLike(postB);
          toggleLikeNote(noteA);
          toggleLikeNote(noteB);
          if (typeof renderLikes === 'function') renderLikes();
          return { ok: true, postA, postB, noteA, noteB };
        });
        a.ok(setup.ok, 'liked two photos and two notes: ' + JSON.stringify(setup));
        await openLikesTab(page, h, 'photos');
        let order = await collectLikeOrder(page);
        a.ok(order.postIds.indexOf('2144') !== -1 && order.postIds.indexOf('2123') !== -1, 'both liked photos appear: ' + JSON.stringify(order.postIds));
        a.ok(order.postIds.indexOf('2144') < order.postIds.indexOf('2123'), 'Liked Photos: later like 2144 is before earlier like 2123: ' + JSON.stringify(order.postIds));

        await openLikesTab(page, h, 'notes');
        order = await collectLikeOrder(page);
        a.ok(order.noteIds.indexOf('9102') !== -1 && order.noteIds.indexOf('9101') !== -1, 'both liked notes appear: ' + JSON.stringify(order.noteIds));
        a.ok(order.noteIds.indexOf('9102') < order.noteIds.indexOf('9101'), 'Liked Notes: later like 9102 is before earlier like 9101: ' + JSON.stringify(order.noteIds));

        // Firestore arrayUnion appends, so a remote snapshot is oldest-first.
        const afterRemote = await page.evaluate(() => {
          window.pendingLikesSync = false;
          window._likeWritesInFlight = 0;
          applyLikesFromRemote(['2123', '2144']);
          applyNoteLikesFromRemote(['9101', '9102']);
          if (typeof renderLikes === 'function') renderLikes();
          return {
            likedOrder: (state.likedOrder || []).map(String),
            likedNoteOrder: (state.likedNoteOrder || []).map(String)
          };
        });
        a.ok(afterRemote.likedOrder[0] === '2144', 'after remote snapshot, likedOrder stays newest-first: ' + JSON.stringify(afterRemote.likedOrder));
        a.ok(afterRemote.likedNoteOrder[0] === '9102', 'after remote snapshot, likedNoteOrder stays newest-first: ' + JSON.stringify(afterRemote.likedNoteOrder));

        await openLikesTab(page, h, 'photos');
        order = await collectLikeOrder(page);
        a.ok(order.postIds.indexOf('2144') < order.postIds.indexOf('2123'), 'Liked Photos still newest first after remote sync: ' + JSON.stringify(order.postIds));
        await openLikesTab(page, h, 'notes');
        order = await collectLikeOrder(page);
        a.ok(order.noteIds.indexOf('9102') < order.noteIds.indexOf('9101'), 'Liked Notes still newest first after remote sync: ' + JSON.stringify(order.noteIds));
      }
    },
    {
      name: 'Delegate likes: Liked Photos grid tile shows only the delegate avatar, and opening the photo shows Liked for / by',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#likes-grid',
        'el:#modal-like-delegates',
        'handler:privilegedDelegateAvatarOnlyHtml',
        'handler:privilegedLikeDelegatesHtml',
        'handler:likedDelegateUsername',
        'handler:isShowcaseAccount',
        'handler:showcasePillHtml',
        'handler:renderLikes',
        'handler:togglePostLike'
      ],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const viewer = viewerFor(account);
        await h.loginAs(page, account);
        const olderId = '2123';
        const newerId = '2144';
        await page.evaluate(({ olderId }) => {
          state.likedPostIds = new Set();
          state.likedOrder = [];
          state.likedPostAt = {};
          togglePostLike(olderId);
        }, { olderId });
        await page.evaluate(({ owner, viewer, newerId }) => {
          const post = (typeof getPostById === 'function') ? getPostById(newerId) : (state.posts || []).find((p) => String(p.id) === String(newerId));
          const author = post && post.author;
          if (author) {
            window._remoteUserProfilesCache = window._remoteUserProfilesCache || {};
            window._remoteUserProfilesCache[author] = Object.assign({}, window._remoteUserProfilesCache[author] || {}, { username: author, isShowcase: true });
          }
          savePrivilegedAccountsList(viewer.username, [{ username: owner.username, status: 'accepted' }]);
          const acc = { username: owner.username, fullName: owner.fullName, email: '', phone: '', accountType: owner.accountType || 'personal' };
          performLogin(acc.username, acc.fullName, '', null, '', acc.accountType, acc, { privilegedReadOnly: true, viewer: viewer.username, grants: ['like'] });
          togglePostLike(newerId);
        }, { owner: account, viewer, newerId });
        await openLikesTab(page, h, 'photos');
        const order = await collectLikeOrder(page);
        a.ok(order.postIds.indexOf(newerId) !== -1 && order.postIds.indexOf(olderId) !== -1, 'both likes appear: ' + JSON.stringify(order.postIds));
        a.ok(order.postIds.indexOf(newerId) < order.postIds.indexOf(olderId), 'delegate like is first (newest): ' + JSON.stringify(order.postIds));
        const tile = (order.tiles || order.tilesWithBadge).find((t) => t.id === newerId);
        a.ok(tile, 'newest grid tile is marked as a delegate like: ' + JSON.stringify(order.tilesWithBadge));
        a.equal(tile && tile.by, viewer.username, 'tile names the delegate @' + viewer.username + ': ' + JSON.stringify(tile));
        a.ok(tile && tile.hasImg, 'grid tile shows the delegate avatar: ' + JSON.stringify(tile));
        a.ok(tile && tile.hasHeart, 'delegate like strip includes the heart: ' + JSON.stringify(tile));
        a.ok(tile && tile.hasShowcase, 'Showcase photo shows the Showcase tag on the strip: ' + JSON.stringify(tile));
        a.ok(tile && !tile.hasAuthorHandle, 'delegate like strip has no @handle text: ' + JSON.stringify(tile));
        a.ok(tile && (!tile.text || tile.text.indexOf('by @') === -1), 'grid tile has no by @handle text: ' + JSON.stringify(tile));
        a.equal(tile && tile.label, 'Done by @' + viewer.username + ' with Privileged Access', 'avatar tooltip/aria-label: ' + JSON.stringify(tile));
        a.equal(JSON.stringify(tile && tile.stripOrder), JSON.stringify(['owner', 'showcase', 'heart', 'delegate']), 'delegate Showcase strip order is owner, Showcase, heart, delegate avatar: ' + JSON.stringify(tile && tile.stripOrder));
        const older = (order.tiles || []).find((t) => t.id === olderId);
        a.ok(older, 'the earlier owner like is still in the grid: ' + JSON.stringify(order.tiles));
        a.ok(older && !older.by && !older.hasImg, 'ordinary like has no delegate avatar: ' + JSON.stringify(older));
        a.ok(older && older.hasHeart, 'ordinary like still shows the heart: ' + JSON.stringify(older));
        a.ok(older && older.hasAuthorHandle, 'ordinary like still shows the owner @handle: ' + JSON.stringify(older));
        a.ok(older && !older.hasShowcase, 'ordinary non-Showcase like has no Showcase tag on its own: ' + JSON.stringify(older));
        const olderHasBadge = order.tilesWithBadge.some((t) => t.id === olderId);
        a.ok(!olderHasBadge, 'the earlier owner like has no delegate avatar: ' + JSON.stringify(order.tilesWithBadge));
        await page.evaluate((id) => { if (typeof openPostDetailModal === 'function') openPostDetailModal(id); }, newerId);
        const likedBy = await page.evaluate(() => {
          const el = document.getElementById('modal-like-delegates');
          return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
        });
        a.ok(likedBy.indexOf('Liked for @' + account.username) !== -1, 'opened photo shows Liked for @' + account.username + ': ' + likedBy);
        a.ok(likedBy.indexOf('by @' + viewer.username) !== -1, 'opened photo shows by @' + viewer.username + ': ' + likedBy);
        await page.evaluate(() => { try { if (typeof closePostDetailModal === 'function') closePostDetailModal(); } catch (e) {} });
        await page.evaluate(() => { try { clearPrivilegedReadOnlySession(); } catch (e) {} });
      }
    },
    {
      name: 'Delegate likes: Privileged Access screen lists the grants they have been given (You can: Like)',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#btn-ac-tab-privileged-access',
        'el:#ac-privileged-received-list',
        'handler:renderPrivilegedAccessView',
        'handler:receivedPrivilegedGrants',
        'handler:privilegedGrantsFromOwnerDoc',
        'handler:privilegedGrantLabel'
      ],
      async run(ctx) {
        const { page, a, h, account } = ctx;
        const owner = account;
        const viewer = viewerFor(account);
        await page.evaluate(({ viewer, owner }) => {
          performLogin(viewer.username, viewer.fullName, viewer.email || '', null, viewer.phone || '', viewer.accountType || 'business', viewer);
          savePrivilegedAccountsList(viewer.username, [
            { username: owner.username, status: 'accepted', acceptedAt: Date.now() }
          ]);
          window.__pixlyPrivTargetDoc = (u) => {
            if (String(u).toLowerCase() === String(owner.username).toLowerCase()) {
              return { username: owner.username, privilegedAccessGranted: [{ username: viewer.username, status: 'accepted', grants: ['like'] }] };
            }
            return null;
          };
        }, { viewer, owner });
        await openPrivilegedAccessView(page, h);
        const rec = await page.evaluate((ownerU) => {
          const list = document.getElementById('ac-privileged-received-list');
          const row = list && (list.querySelector('.ac-priv-received-row[data-username="' + ownerU + '"]') || list.querySelector('[data-username="' + ownerU + '"]'));
          const grantsEl = row && row.querySelector('.ac-priv-received-grants');
          return {
            text: list ? (list.innerText || '').replace(/\s+/g, ' ').trim() : '',
            grants: grantsEl ? (grantsEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
            hasRow: !!row
          };
        }, owner.username);
        a.ok(rec.hasRow, 'received list includes @' + owner.username + ': ' + rec.text);
        a.equal(rec.grants, 'You can: Like', 'delegate screen lists the like grant: ' + JSON.stringify(rec));

        await page.evaluate(({ viewer, owner }) => {
          window.__pixlyPrivTargetDoc = (u) => {
            if (String(u).toLowerCase() === String(owner.username).toLowerCase()) {
              return { username: owner.username, privilegedAccessGranted: [{ username: viewer.username, status: 'accepted', grants: [] }] };
            }
            return null;
          };
          if (typeof renderPrivilegedAccessView === 'function') return renderPrivilegedAccessView();
        }, { viewer, owner });
        await page.waitForTimeout(150);
        const ro = await page.evaluate((ownerU) => {
          const row = document.querySelector('#ac-privileged-received-list .ac-priv-received-row[data-username="' + ownerU + '"]');
          const grantsEl = row && row.querySelector('.ac-priv-received-grants');
          return grantsEl ? (grantsEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
        }, owner.username);
        a.equal(ro, 'Read only', 'no grants shows Read only: ' + ro);
        await page.evaluate(() => { try { closeAccountCenterModal(); } catch (e) {} delete window.__pixlyPrivTargetDoc; });
      }
    }
  ]
};
