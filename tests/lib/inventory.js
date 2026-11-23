'use strict';

/**
 * Enumerate every user-facing interactive control in index.html.
 *
 * Stable keys (used by coverage):
 *   el:#id                  element with an id
 *   el:tag[onclick=fn]#n    static element without an id
 *   handler:fnName          onclick/handler used from a JS template
 *   listener:#id:event      addEventListener binding on a known id
 *   form:#id:submit         form submit
 *   href:url                outbound link
 *   nav:path                first-class navigation path
 *
 * New interactive markup in index.html shows up here automatically.
 * If coverage fails, add or update a test in tests/suites/.
 */

const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'label', 'summary']);

function attr(tag, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i');
  const m = tag.match(re);
  return m ? (m[2] !== undefined ? m[2] : m[3]) : '';
}

function hasAttr(tag, name) {
  return new RegExp('\\b' + name + '\\s*=', 'i').test(tag);
}

function fnFromHandler(expr) {
  if (!expr) return '';
  const s = String(expr).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const m = s.match(/(?:event\.(?:stopPropagation|preventDefault)\(\);\s*|return\s+)*(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/);
  return m ? m[1] : '';
}

function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

function collectStaticElements(html) {
  const markup = stripScripts(html);
  const items = [];
  const seenIds = new Map();
  const tagRe = /<\s*(button|a|input|select|textarea|label|form|summary|div|span|stripe-buy-button)(\s[^>]*)?>/gi;
  let m;
  while ((m = tagRe.exec(markup))) {
    const tagName = m[1].toLowerCase();
    const raw = m[0];
    if (/\bdisabled\b/i.test(raw) && tagName === 'script') continue;
    const id = attr(raw, 'id');
    const onclick = attr(raw, 'onclick');
    const onsubmit = attr(raw, 'onsubmit');
    const href = attr(raw, 'href');
    const type = (attr(raw, 'type') || (tagName === 'button' ? 'button' : '')).toLowerCase();
    const role = (attr(raw, 'role') || '').toLowerCase();
    const name = attr(raw, 'name') || attr(raw, 'aria-label') || attr(raw, 'title') || id || '';
    const isCustomInteractive = tagName === 'stripe-buy-button' ||
      (!!id && (/^(btn-|stat-|user-stat-|pixai-drag-handle|profile-avatar-container|user-profile-avatar-container)/.test(id) || (!!onclick && !/^modal-/.test(id))));
    const interactive = INTERACTIVE_TAGS.has(tagName) || role === 'button' || role === 'tab' || role === 'link' || tagName === 'form' || isCustomInteractive;
    if (!interactive) continue;
    // Skip purely decorative labels without for/id
    if (tagName === 'label' && !attr(raw, 'for') && !id && !onclick) continue;
    // Skip empty/hash-only anchors with no onclick and no id
    if (tagName === 'a' && (!href || href === '#') && !onclick && !id) continue;

    let key;
    if (id && !id.includes('${')) {
      const n = (seenIds.get(id) || 0) + 1;
      seenIds.set(id, n);
      key = n === 1 ? `el:#${id}` : `el:#${id}#${n}`;
    } else {
      const fn = fnFromHandler(onclick || onsubmit);
      key = `el:${tagName}[onclick=${fn || 'none'}]`;
    }
    items.push({
      key,
      kind: tagName === 'form' ? 'form' : (tagName === 'input' || tagName === 'select' || tagName === 'textarea' ? 'input' : 'control'),
      tag: tagName,
      id: id && !id.includes('${') ? id : '',
      type,
      href,
      onclick,
      onsubmit,
      fn: fnFromHandler(onclick || onsubmit),
      name,
      source: 'static'
    });
  }
  return items;
}

function collectTemplateHandlers(html) {
  const items = [];
  const seen = new Set();
  // onclick in JS template strings and HTML strings
  const re = /\bon(?:click|change|input|submit)\s*=\s*(?:"([^"]+)"|'([^']+)'|\\?["']([^"']+)\\?["'])/g;
  let m;
  while ((m = re.exec(html))) {
    const expr = m[1] || m[2] || m[3] || '';
    const fn = fnFromHandler(expr);
    if (!fn || fn === 'if' || fn === 'event') continue;
    const key = `handler:${fn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      kind: 'handler',
      tag: 'handler',
      id: '',
      type: '',
      href: '',
      onclick: expr,
      onsubmit: '',
      fn,
      name: fn,
      source: 'template'
    });
  }
  return items;
}

function collectListeners(html) {
  const items = [];
  const seen = new Set();
  const re = /(?:document\.)?getElementById\(\s*['"]([^'"]+)['"]\s*\)[\s\S]{0,180}?addEventListener\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const event = m[2];
    if (!id || id.includes('${')) continue;
    // Ignore purely lifecycle events on window/document-like
    if (['resize', 'pagehide', 'visibilitychange', 'DOMContentLoaded'].includes(event)) continue;
    const key = `listener:#${id}:${event}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      kind: 'listener',
      tag: 'listener',
      id,
      type: event,
      href: '',
      onclick: '',
      onsubmit: '',
      fn: '',
      name: `${id} ${event}`,
      source: 'listener'
    });
  }
  const bindRe = /\bbind\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
  while ((m = bindRe.exec(html))) {
    const id = m[1];
    const event = m[2];
    if (!id || id.includes('${')) continue;
    if (!new RegExp('\\bid\\s*=\\s*["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']').test(html)) continue;
    const key = `listener:#${id}:${event}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      kind: 'listener',
      tag: 'listener',
      id,
      type: event,
      href: '',
      onclick: '',
      onsubmit: '',
      fn: '',
      name: `${id} ${event}`,
      source: 'listener'
    });
  }
  return items;
}

function collectHrefs(html) {
  const items = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const markup = stripScripts(html);
  let m;
  while ((m = re.exec(markup))) {
    const href = m[1];
    if (!href || href === '#' || href.startsWith('javascript:') || href.includes('${')) continue;
    const key = `href:${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      kind: 'href',
      tag: 'a',
      id: attr(m[0], 'id'),
      type: 'link',
      href,
      onclick: attr(m[0], 'onclick'),
      onsubmit: '',
      fn: '',
      name: href,
      source: 'static'
    });
  }
  return items;
}

