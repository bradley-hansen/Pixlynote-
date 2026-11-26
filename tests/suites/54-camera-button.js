'use strict';

/**
 * Camera button in the Create new post modal.
 * Tapping it opens a capture file input; a chosen photo takes the same
 * wizard path as "Upload photo from your phone." Nothing is written to Firestore.
 */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
async function pickPhoto(page, selector, file) {
  await page.setInputFiles(selector, file);
  // Camera/upload now opens the photo review step first; Next hands the photo to the wizard.
  await page.waitForSelector('#photo-review-overlay:not(.hidden)', { timeout: 5000 });
  await page.click('#btn-photo-review-next');
}

async function openCreate(page, mode) {
  await page.evaluate((m) => {
    if (typeof openCreatePostModal === 'function') openCreatePostModal(m || 'post');
  }, mode || 'post');
  await page.waitForSelector('#modal-create-post:not(.hidden)', { timeout: 4000 });
}

async function wizardPhoto(page) {
  return page.evaluate(() => {
    const img = document.getElementById('create-preview-img');
    const badge = document.getElementById('upload-status-badge');
    return {
      src: (img && img.src) || '',
      selected: (state && state.selectedCreateImage) || '',
      badgeText: badge ? (badge.textContent || '').trim() : '',
      badgeHidden: !badge || badge.classList.contains('hidden')
    };
  });
}

