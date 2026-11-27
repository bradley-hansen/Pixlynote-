'use strict';

/**
 * Shared test harness: local static server, Playwright page, Firebase/Worker
 * mocks, and account fixtures. No production Firestore writes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const TW_PATH = path.join(__dirname, '../vendor/tailwind-3.4.17.js');
const JSZIP_PATH = path.join(__dirname, '../vendor/jszip-3.10.1.min.js');
const VERIFY_CODE = '123456';

const ACCOUNTS = {
  personal: {
    key: 'personal',
    username: 'reg_personal',
    fullName: 'Reg Personal',
    accountType: 'personal',
    email: 'reg.personal@example.test',
    phone: '5555550101',
    password: 'TestPass123!',
    hasContent: true
  },
  business: {
    key: 'business',
    username: 'reg_business',
    fullName: 'Reg Business',
    accountType: 'business',
    email: 'reg.business@example.test',
    phone: '5555550102',
    password: 'TestPass123!',
    hasContent: true
  },
  empty: {
    key: 'empty',
    username: 'reg_empty',
    fullName: 'Reg Empty',
    accountType: 'personal',
    email: 'reg.empty@example.test',
    phone: '5555550103',
    password: 'TestPass123!',
    hasContent: false
  },
  pixlynote: {
    key: 'pixlynote',
    username: 'pixlynote',
    fullName: 'Pixlynote',
    accountType: 'business',
    email: 'pixlynote@example.test',
    phone: '5555550104',
    password: 'TestPass123!',
    hasContent: true
  }
};

const ALL_ACCOUNT_KEYS = ['personal', 'business', 'empty', 'pixlynote'];

function resolvePlaywright() {
  const candidates = [
    path.join(REPO, 'node_modules/playwright-core'),
    '/workspace/pixlynote/test/node_modules/playwright-core'
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.js')) || fs.existsSync(path.join(c, 'package.json'))) return c;
  }
  throw new Error('playwright-core not found. Run npm install in the repo root.');
}

function chromePath() {
  return process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROME || '/usr/bin/google-chrome';
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = u === '/' ? '/index.html' : u;
    const file = path.normalize(path.join(REPO, rel));
    if (!file.startsWith(REPO)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function isFirestoreWrite(req) {
  const u = req.url();
  const m = req.method();
  if (!/firestore\.googleapis\.com|firebaseio\.com/i.test(u)) return false;
  if (/DELETE|PUT|PATCH/.test(m)) return true;
  if (/POST/.test(m) && /:(commit|write|rollback|beginTransaction)\b|:commit|:write/i.test(u)) return true;
  return false;
}

function mockWorker(req) {
  let body = '';
  try { body = req.postData() || ''; } catch (e) {}
  let json = {};
  try { json = body ? JSON.parse(body) : {}; } catch (e) {}
  const u = req.url();
  const pathPart = u.replace(/^https?:\/\/[^/]+/, '');
  const code = String(json.code || json.token || '');
  if (/\/email\/signup-verify|\/email\/reset-verify/i.test(pathPart)) {
    return { valid: code === VERIFY_CODE, debug_code: VERIFY_CODE };
  }
  if (/\/sms\/check/i.test(pathPart)) {
    return { valid: code === VERIFY_CODE, debug_code: VERIFY_CODE };
  }
  if (/\/sms\/send/i.test(pathPart)) {
    return { ok: true, debug_code: VERIFY_CODE };
  }
  if (/\/email/i.test(pathPart)) {
    return { ok: true, debug_code: VERIFY_CODE };
  }
  if (/verify-stripe-session/i.test(pathPart)) {
    return { valid: false, status: 'unpaid' };
  }
  if (/\/cancel-subscription-at-period-end/i.test(pathPart)) {
    // Default: simulate the live worker, which does not have this route yet.
    return { error: 'not_found' };
  }
  if (/\/cancel-subscription(?:\?|$)/i.test(pathPart) || /\/cancel-subscription$/i.test(pathPart.split('?')[0])) {
    return { ok: true, canceled: true, status: 'canceled', test: true };
  }
  if (/\/business-verification\/submit/i.test(pathPart)) {
    return { ok: true, status: 'pending', submittedAt: Date.now(), einCheck: { checked: true, match: false, nameMatch: false, formatOk: true, source: 'propublica' } };
  }
  if (/\/business-verification\/status/i.test(pathPart)) {
    return { status: 'pending', adminNote: '', submittedAt: Date.now(), updatedAt: Date.now() };
  }
  if (/\/business-verification\/admin\/list/i.test(pathPart)) {
    return { ok: true, applications: [] };
  }
  if (/\/business-verification\/admin\/view/i.test(pathPart)) {
    return { ok: true, application: { username: 'reg_business', status: 'pending', einCheck: { checked: true, match: false, nameMatch: false } } };
  }
  if (/\/business-verification\/admin\/decision/i.test(pathPart)) {
    let dec = 'pending';
    try { dec = (json.decision || 'approve'); } catch (e) {}
    const status = dec === 'approve' ? 'approved' : (dec === 'reject' ? 'rejected' : 'more_info');
    return { ok: true, status, username: json.username || '' };
  }
  if (/\/business-verification\/ein-check/i.test(pathPart)) {
    return { ok: true, einCheck: { checked: true, match: true, nameMatch: true, formatOk: true, source: 'propublica', organizationName: 'Example Org' } };
  }
  return { ok: true, debug_code: VERIFY_CODE };
}

async function attachRoutes(context, port, writeLog) {
  const tw = fs.readFileSync(TW_PATH);
  const jszip = fs.readFileSync(JSZIP_PATH);
  await context.route('**/*', async (route) => {
    const req = route.request();
    const u = req.url();
    if (isFirestoreWrite(req)) {
      writeLog.push({ type: 'write-blocked', method: req.method(), url: u.slice(0, 200) });
      return route.abort();
    }
    if (u.startsWith('http://127.0.0.1:' + port) || u.startsWith('data:') || u.startsWith('blob:')) {
      return route.continue();
    }
    if (/cdn\.tailwindcss\.com/.test(u)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: tw,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    if (/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/|cdn\.jsdelivr\.net\/npm\/jszip@/i.test(u)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: jszip,
        headers: {
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        }
      });
    }
    if (/brad-g-hansen\.workers\.dev|PIXLYNOTE_VERIFY|PIXLYNOTE_API/i.test(u) || /workers\.dev/.test(u)) {
      const data = mockWorker(req);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    // Block production Firebase, Gemini, fonts, Stripe.js — tests stay deterministic and local.
    if (/gstatic\.com|googleapis\.com|firebaseio\.com|firebase|generativelanguage|js\.stripe\.com|fonts\.google/i.test(u)) {
      return route.abort();
    }
    return route.abort();
  });
}

