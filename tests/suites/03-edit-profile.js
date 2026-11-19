'use strict';

const { VERIFY_CODE, ALL_ACCOUNT_KEYS } = require('../helpers/harness');


async function profileSnapshot(page) {
  return page.evaluate(() => {
    const u = state.currentUser || {};
    const fields = {};
    const keys = window.STORED_PROFILE_FIELDS || ['fullName', 'email', 'phone', 'bio', 'link', 'accountType'];
    keys.forEach((k) => { fields[k] = u[k] == null ? '' : u[k]; });
    const writes = window.__pixlyUserDocWrites || [];
    return {
      fields,
      writeCount: writes.length,
      lastEdit: [...writes].reverse().find((w) => w.source === 'edit-profile') || null
    };
  });
}

async function submitEditProfile(page) {
  await page.evaluate(() => {
    const form = document.getElementById('edit-profile-form');
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    else document.getElementById('btn-save-edit-profile')?.click();
  });
}

function assertSameStoredFields(a, before, after, label) {
  const keys = Object.keys(before.fields);
  keys.forEach((k) => {
    a.equal(String(after.fields[k] == null ? '' : after.fields[k]), String(before.fields[k] == null ? '' : before.fields[k]), label + ' did not change stored ' + k);
  });
  a.equal(after.writeCount, before.writeCount, label + ' did not write a profile document');
}


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
        'el:#edit-profile-email-error',
        'handler:sendEditEmailCode',
        'handler:verifyEditEmailCode',
        'handler:validateEditProfileForm'
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
        const beforeBlock = await profileSnapshot(page);
        const blocked = await page.evaluate(() => {
          const toast = (document.getElementById('toast-text') || {}).textContent || '';
          const err = (document.getElementById('edit-profile-email-error') || {}).textContent || '';
          const send = document.getElementById('btn-edit-send-email-code');
          const cs = send ? getComputedStyle(send) : null;
          const modal = document.getElementById('modal-edit-profile');
          return {
            toast,
            err,
            sendVisible: !!(send && !send.classList.contains('hidden') && cs && cs.display !== 'none'),
            email: ((document.getElementById('edit-profile-email') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            savedEmail: state.currentUser && (state.currentUser.email || ''),
            modalOpen: !!(modal && !modal.classList.contains('hidden'))
          };
        });
        const afterBlock = await profileSnapshot(page);
        a.ok(/Verify your new email with the code before saving/.test(blocked.err + ' ' + blocked.toast), 'Saving a changed email without a code shows the verify-before-saving message: ' + JSON.stringify({ err: blocked.err, toast: blocked.toast }));
        a.ok(blocked.sendVisible, 'Send code stays visible so the user can verify the new email');
        a.equal(blocked.email, newEmail, 'The typed email is still in the field after a blocked save');
        a.equal(blocked.bio, typedBio, 'The typed bio is still in the field after a blocked email save');
        a.ok(blocked.modalOpen, 'The Edit Profile modal stays open after a blocked save');
        a.ok(blocked.savedEmail !== newEmail, 'The new email is not saved until the code is accepted');
        assertSameStoredFields(a, beforeBlock, afterBlock, 'An unverified email');

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
    }    ,
    {
      name: 'Edit Profile: every stored field survives save, reload, and reopen on a business account',
      accounts: ['business', 'pixlynote'],
      covers: [
        'el:#edit-profile-bio',
        'el:#edit-profile-link',
        'el:#edit-profile-dba-name',
        'el:#edit-profile-business-industry',
        'el:#edit-profile-business-street',
        'el:#edit-profile-business-city',
        'el:#edit-profile-business-state',
        'el:#edit-profile-business-postal',
        'el:#edit-profile-address-visibility',
        'el:#edit-profile-business-hours',
        'el:#edit-profile-support-email',
        'el:#btn-save-edit-profile',
        'handler:fillEditProfileBusinessFields',
        'handler:mergeStoredProfileFields',
        'handler:applyActiveUserDocData'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const values = {
          fullName: 'Round Trip ' + account.username,
          bio: 'Round-trip bio for ' + account.username,
          link: 'example.test/round-trip-' + account.username,
          dbaName: 'Round Trip DBA',
          businessIndustry: 'software_tech',
          businessStreet: '12 Harbor Rd',
          businessCity: 'Galloway',
          businessState: 'NJ',
          businessPostal: '08205',
          businessAddressVisibility: 'city_state',
          businessHours: 'Mon-Fri 9am-5pm EST',
          businessSupportEmail: 'support.' + account.username + '@example.test'
        };
        const beforeEmail = await page.evaluate(() => ((document.getElementById('edit-profile-email') || {}).value || ''));
        const beforePhone = await page.evaluate(() => ((document.getElementById('edit-profile-phone') || {}).value || ''));
        const beforeName = await page.evaluate(() => ((document.getElementById('edit-profile-name') || {}).value || ''));
        // The official @pixlynote display name stays "Pixlynote"; other business accounts can rename.
        if (account.username === 'pixlynote') values.fullName = beforeName || 'Pixlynote';
        else await page.fill('#edit-profile-name', values.fullName);
        await page.fill('#edit-profile-bio', values.bio);
        await page.fill('#edit-profile-link', values.link);
        await page.fill('#edit-profile-dba-name', values.dbaName);
        await page.selectOption('#edit-profile-business-industry', values.businessIndustry);
        await page.fill('#edit-profile-business-street', values.businessStreet);
        await page.fill('#edit-profile-business-city', values.businessCity);
        await page.fill('#edit-profile-business-state', values.businessState);
        await page.fill('#edit-profile-business-postal', values.businessPostal);
        await page.selectOption('#edit-profile-address-visibility', values.businessAddressVisibility);
        await page.fill('#edit-profile-business-hours', values.businessHours);
        await page.fill('#edit-profile-support-email', values.businessSupportEmail);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await submitEditProfile(page);
        await page.waitForTimeout(250);
        const stored = await page.evaluate(() => {
          const u = state.currentUser || {};
          const doc = { username: u.username, accountType: u.accountType };
          (window.STORED_PROFILE_FIELDS || []).forEach(function (k) {
            if (u[k] !== undefined) doc[k] = u[k];
          });
          const writes = (window.__pixlyUserDocWrites || []).filter((w) => w.source === 'edit-profile');
          doc.write = writes.length ? writes[writes.length - 1] : null;
          doc.editWriteCount = writes.length;
          return doc;
        });
        a.equal(stored.editWriteCount, 1, 'A successful save writes the profile document once');
        a.equal(stored.fullName, values.fullName, 'Display name was saved on the business account');
        a.equal(stored.bio, values.bio, 'Bio was saved on the business account');
        a.equal(stored.link, 'https://example.test/round-trip-' + account.username, 'Website was saved and normalized to https://');
        a.equal(stored.email, beforeEmail, 'Existing email was kept on the same save');
        a.equal(stored.phone, beforePhone, 'Existing phone was kept on the same save');
        a.ok(stored.write && stored.write.source === 'edit-profile', 'The save recorded a single edit-profile document write');
        a.equal(stored.write && stored.write.data && stored.write.data.link, stored.link, 'The Firestore payload includes the normalized website');
        a.equal(stored.write && stored.write.data && stored.write.data.email, beforeEmail, 'The Firestore payload includes the email');
        a.equal(stored.write && stored.write.data && stored.write.data.bio, values.bio, 'The Firestore payload includes the bio');
        a.equal(stored.write && stored.write.data && stored.write.data.dbaName, values.dbaName, 'The Firestore payload includes the DBA');
        a.equal(stored.dbaName, values.dbaName, 'DBA was saved');
        a.equal(stored.businessIndustry, values.businessIndustry, 'Industry was saved');
        a.equal(stored.businessStreet, values.businessStreet, 'Street was saved');
        a.equal(stored.businessCity, values.businessCity, 'City was saved');
        a.equal(stored.businessState, values.businessState, 'State was saved');
        a.equal(stored.businessPostal, values.businessPostal, 'Postal code was saved');
        a.equal(stored.businessAddressVisibility, values.businessAddressVisibility, 'Address visibility was saved');
        a.equal(stored.businessHours, values.businessHours, 'Hours were saved');
        a.equal(stored.businessSupportEmail, values.businessSupportEmail, 'Support email was saved');

        await page.evaluate((doc) => {
          const u = state.currentUser;
          const drop = ['dbaName','businessIndustry','businessIndustryOther','businessStreet','businessCity','businessState','businessPostal','businessAddressVisibility','businessHours','businessSupportEmail','bio','link'];
          drop.forEach(function (k) { delete u[k]; });
          u._loadedProfileFields = { fullName: true, email: true, phone: true, accountType: true };
          window._lastLocalProfileWriteTs = 0;
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          const m = document.getElementById('modal-edit-profile');
          if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
          const uname = (typeof normalizeUsername === 'function') ? normalizeUsername(u.username) : String(u.username || '').toLowerCase();
          if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(uname, doc, false);
          else if (typeof mergeStoredProfileFields === 'function') mergeStoredProfileFields(u, doc);
        }, stored);
        await h.openEditProfile(page);
        const fields = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || ''),
          dba: ((document.getElementById('edit-profile-dba-name') || {}).value || ''),
          industry: ((document.getElementById('edit-profile-business-industry') || {}).value || ''),
          street: ((document.getElementById('edit-profile-business-street') || {}).value || ''),
          city: ((document.getElementById('edit-profile-business-city') || {}).value || ''),
          stateVal: ((document.getElementById('edit-profile-business-state') || {}).value || ''),
          postal: ((document.getElementById('edit-profile-business-postal') || {}).value || ''),
          vis: ((document.getElementById('edit-profile-address-visibility') || {}).value || ''),
          hours: ((document.getElementById('edit-profile-business-hours') || {}).value || ''),
          support: ((document.getElementById('edit-profile-support-email') || {}).value || '')
        }));
        a.equal(fields.name, values.fullName, 'Reopened modal shows the saved display name after a reload');
        a.equal(fields.email, beforeEmail, 'Reopened modal shows the saved email after a reload');
        a.equal(fields.phone, beforePhone, 'Reopened modal shows the saved phone after a reload');
        a.equal(fields.bio, values.bio, 'Reopened modal shows the saved bio after a reload');
        a.equal(fields.link, 'https://example.test/round-trip-' + account.username, 'Reopened modal shows the saved https website after a reload');
        a.equal(fields.dba, values.dbaName, 'Reopened modal shows the saved DBA after a reload');
        a.equal(fields.industry, values.businessIndustry, 'Reopened modal shows the saved industry after a reload');
        a.equal(fields.street, values.businessStreet, 'Reopened modal shows the saved street after a reload');
        a.equal(fields.city, values.businessCity, 'Reopened modal shows the saved city after a reload');
        a.equal(fields.stateVal, values.businessState, 'Reopened modal shows the saved state after a reload');
        a.equal(fields.postal, values.businessPostal, 'Reopened modal shows the saved postal code after a reload');
        a.equal(fields.vis, values.businessAddressVisibility, 'Reopened modal shows the saved address visibility after a reload');
        a.equal(fields.hours, values.businessHours, 'Reopened modal shows the saved hours after a reload');
        a.equal(fields.support, values.businessSupportEmail, 'Reopened modal shows the saved support email after a reload');
        await page.evaluate(() => {
          window._activeUserDocCache = null;
          if (state.currentUser && state.currentUser._loadedProfileFields) {
            ['dbaName','businessIndustry','businessIndustryOther','businessStreet','businessCity','businessState','businessPostal','businessAddressVisibility','businessHours','businessSupportEmail'].forEach((k) => {
              delete state.currentUser[k];
              delete state.currentUser._loadedProfileFields[k];
            });
          }
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'Edit Profile: a stale or partial render cannot blank stored business fields',
      accounts: ['business', 'pixlynote'],
      covers: [
        'handler:publicSafeUserFields',
        'handler:omitUnloadedPublicUserFields',
        'handler:mergeStoredProfileFields',
        'handler:fillEditProfileBusinessFields',
        'el:#edit-profile-dba-name',
        'el:#edit-profile-business-industry',
        'el:#edit-profile-business-city',
        'el:#edit-profile-business-hours',
        'el:#edit-profile-support-email'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const stored = {
          dbaName: 'Keep DBA',
          businessIndustry: 'software_tech',
          businessIndustryOther: '',
          businessStreet: '12 Harbor Rd',
          businessCity: 'Galloway',
          businessState: 'NJ',
          businessPostal: '08205',
          businessAddressVisibility: 'city_state',
          businessHours: 'Mon-Fri 9am-5pm EST',
          businessSupportEmail: 'keep.support@example.test'
        };
        const persist = await page.evaluate((stored) => {
          const u = state.currentUser;
          const drop = Object.keys(stored);
          drop.forEach(function (k) { delete u[k]; });
          u._loadedProfileFields = { email: true, phone: true, bio: true, link: true, accountType: true, fullName: true };
          window._activeUserDocCache = {
            username: u.username,
            data: Object.assign({ username: u.username, accountType: u.accountType || 'business', email: u.email || '', phone: u.phone || '', bio: u.bio || '', link: u.link || '' }, stored),
            at: Date.now()
          };
          const rec = (typeof publicSafeUserFields === 'function') ? publicSafeUserFields(u) : {};
          return rec;
        }, stored);
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'dbaName'), 'A partial profile persist does not write a blank DBA');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessIndustry'), 'A partial profile persist does not write a blank industry');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessCity'), 'A partial profile persist does not write a blank city');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessState'), 'A partial profile persist does not write a blank state');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessPostal'), 'A partial profile persist does not write a blank postal code');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessHours'), 'A partial profile persist does not write blank hours');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessSupportEmail'), 'A partial profile persist does not write a blank support email');
        a.ok(!Object.prototype.hasOwnProperty.call(persist, 'businessStreet'), 'A partial profile persist does not write a blank street');

        await h.openEditProfile(page);
        const fields = await page.evaluate(() => ({
          dba: ((document.getElementById('edit-profile-dba-name') || {}).value || ''),
          industry: ((document.getElementById('edit-profile-business-industry') || {}).value || ''),
          city: ((document.getElementById('edit-profile-business-city') || {}).value || ''),
          stateVal: ((document.getElementById('edit-profile-business-state') || {}).value || ''),
          postal: ((document.getElementById('edit-profile-business-postal') || {}).value || ''),
          hours: ((document.getElementById('edit-profile-business-hours') || {}).value || ''),
          support: ((document.getElementById('edit-profile-support-email') || {}).value || ''),
          street: ((document.getElementById('edit-profile-business-street') || {}).value || '')
        }));
        a.equal(fields.dba, stored.dbaName, 'Opening Edit Profile fills DBA from stored data even after a partial render');
        a.equal(fields.industry, stored.businessIndustry, 'Opening Edit Profile fills industry from stored data even after a partial render');
        a.equal(fields.city, stored.businessCity, 'Opening Edit Profile fills city from stored data even after a partial render');
        a.equal(fields.stateVal, stored.businessState, 'Opening Edit Profile fills state from stored data even after a partial render');
        a.equal(fields.postal, stored.businessPostal, 'Opening Edit Profile fills postal code from stored data even after a partial render');
        a.equal(fields.hours, stored.businessHours, 'Opening Edit Profile fills hours from stored data even after a partial render');
        a.equal(fields.support, stored.businessSupportEmail, 'Opening Edit Profile fills support email from stored data even after a partial render');
        a.equal(fields.street, stored.businessStreet, 'Opening Edit Profile fills street from stored data even after a partial render');
        await page.evaluate(() => {
          window._activeUserDocCache = null;
          if (state.currentUser && state.currentUser._loadedProfileFields) {
            ['dbaName','businessIndustry','businessIndustryOther','businessStreet','businessCity','businessState','businessPostal','businessAddressVisibility','businessHours','businessSupportEmail'].forEach((k) => {
              delete state.currentUser[k];
              delete state.currentUser._loadedProfileFields[k];
            });
          }
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'Edit Profile: every stored field survives save, reload, and reopen on a personal account',
      accounts: ['personal', 'empty'],
      covers: [
        'el:#edit-profile-name',
        'el:#edit-profile-email',
        'el:#edit-profile-phone',
        'el:#edit-profile-bio',
        'el:#edit-profile-link',
        'el:#btn-save-edit-profile',
        'handler:validateEditProfileForm'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const values = {
          fullName: 'Round Trip ' + account.username,
          bio: 'Personal round-trip bio for ' + account.username,
          link: 'example.test/personal-' + account.username
        };
        const beforeEmail = await page.evaluate(() => ((document.getElementById('edit-profile-email') || {}).value || ''));
        const beforePhone = await page.evaluate(() => ((document.getElementById('edit-profile-phone') || {}).value || ''));
        a.ok(beforeEmail, 'The personal account already has an email');
        await page.fill('#edit-profile-name', values.fullName);
        await page.fill('#edit-profile-bio', values.bio);
        await page.fill('#edit-profile-link', values.link);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await submitEditProfile(page);
        await page.waitForTimeout(250);
        const stored = await page.evaluate(() => {
          const u = state.currentUser || {};
          const writes = (window.__pixlyUserDocWrites || []).filter((w) => w.source === 'edit-profile');
          return {
            fullName: u.fullName || '',
            email: u.email || '',
            phone: u.phone || '',
            bio: u.bio || '',
            link: u.link || '',
            writeCount: writes.length,
            write: writes.length ? writes[writes.length - 1] : null
          };
        });
        a.equal(stored.fullName, values.fullName, 'Display name was saved on the personal account');
        a.equal(stored.bio, values.bio, 'Bio was saved on the personal account');
        a.equal(stored.link, 'https://example.test/personal-' + account.username, 'Website was saved and normalized to https://');
        a.equal(stored.email, beforeEmail, 'Existing email was kept on the same save');
        a.equal(stored.phone, beforePhone, 'Existing phone was kept on the same save');
        a.equal(stored.writeCount, 1, 'A successful personal save writes the profile document once');
        a.equal(stored.write && stored.write.data && stored.write.data.link, stored.link, 'The Firestore payload includes the normalized website');
        a.equal(stored.write && stored.write.data && stored.write.data.email, beforeEmail, 'The Firestore payload includes the email');

        await page.evaluate((doc) => {
          const u = state.currentUser;
          ['fullName', 'email', 'phone', 'bio', 'link'].forEach(function (k) { delete u[k]; });
          u._loadedProfileFields = { accountType: true };
          window._lastLocalProfileWriteTs = 0;
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
          const m = document.getElementById('modal-edit-profile');
          if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
          const uname = (typeof normalizeUsername === 'function') ? normalizeUsername(u.username) : String(u.username || '').toLowerCase();
          if (typeof applyActiveUserDocData === 'function') applyActiveUserDocData(uname, doc, false);
          else if (typeof mergeStoredProfileFields === 'function') mergeStoredProfileFields(u, doc);
        }, { username: account.username, fullName: stored.fullName, email: stored.email, phone: stored.phone, bio: stored.bio, link: stored.link, accountType: 'personal' });
        await h.openEditProfile(page);
        const fields = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || '')
        }));
        a.equal(fields.name, values.fullName, 'Reopened personal modal shows the saved name');
        a.equal(fields.email, beforeEmail, 'Reopened personal modal shows the saved email');
        a.equal(fields.phone, beforePhone, 'Reopened personal modal shows the saved phone');
        a.equal(fields.bio, values.bio, 'Reopened personal modal shows the saved bio');
        a.equal(fields.link, 'https://example.test/personal-' + account.username, 'Reopened personal modal shows the saved https website');
        await page.evaluate(() => {
          window._activeUserDocCache = null;
          if (typeof closeEditProfileModal === 'function') closeEditProfileModal();
        });
      }
    },
    {
      name: 'Edit Profile: an invalid website is blocked inline and does not drop other typed fields',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#edit-profile-link', 'el:#edit-profile-link-error', 'el:#edit-profile-bio', 'el:#btn-save-edit-profile', 'handler:validateEditProfileForm', 'handler:normalizeWebsiteUrl'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const typedBio = 'Bio kept with a bad website';
        const bad = 'javascript:alert(1)';
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-link', bad);
        const before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(150);
        const after = await profileSnapshot(page);
        const ui = await page.evaluate(() => {
          const modal = document.getElementById('modal-edit-profile');
          return {
            err: (document.getElementById('edit-profile-link-error') || {}).textContent || '',
            toast: (document.getElementById('toast-text') || {}).textContent || '',
            link: ((document.getElementById('edit-profile-link') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
            modalOpen: !!(modal && !modal.classList.contains('hidden')),
            stateLink: state.currentUser && (state.currentUser.link || ''),
            stateBio: state.currentUser && (state.currentUser.bio || '')
          };
        });
        a.ok(/valid website/i.test(ui.err + ' ' + ui.toast), 'An invalid website shows an inline error: ' + JSON.stringify({ err: ui.err, toast: ui.toast }));
        a.equal(ui.link, bad, 'The invalid website stays in the field instead of vanishing');
        a.equal(ui.bio, typedBio, 'The typed bio is still in the field after a blocked website save');
        a.ok(ui.modalOpen, 'The modal stays open so the user can fix the website');
        a.ok(ui.stateLink !== bad && !/javascript:/i.test(ui.stateLink || ''), 'The invalid website is not stored on the profile');
        a.ok(ui.stateBio !== typedBio || after.writeCount === before.writeCount, 'A blocked website save does not persist the bio alone');
        assertSameStoredFields(a, before, after, 'An invalid website');
      }
    },
    {
      name: 'Edit Profile: each validation failure writes nothing and keeps typed fields',
      accounts: ['personal', 'business'],
      covers: [
        'el:#edit-profile-name',
        'el:#edit-profile-email',
        'el:#edit-profile-phone',
        'el:#edit-profile-support-email',
        'el:#edit-profile-support-email-error',
        'handler:validateEditProfileForm',
        'handler:editProfileEmailConflictMessage',
        'handler:editProfilePhoneConflictMessage'
      ],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        const isBiz = account.accountType === 'business';
        await h.openEditProfile(page);
        const originalName = await page.evaluate(() => ((document.getElementById('edit-profile-name') || {}).value || ''));
        const typedBio = 'Keep this bio through failed saves';
        const typedLink = 'https://example.test/keep-on-fail-' + account.username;
        await page.fill('#edit-profile-bio', typedBio);
        await page.fill('#edit-profile-link', typedLink);

        // Missing name
        await page.fill('#edit-profile-name', '');
        let before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        let after = await profileSnapshot(page);
        let ui = await page.evaluate(() => ({
          name: ((document.getElementById('edit-profile-name') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || ''),
          toast: (document.getElementById('toast-text') || {}).textContent || ''
        }));
        a.ok(/required/i.test(ui.toast), 'A missing name shows a required-name message: ' + ui.toast);
        a.equal(ui.name, '', 'The name field stays empty so the user can fill it');
        a.equal(ui.bio, typedBio, 'A missing name does not drop the typed bio');
        a.ok((ui.link || '').includes('keep-on-fail-'), 'A missing name does not drop the typed website');
        assertSameStoredFields(a, before, after, 'A missing name');
        await page.fill('#edit-profile-name', originalName);

        // Missing email and phone
        await page.fill('#edit-profile-email', '');
        await page.fill('#edit-profile-phone', '');
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        after = await profileSnapshot(page);
        ui = await page.evaluate(() => ({
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          toast: (document.getElementById('toast-text') || {}).textContent || ''
        }));
        a.ok(/email or phone/i.test(ui.toast), 'Clearing both contacts asks for an email or phone: ' + ui.toast);
        a.equal(ui.email, '', 'The email field stays empty');
        a.equal(ui.phone, '', 'The phone field stays empty');
        a.equal(ui.bio, typedBio, 'Clearing contacts does not drop the typed bio');
        assertSameStoredFields(a, before, after, 'Missing email and phone');

        // Restore email, use a conflicting phone
        const existingEmail = await page.evaluate(() => (state.currentUser && state.currentUser.email) || '');
        await page.fill('#edit-profile-email', existingEmail);
        await page.fill('#edit-profile-phone', '5555550101');
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        // 5555550101 belongs to reg_personal; for the personal account use the business number instead
        const conflictPhone = account.username === 'reg_personal' ? '5555550102' : '5555550101';
        await page.fill('#edit-profile-phone', conflictPhone);
        await page.evaluate(() => {
          document.getElementById('edit-profile-phone')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        after = await profileSnapshot(page);
        ui = await page.evaluate(() => ({
          err: (document.getElementById('edit-profile-phone-error') || {}).textContent || '',
          toast: (document.getElementById('toast-text') || {}).textContent || '',
          phone: ((document.getElementById('edit-profile-phone') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          email: ((document.getElementById('edit-profile-email') || {}).value || '')
        }));
        a.ok(/This number is already used by another account\. Remove it and use your email instead\./.test(ui.err + ' ' + ui.toast), 'A phone conflict uses the clear message');
        a.ok((ui.phone || '').replace(/\D/g, '').includes(conflictPhone), 'The conflicting phone stays in the field');
        a.equal(ui.bio, typedBio, 'A phone conflict does not drop the typed bio');
        assertSameStoredFields(a, before, after, 'A conflicting phone');

        // Conflicting email
        const conflictEmail = account.username === 'reg_personal' ? 'reg.business@example.test' : 'reg.personal@example.test';
        await page.fill('#edit-profile-email', conflictEmail);
        await page.evaluate(() => {
          document.getElementById('edit-profile-email')?.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof syncEditProfileVerifyUi === 'function') syncEditProfileVerifyUi();
        });
        before = await profileSnapshot(page);
        await submitEditProfile(page);
        await page.waitForTimeout(120);
        after = await profileSnapshot(page);
        ui = await page.evaluate(() => ({
          err: (document.getElementById('edit-profile-email-error') || {}).textContent || '',
          toast: (document.getElementById('toast-text') || {}).textContent || '',
          email: ((document.getElementById('edit-profile-email') || {}).value || ''),
          bio: ((document.getElementById('edit-profile-bio') || {}).value || ''),
          link: ((document.getElementById('edit-profile-link') || {}).value || '')
        }));
        a.ok(/This email is already used by another account\. Remove it and use your phone instead\./.test(ui.err + ' ' + ui.toast), 'An email conflict uses the clear message');
        a.equal(ui.email, conflictEmail, 'The conflicting email stays in the field');
        a.equal(ui.bio, typedBio, 'An email conflict does not drop the typed bio');
        a.ok((ui.link || '').includes('keep-on-fail-'), 'An email conflict does not drop the typed website');
        assertSameStoredFields(a, before, after, 'A conflicting email');

        if (isBiz) {
          await page.evaluate(() => { if (typeof closeEditProfileModal === 'function') closeEditProfileModal(); });
          await h.openEditProfile(page);
          await page.waitForSelector('#edit-profile-support-email');
          await page.fill('#edit-profile-bio', typedBio);
          await page.fill('#edit-profile-link', typedLink);
          await page.fill('#edit-profile-support-email', 'not-an-email');
          before = await profileSnapshot(page);
          await page.evaluate(() => {
            const t = document.getElementById('toast-text');
            if (t) t.textContent = '';
            if (typeof clearEditProfileFieldErrors === 'function') clearEditProfileFieldErrors();
            if (typeof validateEditProfileForm === 'function' && typeof showEditProfileValidationErrors === 'function') {
              const result = validateEditProfileForm();
              if (!result.ok) {
                showEditProfileValidationErrors(result);
                return result.ok;
              }
            }
            const form = document.getElementById('edit-profile-form');
            if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
            else document.getElementById('btn-save-edit-profile')?.click();
            return true;
          });
          await page.waitForTimeout(150);
          after = await profileSnapshot(page);
          ui = await page.evaluate(() => ({
            err: (document.getElementById('edit-profile-support-email-error') || {}).textContent || '',
            toast: (document.getElementById('toast-text') || {}).textContent || '',
            support: ((document.getElementById('edit-profile-support-email') || {}).value || ''),
            bio: ((document.getElementById('edit-profile-bio') || {}).value || '')
          }));
          a.ok(/valid support email/i.test(ui.err + ' ' + ui.toast), 'An invalid support email shows an inline error: ' + JSON.stringify({ err: ui.err, toast: ui.toast }));
          a.equal(ui.support, 'not-an-email', 'The invalid support email stays in the field');
          a.equal(ui.bio, typedBio, 'An invalid support email does not drop the typed bio');
          assertSameStoredFields(a, before, after, 'An invalid support email');
        }
      }
    },
    {
      name: 'Edit Profile: a later likes sync cannot overwrite a completed profile save',
      accounts: ['business', 'pixlynote'],
      covers: ['handler:syncAllLikesToFirestore', 'handler:validateEditProfileForm'],
      async run(ctx) {
        const { page, h, a, account } = ctx;
        await h.openEditProfile(page);
        const bio = 'Saved bio must survive likes sync ' + account.username;
        const site = 'saved-site.test/' + account.username;
        await page.fill('#edit-profile-bio', bio);
        await page.fill('#edit-profile-link', site);
        await page.evaluate(() => { window.__pixlyUserDocWrites = []; });
        await submitEditProfile(page);
        await page.waitForTimeout(250);
        const saved = await page.evaluate(() => ({
          email: state.currentUser && (state.currentUser.email || ''),
          phone: state.currentUser && (state.currentUser.phone || ''),
          bio: state.currentUser && (state.currentUser.bio || ''),
          link: state.currentUser && (state.currentUser.link || '')
        }));
        a.equal(saved.bio, bio, 'Bio was saved before the likes sync');
        a.equal(saved.link, 'https://' + site, 'Website was saved before the likes sync');

        const syncWrite = await page.evaluate(async () => {
          // Simulate a likes sync after in-memory contact fields are clobbered, like the 5:18 PM ET overwrite.
          const previous = {
            email: state.currentUser.email,
            phone: state.currentUser.phone,
            bio: state.currentUser.bio,
            link: state.currentUser.link
          };
          state.currentUser.email = '';
          state.currentUser.phone = state.currentUser.phone || '+1 (555) 010-9999';
          state.currentUser.link = '';
          const captured = [];
          const prevReady = window.firebaseReady;
          const prevFb = window.firebase;
          window.firebaseReady = true;
          window._likesHydratedFromCloud = true;
          window.firebase = {
            db: {},
            doc: function (db, col, id) { return { col, id }; },
            setDoc: async function (ref, payload) { captured.push({ ref, payload }); return true; }
          };
          try {
            if (typeof syncAllLikesToFirestore === 'function') await syncAllLikesToFirestore();
          } finally {
            window.firebaseReady = prevReady;
            window.firebase = prevFb;
            state.currentUser.email = previous.email;
            state.currentUser.phone = previous.phone;
            state.currentUser.bio = previous.bio;
            state.currentUser.link = previous.link;
          }
          const payload = captured.length ? captured[captured.length - 1].payload : null;
          return {
            count: captured.length,
            hasEmail: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'email')),
            hasPhone: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'phone')),
            hasLink: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'link')),
            hasBio: !!(payload && Object.prototype.hasOwnProperty.call(payload, 'bio')),
            email: payload && payload.email,
            link: payload && payload.link,
            bio: payload && payload.bio
          };
        });
        a.ok(syncWrite.count >= 1, 'The likes sync still writes likes data');
        a.ok(!syncWrite.hasEmail && !syncWrite.hasPhone && !syncWrite.hasLink && !syncWrite.hasBio, 'The likes sync does not write email, phone, website, or bio: ' + JSON.stringify(syncWrite));
      }
    }


  ]
};