module.exports = {
  name: 'Create modal Camera button',
  tests: [
    {
      name: 'Create modal: Camera sits to the right of the title and opens a capture file input',
      accounts: ['personal'],
      covers: ['el:#btn-create-camera', 'el:#create-camera-upload', 'handler:openCreateCamera', 'listener:#create-camera-upload:change'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        await openCreate(page, 'post');

        const ui = await page.evaluate(() => {
          const title = document.getElementById('create-modal-title');
          const cam = document.getElementById('btn-create-camera');
          const drafts = document.getElementById('btn-open-drafts-from-create');
          const close = document.getElementById('btn-close-create-modal');
          const inp = document.getElementById('create-camera-upload');
          const header = title && title.parentElement;
          return {
            title: title && (title.textContent || '').trim(),
            camText: cam && (cam.textContent || '').trim(),
            headerHasBoth: !!(header && header.contains(title) && header.contains(cam)),
            titleRight: title && Math.round(title.getBoundingClientRect().right),
            camLeft: cam && Math.round(cam.getBoundingClientRect().left),
            camRight: cam && Math.round(cam.getBoundingClientRect().right),
            draftsLeft: drafts && Math.round(drafts.getBoundingClientRect().left),
            closeRight: close && Math.round(close.getBoundingClientRect().right),
            accept: inp && inp.getAttribute('accept'),
            capture: inp && inp.getAttribute('capture'),
            type: inp && inp.getAttribute('type'),
            hidden: inp && inp.classList.contains('hidden')
          };
        });
        a.equal(ui.title, 'Create new post', 'modal title is Create new post');
        a.equal(ui.camText, 'Camera', 'Camera text button is present');
        a.ok(ui.headerHasBoth, 'Camera is grouped with the title');
        a.ok(ui.camLeft >= ui.titleRight, 'Camera is immediately to the right of the title: ' + JSON.stringify(ui));
        a.ok(ui.camRight <= ui.draftsLeft, 'Camera is left of Drafts: ' + JSON.stringify(ui));
        a.equal(ui.type, 'file', 'capture control is a file input');
        a.equal(ui.accept, 'image/*', 'input accepts images');
        a.equal(ui.capture, 'environment', 'input uses the environment camera');
        a.ok(ui.hidden, 'capture input is hidden');

        await page.evaluate(() => {
          window.__camInputClicked = false;
          const inp = document.getElementById('create-camera-upload');
          if (inp) inp.addEventListener('click', () => { window.__camInputClicked = true; }, true);
        });
        await page.click('#btn-create-camera');
        const clicked = await page.evaluate(() => !!window.__camInputClicked);
        a.ok(clicked, 'tapping Camera triggers the capture input');
        await page.evaluate(() => { if (typeof closeCreatePostModal === 'function') closeCreatePostModal(); });
      }
    },
    {
      name: 'Create modal: a photo from Camera loads into the wizard the same way as an upload, for Grid Post, Story and Highlight',
      accounts: ['personal'],
      covers: ['el:#btn-create-camera', 'el:#create-camera-upload', 'el:#create-preview-img', 'handler:openCreateCamera'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        const file = { name: 'camera-shot.png', mimeType: 'image/png', buffer: TINY_PNG };

        for (const mode of ['post', 'story', 'highlight']) {
          await openCreate(page, mode);
          await page.evaluate(() => { if (typeof clearCreateWizardImage === 'function') clearCreateWizardImage(); });
          const before = await wizardPhoto(page);
          await pickPhoto(page, '#create-camera-upload', file);
          await page.waitForFunction(() => {
            const s = (state && state.selectedCreateImage) || '';
            return typeof s === 'string' && s.indexOf('data:image') === 0;
          }, null, { timeout: 5000 });
          const after = await wizardPhoto(page);
          a.ok(after.selected.indexOf('data:image') === 0, mode + ': selectedCreateImage is a photo data URL');
          a.ok(after.src.indexOf('data:image') === 0, mode + ': preview shows the photo');
          a.ok(after.src === after.selected, mode + ': preview matches the chosen photo');
          a.ok(after.selected !== before.selected && after.src !== before.src, mode + ': the wizard photo changed from its previous value');
          a.ok(!after.badgeHidden, mode + ': the selected-photo badge is shown');
          await page.evaluate(() => { if (typeof closeCreatePostModal === 'function') closeCreatePostModal(); });
        }

        // Same path as the library upload: both inputs update selectedCreateImage the same way.
        await openCreate(page, 'post');
        await page.evaluate(() => { if (typeof clearCreateWizardImage === 'function') clearCreateWizardImage(); });
        await pickPhoto(page, '#create-file-upload', { name: 'library.png', mimeType: 'image/png', buffer: TINY_PNG });
        await page.waitForFunction(() => ((state && state.selectedCreateImage) || '').indexOf('data:image') === 0, null, { timeout: 5000 });
        const fromUpload = await wizardPhoto(page);
        await page.evaluate(() => { if (typeof clearCreateWizardImage === 'function') clearCreateWizardImage(); });
        await pickPhoto(page, '#create-camera-upload', file);
        await page.waitForFunction(() => ((state && state.selectedCreateImage) || '').indexOf('data:image') === 0, null, { timeout: 5000 });
        const fromCamera = await wizardPhoto(page);
        a.ok(fromUpload.selected.indexOf('data:image') === 0 && fromCamera.selected.indexOf('data:image') === 0,
          'upload and Camera both load a data URL into the wizard');
        a.equal(fromUpload.selected.slice(0, 14), fromCamera.selected.slice(0, 14), 'both paths store an image data URL');
        await page.evaluate(() => { if (typeof closeCreatePostModal === 'function') closeCreatePostModal(); });
      }
    },
    {
      name: 'Create modal: cancel, denied, or blocked Camera permission fails safely and leaves Upload photo usable',
      accounts: ['personal'],
      covers: ['el:#create-camera-upload', 'el:#create-file-upload', 'handler:openCreateCamera', 'el:#btn-create-camera'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        await openCreate(page, 'post');
        await pickPhoto(page, '#create-file-upload', { name: 'keep-me.png', mimeType: 'image/png', buffer: TINY_PNG });
        await page.waitForFunction(() => ((state && state.selectedCreateImage) || '').indexOf('data:image') === 0, null, { timeout: 5000 });
        const before = await wizardPhoto(page);

        // Cancel: change with no file selected (same as dismissing the camera).
        await page.evaluate(() => {
          const inp = document.getElementById('create-camera-upload');
          try { inp.value = ''; } catch (e) {}
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(200);
        let after = await wizardPhoto(page);
        a.equal(after.selected, before.selected, 'canceling the camera does not change the chosen photo');
        a.equal(after.src, before.src, 'canceling the camera does not change the preview');

        // Denied / blocked permission: opening the capture input throws, and must not escape.
        const safety = await page.evaluate(() => {
          const inp = document.getElementById('create-camera-upload');
          const orig = inp.click;
          const pageErrors = [];
          const onErr = (ev) => { pageErrors.push(String((ev && ev.message) || ev)); };
          window.addEventListener('error', onErr);
          const results = [];
          for (const [name, err] of [
            ['NotAllowedError', new DOMException('Permission denied', 'NotAllowedError')],
            ['SecurityError', new DOMException('Camera blocked', 'SecurityError')]
          ]) {
            inp.click = () => { throw err; };
            let threw = false;
            try { openCreateCamera(); } catch (e) { threw = true; }
            results.push({ name, threw });
          }
          inp.click = orig;
          window.removeEventListener('error', onErr);
          const modal = document.getElementById('modal-create-post');
          const upload = document.getElementById('create-file-upload');
          const label = document.querySelector('label[for="create-file-upload"]');
          return {
            results,
            pageErrors,
            modalOpen: !!(modal && !modal.classList.contains('hidden')),
            uploadPresent: !!upload,
            labelText: label ? (label.textContent || '').replace(/\s+/g, ' ').trim() : ''
          };
        });
        a.ok(safety.results.every((r) => !r.threw), 'openCreateCamera does not throw when the camera is denied or blocked: ' + JSON.stringify(safety.results));
        a.equal(safety.pageErrors.length, 0, 'no uncaught page error after a denied or blocked camera: ' + JSON.stringify(safety.pageErrors));
        a.ok(safety.modalOpen, 'the create modal is still open after a camera permission failure');
        a.ok(safety.uploadPresent, 'Upload photo from your phone is still in the modal');
        a.ok(/Upload photo from your phone/.test(safety.labelText), 'upload label is still visible: ' + safety.labelText);

        after = await wizardPhoto(page);
        a.equal(after.selected, before.selected, 'a denied or blocked camera does not change the chosen photo');

        // After those failures the library upload path still loads a photo.
        await page.evaluate(() => { if (typeof clearCreateWizardImage === 'function') clearCreateWizardImage(); });
        await pickPhoto(page, '#create-file-upload', { name: 'after-deny.png', mimeType: 'image/png', buffer: TINY_PNG });
        await page.waitForFunction(() => ((state && state.selectedCreateImage) || '').indexOf('data:image') === 0, null, { timeout: 5000 });
        const uploaded = await wizardPhoto(page);
        a.ok(uploaded.selected.indexOf('data:image') === 0, 'Upload photo from your phone still loads a photo after camera permission failure');
        a.ok(!uploaded.badgeHidden, 'upload badge still appears after camera permission failure');
        await page.evaluate(() => { if (typeof closeCreatePostModal === 'function') closeCreatePostModal(); });
      }
    }
  ]
};