const INIT_SCRIPT = `
  window.__PIXLY_REGRESSION = true;
  window.__pixlyDeleteCalls = [];
  // Listener audit: record which addEventListener bindings on elements with an id actually fire
  // (key listener:#id:event, same as tests/lib/inventory.js). A recorder is added right after the
  // app's own listener, so it only records; it never changes what the app does.
  (function () {
    try {
      var fired = new Set();
      var recorders = new Map();
      var origAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, fn, opts) {
        var out = origAdd.apply(this, arguments);
        try {
          if (this && this.nodeType === 1 && this.id && typeof type === 'string') {
            var key = 'listener:#' + this.id + ':' + type;
            var rec = recorders.get(key);
            if (!rec) { rec = function () { fired.add(key); }; recorders.set(key, rec); }
            origAdd.call(this, type, rec);
          }
        } catch (e) {}
        return out;
      };
      window.__firedListenersTake = function () { var a = Array.from(fired); fired.clear(); return a; };
    } catch (e) {}
  })();
`;

async function installAppStubs(page) {
  await page.evaluate(() => {
    const stub = function (username) {
      window.__pixlyDeleteCalls.push(username || '');
    };
    window.permanentlyDeleteAccount = stub;
    if (typeof permanentlyDeleteAccount === 'function') {
      try { permanentlyDeleteAccount = stub; } catch (e) {}
    }
    // Never talk to production Firebase from these tests.
    window.firebaseReady = false;
    if (window.firebase) {
      const block = async () => { throw new Error('firebase blocked in regression suite'); };
      ['setDoc', 'updateDoc', 'deleteDoc', 'addDoc', 'writeBatch', 'runTransaction'].forEach((k) => {
        if (window.firebase[k]) window.firebase[k] = block;
      });
    }
  });
}

