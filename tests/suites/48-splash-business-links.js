'use strict';

/**
 * Splash Digital AssetPro lockup at the bottom of the signed-out landing
 * page is a single outbound link. The destination lives only on
 * #splash-business-link (SPLASH_BUSINESS_LINK_HREF).
 */

const SPLASH_BUSINESS_HREF = 'https://digitalassetpro.io';

module.exports = {
  name: 'Splash business links',
  tests: [
    {
      name: 'Splash: Digital AssetPro lockup at the bottom links out in a new tab',
      accounts: ['signed-out'],
      covers: ['el:#splash-business-link', 'href:https://digitalassetpro.io'],
      async run(ctx) {
        const { page, h, a } = ctx;
        // Prior signed-out tests on the shared page may have opened login/signup
        // and hidden the splash. Return via the real splash path first.
        await page.evaluate(() => {
          if (typeof setAuthMode === 'function') setAuthMode('splash');
        });
        await page.waitForTimeout(80);
        a.ok(await h.isVisible(page, '#splash-container'), 'Splash is visible when signed out');
        a.ok(await h.isVisible(page, '#splash-business-link'), 'Digital AssetPro lockup link is visible');
        const info = await page.evaluate(() => {
          const link = document.getElementById('splash-business-link');
          if (!link) return { missing: true };
          const img = link.querySelector('img');
          const cs = getComputedStyle(link);
          const text = (link.textContent || '').replace(/\s+/g, ' ').trim();
          return {
            href: link.getAttribute('href'),
            target: link.getAttribute('target'),
            rel: link.getAttribute('rel') || '',
            text,
            hasLogo: !!(img && /Digital AssetPro/i.test(img.getAttribute('alt') || '')),
            textDecoration: cs.textDecorationLine || cs.textDecoration,
            insideSplash: !!(link.closest('#splash-container')),
            afterButtons: !!(link.compareDocumentPosition(document.getElementById('btn-splash-login')) & Node.DOCUMENT_POSITION_PRECEDING)
          };
        });
        a.ok(!info.missing, 'splash-business-link is in the document');
        a.equal(info.href, SPLASH_BUSINESS_HREF, 'href is the isolated Digital AssetPro site');
        a.equal(info.target, '_blank', 'opens in a new tab');
        a.ok(/\bnoopener\b/.test(info.rel) && /\bnoreferrer\b/.test(info.rel), 'rel includes noopener and noreferrer (got ' + info.rel + ')');
        a.ok(info.hasLogo, 'Digital AssetPro logo is inside the link');
        a.ok(/Digital Asset\s*Pro/i.test(info.text), 'Digital AssetPro wordmark is inside the link');
        a.ok(info.insideSplash, 'link is on the splash page');
        a.ok(info.afterButtons, 'link sits at the bottom of the splash, after the login button');
        a.ok(!/underline/i.test(String(info.textDecoration)), 'existing look is kept (no underline): ' + info.textDecoration);
      }
    }
  ]
};
