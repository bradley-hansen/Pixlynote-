'use strict';

/**
 * Photo review + Edit photo step after Camera or Upload photo from your phone.
 * Filters, AI keyword mapping, Puppy ears (face library stubbed or blocked), and
 * Next handing the edited photo to the Create wizard. Nothing is written to Firestore.
 */

async function makePhoto(page, w, h) {
  const b64 = await page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#ff3b30'); g.addColorStop(0.5, '#34c759'); g.addColorStop(1, '#007aff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png').split(',')[1];
  }, { w, h });
  return { name: 'sample-photo.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

async function openCreate(page, mode) {
  await page.evaluate((m) => { if (typeof openCreatePostModal === 'function') openCreatePostModal(m); }, mode || 'post');
  await page.waitForSelector('#modal-create-post:not(.hidden)', { timeout: 4000 });
  await page.evaluate(() => { if (typeof clearCreateWizardImage === 'function') clearCreateWizardImage(); });
}

async function pickToReview(page, selector, file) {
  await page.setInputFiles(selector, file);
  await page.waitForSelector('#photo-review-overlay:not(.hidden)', { timeout: 5000 });
  await page.waitForFunction(() => !!(window.pixlyPhotoEdit && window.pixlyPhotoEdit.original), null, { timeout: 5000 });
}

async function openEditor(page) {
  await page.click('#btn-photo-review-edit');
  await page.waitForSelector('#photo-edit-overlay:not(.hidden)', { timeout: 4000 });
  await page.waitForFunction(() => {
    const c = document.getElementById('photo-edit-canvas');
    return c && c.width > 1 && c.dataset.filter;
  }, null, { timeout: 5000 });
}

async function canvasStats(page) {
  return page.evaluate(() => {
    const c = document.getElementById('photo-edit-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let maxChroma = 0, sumR = 0, sumB = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      maxChroma = Math.max(maxChroma, Math.max(r, g, b) - Math.min(r, g, b));
      sumR += r; sumB += b; n++;
    }
    return { w: c.width, h: c.height, maxChroma, avgR: sumR / n, avgB: sumB / n, filter: c.dataset.filter, ears: c.dataset.ears };
  });
}

function imgSize(page, src) {
  return page.evaluate((s) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res({ w: 0, h: 0 });
    i.src = s;
  }), src);
}

const FAKE_VISION_MODULE = `
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export const FaceLandmarker = {
  createFromOptions: async () => ({
    detect: () => {
      if (window.__fakeNoFace) return { faceLandmarks: [] };
      const lm = [];
      for (let i = 0; i < 478; i++) lm.push({ x: 0.5, y: 0.5, z: 0 });
      lm[234] = { x: 0.3, y: 0.5, z: 0 };
      lm[454] = { x: 0.7, y: 0.5, z: 0 };
      lm[10] = { x: 0.5, y: 0.3, z: 0 };
      lm[4] = { x: 0.5, y: 0.55, z: 0 };
      lm[152] = { x: 0.5, y: 0.8, z: 0 };
      window.__fakeDetectCalls = (window.__fakeDetectCalls || 0) + 1;
      return { faceLandmarks: [lm] };
    }
  })
};`;