async function waitForApp(page) {
  await page.waitForFunction(() => typeof performLogin === 'function' && window.state, null, { timeout: 45000 });
  await installAppStubs(page);
}

function tinyPng() {
  // 1x1 png
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

async function seedAccountsStore(page) {
  await page.evaluate((accounts) => {
    const map = {};
    for (const a of accounts) {
      const rec = {
        username: a.username,
        fullName: a.fullName,
        email: a.email,
        phone: a.phone,
        accountType: a.accountType,
        password: a.password,
        bio: a.username === 'pixlynote' ? 'The official Pixlynote account' : ('Bio for ' + a.fullName),
        link: 'https://example.test/' + a.username
      };
      map[a.username.toLowerCase()] = rec;
      try {
        localStorage.setItem('pixly_account_' + a.username.toLowerCase(), JSON.stringify(rec));
        localStorage.setItem('pixly_user_password_' + a.username.toLowerCase(), a.password);
      } catch (e) {}
    }
    try { localStorage.setItem('pixly_accounts', JSON.stringify(map)); } catch (e) {}
    window._pixlyAccounts = Object.assign({}, window._pixlyAccounts || {}, map);
  }, Object.values(ACCOUNTS));
}

async function seedContent(page, account) {
  const img = tinyPng();
  await page.evaluate(({ account, img }) => {
    const u = account.username;
    const name = account.fullName;
    if (!state.posts) state.posts = [];
    if (!state.notes) state.notes = [];
    if (!state.explorePosts) state.explorePosts = [];
    if (!state.likedPostIds) state.likedPostIds = new Set();
    if (!state.savedPostIds) state.savedPostIds = new Set();
    if (!state.likedNoteIds) state.likedNoteIds = new Set();
    if (!state.savedNoteIds) state.savedNoteIds = new Set();
    if (!state.likedOrder) state.likedOrder = [];
    if (!Array.isArray(state.following)) state.following = [];

    const mkPost = (id, author, authorName, caption, extra) => Object.assign({
      id,
      author,
      authorName,
      authorAvatar: img,
      location: 'Test City',
      image: img,
      caption,
      tags: ['#test'],
      likes: 0,
      isLiked: false,
      timestamp: '1 MIN AGO',
      comments: [{ id: Number(id) * 10 + 1, user: 'alice_test', text: 'Nice shot' }]
    }, extra || {});
    const mkNote = (id, author, authorName, text, extra) => Object.assign({
      id,
      author,
      authorName,
      authorAvatar: img,
      text,
      time: '1m ago',
      likes: 0,
      isLiked: false,
      replies: 1,
      comments: [{ id: Number(id) * 10 + 1, user: 'alice_test', text: 'Great note', replies: [] }]
    }, extra || {});

    // Explore-range (non-seed) items used by likes/saves tests.
    const exploreA = mkPost(2123, 'explore_alice', 'Explore Alice', 'Explore photo A');
    const exploreB = mkPost(2144, 'explore_bob', 'Explore Bob', 'Explore photo B');
    const ownPost = mkPost(3001, u, name, 'My own photo');
    const ownNote = mkNote(9001, u, name, 'My own note');
    const exploreNoteA = mkNote(9101, 'explore_alice', 'Explore Alice', 'Explore note A');
    const exploreNoteB = mkNote(9102, 'explore_bob', 'Explore Bob', 'Explore note B');

    const addPost = (p) => {
      if (!state.posts.some((x) => String(x.id) === String(p.id))) state.posts.push(p);
      if (!state.explorePosts.some((x) => String(x.id) === String(p.id)) && Number(p.id) >= 2000) state.explorePosts.push(p);
    };
    const addNote = (n) => {
      if (!state.notes.some((x) => String(x.id) === String(n.id))) state.notes.push(n);
    };

    addPost(exploreA);
    addPost(exploreB);
    addPost(ownPost);
    addNote(ownNote);
    addNote(exploreNoteA);
    addNote(exploreNoteB);

    if (account.hasContent) {
      // One reply-like note authored as a reply if the app uses parentId
      addNote(mkNote(9201, u, name, 'A reply from me', { parentId: 9101, isReply: true }));
    }

    // Discover directory: one already-connected, two unconnected.
    state.following = [{ username: 'connected_user', fullName: 'Connected User', avatar: img, isFollowing: true }];
    const dirUsers = new Map();
    [
      { username: 'connected_user', fullName: 'Connected User', bio: 'Already connected', avatar: img, accountType: 'personal' },
      { username: 'fresh_creator', fullName: 'Fresh Creator', bio: 'Brand new here', avatar: img, accountType: 'personal' },
      { username: 'another_new', fullName: 'Another New', bio: 'Also new', avatar: img, accountType: 'personal' }
    ].forEach((rec) => {
      dirUsers.set(rec.username, Object.assign({
        likedPostIds: [], likedNoteIds: [], deletedNoteIds: [], deletedPostIds: [], following: [], deactivated: false
      }, rec));
    });
    window._exploreUserDir = { users: dirUsers, notes: new Map() };
    window._explorePostBatches = window._explorePostBatches || [];
    state.likedPostIds = state.likedPostIds instanceof Set ? state.likedPostIds : new Set(state.likedPostIds || []);
    state.savedPostIds = state.savedPostIds instanceof Set ? state.savedPostIds : new Set(state.savedPostIds || []);
    state.likedNoteIds = state.likedNoteIds instanceof Set ? state.likedNoteIds : new Set(state.likedNoteIds || []);
    state.savedNoteIds = state.savedNoteIds instanceof Set ? state.savedNoteIds : new Set(state.savedNoteIds || []);
    state.deletedPostIds = state.deletedPostIds instanceof Set ? state.deletedPostIds : new Set(state.deletedPostIds || []);
    state.deletedNoteIds = state.deletedNoteIds instanceof Set ? state.deletedNoteIds : new Set(state.deletedNoteIds || []);
    state.deletedReplyIds = state.deletedReplyIds instanceof Set ? state.deletedReplyIds : new Set(state.deletedReplyIds || []);
    state.likedStoryIds = state.likedStoryIds instanceof Set ? state.likedStoryIds : new Set(state.likedStoryIds || []);

    // A local story so the viewer can open.
    state.stories = state.stories || [];
    if (!state.stories.some((s) => String(s.id) === 'story-reg-1')) {
      state.stories.push({
        id: 'story-reg-1',
        author: u,
        authorName: name,
        authorAvatar: img,
        image: img,
        caption: 'Regression story',
        createdAt: Date.now(),
        viewers: [],
        comments: []
      });
    }
  }, { account, img });
}

async function loginAs(page, account) {
  await seedAccountsStore(page);
  await page.evaluate((account) => {
    if (typeof window.permanentlyDeleteAccount === 'function') {
      const stub = function (u) { (window.__pixlyDeleteCalls || (window.__pixlyDeleteCalls = [])).push(u || ''); };
      window.permanentlyDeleteAccount = stub;
    }
    const authView = document.getElementById('auth-view');
    const mainView = document.getElementById('main-view');
    if (authView) { authView.classList.add('hidden'); authView.style.display = 'none'; }
    if (mainView) { mainView.classList.remove('hidden'); mainView.style.display = 'flex'; }
    try {
      localStorage.setItem('pixly_is_logged_in', '1');
      localStorage.setItem('pixly_active_username', account.username);
    } catch (e) {}
    state.isLoggedIn = true;
    if (typeof performLogin === 'function') {
      performLogin(account.username, account.fullName, account.email, null, account.phone, account.accountType);
    }
    state.currentUser = Object.assign({}, state.currentUser || {}, {
      username: account.username,
      fullName: account.fullName,
      accountType: account.accountType,
      email: account.email,
      phone: account.phone,
      bio: account.username === 'pixlynote' ? 'The official Pixlynote account' : ('Bio for ' + account.fullName)
    });
  }, account);
  await seedContent(page, account);
  await page.evaluate(() => {
    try { if (typeof switchMainTab === 'function') switchMainTab('profile'); } catch (e) { console.warn('switchMainTab', e); }
    try { if (typeof renderProfile === 'function') renderProfile(); } catch (e) { console.warn('renderProfile', e); }
    try { if (typeof renderFeed === 'function') renderFeed(); } catch (e) { console.warn('renderFeed', e); }
  });
  // Hide welcome toasts so they don't cover headers.
  await hideToasts(page);
}

async function hideToasts(page) {
  await page.evaluate(() => {
    const toast = document.getElementById('toast');
    if (toast) {
      // Hide with the same classes showToast uses. Do not set display:none (`.flex` is
      // `display:flex !important`, and hiding #toast-text alone leaves an empty black pill)
      // and do not leave sticky !important inline styles that would block later toasts.
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
      toast.style.removeProperty('opacity');
      toast.style.removeProperty('visibility');
      toast.style.removeProperty('pointer-events');
      toast.style.removeProperty('display');
      try { clearTimeout(window._toastTimeout); } catch (e) {}
    }
    document.querySelectorAll('[class*="toast"], [id*="toast"]').forEach((el) => {
      if (el.id === 'toast' || el.id === 'toast-text' || el.id === 'toast-action') return;
      if ((el.textContent || '').length < 120) el.style.display = 'none';
    });
    [...document.querySelectorAll('body *')].forEach((el) => {
      if (el.id === 'toast' || el.id === 'toast-text' || el.id === 'toast-action') return;
      if (toast && toast.contains(el)) return;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && /Welcome back/i.test(n.textContent || ''));
      if (own && (el.textContent || '').trim().length < 80) el.style.display = 'none';
    });
  });
}

