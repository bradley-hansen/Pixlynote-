'use strict';

const { VERIFY_CODE, ALL_ACCOUNT_KEYS } = require('../helpers/harness');

module.exports = {
  name: 'Edit Profile',
  tests: [
    {
      name: 'Edit Profile: Send code appears on a changed email row',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-edit-profile-modal', 'el:#edit-profile-email', 'el:#btn-edit-send-email-code', 'el:#edit-profile-email-verify-panel', 'el:#edit-profile-email-code', 'el:#btn-edit-verify-email-code', 'el:#btn-edit-resend-email-code', 'handler:openEditProfileModal', 'handler:sendEditEmailCode'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const open = await h.isVisible(page, '#modal-edit-profile');
        a.ok(open, 'Edit Profile modal opens for @' + account.username);
        await page.fill('#edit-profile-email', 'new.' + account.username + '@example.test');
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(120);
        const send = await page.evaluate(() => {
          const b = document.getElementById('btn-edit-send-email-code');
          if (!b) return { exists: false };
          const cs = getComputedStyle(b);
          return { exists: true, hidden: b.classList.contains('hidden') || cs.display === 'none', disabled: !!b.disabled, text: (b.textContent || '').trim() };
        });
        a.ok(send.exists && !send.hidden, 'Send code shows on the changed email row: ' + JSON.stringify(send));
        a.ok(!send.disabled, 'Send code is enabled for a free new email');
      }
    },
    {
      name: 'Edit Profile: Send code appears on a changed phone row',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-phone', 'el:#btn-edit-send-phone-code', 'el:#edit-profile-phone-verify-panel', 'el:#edit-profile-phone-code', 'el:#btn-edit-verify-phone-code', 'el:#btn-edit-resend-phone-code', 'handler:sendEditPhoneCode'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.openEditProfile(page);
        await page.fill('#edit-profile-phone', '2025550199');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(120);
        const send = await page.evaluate(() => {
          const b = document.getElementById('btn-edit-send-phone-code');
          if (!b) return { exists: false };
          const cs = getComputedStyle(b);
          return { exists: true, hidden: b.classList.contains('hidden') || cs.display === 'none', disabled: !!b.disabled };
        });
        a.ok(send.exists && !send.hidden && !send.disabled, 'Send code shows on the changed phone row: ' + JSON.stringify(send));
      }
    },
    {
      name: 'Edit Profile: a taken email or phone blocks Send code',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-email-error', 'el:#edit-profile-phone-error'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        // Taken email (built-in), unless this account is bradley which we are not.
        await page.fill('#edit-profile-email', 'bradley.g.hansen@hotmail.com');
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(150);
        const emailState = await page.evaluate(() => {
          const b = document.getElementById('btn-edit-send-email-code');
          const err = (document.getElementById('edit-profile-email-error') || {}).textContent || '';
          return { disabled: !!(b && (b.disabled || b.classList.contains('cursor-not-allowed'))), err, hidden: !b || b.classList.contains('hidden') };
        });
        a.ok(/already used by another account/i.test(emailState.err) && /use your phone instead/i.test(emailState.err), 'Taken email shows the email conflict message: ' + JSON.stringify(emailState));
        a.ok(emailState.disabled || /already used by another account/i.test(emailState.err), 'Taken email blocks Send code: ' + JSON.stringify(emailState));

        await page.fill('#edit-profile-phone', '6092896702');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(150);
        const phoneState = await page.evaluate(() => {
          const b = document.getElementById('btn-edit-send-phone-code');
          const err = (document.getElementById('edit-profile-phone-error') || {}).textContent || '';
          return { disabled: !!(b && (b.disabled || b.classList.contains('cursor-not-allowed'))), err };
        });
        a.ok(/already used by another account/i.test(phoneState.err) && /use your email instead/i.test(phoneState.err), 'Taken phone shows the phone conflict message: ' + JSON.stringify(phoneState));
        a.ok(phoneState.disabled || /already used by another account/i.test(phoneState.err), 'Taken phone blocks Send code: ' + JSON.stringify(phoneState));
      }
    },
    {
      name: 'Edit Profile: username shows taken or available and Save stays off when taken',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-username', 'el:#edit-profile-username-status', 'el:#btn-save-edit-profile', 'listener:#edit-profile-username:input'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        // Taken username (not self)
        const takenName = account.username === 'pixlynote' ? 'bradley_hansen' : 'pixlynote';
        await page.fill('#edit-profile-username', takenName);
        await page.evaluate(() => {
          document.getElementById('edit-profile-username')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        const taken = await page.evaluate(() => {
          const st = (document.getElementById('edit-profile-username-status') || document.getElementById('edit-profile-username-error') || {}).textContent || '';
          const btn = document.getElementById('btn-save-edit-profile');
          const can = (typeof editProfileCanSave === 'function') ? editProfileCanSave() : null;
          return { st, disabled: !!(btn && btn.disabled), can };
        });
        a.ok(/taken/i.test(taken.st), 'Shows "Username taken": ' + JSON.stringify(taken));
        a.ok(taken.disabled || taken.can === false, 'Save is disabled while the username is taken');

        await page.fill('#edit-profile-username', 'free_name_' + account.username);
        await page.evaluate(() => {
          document.getElementById('edit-profile-username')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        const free = await page.evaluate(() => (document.getElementById('edit-profile-username-status') || {}).textContent || '');
        a.ok(/available/i.test(free), 'Shows "Username available" for a free name: ' + free);
      }
    },
    {
      name: 'Edit Profile: name, bio and website can be saved without a code when contact fields are unchanged',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-form', 'el:#edit-profile-name', 'el:#edit-profile-bio', 'el:#edit-profile-website', 'el:#edit-profile-link', 'el:#btn-save-edit-profile', 'el:#edit-profile-email-verified-badge'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const nameSel = await page.evaluate(() => {
          const ids = ['edit-profile-name', 'edit-profile-fullname', 'edit-full-name', 'edit-profile-full-name'];
          return ids.find((id) => document.getElementById(id)) || (document.querySelector('#modal-edit-profile input[name="fullName"], #modal-edit-profile input[name="name"]') || {}).id || '';
        });
        const bioId = await page.evaluate(() => (document.getElementById('edit-profile-bio') || document.querySelector('#modal-edit-profile textarea')) ? (document.getElementById('edit-profile-bio') || document.querySelector('#modal-edit-profile textarea')).id : '');
        const linkId = await page.evaluate(() => {
          const ids = ['edit-profile-website', 'edit-profile-link', 'edit-profile-url'];
          return ids.find((id) => document.getElementById(id)) || '';
        });
        const newName = account.fullName + ' Edited';
        const newBio = 'Updated bio without a code';
        const newLink = 'https://example.test/updated';
        if (nameSel) await page.fill('#' + nameSel, newName);
        if (bioId) await page.fill('#' + bioId, newBio);
        if (linkId) await page.fill('#' + linkId, newLink);
        const can = await page.evaluate(() => (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !document.getElementById('btn-save-edit-profile')?.disabled);
        a.ok(can, 'Save is enabled when only name/bio/website changed');
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const isOfficial = String(account.username || '').toLowerCase() === 'pixlynote';
        const saved = await page.evaluate(() => ({
          name: state.currentUser && state.currentUser.fullName,
          bio: state.currentUser && state.currentUser.bio,
          link: state.currentUser && (state.currentUser.link || state.currentUser.website)
        }));
        // renderProfile() keeps the official @pixlynote display name, but bio and website must persist like every other account.
        if (isOfficial) {
          a.equal(saved.name, 'Pixlynote', 'Official account display name stays Pixlynote after save');
        } else {
          a.equal(saved.name, newName, 'Name was saved on the current user');
        }
        a.equal(saved.bio, newBio, 'Bio was saved on the current user');
        a.ok((saved.link || '').includes('example.test/updated'), 'Website was saved on the current user: ' + saved.link);
        // Re-open the modal and confirm the fields show the saved (or officially locked) values.
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          const m = document.getElementById('modal-edit-profile');
          if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
        });
        await h.openEditProfile(page);
        const fields = await page.evaluate(({ nameSel, bioId, linkId }) => ({
          name: nameSel ? ((document.getElementById(nameSel) || {}).value || '') : '',
          bio: bioId ? ((document.getElementById(bioId) || {}).value || '') : '',
          link: linkId ? ((document.getElementById(linkId) || {}).value || '') : ''
        }), { nameSel, bioId, linkId });
        if (isOfficial) {
          if (nameSel) a.equal(fields.name, 'Pixlynote', 'Reopened official modal keeps the locked display name');
        } else {
          if (nameSel) a.equal(fields.name, newName, 'Reopened modal shows the saved name');
        }
        if (bioId) a.equal(fields.bio, newBio, 'Reopened modal shows the saved bio');
        if (linkId) a.ok((fields.link || '').includes('example.test/updated'), 'Reopened modal shows the saved website');
      }
    },
    {
      name: 'Edit Profile: switching category starts the other type\'s name empty and requires a name to save',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#btn-edit-account-personal', 'el:#btn-edit-account-business', 'el:#lbl-edit-profile-name', 'el:#edit-profile-name', 'el:#btn-save-edit-profile'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const start = await page.evaluate(() => {
          const nameInp = document.getElementById('edit-profile-name');
          const save = document.getElementById('btn-save-edit-profile');
          const lbl = document.getElementById('lbl-edit-profile-name');
          return {
            type: window._editingAccountType || (state.currentUser && state.currentUser.accountType) || 'personal',
            name: nameInp ? nameInp.value : '',
            placeholder: nameInp ? (nameInp.placeholder || '') : '',
            label: lbl ? (lbl.textContent || '').trim() : '',
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled)
          };
        });
        const isBiz = start.type === 'business';
        const savedName = start.name;
        a.ok(savedName, 'Current category opens with the saved name: ' + savedName);
        a.ok(start.canSave && !start.saveDisabled, 'Save is enabled when the saved name for this category is present');
        a.equal(start.label, isBiz ? 'Display Name' : 'Full Name', 'Label matches the current category');

        const otherBtn = isBiz ? '#btn-edit-account-personal' : '#btn-edit-account-business';
        const backBtn = isBiz ? '#btn-edit-account-business' : '#btn-edit-account-personal';
        await page.click(otherBtn);
        await page.waitForTimeout(80);
        const switched = await page.evaluate(() => {
          const nameInp = document.getElementById('edit-profile-name');
          const save = document.getElementById('btn-save-edit-profile');
          const lbl = document.getElementById('lbl-edit-profile-name');
          const extras = ['edit-profile-category', 'edit-profile-business-category', 'edit-profile-business-contact', 'edit-profile-contact', 'edit-profile-address', 'edit-profile-business-address']
            .map((id) => {
              const el = document.getElementById(id);
              return el ? { id, value: el.value || '' } : null;
            })
            .filter(Boolean);
          return {
            type: window._editingAccountType,
            name: nameInp ? nameInp.value : 'MISSING',
            placeholder: nameInp ? (nameInp.placeholder || '') : '',
            label: lbl ? (lbl.textContent || '').trim() : '',
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled),
            extras
          };
        });
        a.equal(switched.type, isBiz ? 'personal' : 'business', 'Switcher selected the other category');
        a.equal(switched.name, '', 'The other category\'s name is not copied from the current name (got "' + switched.name + '")');
        a.ok((switched.placeholder || '').trim(), 'Empty name field shows a placeholder: ' + switched.placeholder);
        a.equal(switched.label, isBiz ? 'Full Name' : 'Display Name', 'Label updates for the other category');
        a.ok(!switched.canSave && switched.saveDisabled, 'Save is disabled until the new category name is filled');
        switched.extras.forEach((f) => {
          a.equal(f.value, '', 'Type-only field #' + f.id + ' starts empty');
        });

        await page.click(backBtn);
        await page.waitForTimeout(80);
        const restored = await page.evaluate(() => {
          const nameInp = document.getElementById('edit-profile-name');
          const save = document.getElementById('btn-save-edit-profile');
          const lbl = document.getElementById('lbl-edit-profile-name');
          return {
            type: window._editingAccountType,
            name: nameInp ? nameInp.value : '',
            label: lbl ? (lbl.textContent || '').trim() : '',
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled)
          };
        });
        a.equal(restored.type, start.type, 'Switcher returns to the original category');
        a.equal(restored.name, savedName, 'Saved name for the original category is restored unchanged');
        a.equal(restored.label, start.label, 'Original label is restored');
        a.ok(restored.canSave && !restored.saveDisabled, 'Save is enabled again after the saved name is restored');

        await page.click(otherBtn);
        await page.waitForTimeout(50);
        const typedName = isBiz ? 'Pat Person' : 'Acme Test Co';
        await page.fill('#edit-profile-name', typedName);
        await page.evaluate(() => {
          document.getElementById('edit-profile-name')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const afterType = await page.evaluate(() => {
          const save = document.getElementById('btn-save-edit-profile');
          return {
            canSave: (typeof editProfileCanSave === 'function') ? editProfileCanSave() : !save?.disabled,
            saveDisabled: !!(save && save.disabled),
            name: (document.getElementById('edit-profile-name') || {}).value || ''
          };
        });
        a.equal(afterType.name, typedName, 'Typed name is accepted');
        a.ok(afterType.canSave && !afterType.saveDisabled, 'Save enables once the new category name is filled');

        await page.click(backBtn);
        await page.waitForTimeout(80);
        const backAgain = await page.evaluate(() => (document.getElementById('edit-profile-name') || {}).value || '');
        a.equal(backAgain, savedName, 'Switching back still keeps the original saved name unchanged');
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    }    ,
    {
      name: 'Edit Profile: a conflicting phone or email keeps other typed fields and uses a clear message',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#edit-profile-email',
        'el:#edit-profile-phone',
        'el:#edit-profile-bio',
        'el:#edit-profile-link',
        'el:#edit-profile-email-error',
        'el:#edit-profile-phone-error',
        'el:#btn-save-edit-profile',
        'handler:editProfilePhoneConflictMessage',
        'handler:editProfileEmailConflictMessage'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const originalEmail = await page.evaluate(() => ((document.getElementById('edit-profile-email') || {}).value || ''));
        const typedBio = 'Keep this bio after a phone conflict';
        const typedLink = 'https://example.test/keep-after-conflict';
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-link', typedLink);
        await page.fill('#edit-profile-phone', '6092896702');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(150);
        const afterPhone = await page.evaluate(() => {
          const toast = (document.getElementById('toast-text') || {}).textContent || '';
          const err = (document.getElementById('edit-profile-phone-error') || {}).textContent || '';
          return {
            toast,
            err,
            email: ((document.getElementById('edit-profile-email') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            link: ((document.getElementById('edit-profile-link') || {}).value || ''),
            phone: ((document.getElementById('edit-profile-phone') || {}).value || '')
          };
        });
        a.ok(/This number is already used by another account\. Remove it and use your email instead\./.test(afterPhone.err + ' ' + afterPhone.toast), 'Phone conflict uses the clear Remove it and use your email message');
        a.equal(afterPhone.email, originalEmail, 'A phone conflict does not clear the email the user already had');
        a.equal(afterPhone.bio, typedBio, 'A phone conflict does not wipe a typed bio');
        a.ok((afterPhone.link || '').includes('example.test/keep-after-conflict'), 'A phone conflict does not wipe a typed website');
        a.ok(/609/.test(afterPhone.phone.replace(/\D/g, '')) || afterPhone.phone.length > 0, 'The conflicting phone stays in the field so the user can delete it');

        await page.fill('#edit-profile-email', 'bradley.g.hansen@hotmail.com');
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(150);
        const afterEmail = await page.evaluate(() => {
          const toast = (document.getElementById('toast-text') || {}).textContent || '';
          const err = (document.getElementById('edit-profile-email-error') || {}).textContent || '';
          return {
            toast,
            err,
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            link: ((document.getElementById('edit-profile-link') || {}).value || '')
          };
        });
        a.ok(/This email is already used by another account\. Remove it and use your phone instead\./.test(afterEmail.err + ' ' + afterEmail.toast), 'Email conflict uses the matching Remove it and use your phone message');
        a.equal(afterEmail.bio, typedBio, 'An email conflict does not wipe a typed bio');
        a.ok((afterEmail.link || '').includes('example.test/keep-after-conflict'), 'An email conflict does not wipe a typed website');
      }
    },
    {
      name: 'Edit Profile: removing a phone saves and stays gone when an email remains',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-phone', 'el:#edit-profile-email', 'el:#btn-save-edit-profile', 'handler:openEditProfileModal'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const before = await page.evaluate(() => ({
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || '')
        }));
        a.ok(before.email, 'The account already has an email so the phone can be removed');
        await page.fill('#edit-profile-phone', '');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        const afterSave = await page.evaluate(() => ({
          phone: state.currentUser && (state.currentUser.phone || ''),
          email: state.currentUser && (state.currentUser.email || '')
        }));
        a.equal(afterSave.phone, '', 'The saved profile does not keep the removed phone');
        a.equal(afterSave.email, before.email, 'The existing email is still on the profile after the phone is removed');
        if (typeof afterSave.email === 'string' && afterSave.email) {
          // already asserted
        }
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          if (typeof renderProfile === 'function') renderProfile();
        });
        await h.openEditProfile(page);
        const reopened = await page.evaluate(() => ({
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          statePhone: state.currentUser && (state.currentUser.phone || '')
        }));
        a.equal(reopened.phone, '', 'Reopening Edit Profile does not bring the removed phone back');
        a.equal(reopened.statePhone, '', 'renderProfile does not restore a deleted phone');
        a.equal(reopened.email, before.email, 'The email is still in the form after reopen');
      }
    },
    {
      name: 'Edit Profile: a changed email requires a code, then saves after the code is accepted',
      accounts: ALL_ACCOUNT_KEYS,
      covers: [
        'el:#edit-profile-email',
        'el:#btn-edit-send-email-code',
        'el:#edit-profile-email-code',
        'el:#btn-edit-verify-email-code',
        'el:#btn-save-edit-profile',
        'handler:sendEditEmailCode',
        'handler:verifyEditEmailCode'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const newEmail = 'verify.' + account.username + '@example.test';
        const typedBio = 'Bio typed with a new email';
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-email', newEmail);
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        await page.waitForTimeout(80);
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(150);
        const blocked = await page.evaluate(() => {
          const toast = (document.getElementById('toast-text') || {}).textContent || '';
          const send = document.getElementById('btn-edit-send-email-code');
          const cs = send ? getComputedStyle(send) : null;
          return {
            toast,
            sendVisible: !!(send && !send.classList.contains('hidden') && cs && cs.display !== 'none'),
            email: ((document.getElementById('edit-profile-email') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            savedEmail: state.currentUser && (state.currentUser.email || '')
          };
        });
        a.ok(/Send code|Verify the new email/i.test(blocked.toast), 'Saving a changed email without a code asks the user to verify it: ' + blocked.toast);
        a.ok(blocked.sendVisible, 'Send code stays visible so the user can verify the new email');
        a.equal(blocked.email, newEmail, 'The typed email is still in the field after a blocked save');
        a.equal(blocked.bio, typedBio, 'The typed bio is still in the field after a blocked email save');
        a.ok(blocked.savedEmail !== newEmail, 'The new email is not saved until the code is accepted');

        await page.click('#btn-edit-send-email-code');
        await page.waitForTimeout(200);
        const codeVisible = await page.evaluate(() => {
          const wrap = document.getElementById('edit-profile-email-code-wrap');
          return !!(wrap && !wrap.classList.contains('hidden'));
        });
        a.ok(codeVisible, 'The email code field appears after Send code');
        await page.fill('#edit-profile-email-code', VERIFY_CODE);
        await page.click('#btn-edit-verify-email-code');
        await page.waitForTimeout(200);
        const verified = await page.evaluate(() => {
          const status = (document.getElementById('edit-profile-email-verify-status') || {}).textContent || '';
          const can = (typeof editProfileCanSave === 'function') ? editProfileCanSave() : false;
          return { status, can };
        });
        a.ok(/Email verified/i.test(verified.status), 'The form confirms the email code was accepted: ' + verified.status);
        a.ok(verified.can, 'Save is enabled after the email code is accepted');
        await page.evaluate(() => {
          const form = document.getElementById('edit-profile-form');
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else document.getElementById('btn-save-edit-profile')?.click();
        });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          if (typeof renderProfile === 'function') renderProfile();
        });
        await h.openEditProfile(page);
        const saved = await page.evaluate(() => ({
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          stateEmail: state.currentUser && (state.currentUser.email || ''),
          stateBio: state.currentUser && (state.currentUser.bio || '')
        }));
        a.equal(saved.email, newEmail, 'The verified email is in the form after reopen');
        a.equal(saved.stateEmail, newEmail, 'The verified email stayed on the profile after render');
        a.equal(saved.bio, typedBio, 'The bio typed with the email change is still in the form');
        a.equal(saved.stateBio, typedBio, 'The bio typed with the email change stayed on the profile');
      }
    }

  ]
};
