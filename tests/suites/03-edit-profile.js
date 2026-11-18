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
        a.ok(emailState.disabled || /taken|already/i.test(emailState.err), 'Taken email blocks Send code: ' + JSON.stringify(emailState));

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
        a.ok(phoneState.disabled || /taken|already/i.test(phoneState.err), 'Taken phone blocks Send code: ' + JSON.stringify(phoneState));
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
        // renderProfile() locks the official @pixlynote display name and website after save.
        if (isOfficial) {
          a.equal(saved.name, 'Pixlynote', 'Official account display name stays Pixlynote after save');
          a.equal(saved.bio, newBio, 'Bio was saved on the official account');
        } else {
          a.equal(saved.name, newName, 'Name was saved on the current user');
          a.equal(saved.bio, newBio, 'Bio was saved on the current user');
          a.ok((saved.link || '').includes('example.test/updated'), 'Website was saved on the current user: ' + saved.link);
        }
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
          // openEditProfileModal blanks bio and website on @pixlynote so personal data cannot leak into the form.
          if (bioId) a.equal(fields.bio, '', 'Reopened official modal blanks the bio field');
          if (linkId) a.equal(fields.link, '', 'Reopened official modal blanks the website field');
        } else {
          if (nameSel) a.equal(fields.name, newName, 'Reopened modal shows the saved name');
          if (bioId) a.equal(fields.bio, newBio, 'Reopened modal shows the saved bio');
          if (linkId) a.ok((fields.link || '').includes('example.test/updated'), 'Reopened modal shows the saved website');
        }
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
        a.equal(start.label, isBiz ? 'Business Name' : 'Full Name', 'Label matches the current category');

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
        a.equal(switched.label, isBiz ? 'Full Name' : 'Business Name', 'Label updates for the other category');
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
    }
  ]
};