async function openLoginForm(page) {
  await page.evaluate(() => {
    if (typeof setAuthMode === 'function') setAuthMode('login');
    const splash = document.getElementById('splash-container');
    const auth = document.getElementById('auth-card-container');
    if (splash) splash.style.display = 'none';
    if (auth) { auth.classList.remove('hidden'); auth.style.display = ''; }
    const login = document.getElementById('auth-login-container');
    const signup = document.getElementById('auth-signup-container');
    if (login) { login.classList.remove('hidden'); login.style.display = ''; }
    if (signup) signup.classList.add('hidden');
  });
}

async function openSignupForm(page) {
  await page.evaluate(() => {
    if (typeof setAuthMode === 'function') setAuthMode('signup');
    const splash = document.getElementById('splash-container');
    const auth = document.getElementById('auth-card-container');
    if (splash) splash.style.display = 'none';
    if (auth) { auth.classList.remove('hidden'); auth.style.display = ''; }
    const login = document.getElementById('auth-login-container');
    const signup = document.getElementById('auth-signup-container');
    if (signup) { signup.classList.remove('hidden'); signup.style.display = ''; }
    if (login) login.classList.add('hidden');
  });
}

async function isVisible(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (el.classList.contains('hidden') || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, sel);
}

async function closeOverlays(page) {
  await page.evaluate(() => {
    const closers = [
      'closeProfileMenu', 'closeEditProfileModal', 'closePostDetailModal', 'closeNoteDetailModal',
      'closePixaiModal', 'closeMessagesModal', 'closeDmShareModal', 'closeDiscoverCreatorsModal',
      'closeSubscriptionModal', 'closeTermsPoliciesModal', 'closeCreatePostModal', 'closeEditContentModal', 'closeHelpCenterModal', 'closeDisconnectConfirm'
    ];
    closers.forEach((fn) => {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
    });
    document.querySelectorAll('[id^="modal-"], [id$="-dropdown"], [id$="-sheet"], [id$="-backdrop"], #menu-disconnect-confirm').forEach((el) => {
      if (!el || el.id === 'main-view' || el.id === 'auth-view') return;
      el.classList.add('hidden');
      if (el.style) el.style.display = 'none';
    });
    const drawer = document.getElementById('modal-profile-drawer');
    if (drawer) { drawer.classList.add('hidden'); drawer.style.display = 'none'; }
  });
  await hideToasts(page);
}

