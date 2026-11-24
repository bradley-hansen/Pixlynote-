'use strict';

/**
 * Mobile header Beta label: on narrow widths, BETA stacks under the Pixlynote
 * wordmark as small light-gray uppercase text so the header does not overflow
 * horizontally. Desktop (sm+) keeps the inline violet pill.
 */

const { ALL_ACCOUNT_KEYS } = require('../helpers/harness');

const MOBILE_WIDTHS = [320, 360, 390, 412];
const MOBILE_HEIGHT = 844;
const DESKTOP_VIEWPORT = { width: 1024, height: 768 };
const DEFAULT_VIEWPORT = { width: 390, height: 844 };

function measureHeader() {
  const pill = document.getElementById('nav-beta-pill');
  const brand = document.getElementById('nav-brand-btn');
  const wordmark = brand && brand.querySelector('.brand-font');
  const header = document.querySelector('#main-view header') || document.querySelector('header');
  const headerRow = header && header.querySelector(':scope > div');
  const doc = document.documentElement;
  if (!pill || !brand || !wordmark) {
    return { missing: true, hasPill: !!pill, hasBrand: !!brand, hasWordmark: !!wordmark };
  }
  const pr = pill.getBoundingClientRect();
  const wr = wordmark.getBoundingClientRect();
  const br = brand.getBoundingClientRect();
  const hr = header ? header.getBoundingClientRect() : { right: 0, width: 0 };
  const cs = getComputedStyle(pill);
  const viewport = window.innerWidth;
  const docOverflow = Math.max(0, doc.scrollWidth - viewport, document.body.scrollWidth - viewport);
  const rowOverflow = headerRow ? Math.max(0, headerRow.scrollWidth - headerRow.clientWidth) : 0;
  const headerOverflow = header ? Math.max(0, header.scrollWidth - header.clientWidth) : 0;
  let farthestRight = 0;
  if (header) {
    const nodes = [header, ...header.querySelectorAll('*')];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (style.position === 'fixed' || style.position === 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) farthestRight = Math.max(farthestRight, r.right);
    }
  }
  // Stacked under the wordmark: the label starts at or below the wordmark's
  // bottom and horizontally overlaps the wordmark (not sitting beside it).
  const underWordmark =
    pr.top >= wr.bottom - 4 &&
    pr.bottom > wr.bottom &&
    pr.left < wr.right &&
    pr.right > wr.left;
  const inlineWithWordmark =
    pr.left >= wr.right - 2 &&
    Math.abs((pr.top + pr.height / 2) - (wr.top + wr.height / 2)) <= Math.max(10, wr.height / 2);
  const rgb = (cs.color || '').replace(/\s+/g, '');
  const bg = (cs.backgroundColor || '').replace(/\s+/g, '');
  return {
    missing: false,
    text: (pill.textContent || '').trim(),
    visible: pr.width > 0 && pr.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
    viewport,
    docScrollWidth: doc.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: doc.clientWidth,
    docOverflow,
    rowOverflow,
    headerOverflow,
    headerRight: hr.right,
    farthestRight,
    noHorizontalOverflow: docOverflow <= 1 && rowOverflow <= 1 && headerOverflow <= 1 && farthestRight <= viewport + 1 && hr.right <= viewport + 1,
    underWordmark,
    inlineWithWordmark,
    insideBrand: pr.left >= br.left - 1 && pr.right <= br.right + 1 && pr.top >= br.top - 1 && pr.bottom <= br.bottom + 1,
    fontSize: cs.fontSize,
    color: rgb,
    backgroundColor: bg,
    borderRadius: cs.borderRadius,
    pill: { top: round(pr.top), bottom: round(pr.bottom), left: round(pr.left), right: round(pr.right), w: round(pr.width), h: round(pr.height) },
    wordmark: { top: round(wr.top), bottom: round(wr.bottom), left: round(wr.left), right: round(wr.right), w: round(wr.width), h: round(wr.height) }
  };

  function round(n) { return Math.round(n * 10) / 10; }
}

async function snapshotAtWidth(page, width) {
  await page.setViewportSize({ width, height: MOBILE_HEIGHT });
  await page.waitForTimeout(80);
  return page.evaluate(measureHeader);
}

async function restoreViewport(page) {
  await page.setViewportSize(DEFAULT_VIEWPORT);
  await page.waitForTimeout(40);
}

async function showHeader(page, h) {
  await h.closeOverlays(page);
  await h.gotoMainTab(page, 'feed');
  await page.waitForTimeout(80);
}

