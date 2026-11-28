'use strict';

const fs = require('fs');
const path = require('path');

const SHOT = '/workspace/pixlynote/tos-update/shots/tos-sections-8-9-footer.png';

const HEADINGS = [
  '1. ACCEPTANCE OF TERMS',
  '2. ELIGIBILITY & ACCOUNT SECURITY',
  '3. SUBSCRIPTIONS & BILLING',
  '4. ACCOUNT DEACTIVATION & DELETION',
  '5. BUSINESS ACCOUNTS & ASSOCIATION',
  '6. GOVERNMENT & ORGANIZATION VERIFICATION',
  '7. INTELLECTUAL PROPERTY OWNERSHIP',
  '8. LIMITATION OF LIABILITY',
  '9. SERVICE AVAILABILITY, MODIFICATION & DISCONTINUATION',
  '10. CHANGES TO THESE TERMS'
];

const SECTION_9_TEXT = 'Pixlynote reserves the right, at its sole discretion, to modify, suspend, or permanently discontinue the platform, or any feature or subscription tier thereof, at any time, for any reason (including operational, financial, or legal reasons), with or without prior notice. Digital AssetPro LLC (doing business as Pixlynote) shall not be liable to you or any third party for any modification, suspension, or discontinuation of the Service. In the event of a permanent shutdown, active recurring subscriptions will be canceled to prevent future charges, and any unearned subscription fees or data export windows will be handled in accordance with applicable law.';

function readTosFromSource() {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const start = html.indexOf('id="policy-section-tos"');
  const end = html.indexOf('id="policy-section-guidelines"');
  return start >= 0 && end > start ? html.slice(start, end) : '';
}

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

module.exports = {
  name: 'Terms of Service update',
  tests: [
    {
      name: 'ToS update: Unit: source has headings 1-10 in order, exact section 9 text, footer, and November 28, 2026',
      accounts: ['personal'],
      covers: ['el:#policy-section-tos', 'el:#modal-terms-policies'],
      async run(ctx) {
        const { a } = ctx;
        const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
        const tos = readTosFromSource();
        a.ok(tos, 'ToS section is present in index.html');
        const headings = [];
        const re = /<h4[^>]*>([^<]+)<\/h4>/g;
        let m;
        while ((m = re.exec(tos))) headings.push(decode(m[1]).replace(/\s+/g, ' ').trim());
        a.equal(headings.length, 10, 'ToS has exactly 10 section headings: ' + JSON.stringify(headings));
        HEADINGS.forEach((want, i) => {
          a.equal(headings[i], want, 'Heading ' + (i + 1) + ' is ' + want);
        });
        const pRe = /<h4[^>]*>\s*9\.\s*SERVICE AVAILABILITY[\s\S]*?<\/h4>\s*<p>([\s\S]*?)<\/p>/;
        const pMatch = tos.match(pRe);
        a.ok(pMatch, 'Section 9 body paragraph is present');
        a.equal(decode(pMatch[1]).replace(/\s+/g, ' ').trim(), SECTION_9_TEXT, 'Section 9 body text is exact');
        a.ok(/Last updated:\s*November 28, 2026/.test(html), 'Last updated November 28, 2026 is in the file');
        a.ok(/Digital AssetPro LLC d\/b\/a Pixlynote/.test(html), 'Footer uses Digital AssetPro LLC d/b/a Pixlynote');
        a.ok(!/Pixlynote Inc\./.test(html), 'Pixlynote Inc. is no longer in index.html');
        a.ok(/Canceling stops future charges and is not a refund/.test(tos)
          && /keep Plus or Business Plus until the end of the period/.test(tos),
          'Section 3 still describes cancel-at-period-end and no refunds');
      }
    },
    {
      name: 'ToS update: E2E: modal shows headings 1-10 in order, exact section 9 text, footer, and date',
      accounts: ['personal'],
      covers: ['el:#modal-terms-policies', 'el:#policy-section-tos', 'el:#btn-policy-tab-tos', 'handler:openTermsPoliciesModal', 'handler:switchPolicyTab', 'handler:closeTermsPoliciesModal'],
      async run(ctx) {
        const { page, a } = ctx;
        const got = await page.evaluate(() => {
          if (typeof openTermsPoliciesModal === 'function') openTermsPoliciesModal('tos');
          const modal = document.getElementById('modal-terms-policies');
          const tos = document.getElementById('policy-section-tos');
          const headings = Array.from((tos || document).querySelectorAll('h4')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
          const h9 = Array.from((tos || document).querySelectorAll('h4')).find((el) => /9\.\s*SERVICE AVAILABILITY/i.test(el.textContent || ''));
          const section9 = h9 && h9.parentElement ? (h9.parentElement.querySelector('p') || {}).textContent || '' : '';
          const footer = (modal && modal.querySelector('.border-t')) ? (modal.querySelector('.border-t').innerText || '') : (modal && modal.innerText) || '';
          return {
            open: !!(modal && !modal.classList.contains('hidden') && (modal.style.display === 'flex' || getComputedStyle(modal).display !== 'none')),
            headings,
            section9: section9.replace(/\s+/g, ' ').trim(),
            footer: footer.replace(/\s+/g, ' ').trim(),
            modalText: ((modal && modal.innerText) || '').replace(/\s+/g, ' ')
          };
        });
        a.ok(got.open, 'Terms & Policies modal opens on the ToS tab');
        a.equal(got.headings.length, 10, 'Rendered ToS has 10 headings: ' + JSON.stringify(got.headings));
        HEADINGS.forEach((want, i) => {
          a.equal(got.headings[i], want, 'Rendered heading ' + (i + 1) + ' is ' + want);
        });
        a.equal(got.section9, SECTION_9_TEXT, 'Rendered section 9 text is exact');
        a.ok(/November 28, 2026/.test(got.footer) || /November 28, 2026/.test(got.modalText), 'Modal shows Last updated November 28, 2026');
        a.ok(/Digital AssetPro LLC d\/b\/a Pixlynote/.test(got.footer) || /Digital AssetPro LLC d\/b\/a Pixlynote/.test(got.modalText), 'Modal footer shows Digital AssetPro LLC d/b/a Pixlynote');
        a.ok(!/Pixlynote Inc\./.test(got.modalText), 'Modal no longer says Pixlynote Inc.');

        await page.evaluate(() => {
          if (typeof switchPolicyTab === 'function') switchPolicyTab('tos');
          const heads = Array.from(document.querySelectorAll('#policy-section-tos h4'));
          const eighth = heads[7];
          if (eighth) eighth.scrollIntoView({ block: 'start', inline: 'nearest' });
        });
        await page.waitForTimeout(400);
        const card = page.locator('#modal-terms-policies > div').first();
        fs.mkdirSync(path.dirname(SHOT), { recursive: true });
        await card.screenshot({ path: SHOT });
        a.ok(fs.existsSync(SHOT) && fs.statSync(SHOT).size > 1000, 'Mobile screenshot of sections 8-9 and the footer was saved');

        await page.evaluate(() => { if (typeof closeTermsPoliciesModal === 'function') closeTermsPoliciesModal(); });
      }
    }
  ]
};