const NAV_PATHS = [
  { key: 'nav:auth:login', name: 'Auth: Log in tab', id: 'tab-auth-login' },
  { key: 'nav:auth:signup', name: 'Auth: Sign up tab', id: 'tab-auth-signup' },
  { key: 'nav:main:feed', name: 'Main: Feed', id: 'nav-btn-feed' },
  { key: 'nav:main:explore', name: 'Main: Explore', id: 'nav-btn-explore' },
  { key: 'nav:main:pixai', name: 'Main: Pixlynote AI', id: 'nav-btn-pixai' },
  { key: 'nav:main:create', name: 'Main: Create', id: 'nav-btn-create' },
  { key: 'nav:main:profile', name: 'Main: Profile', id: 'nav-btn-profile' },
  { key: 'nav:profile:posts', name: 'Owner profile: Posts tab', id: 'tab-btn-posts' },
  { key: 'nav:profile:notes', name: 'Owner profile: Notes tab', id: 'tab-btn-notes' },
  { key: 'nav:profile:replies', name: 'Owner profile: Replies tab', id: 'tab-btn-replies' },
  { key: 'nav:profile:saved', name: 'Owner profile: Saved tab', id: 'tab-btn-saved' },
  { key: 'nav:profile:likes', name: 'Owner profile: Likes tab', id: 'tab-btn-likes' },
  { key: 'nav:profile:saved-photos', name: 'Saved: Photos subtab', id: 'saved-subtab-photos' },
  { key: 'nav:profile:saved-notes', name: 'Saved: Notes subtab', id: 'saved-subtab-notes' },
  { key: 'nav:profile:likes-photos', name: 'Likes: Photos subtab', id: 'likes-subtab-photos' },
  { key: 'nav:profile:likes-notes', name: 'Likes: Notes subtab', id: 'likes-subtab-notes' },
  { key: 'nav:explore:posts', name: 'Explore: Posts tab', id: 'explore-tab-btn-posts' },
  { key: 'nav:explore:notes', name: 'Explore: Notes tab', id: 'explore-tab-btn-notes' },
  { key: 'nav:user-profile:posts', name: 'Visitor profile: Posts tab', id: 'user-tab-btn-posts' },
  { key: 'nav:user-profile:notes', name: 'Visitor profile: Notes tab', id: 'user-tab-btn-notes' },
  { key: 'nav:user-profile:replies', name: 'Visitor profile: Replies tab', id: 'user-tab-btn-replies' },
  { key: 'nav:gesture:pull-to-refresh', name: 'Gesture: pull down to refresh the feed or Explore', id: '' },
  { key: 'nav:shortcut:escape-closes-menus', name: 'Shortcut: Escape closes menus and confirmations', id: '' },
  { key: 'nav:shortcut:header-search-enter', name: 'Shortcut: Enter in header search opens Explore', id: 'header-search-input' },
  { key: 'nav:shortcut:story-reply-enter', name: 'Shortcut: Enter sends a story reply', id: 'story-reply-input' },
  { key: 'nav:shortcut:signup-email-code-enter', name: 'Shortcut: Enter verifies the signup email code', id: 'signup-email-code' },
  { key: 'nav:shortcut:signup-phone-code-enter', name: 'Shortcut: Enter verifies the signup phone code', id: 'signup-phone-code' }
];

function collectNavPaths() {
  return NAV_PATHS.map((p) => ({
    key: p.key,
    kind: 'nav',
    tag: 'nav',
    id: p.id,
    type: 'tab',
    href: '',
    onclick: '',
    onsubmit: '',
    fn: '',
    name: p.name,
    source: 'nav'
  }));
}

function buildInventory(html) {
  const staticItems = collectStaticElements(html);
  const handlers = collectTemplateHandlers(html);
  const listeners = collectListeners(html);
  const hrefs = collectHrefs(html);
  const nav = collectNavPaths();

  const byKey = new Map();
  function add(item) {
    if (!item.key) return;
    if (!byKey.has(item.key)) byKey.set(item.key, item);
  }
  // Prefer the richer static entry when keys collide with href/listener.
  staticItems.forEach(add);
  hrefs.forEach(add);
  listeners.forEach(add);
  handlers.forEach(add);
  nav.forEach(add);
  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

module.exports = {
  buildInventory,
  fnFromHandler,
  NAV_PATHS
};