function assertMobileLayout(a, layout, width) {
  a.ok(layout && !layout.missing, 'header wordmark and #nav-beta-pill are in the DOM at ' + width + 'px: ' + JSON.stringify(layout));
  a.ok(layout.visible, 'BETA is visible at ' + width + 'px');
  a.equal(layout.text.toLowerCase(), 'beta', 'BETA label text at ' + width + 'px');
  a.ok(layout.underWordmark, 'BETA is stacked under the wordmark at ' + width + 'px: ' + JSON.stringify(layout));
  a.ok(!layout.inlineWithWordmark, 'BETA is not inline beside the wordmark at ' + width + 'px: ' + JSON.stringify(layout));
  a.ok(layout.insideBrand, 'BETA stays inside the brand control at ' + width + 'px');
  a.ok(
    layout.noHorizontalOverflow,
    'no horizontal overflow at ' + width + 'px (scrollWidth <= viewport): ' + JSON.stringify({
      viewport: layout.viewport,
      docScrollWidth: layout.docScrollWidth,
      bodyScrollWidth: layout.bodyScrollWidth,
      docOverflow: layout.docOverflow,
      rowOverflow: layout.rowOverflow,
      headerOverflow: layout.headerOverflow,
      farthestRight: layout.farthestRight,
      headerRight: layout.headerRight
    })
  );
}

module.exports = {
  name: 'Beta pill mobile header layout',
  tests: [
    {
      name: 'Unit: BETA stacks under the wordmark with no horizontal overflow at 320, 360, 390 and 412px; desktop keeps the inline pill',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#nav-beta-pill', 'el:#nav-brand-btn'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await showHeader(page, h);
        try {
          for (const width of MOBILE_WIDTHS) {
            const layout = await snapshotAtWidth(page, width);
            assertMobileLayout(a, layout, width);
          }

          await page.setViewportSize(DESKTOP_VIEWPORT);
          await page.waitForTimeout(80);
          const desktop = await page.evaluate(measureHeader);
          a.ok(desktop && !desktop.missing && desktop.visible, 'BETA is visible on desktop');
          a.equal(desktop.text.toLowerCase(), 'beta', 'desktop BETA text');
          a.ok(desktop.inlineWithWordmark, 'desktop BETA stays inline beside the wordmark: ' + JSON.stringify(desktop));
          a.ok(!desktop.underWordmark, 'desktop BETA is not stacked under the wordmark: ' + JSON.stringify(desktop));
          a.ok(desktop.noHorizontalOverflow, 'no horizontal overflow on desktop: ' + JSON.stringify(desktop));
        } finally {
          await restoreViewport(page);
        }
      }
    },
    {
      name: 'E2E: on the signed-in feed, BETA renders under the wordmark and the document does not scroll horizontally at 320, 360, 390 and 412px',
      accounts: ALL_ACCOUNT_KEYS,
      covers: ['el:#nav-beta-pill', 'el:#nav-brand-btn', 'listener:#nav-brand-btn:click'],
      async run(ctx) {
        const { page, h, a } = ctx;
        await h.closeOverlays(page);
        await page.evaluate(() => {
          const btn = document.getElementById('btn-nav-feed') || document.getElementById('nav-feed-btn') || document.querySelector('[data-tab="feed"]');
          if (btn) btn.click();
          else if (typeof switchMainTab === 'function') switchMainTab('feed');
        });
        await page.waitForTimeout(120);
        const feedVisible = await page.evaluate(() => {
          const main = document.getElementById('main-view');
          if (!main) return false;
          const cs = getComputedStyle(main);
          return !main.classList.contains('hidden') && cs.display !== 'none';
        });
        a.ok(feedVisible, 'main app header is on screen');

        try {
          for (const width of MOBILE_WIDTHS) {
            await page.setViewportSize({ width, height: MOBILE_HEIGHT });
            await page.waitForTimeout(100);
            const layout = await page.evaluate(measureHeader);
            assertMobileLayout(a, layout, width);
            a.ok(
              layout.docScrollWidth <= layout.viewport + 1,
              'document.scrollWidth (' + layout.docScrollWidth + ') <= viewport (' + layout.viewport + ') at ' + width + 'px'
            );
          }

          await page.setViewportSize({ width: 390, height: MOBILE_HEIGHT });
          await page.waitForTimeout(60);
          const before = await page.evaluate(() => document.getElementById('nav-brand-btn') && true);
          a.ok(before, 'brand button is present before click');
          await page.click('#nav-brand-btn');
          await page.waitForTimeout(80);
          const stillVisible = await page.evaluate(measureHeader);
          a.ok(stillVisible && stillVisible.visible, 'BETA remains visible after tapping the wordmark');
          a.ok(stillVisible.underWordmark, 'BETA stays under the wordmark after tapping the brand');
        } finally {
          await restoreViewport(page);
        }
      }
    }
  ]
};
