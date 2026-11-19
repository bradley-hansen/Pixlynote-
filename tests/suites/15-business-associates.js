'use strict';

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Business associates',
  tests: [
    {
      name: 'Only a business can send an association invite, and it cannot invite itself',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-ac-tab-associate', 'el:#ac-view-associate', 'el:#ac-associate-username-input', 'el:#btn-ac-invite-associate', 'el:#btn-ac-leave-associated-business'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(() => {
          const me = (state.currentUser && state.currentUser.username) || '';
          const isBiz = typeof isBusinessAccount === 'function' && isBusinessAccount(state.currentUser);
          const toasts = [];
          const prevToast = window.showToast;
          window.showToast = (msg) => { toasts.push(String(msg || '')); };
          if (typeof inviteBusinessAssociate === 'function') {
            inviteBusinessAssociate(me);
            inviteBusinessAssociate('invitee_reg_user');
          }
          window.showToast = prevToast;
          if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
          if (typeof setAccountCenterView === 'function') setAccountCenterView('associate');
          const title = (document.getElementById('ac-tab-associate-title') || {}).textContent || (document.getElementById('ac-header-title') || {}).textContent || '';
          const panel = document.getElementById('ac-associate-business-panel');
          const panelText = (panel && panel.innerText) || '';
          const inviteBtn = document.getElementById('btn-ac-invite-associate');
          const list = typeof getBusinessAssociatesList === 'function' ? getBusinessAssociatesList(me) : [];
          const invited = list.some((g) => g && g.username === 'invitee_reg_user' && g.status === 'pending');
          const selfInvited = list.some((g) => g && g.username === me);
          return { isBiz, toasts, title, panelText, hasInviteBtn: !!inviteBtn, invited, selfInvited, panelHidden: !panel || panel.classList.contains('hidden') };
        });
        if (r.isBiz) {
          a.ok(/Associate an account/i.test(r.title + r.panelText), 'Business Account Center item is labeled Associate an account');
          a.ok(/personal or business/i.test(r.panelText), 'Invite copy allows a personal or business invitee');
          a.ok(!r.panelHidden && r.hasInviteBtn, 'A business sees the invite form');
          a.ok(r.selfInvited === false, 'A business cannot associate with itself');
          a.ok(r.toasts.some((t) => /itself/i.test(t)), 'Self-invite is blocked with a clear message');
          a.ok(r.invited, 'A business can send an invite to another account');
        } else {
          a.ok(!r.invited && !r.selfInvited, 'A personal account cannot send association invites');
          a.ok(r.toasts.some((t) => /only a business/i.test(t)), 'Personal send is blocked with a clear message');
        }
      }
    },
    {
      name: 'A personal invitee already tied to a business must leave before accepting a new invite',
      accounts: ['personal', 'empty'],
      covers: ['el:#assoc-invite-leave-first-msg', 'el:#btn-leave-associated-business'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          const me = (state.currentUser && state.currentUser.username) || 'me';
          if (typeof saveAssociatedBusiness === 'function') {
            saveAssociatedBusiness(me, { username: 'first_biz', avatar: 'https://example.com/first.png', acceptedAt: Date.now() });
          } else {
            state.currentUser.associatedBusiness = { username: 'first_biz', avatar: 'https://example.com/first.png', acceptedAt: Date.now() };
          }
          state.notifications = [{
            id: 90001,
            type: 'business_associate_invite',
            status: 'pending',
            fromUser: 'second_biz',
            fromAvatar: 'https://example.com/second.png',
            fromFullName: 'Second Biz',
            text: 'invited you to associate with their business.',
            time: 'Just now',
            timestamp: Date.now(),
            read: false
          }];
          if (typeof renderNotifications === 'function') renderNotifications(true);
          const msg = (document.getElementById('assoc-invite-leave-first-msg') || {}).textContent || '';
          const leaveBtn = document.getElementById('btn-leave-associated-business') || document.querySelector('.notif-assoc-leave');
          const blockedAccept = document.querySelector('.notif-assoc-accept');
          if (typeof respondToBusinessAssociateInvite === 'function') {
            await respondToBusinessAssociateInvite(0, true);
          }
          const stillFirst = (typeof getAssociatedBusiness === 'function' ? getAssociatedBusiness(me) : state.currentUser.associatedBusiness) || {};
          const blockedUsername = stillFirst.username;
          if (typeof leaveAssociatedBusiness === 'function') await leaveAssociatedBusiness();
          const afterLeave = typeof getAssociatedBusiness === 'function' ? getAssociatedBusiness(me) : state.currentUser.associatedBusiness;
          if (typeof renderNotifications === 'function') renderNotifications(true);
          const acceptAfter = document.querySelector('.notif-assoc-accept');
          if (typeof respondToBusinessAssociateInvite === 'function') {
            await respondToBusinessAssociateInvite(0, true);
          }
          const afterAccept = (typeof getAssociatedBusiness === 'function' ? getAssociatedBusiness(me) : state.currentUser.associatedBusiness) || {};
          const badge = (typeof creatorStatusBadgesHtml === 'function')
            ? creatorStatusBadgesHtml(Object.assign({}, state.currentUser, { associatedBusiness: afterAccept }))
            : '';
          return {
            msg,
            hasLeave: !!leaveBtn,
            hasAcceptWhileBlocked: !!blockedAccept,
            blockedUsername,
            afterLeave: afterLeave && afterLeave.username,
            hasAcceptAfterLeave: !!acceptAfter,
            accepted: afterAccept.username,
            badgeHasAvatar: /associated-business-avatar/.test(badge) && /second_biz/.test(badge)
          };
        });
        a.ok(/already associated with @first_biz/i.test(r.msg) && /leave that business first/i.test(r.msg), 'Blocked accept shows a leave-first message: ' + r.msg);
        a.ok(r.hasLeave, 'A Leave business action is shown on the blocked invite');
        a.ok(!r.hasAcceptWhileBlocked, 'Accept is not offered until the current business is left');
        a.ok(r.blockedUsername === 'first_biz', 'Accept does not switch the association while still tied to another business');
        a.ok(!r.afterLeave, 'Leave business clears the current association');
        a.ok(r.hasAcceptAfterLeave, 'Accept is available after leaving');
        a.ok(r.accepted === 'second_biz', 'After leaving, the new invite can be accepted');
        a.ok(r.badgeHasAvatar, 'The inviting business avatar renders next to the invitee name/check');
      }
    },
    {
      name: 'A business invitee already tied to a business must leave before accepting a new invite',
      accounts: ['business', 'pixlynote'],
      covers: ['el:#btn-ac-leave-associated-business'],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          const me = (state.currentUser && state.currentUser.username) || 'me';
          const isBiz = typeof isBusinessAccount === 'function' && isBusinessAccount(state.currentUser);
          if (typeof saveAssociatedBusiness === 'function') {
            saveAssociatedBusiness(me, { username: 'alpha_biz', avatar: 'https://example.com/alpha.png', acceptedAt: Date.now() });
          } else {
            state.currentUser.associatedBusiness = { username: 'alpha_biz', avatar: 'https://example.com/alpha.png', acceptedAt: Date.now() };
          }
          state.notifications = [{
            id: 90002,
            type: 'business_associate_invite',
            status: 'pending',
            fromUser: 'beta_biz',
            fromAvatar: 'https://example.com/beta.png',
            fromFullName: 'Beta Biz',
            text: 'invited you to associate with their business.',
            time: 'Just now',
            timestamp: Date.now(),
            read: false
          }];
          if (typeof renderNotifications === 'function') renderNotifications(true);
          const msg = (document.getElementById('assoc-invite-leave-first-msg') || {}).textContent || '';
          const leaveBtn = document.getElementById('btn-leave-associated-business') || document.querySelector('.notif-assoc-leave');
          if (typeof respondToBusinessAssociateInvite === 'function') {
            await respondToBusinessAssociateInvite(0, true);
          }
          const still = (typeof getAssociatedBusiness === 'function' ? getAssociatedBusiness(me) : state.currentUser.associatedBusiness) || {};
          if (typeof openAccountCenterModal === 'function') openAccountCenterModal();
          if (typeof setAccountCenterView === 'function') setAccountCenterView('associate');
          const acLeave = document.getElementById('btn-ac-leave-associated-business');
          const acStatus = (document.getElementById('ac-associate-personal-status') || {}).textContent || '';
          const acLeaveHidden = !acLeave || acLeave.classList.contains('hidden');
          if (typeof leaveAssociatedBusiness === 'function') await leaveAssociatedBusiness();
          if (typeof renderNotifications === 'function') renderNotifications(true);
          if (typeof respondToBusinessAssociateInvite === 'function') {
            await respondToBusinessAssociateInvite(0, true);
          }
          const after = (typeof getAssociatedBusiness === 'function' ? getAssociatedBusiness(me) : state.currentUser.associatedBusiness) || {};
          const badge = (typeof creatorStatusBadgesHtml === 'function')
            ? creatorStatusBadgesHtml(Object.assign({}, state.currentUser, { associatedBusiness: after, isPlus: false, isVerified: false, isBusinessPlus: false }))
            : '';
          const canSelf = (typeof inviteBusinessAssociate === 'function');
          const toasts = [];
          const prevToast = window.showToast;
          window.showToast = (msg) => { toasts.push(String(msg || '')); };
          if (canSelf) inviteBusinessAssociate(me);
          window.showToast = prevToast;
          return {
            isBiz,
            msg,
            hasLeave: !!leaveBtn,
            still: still.username,
            acStatus,
            acLeaveShown: !acLeaveHidden,
            accepted: after.username,
            badgeHasAvatar: /associated-business-avatar/.test(badge) && /beta_biz/.test(badge),
            selfToast: toasts.some((t) => /itself/i.test(t))
          };
        });
        a.ok(r.isBiz, 'This case runs as a business invitee');
        a.ok(/already associated with @alpha_biz/i.test(r.msg) && /leave that business first/i.test(r.msg), 'Business invitee sees the leave-first message: ' + r.msg);
        a.ok(r.hasLeave, 'Business invitee gets a Leave business action');
        a.ok(r.still === 'alpha_biz', 'Accept is blocked while the business is still tied to another business');
        a.ok(/alpha_biz/.test(r.acStatus) && r.acLeaveShown, 'Account Center shows the current association and Leave for a business invitee');
        a.ok(r.accepted === 'beta_biz', 'After leaving, the business invitee can accept the new invite');
        a.ok(r.badgeHasAvatar, 'The inviting business avatar shows next to a business invitee name/check, even without Plus');
        a.ok(r.selfToast, 'A business still cannot associate with itself');
      }
    }
  ]
};