async function gotoMainTab(page, tab) {
  await page.evaluate((tab) => {
    if (typeof switchMainTab === 'function') switchMainTab(tab);
  }, tab);
}

async function openOwnerMenu(page) {
  await gotoMainTab(page, 'profile');
  // switchMainTab calls closeProfileMenu(), which hides the drawer after 300ms.
  // Wait that out so the delayed hide cannot close the menu we are about to open.
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const fn = window.openProfileMenu || (typeof openProfileMenu === 'function' ? openProfileMenu : null);
    if (fn) fn();
    const modal = document.getElementById('modal-profile-drawer');
    const card = document.getElementById('profile-drawer-card');
    const backdrop = document.getElementById('profile-drawer-backdrop');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
    if (backdrop) {
      backdrop.classList.remove('opacity-0');
      backdrop.classList.add('opacity-100');
    }
    if (card) {
      card.classList.remove('translate-x-full');
      card.classList.add('translate-x-0');
    }
  });
  await page.waitForTimeout(200);
}

async function openEditProfile(page) {
  await gotoMainTab(page, 'profile');
  await page.evaluate(() => {
    if (typeof openEditProfileModal === 'function') openEditProfileModal();
  });
  await page.waitForTimeout(150);
}

async function launchSession(opts) {
  const port = opts.port || Number(process.env.REGRESSION_PORT || 8091);
  const writeLog = [];
  const { chromium } = require(resolvePlaywright());
  const server = await startServer(port);
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  return { browser, server, port, writeLog, close: async () => { await browser.close(); server.close(); } };
}

