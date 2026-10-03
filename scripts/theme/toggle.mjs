// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// node scripts/theme/toggle.mjs [--pages /,/store.html,...] [--base http://localhost:8787]
// Behavioural tests for seasonal.js on real pages. Prints PASS/FAIL per check.
import puppeteer from 'puppeteer-core';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8787');
const PAGES = arg('pages', '/').split(',');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BLOCK = [/challenges\.cloudflare\.com/, /lemonsqueezy\.com/];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
async function open(url, { width = 1280, mobile = false, reduced = false, fresh = true, ctx } = {}) {
  const page = await (ctx || browser).newPage();
  await page.setViewport({ width, height: 900, isMobile: mobile, hasTouch: mobile });
  await page.setRequestInterception(true);
  page.on('request', rq => (BLOCK.some(re => re.test(rq.url())) ? rq.abort() : rq.continue()));
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (fresh) await page.evaluateOnNewDocument(() => { try { if (window.top !== window) return; if (!sessionStorage.getItem('__t')) { localStorage.clear(); sessionStorage.setItem('__t', '1'); } } catch (e) {} });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 45000 });
  page.__errors = errors;
  return page;
}
const theme = (p) => p.evaluate(() => document.documentElement.dataset.theme);
const stored = (p) => p.evaluate(() => localStorage.getItem('sc-theme'));
async function hold(p, ms, { moveBy = 0 } = {}) {
  const box = await p.evaluate(() => { const el = document.querySelector('[data-theme-toggle]'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down();
  if (moveBy) { await sleep(150); await p.mouse.move(box.x + moveBy, box.y + moveBy, { steps: 4 }); }
  await sleep(ms); await p.mouse.up(); await sleep(150);
}

for (const url of PAGES) {
  console.log(`\n=== ${url} ===`);
  const ctx = await browser.createBrowserContext();
  const p = await open(url, { ctx });
  check('default theme is fall', (await theme(p)) === 'fall');
  const t = await p.evaluate(() => { const el = document.querySelector('[data-theme-toggle]'); if (!el) return null; return { role: el.getAttribute('role'), tab: el.getAttribute('tabindex'), title: el.getAttribute('title'), text: el.textContent.trim().slice(0, 60), visible: el.getBoundingClientRect().width > 0 }; });
  check('toggle element exists, visible, contains (c)', !!t && t.visible && /\u00a9/.test(t.text), t ? `"${t.text}"` : 'missing');
  check('toggle enhanced: role=button tabindex=0 title', !!t && t.role === 'button' && t.tab === '0' && /hold/i.test(t.title || ''));
  const leaves = await p.evaluate(() => document.querySelectorAll('.sc-leaves .sc-leaf').length);
  check('desktop leaves rendered (14)', leaves === 14, `got ${leaves}`);
  const leafBehind = await p.evaluate(() => { const l = document.querySelector('.sc-leaves'); return l ? getComputedStyle(l).zIndex : null; });
  check('leaf layer is behind content (z -1)', leafBehind === '-1', `z=${leafBehind}`);

  await hold(p, 200);
  check('short press does not switch', (await theme(p)) === 'fall');
  await hold(p, 900, { moveBy: 30 });
  check('drag during hold cancels', (await theme(p)) === 'fall');
  await hold(p, 900);
  check('long press switches to original', (await theme(p)) === 'original');
  check('choice persisted', (await stored(p)) === 'original');
  const toast = await p.evaluate(() => { const el = document.querySelector('.sc-toast'); return el ? { on: el.classList.contains('sc-toast-on'), text: el.textContent } : null; });
  check('toast shown with next-step hint', !!toast && toast.on && /Original theme/.test(toast.text) && /Fall/.test(toast.text), toast ? `"${toast.text}"` : 'none');
  check('leaves removed in original', (await p.evaluate(() => !document.querySelector('.sc-leaves'))));
  const metaColor = await p.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
  check('theme-color meta present', !!metaColor, metaColor);

  // cross-tab sync
  const p2 = await open(url, { ctx, fresh: false });
  check('second tab opens in persisted original', (await theme(p2)) === 'original');
  await p.bringToFront();
  await p.evaluate(() => { const el = document.querySelector('[data-theme-toggle]'); el.focus(); });
  await p.keyboard.down('Enter'); await sleep(900); await p.keyboard.up('Enter'); await sleep(200);
  check('keyboard hold (Enter) switches back to fall', (await theme(p)) === 'fall');
  await sleep(300);
  check('other tab synced to fall via storage event', (await theme(p2)) === 'fall');

  await p.reload({ waitUntil: 'networkidle2' });
  check('reload keeps fall', (await theme(p)) === 'fall');
  await p.goto(BASE + url + (url.includes('?') ? '&' : '?') + 'theme=original', { waitUntil: 'networkidle2' });
  check('?theme=original applies', (await theme(p)) === 'original');
  check('?theme= is stripped from the URL', !(await p.evaluate(() => location.search.includes('theme='))));
  check('no page errors', p.__errors.length === 0 && p2.__errors.length === 0, [...p.__errors, ...p2.__errors].join(' | '));
  await ctx.close();

  const ctxM = await browser.createBrowserContext();
  const m = await open(url, { ctx: ctxM, width: 390, mobile: true });
  const ml = await m.evaluate(() => document.querySelectorAll('.sc-leaves .sc-leaf').length);
  check('mobile leaves rendered (7)', ml === 7, `got ${ml}`);
  const tapHold = await m.evaluate(async () => {
    const el = document.querySelector('[data-theme-toggle]'); el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); const x = r.left + 5, y = r.top + r.height / 2;
    const o = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    await new Promise(r => setTimeout(r, 500)); el.dispatchEvent(cm);
    await new Promise(r => setTimeout(r, 400)); el.dispatchEvent(new PointerEvent('pointerup', o));
    return { theme: document.documentElement.dataset.theme, ctxMenuBlocked: cm.defaultPrevented };
  });
  check('touch long-press switches on mobile', tapHold.theme === 'original');
  check('Android context menu suppressed during hold', tapHold.ctxMenuBlocked);
  await ctxM.close();

  const ctxR = await browser.createBrowserContext();
  const r = await open(url, { ctx: ctxR, reduced: true });
  check('reduced motion: no leaves', await r.evaluate(() => !document.querySelector('.sc-leaves')));
  check('reduced motion: still fall theme', (await theme(r)) === 'fall');
  await ctxR.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
