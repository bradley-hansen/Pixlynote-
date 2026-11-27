'use strict';

const FILE_IDS = [
  'bizver-file-articles',
  'bizver-file-tax-letter',
  'bizver-file-address-proof',
  'bizver-file-photo-id'
];

module.exports = {
  name: 'Verification upload feedback',
  tests: [
    {
      name: 'Business verification file pickers show Attached: filename (size) with a green check, an error for rejected files, and clear the feedback when the selection is cleared',
      accounts: ['business'],
      covers: [
        'el:#bizver-file-articles',
        'el:#bizver-file-tax-letter',
        'el:#bizver-file-address-proof',
        'el:#bizver-file-photo-id',
        'el:#bizver-file-articles-status',
        'el:#bizver-file-tax-letter-status',
        'el:#bizver-file-address-proof-status',
        'el:#bizver-file-photo-id-status',
        'handler:handleVerificationFilePicked',
        'handler:formatVerificationFileSize',
        'handler:setVerificationFileFeedback',
        'handler:clearVerificationFileFeedback',
        'handler:fileTooLarge',
        'listener:#bizver-file-articles:change',
        'listener:#bizver-file-tax-letter:change',
        'listener:#bizver-file-address-proof:change',
        'listener:#bizver-file-photo-id:change'
      ],
      async run(ctx) {
        const { page, a } = ctx;
        const r = await page.evaluate(async () => {
          function statusOf(id) {
            const el = document.getElementById(id + '-status');
            if (!el) return { missing: true };
            const hidden = el.classList.contains('hidden');
            return {
              missing: false,
              hidden,
              text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(),
              aria: el.getAttribute('aria-label') || '',
              green: /\btext-emerald-700\b/.test(el.className),
              red: /\btext-rose-700\b/.test(el.className),
              hasCheck: !!(el.querySelector('span') && (el.querySelector('span').textContent || '').indexOf('✓') !== -1)
            };
          }
          function attach(id, file) {
            const input = document.getElementById(id);
            const dt = new DataTransfer();
            if (file) dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return { hasFile: !!(input.files && input.files[0]), name: (input.files[0] && input.files[0].name) || '' };
          }
          function clearInput(id) {
            const input = document.getElementById(id);
            input.value = '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }

          if (typeof openBusinessVerificationModal === 'function') openBusinessVerificationModal();

          const sizes = {
            b: formatVerificationFileSize(200),
            kbSmall: formatVerificationFileSize(1536),
            kb: formatVerificationFileSize(2048),
            mb: formatVerificationFileSize(1.5 * 1024 * 1024)
          };

          const before = {};
          ['bizver-file-articles','bizver-file-tax-letter','bizver-file-address-proof','bizver-file-photo-id'].forEach(function (id) { before[id] = statusOf(id); });

          const pdf = new File([new Uint8Array([37, 80, 68, 70, 45, 49])], 'articles.pdf', { type: 'application/pdf' });
          const jpg = new File([new Uint8Array(120000)], 'utility-bill.jpg', { type: 'image/jpeg' });
          const png = new File([new Uint8Array(80000)], 'photo-id.png', { type: 'image/png' });
          const heic = new File([new Uint8Array(2048)], 'scan.heic', { type: 'image/heic' });

          const attached = {
            articles: attach('bizver-file-articles', pdf),
            tax: attach('bizver-file-tax-letter', heic),
            address: attach('bizver-file-address-proof', jpg),
            photo: attach('bizver-file-photo-id', png)
          };
          const afterAttach = {
            articles: statusOf('bizver-file-articles'),
            tax: statusOf('bizver-file-tax-letter'),
            address: statusOf('bizver-file-address-proof'),
            photo: statusOf('bizver-file-photo-id')
          };

          const expected = {
            articles: 'Attached: articles.pdf (' + formatVerificationFileSize(pdf.size) + ')',
            tax: 'Attached: scan.heic (' + formatVerificationFileSize(heic.size) + ')',
            address: 'Attached: utility-bill.jpg (' + formatVerificationFileSize(jpg.size) + ')',
            photo: 'Attached: photo-id.png (' + formatVerificationFileSize(png.size) + ')'
          };

          const badType = new File([new Uint8Array(16)], 'notes.txt', { type: 'text/plain' });
          const typePick = attach('bizver-file-tax-letter', badType);
          const afterType = statusOf('bizver-file-tax-letter');

          const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.pdf', { type: 'application/pdf' });
          const sizePick = attach('bizver-file-address-proof', big);
          const afterSize = statusOf('bizver-file-address-proof');

          clearInput('bizver-file-articles');
          const afterClearArticles = statusOf('bizver-file-articles');

          attach('bizver-file-photo-id', png);
          if (typeof clearBusinessVerificationSensitiveFields === 'function') clearBusinessVerificationSensitiveFields();
          else if (typeof clearVerificationFileFeedback === 'function') {
            ['bizver-file-articles','bizver-file-tax-letter','bizver-file-address-proof','bizver-file-photo-id'].forEach(function (id) {
              const el = document.getElementById(id); if (el) el.value = '';
            });
            clearVerificationFileFeedback();
          }
          const afterReset = {
            articles: statusOf('bizver-file-articles'),
            tax: statusOf('bizver-file-tax-letter'),
            address: statusOf('bizver-file-address-proof'),
            photo: statusOf('bizver-file-photo-id'),
            photoEmpty: !((document.getElementById('bizver-file-photo-id') || {}).files || [])[0]
          };

          const govOrgHasFile = !!(document.querySelector('#modal-verification-request input[type="file"]'));

          if (typeof closeBusinessVerificationModal === 'function') {
            window._businessVerificationFromCheckout = false;
            closeBusinessVerificationModal();
          }

          return { sizes, before, attached, afterAttach, expected, typePick, afterType, sizePick, afterSize, afterClearArticles, afterReset, govOrgHasFile };
        });

        a.equal(r.sizes.b, '200 B', 'Bytes are formatted as B');
        a.equal(r.sizes.kbSmall, '1.5 KB', 'Small KB sizes keep one decimal');
        a.equal(r.sizes.kb, '2 KB', 'Exact KB values drop a trailing .0');
        a.equal(r.sizes.mb, '1.5 MB', 'Megabyte sizes are formatted');

        FILE_IDS.forEach((id) => {
          a.ok(!r.before[id].missing, id + '-status exists');
          a.ok(r.before[id].hidden, id + ' feedback is hidden before a file is chosen');
        });

        a.ok(r.attached.articles.hasFile && r.attached.tax.hasFile && r.attached.address.hasFile && r.attached.photo.hasFile, 'Valid files stay selected');
        ['articles', 'tax', 'address', 'photo'].forEach((key) => {
          const s = r.afterAttach[key];
          a.ok(!s.hidden, key + ': feedback is shown');
          a.ok(s.green && s.hasCheck, key + ': green check is shown');
          a.equal(s.text, '✓ ' + r.expected[key], key + ': Attached text includes the filename and size');
          a.equal(s.aria, r.expected[key], key + ': aria-label is the Attached text');
        });

        a.ok(!r.typePick.hasFile, 'A rejected type is cleared from the input');
        a.ok(!r.afterType.hidden && r.afterType.red && !r.afterType.hasCheck, 'Rejected type shows a red error');
        a.ok(/PDF, JPG, PNG, or HEIC/i.test(r.afterType.text), 'Type error mentions PDF, JPG, PNG, or HEIC: ' + r.afterType.text);

        a.ok(!r.sizePick.hasFile, 'An over-10 MB file is cleared from the input');
        a.ok(!r.afterSize.hidden && r.afterSize.red, 'Oversize file shows a red error');
        a.ok(/10 MB/i.test(r.afterSize.text), 'Oversize error mentions 10 MB: ' + r.afterSize.text);

        a.ok(r.afterClearArticles.hidden && !r.afterClearArticles.text, 'Clearing the selection hides the feedback');
        a.ok(r.afterReset.photoEmpty, 'clearBusinessVerificationSensitiveFields clears the file input');
        FILE_IDS.forEach((id) => {
          const key = id.replace('bizver-file-', '').replace('-proof', '').replace('-letter', '');
          const s = r.afterReset[id.replace('bizver-file-', '').replace('tax-letter', 'tax').replace('address-proof', 'address').replace('photo-id', 'photo')];
          a.ok(s.hidden, 'Feedback is cleared after sensitive fields are reset: ' + id);
        });
        a.ok(!r.govOrgHasFile, 'Government/Organization request form has no file pickers to update');
      }
    }
  ]
};