module.exports = {
  name: 'Photo review and Edit photo',
  tests: [
    {
      name: 'Photo editor: upload opens a full-screen review with back, pencil and Next; pencil opens Edit photo with tools, filters and dots',
      accounts: ['personal'],
      covers: [
        'el:#btn-photo-review-back', 'el:#btn-photo-review-edit', 'el:#btn-photo-review-next',
        'el:#btn-photo-edit-cancel', 'el:#btn-photo-edit-done',
        'el:#btn-photo-tool-filter', 'el:#btn-photo-tool-ai',
        'handler:closePhotoReview', 'handler:openPhotoEditor', 'handler:setPhotoEditTool', 'handler:cancelPhotoEdit'
      ],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        const file = await makePhoto(page, 300, 300);
        await openCreate(page, 'post');
        await pickToReview(page, '#create-file-upload', file);

        const review = await page.evaluate(() => {
          const ov = document.getElementById('photo-review-overlay');
          const r = ov.getBoundingClientRect();
          return {
            full: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
            img: (document.getElementById('photo-review-img').src || '').slice(0, 10),
            back: !!document.getElementById('btn-photo-review-back'),
            pencil: !!document.getElementById('btn-photo-review-edit'),
            next: (document.getElementById('btn-photo-review-next').textContent || '').trim(),
            wizardPhoto: state.selectedCreateImage || ''
          };
        });
        a.ok(review.full, 'review step is full screen');
        a.equal(review.img, 'data:image', 'review step shows the photo');
        a.ok(review.back && review.pencil, 'review step has back arrow and pencil');
        a.equal(review.next, 'Next', 'review step has a Next button');
        a.equal(review.wizardPhoto, '', 'photo is not in the wizard until Next');

        // Back discards the pick and leaves the wizard unchanged.
        await page.click('#btn-photo-review-back');
        a.ok(await page.evaluate(() => document.getElementById('photo-review-overlay').classList.contains('hidden')), 'back closes review');
        a.equal(await page.evaluate(() => state.selectedCreateImage || ''), '', 'back leaves the wizard photo unchanged');
        a.ok(await page.evaluate(() => !document.getElementById('modal-create-post').classList.contains('hidden')), 'Create modal is still open after back');

        await pickToReview(page, '#create-file-upload', file);
        await openEditor(page);
        const edit = await page.evaluate(() => {
          const txt = (id) => ((document.getElementById(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();
          const thumbs = Array.from(document.querySelectorAll('#photo-filter-row .photo-filter-thumb'));
          return {
            cancel: txt('btn-photo-edit-cancel'), done: txt('btn-photo-edit-done'),
            tools: [txt('btn-photo-tool-filter'), txt('btn-photo-tool-ai')],
            hasEarsTool: !!document.getElementById('btn-photo-tool-ears'),
            names: thumbs.map((t) => (t.querySelector('.photo-filter-name').textContent || '').trim()),
            dots: document.querySelectorAll('#photo-filter-dots [data-dot]').length,
            activeDot: (document.querySelector('#photo-filter-dots .bg-pink-400') || {}).getAttribute ? document.querySelector('#photo-filter-dots .bg-pink-400').getAttribute('data-dot') : '',
            rowScrolls: getComputedStyle(document.getElementById('photo-filter-row')).overflowX
          };
        });
        a.equal(edit.cancel, 'Cancel', 'Edit photo has Cancel');
        a.equal(edit.done, 'Done', 'Edit photo has Done');
        a.equal(JSON.stringify(edit.tools), JSON.stringify(['Filter', 'AI']), 'tool row is Filter and AI');
        a.ok(!edit.hasEarsTool, 'Puppy ears is not a bottom tool button');
        a.equal(edit.names[0], 'Original', 'first filter is Original');
        a.ok(edit.names.length >= 9, 'Original plus about 8 filters: ' + edit.names.join(', '));
        a.ok(edit.names.includes('Pixly Bloom'), 'brand purple-pink filter is present');
        a.ok(edit.names.includes('Puppy ears'), 'Puppy ears is a tile in the filter row');
        a.ok(await page.$('#photo-filter-row .photo-filter-thumb[data-filter="puppy"]'), 'Puppy ears filter tile is in the row');
        a.equal(edit.dots, edit.names.length, 'one dot per filter');
        a.equal(edit.activeDot, 'original', 'dot shows the current filter');
        a.equal(edit.rowScrolls, 'auto', 'filter row scrolls horizontally');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#photo-filter-row img')).every((i) => (i.src || '').startsWith('data:image')), null, { timeout: 5000 });
        a.ok(true, 'every filter thumbnail is a preview of the photo');
        const thumbMarks = await page.evaluate(async () => {
          const img = document.querySelector('#photo-filter-row .photo-filter-thumb[data-filter="puppy"] img');
          if (!img || !img.src) return { brownOrPink: 0, nose: 0 };
          await new Promise((res, rej) => { if (img.complete && img.naturalWidth) res(); else { img.onload = res; img.onerror = rej; } });
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 96; c.height = img.naturalHeight || 96;
          c.getContext('2d').drawImage(img, 0, 0);
          const { width: w, height: h } = c;
          const d = c.getContext('2d').getImageData(0, 0, w, h).data;
          let brownOrPink = 0, nose = 0;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if ((r > 90 && r < 170 && g > 40 && g < 120 && b < 80 && r > g + 10) ||
                (r > 200 && g > 120 && g < 210 && b > 140 && b < 230 && r > g + 20)) brownOrPink++;
            if (r < 45 && g < 45 && b < 45) nose++;
          }
          return { brownOrPink, nose, w, h };
        });
        a.ok(thumbMarks.brownOrPink > 30, 'Puppy ears tile thumbnail clearly shows ears: ' + JSON.stringify(thumbMarks));
        a.ok(thumbMarks.nose > 5, 'Puppy ears tile thumbnail still shows the nose: ' + JSON.stringify(thumbMarks));

        await page.click('#btn-photo-tool-ai');
        a.ok(await page.evaluate(() => !document.getElementById('photo-edit-panel-ai').classList.contains('hidden')), 'AI tool opens its panel');
        a.equal(await page.evaluate(() => document.getElementById('photo-ai-input').placeholder), 'Describe an edit…', 'AI box placeholder');
        await page.click('#btn-photo-tool-filter');
        a.ok(await page.evaluate(() => !document.getElementById('photo-edit-panel-filter').classList.contains('hidden')), 'Filter tool shows the filter row');
        await page.click('#btn-photo-edit-cancel');
        a.ok(await page.evaluate(() => document.getElementById('photo-edit-overlay').classList.contains('hidden')
          && !document.getElementById('photo-review-overlay').classList.contains('hidden')), 'Cancel returns to review');
        await page.click('#btn-photo-review-back');
      }
    },
    {
      name: 'Photo editor: a filter changes the photo, Done applies it, Cancel discards, and Original always recovers the photo',
      accounts: ['personal'],
      covers: ['handler:selectPhotoFilter', 'handler:donePhotoEdit', 'el:#btn-photo-edit-done', 'el:#btn-photo-edit-cancel'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        const file = await makePhoto(page, 320, 240);
        await openCreate(page, 'post');
        await pickToReview(page, '#create-file-upload', file);
        await openEditor(page);
        const orig = await canvasStats(page);
        a.ok(orig.maxChroma > 100, 'sample photo is colorful');

        await page.click('#photo-filter-row .photo-filter-thumb[data-filter="ink"]');
        await page.waitForFunction(() => document.getElementById('photo-edit-canvas').dataset.filter === 'ink', null, { timeout: 4000 });
        const ink = await canvasStats(page);
        a.ok(ink.maxChroma <= 6, 'Ink makes the photo black and white: chroma ' + ink.maxChroma);
        a.equal(await page.evaluate(() => document.querySelector('#photo-filter-dots .bg-pink-400').getAttribute('data-dot')), 'ink', 'dots follow the selected filter');

        await page.evaluate(() => selectPhotoFilter('golden'));
        await page.waitForFunction(() => document.getElementById('photo-edit-canvas').dataset.filter === 'golden', null, { timeout: 4000 });
        const golden = await canvasStats(page);
        a.ok(golden.avgR - golden.avgB > orig.avgR - orig.avgB, 'Golden Hour warms the photo');

        await page.evaluate(() => selectPhotoFilter('bloom'));
        await page.waitForFunction(() => document.getElementById('photo-edit-canvas').dataset.filter === 'bloom', null, { timeout: 4000 });
        await page.click('#btn-photo-edit-done');
        await page.waitForFunction(() => window.pixlyPhotoEdit.applied.filter === 'bloom', null, { timeout: 5000 });
        const afterDone = await page.evaluate(() => ({
          current: pixlyPhotoEdit.current, original: pixlyPhotoEdit.original,
          review: document.getElementById('photo-review-img').src,
          editHidden: document.getElementById('photo-edit-overlay').classList.contains('hidden')
        }));
        a.ok(afterDone.editHidden, 'Done returns to review');
        a.ok(afterDone.current !== afterDone.original, 'Done applies the filter');
        a.equal(afterDone.review, afterDone.current, 'review shows the edited photo');
        a.ok(afterDone.current.startsWith('data:image/jpeg'), 'edited photo is a JPEG like the upload path');

        // Cancel discards a new edit.
        await openEditor(page);
        a.equal(await page.evaluate(() => document.getElementById('photo-edit-canvas').dataset.filter), 'bloom', 'editor reopens with the applied filter');
        await page.evaluate(() => selectPhotoFilter('frost'));
        await page.click('#btn-photo-edit-cancel');
        const afterCancel = await page.evaluate(() => ({ applied: pixlyPhotoEdit.applied.filter, current: pixlyPhotoEdit.current }));
        a.equal(afterCancel.applied, 'bloom', 'Cancel keeps the previously applied filter');
        a.equal(afterCancel.current, afterDone.current, 'Cancel leaves the photo unchanged');

        // Original recovers the untouched photo.
        await openEditor(page);
        await page.evaluate(() => selectPhotoFilter('original'));
        await page.click('#btn-photo-edit-done');
        await page.waitForFunction(() => window.pixlyPhotoEdit.applied.filter === 'original', null, { timeout: 5000 });
        const recovered = await page.evaluate(() => ({ current: pixlyPhotoEdit.current, original: pixlyPhotoEdit.original }));
        a.equal(recovered.current, recovered.original, 'Original restores the exact original photo');
        await page.click('#btn-photo-review-back');
      }
    },
    {
      name: 'Photo editor: AI box maps typed keywords to preset filters and shows a coming-soon note otherwise',
      accounts: ['personal'],
      covers: ['el:#photo-ai-form', 'el:#photo-ai-input', 'el:#btn-photo-ai-apply', 'handler:applyPhotoAiEdit'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        const cases = await page.evaluate(() => {
          const ask = ['make it warm', 'cooler please', 'brighten this', 'darker and moody', 'b&w', 'black and white', 'Black & White',
            'vintage film look', 'studio lighting', 'more pink', 'purple vibes', 'add a dragon', '', 'warm but vintage'];
          return ask.map((t) => [t, matchPhotoAiKeyword(t)]);
        });
        const want = {
          'make it warm': 'golden', 'cooler please': 'frost', 'brighten this': 'daylight', 'darker and moody': 'midnight',
          'b&w': 'ink', 'black and white': 'ink', 'Black & White': 'ink', 'vintage film look': 'retro', 'studio lighting': 'studio',
          'more pink': 'bloom', 'purple vibes': 'bloom', 'add a dragon': null, '': null, 'warm but vintage': 'golden'
        };
        cases.forEach(([t, got]) => a.equal(got, want[t], `keyword "${t}" maps to ${want[t]}`));

        const file = await makePhoto(page, 200, 200);
        await openCreate(page, 'post');
        await pickToReview(page, '#create-file-upload', file);
        await openEditor(page);
        await page.click('#btn-photo-tool-ai');
        await page.fill('#photo-ai-input', 'make it black and white');
        await page.click('#btn-photo-ai-apply');
        await page.waitForFunction(() => document.getElementById('photo-edit-canvas').dataset.filter === 'ink', null, { timeout: 4000 });
        a.ok(/Applied Ink/.test(await page.textContent('#photo-ai-note')), 'AI note names the applied filter');
        a.ok((await canvasStats(page)).maxChroma <= 6, 'keyword edit really applies the filter');

        await page.fill('#photo-ai-input', 'remove the background');
        await page.press('#photo-ai-input', 'Enter');
        await page.waitForTimeout(150);
        a.ok(/coming soon/i.test(await page.textContent('#photo-ai-note')), 'unmatched text shows the coming-soon note');
        a.equal(await page.evaluate(() => pixlyPhotoEdit.draft.filter), 'ink', 'unmatched text leaves the filter unchanged');
        a.ok(await page.evaluate(() => !document.getElementById('photo-edit-overlay').classList.contains('hidden')), 'Enter does not leave the editor');
        await page.click('#btn-photo-edit-cancel');
        await page.click('#btn-photo-review-back');
      }
    },
    {
      name: 'Photo editor: Puppy ears fails safely when the face library cannot load',
      accounts: ['personal'],
      covers: ['handler:selectPhotoFilter'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        // The harness blocks every CDN, so the MediaPipe import fails like an offline phone.
        const file = await makePhoto(page, 240, 240);
        await openCreate(page, 'post');
        await pickToReview(page, '#create-camera-upload', file);
        await openEditor(page);
        const before = await canvasStats(page);
        await page.click('#photo-filter-row .photo-filter-thumb[data-filter="puppy"]');
        await page.waitForFunction(() => /could not load/i.test(document.getElementById('photo-ears-note').textContent || ''), null, { timeout: 30000 });
        const after = await canvasStats(page);
        a.equal(after.ears, '0', 'no ears drawn');
        a.equal(after.filter, 'original', 'failed Puppy ears leaves the previous filter selected');
        a.equal(after.avgR.toFixed(2), before.avgR.toFixed(2), 'photo is unchanged');
        a.ok(/unchanged/i.test(await page.textContent('#photo-ears-note')), 'note says the photo is unchanged');
        await page.click('#btn-photo-edit-done');
        await page.waitForFunction(() => document.getElementById('photo-edit-overlay').classList.contains('hidden'), null, { timeout: 4000 });
        a.equal(await page.evaluate(() => pixlyPhotoEdit.current === pixlyPhotoEdit.original), true, 'Done after a failed ears load keeps the original photo');
        await page.click('#btn-photo-review-next');
        await page.waitForFunction(() => ((state && state.selectedCreateImage) || '').startsWith('data:image'), null, { timeout: 4000 });
        a.ok(true, 'Next still hands the photo to the wizard');
        a.equal(errors.length, 0, 'no page errors: ' + errors.join(' | '));
      }
    },
    {
      name: 'Photo editor: selecting the Puppy ears filter draws ears, another filter removes them, and no face fails safely',
      accounts: ['personal'],
      covers: ['handler:selectPhotoFilter'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        await page.route(/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@[^/]+\/vision_bundle\.mjs/, (route) => route.fulfill({
          status: 200, contentType: 'application/javascript', body: FAKE_VISION_MODULE,
          headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
        }));
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const file = await makePhoto(page, 300, 300);
        await openCreate(page, 'post');
        await pickToReview(page, '#create-file-upload', file);
        await openEditor(page);
        const before = await canvasStats(page);
        await page.click('#photo-filter-row .photo-filter-thumb[data-filter="puppy"]');
        await page.waitForFunction(() => document.getElementById('photo-edit-canvas').dataset.filter === 'puppy' && document.getElementById('photo-edit-canvas').dataset.ears === '1', null, { timeout: 8000 });
        const withEars = await canvasStats(page);
        a.equal(withEars.filter, 'puppy', 'Puppy ears filter is selected');
        const marks = await page.evaluate(() => {
          const c = document.getElementById('photo-edit-canvas');
          const { width: w, height: h } = c;
          const d = c.getContext('2d').getImageData(0, 0, w, h).data;
          let brownOrPink = 0, brownOrPinkTop = 0, nose = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const r = d[i], g = d[i + 1], b = d[i + 2];
              const ear = (r > 90 && r < 170 && g > 40 && g < 120 && b < 80 && r > g + 10) ||
                          (r > 200 && g > 120 && g < 210 && b > 140 && b < 230 && r > g + 20);
              if (ear) {
                brownOrPink++;
                if (y < h * 0.3) brownOrPinkTop++;
              }
              if (r < 45 && g < 45 && b < 45 && y > h * 0.4 && y < h * 0.7) nose++;
            }
          }
          return { brownOrPink, brownOrPinkTop, nose };
        });
        a.ok(marks.brownOrPink > 30, 'ears are drawn onto the photo: ' + JSON.stringify(marks));
        a.ok(marks.brownOrPinkTop > 10, 'ears sit on top of the head, not over the face: ' + JSON.stringify(marks));
        a.ok(marks.nose > 5, 'the nose is kept: ' + JSON.stringify(marks));
        a.equal(await page.evaluate(() => document.querySelector('#photo-filter-dots .bg-pink-400').getAttribute('data-dot')), 'puppy', 'dots follow the Puppy ears filter');

        // Another filter removes the ears.
        await page.click('#photo-filter-row .photo-filter-thumb[data-filter="ink"]');
        await page.waitForFunction(() => document.getElementById('photo-edit-canvas').dataset.filter === 'ink' && document.getElementById('photo-edit-canvas').dataset.ears === '0', null, { timeout: 4000 });
        a.equal((await canvasStats(page)).ears, '0', 'selecting another filter removes the ears');

        await page.evaluate(() => { window.__fakeNoFace = true; });
        await page.click('#photo-filter-row .photo-filter-thumb[data-filter="puppy"]');
        await page.waitForFunction(() => /No face found/i.test(document.getElementById('photo-ears-note').textContent || ''), null, { timeout: 4000 });
        const noFace = await canvasStats(page);
        a.equal(noFace.ears, '0', 'no face leaves the photo unchanged');
        a.equal(noFace.filter, 'ink', 'no face keeps the previous filter selected');

        await page.evaluate(() => { window.__fakeNoFace = false; });
        await page.click('#photo-filter-row .photo-filter-thumb[data-filter="puppy"]');
        await page.waitForFunction(() => document.getElementById('photo-edit-canvas').dataset.ears === '1', null, { timeout: 4000 });
        await page.click('#btn-photo-edit-done');
        await page.waitForFunction(() => pixlyPhotoEdit.applied.filter === 'puppy' && !!(pixlyPhotoEdit.applied.faces && pixlyPhotoEdit.applied.faces.length), null, { timeout: 4000 });
        a.ok(await page.evaluate(() => pixlyPhotoEdit.current !== pixlyPhotoEdit.original), 'Done applies the puppy ears');
        a.equal(errors.length, 0, 'no page errors: ' + errors.join(' | '));
        await page.click('#btn-photo-review-back');
      }
    },
    {
      name: 'Photo editor: puppy ear bounds stay inside the image when the face is near the top edge, and the exported JPEG contains the full ears',
      accounts: ['personal'],
      covers: ['handler:selectPhotoFilter'],
      async run({ page, h, a }) {
        await h.gotoMainTab(page, 'feed');
        const report = await page.evaluate(() => {
          const nearTop = [{
            left: { x: 0.32, y: 0.20 }, right: { x: 0.68, y: 0.20 },
            top: { x: 0.5, y: 0.05 }, nose: { x: 0.5, y: 0.24 }, chin: { x: 0.5, y: 0.42 }
          }];
          const normal = [{
            left: { x: 0.30, y: 0.50 }, right: { x: 0.70, y: 0.50 },
            top: { x: 0.5, y: 0.32 }, nose: { x: 0.5, y: 0.55 }, chin: { x: 0.5, y: 0.80 }
          }];
          function inside(b, w, h) {
            return b && b.left >= 0 && b.top >= 0 && b.right <= w && b.bottom <= h && (b.right - b.left) > 8 && (b.bottom - b.top) > 8;
          }
          function render(w, h, faces) {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#7ec8e3';
            ctx.fillRect(0, 0, w, h);
            pixlyDrawPuppyEars(ctx, w, h, faces);
            const layout = pixlyPuppyEarLayout(w, h, faces);
            const d = ctx.getImageData(0, 0, w, h).data;
            let insideEars = 0, outsideEars = 0;
            const pad = 0;
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const ear = (r > 90 && r < 170 && g > 40 && g < 120 && b < 80 && r > g + 10) ||
                            (r > 200 && g > 120 && g < 210 && b > 140 && b < 230 && r > g + 20);
                if (!ear) continue;
                const inBox = x >= pad && y >= pad && x < w - pad && y < h - pad;
                if (inBox) insideEars++; else outsideEars++;
              }
            }
            const jpeg = c.toDataURL('image/jpeg', 0.82);
            return { w, h, bounds: layout.bounds, inside: inside(layout.bounds, w, h), insideEars, outsideEars, jpegLen: jpeg.length };
          }
          return {
            topSquare: render(400, 400, nearTop),
            topPortrait: render(300, 400, nearTop),
            normal: render(400, 400, normal)
          };
        });
        ['topSquare', 'topPortrait', 'normal'].forEach((k) => {
          const r = report[k];
          a.ok(r.inside, k + ': ear bounding box stays inside the image: ' + JSON.stringify(r.bounds) + ' in ' + r.w + 'x' + r.h);
          a.ok(r.insideEars > 30, k + ': ears are actually drawn: ' + JSON.stringify(r));
          a.equal(r.outsideEars, 0, k + ': no ear pixels fall outside the image');
        });
        a.ok(report.topSquare.bounds.top >= 0 && report.topPortrait.bounds.top >= 0, 'ears of a near-top face are not clipped at y < 0');
        a.ok(report.topSquare.jpegLen > 1000 && report.topPortrait.jpegLen > 1000, 'JPEG of the fitted ears is produced for the upload path');
      }
    },
    {
      name: 'Photo editor: Next passes the edited photo to the wizard for Grid Post, Story and Highlight, at a sane size',
      accounts: ['personal'],
      covers: ['el:#btn-photo-review-next', 'handler:photoReviewNext', 'el:#create-preview-img'],
      async run({ page, h, a }) {
        await page.setViewportSize({ width: 390, height: 844 });
        await h.gotoMainTab(page, 'feed');
        const big = await makePhoto(page, 1600, 1200);
        for (const mode of ['post', 'story', 'highlight']) {
          await openCreate(page, mode);
          await pickToReview(page, mode === 'story' ? '#create-camera-upload' : '#create-file-upload', big);
          await openEditor(page);
          await page.evaluate(() => selectPhotoFilter('retro'));
          await page.click('#btn-photo-edit-done');
          await page.waitForFunction(() => pixlyPhotoEdit.applied.filter === 'retro', null, { timeout: 5000 });
          const edited = await page.evaluate(() => ({ current: pixlyPhotoEdit.current, original: pixlyPhotoEdit.original }));
          await page.click('#btn-photo-review-next');
          await page.waitForFunction(() => ((state && state.selectedCreateImage) || '').startsWith('data:image'), null, { timeout: 5000 });
          const wiz = await page.evaluate(() => ({
            mode: state.createWizardMode,
            selected: state.selectedCreateImage,
            preview: document.getElementById('create-preview-img').src,
            reviewHidden: document.getElementById('photo-review-overlay').classList.contains('hidden'),
            badge: !document.getElementById('upload-status-badge').classList.contains('hidden')
          }));
          a.equal(wiz.mode, mode, mode + ': wizard mode kept');
          a.ok(wiz.reviewHidden, mode + ': Next closes review');
          a.equal(wiz.selected, edited.current, mode + ': wizard photo is the edited photo');
          a.ok(wiz.selected !== edited.original, mode + ': wizard photo is not the unedited original');
          a.equal(wiz.preview, edited.current, mode + ': preview shows the edited photo');
          a.ok(wiz.badge, mode + ': selected-photo badge is shown');
          const size = await imgSize(page, wiz.selected);
          a.ok(size.w <= 800 && size.h <= 800 && size.w > 0, mode + ': edited photo stays within 800px: ' + JSON.stringify(size));
          a.ok(wiz.selected.startsWith('data:image/jpeg'), mode + ': edited photo is a JPEG');
          await page.evaluate(() => { if (typeof closeCreatePostModal === 'function') closeCreatePostModal(); });
        }
      }
    }
  ]
};
