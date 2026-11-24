#!/usr/bin/env node
'use strict';
// One preview screenshot of the db-lockdown build as @reg_personal, using the regression harness
// (Firebase blocked; any Firestore write is recorded and fails the run). Usage: node tools/db-lockdown/screenshot.js <out.png>
const path = require('path');
const h = require('../../tests/helpers/harness');
(async () => {
  const out = path.resolve(process.argv[2] || 'db-lockdown-preview.png');
  const session = await h.launchSession({ port: Number(process.env.REGRESSION_PORT || 8098) });
  try {
    const page = await h.newPage(session);
    await h.loadApp(page, session);
    await h.loginAs(page, h.ACCOUNTS.personal);
    await page.evaluate(() => { if (typeof switchMainTab === 'function') switchMainTab('feed'); });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({ user: state.currentUser && state.currentUser.username, guard: typeof window.installPixlyDataGuard === 'function' && !!window.pixlyGuard }));
    await page.screenshot({ path: out });
    console.log(JSON.stringify({ out, user: info.user, guardLoaded: info.guard, firestoreWrites: session.writeLog.length, pageErrors: page._errors.length }));
  } finally { await session.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