async function newPage(session, viewport) {
  const ctx = await session.browser.newContext({
    viewport: viewport || { width: 390, height: 844 },
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });
  await attachRoutes(ctx, session.port, session.writeLog);
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', (err) => page._errors.push(String(err)));
  await page.addInitScript(INIT_SCRIPT);
  return page;
}

async function loadApp(page, session) {
  await page.goto('http://127.0.0.1:' + session.port + '/index.html?cb=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });
  await waitForApp(page);
  await seedAccountsStore(page);
}

async function resetMembershipFlags(page) {
  await page.evaluate(() => {
    if (!(window.state && state.currentUser)) return;
    const cur = state.currentUser;
    cur.isPlus = false;
    cur.isVerified = false;
    cur.isBusinessPlus = false;
    cur.subscriptionStatus = 'inactive';
    cur.stripeCancelAtPeriodEnd = false;
    delete cur.stripeSessionId;
    delete cur.stripeSubscriptionId;
    delete cur.stripeCustomerId;
    delete cur.stripeBusinessSessionId;
    delete cur.stripeBusinessSubscriptionId;
    delete cur.stripeCurrentPeriodEnd;
    if (typeof persistCurrentUserSubscription === 'function') persistCurrentUserSubscription();
  });
}

async function clearLoginSession(page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem('pixly_is_logged_in');
      localStorage.removeItem('pixly_active_username');
      localStorage.removeItem('pixlynote_user');
      localStorage.removeItem('pixly_session_accounts');
    } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
  });
}

// Reload into a signed-out splash so later signed-out tests can open the auth forms.
async function resetToSignedOut(page, session) {
  await clearLoginSession(page);
  await loadApp(page, session);
  const stillIn = await page.evaluate(() => !!(window.state && state.isLoggedIn)).catch(() => false);
  if (stillIn) {
    await clearLoginSession(page);
    await page.evaluate(() => {
      try { if (typeof performLogout === 'function') performLogout(); } catch (e) {}
    });
    await loadApp(page, session);
  }
}

module.exports = {
  ACCOUNTS,
  ALL_ACCOUNT_KEYS,
  VERIFY_CODE,
  REPO,
  resolvePlaywright,
  chromePath,
  launchSession,
  newPage,
  loadApp,
  clearLoginSession,
  resetMembershipFlags,
  resetToSignedOut,
  loginAs,
  seedContent,
  seedAccountsStore,
  openLoginForm,
  openSignupForm,
  isVisible,
  closeOverlays,
  gotoMainTab,
  openOwnerMenu,
  openEditProfile,
  hideToasts,
  installAppStubs,
  tinyPng
};
