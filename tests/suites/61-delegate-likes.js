'use strict';

/**
 * Delegate likes (to-do #3, 2026-11-27):
 *  1. Profile Likes (Liked Photos and Liked Notes) show the newest likes first,
 *     ordered by the like's time (not the post's), including after a Firestore
 *     arrayUnion snapshot (oldest-first).
 *  2. A Liked Photos grid tile for a delegate like shows the "by @handle"
 *     badge with the delegate's avatar.
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
    const badge = firstTile && firstTile.querySelector('.liked-grid-delegate .pixly-delegate-badge, .pixly-delegate-badge');
    return {
      postIds,
      noteIds,
      firstPostId: postIds[0] || '',
      firstNoteId: noteIds[0] || '',
      firstDelegate: firstTile ? (firstTile.getAttribute('data-liked-by-delegate') || '') : '',
      firstBadgeText: badge ? (badge.textContent || '').replace(/\s+/g, ' ').trim() : '',
      firstBadgeHasImg: !!(badge && badge.querySelector('img')),
      tilesWithBadge: grid ? Array.from(grid.querySelectorAll('[data-liked-by-delegate]')).map((el) => ({
        id: el.getAttribute('data-post-id'),
        by: el.getAttribute('data-liked-by-delegate'),
        text: ((el.querySelector('.pixly-delegate-badge') || {}).textContent || '').replace(/\s+/g, ' ').trim()
      })) : []
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
      name: 'Delegate likes: Liked Photos grid tile shows the by @handle badge with avatar, and the new like is first',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#likes-grid',
        'handler:privilegedDelegateBadgeHtml',
        'handler:likedDelegateUsername',
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
          savePrivilegedAccountsList(viewer.username, [{ username: owner.username, status: 'accepted' }]);
          const acc = { username: owner.username, fullName: owner.fullName, email: '', phone: '', accountType: owner.accountType || 'personal' };
          performLogin(acc.username, acc.fullName, '', null, '', acc.accountType, acc, { privilegedReadOnly: true, viewer: viewer.username, grants: ['like'] });
          togglePostLike(newerId);
        }, { owner: account, viewer, newerId });
        await openLikesTab(page, h, 'photos');
        const order = await collectLikeOrder(page);
        a.ok(order.postIds.indexOf(newerId) !== -1 && order.postIds.indexOf(olderId) !== -1, 'both likes appear: ' + JSON.stringify(order.postIds));
        a.ok(order.postIds.indexOf(newerId) < order.postIds.indexOf(olderId), 'delegate like is first (newest): ' + JSON.stringify(order.postIds));
        const tile = order.tilesWithBadge.find((t) => t.id === newerId);
        a.ok(tile, 'newest grid tile is marked as a delegate like: ' + JSON.stringify(order.tilesWithBadge));
        a.equal(tile && tile.by, viewer.username, 'badge names the delegate @' + viewer.username + ': ' + JSON.stringify(tile));
        a.ok(tile && tile.text.indexOf('by @' + viewer.username) !== -1, 'grid badge text is by @' + viewer.username + ': ' + JSON.stringify(tile));
        const badgeImg = await page.evaluate((id) => {
          const el = document.querySelector('.liked-grid-item[data-post-id="' + id + '"] .pixly-delegate-badge img, [data-post-id="' + id + '"] .liked-grid-delegate img');
          return !!(el && el.getAttribute('src'));
        }, newerId);
        a.ok(badgeImg, 'delegate badge includes the delegate avatar');
        const olderHasBadge = order.tilesWithBadge.some((t) => t.id === olderId);
        a.ok(!olderHasBadge, 'the earlier owner like has no delegate badge: ' + JSON.stringify(order.tilesWithBadge));
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
