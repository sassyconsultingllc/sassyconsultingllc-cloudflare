// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// Visual-parity + audit snapshotter.
//   node snap.mjs --out <dir> [--theme none|original|fall] [--widths 390,1280]
//                 [--pages /,/store.html] [--shots] [--base http://localhost:8787]
// Writes <out>/<width>__<slug>.json (and .png with --shots).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const has = (k) => process.argv.includes('--' + k);
const BASE = arg('base', 'http://localhost:8787');
const OUT = arg('out');
const THEME = arg('theme', 'none');
const WIDTHS = String(arg('widths', '390,1280')).split(',').map(Number);
const SHOTS = has('shots');
const LIVE = has('live');          // do not freeze animations (for screenshots of leaves)
const REPO = arg('repo', process.cwd());
const CHROME = arg('chrome', process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');
if (!OUT) { console.error('--out required'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const SKIP = new Set(['browser-info.html', 'privacy-policy.html']); // 0s meta-refresh redirects
function listPages() {
  const root = path.join(REPO, 'public');
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'status') walk(p); continue; }
      if (!e.name.endsWith('.html')) continue;
      const rel = path.relative(root, p).replace(/\\/g, '/');
      if (SKIP.has(rel)) continue;
      out.push(rel === 'index.html' ? '/' : '/' + rel);
    }
  };
  walk(root);
  return out.sort();
}
const PAGES = arg('pages') ? String(arg('pages')).split(',') : listPages();
const slug = (u) => (u === '/' ? 'index' : u.replace(/^\//, '').replace(/\.html$/, '').replace(/\//g, '__'));

// Third parties that render nondeterministically. Fonts and icon CSS stay — they
// change metrics, so both runs must have them.
const BLOCK = [/challenges\.cloudflare\.com/, /lemonsqueezy\.com/, /googletagmanager|google-analytics/];

const collect = () => {
  const vw = document.documentElement.clientWidth;
  // ---- colour normalisation: every colour token -> rgba(r,g,b,a) ----
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const fmt = (r, g, b, a) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${(+a).toFixed(2)})`;
  const normOne = (s) => {
    let m;
    if ((m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/))) {
      let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]);
      return fmt(m[1], m[2], m[3], a);
    }
    if ((m = s.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+%?))?\s*\)$/))) {
      let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]);
      return fmt(clamp(+m[1], 0, 1) * 255, clamp(+m[2], 0, 1) * 255, clamp(+m[3], 0, 1) * 255, a);
    }
    return s;
  };
  const norm = (s) => (s || '').replace(/(rgba?\([^)]*\)|color\(srgb[^)]*\))/g, (t) => normOne(t.trim()));
  const parse = (s) => { const m = normOne(s).match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/); return m ? [+m[1], +m[2], +m[3], +m[4]] : null; };

  // ---- stable-ish element path ----
  const seg = (el) => {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    let i = 1; for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === el.tagName) i++;
    const cls = [...el.classList].filter(c => !/^(is-|js-|sc-)/.test(c)).slice(0, 2).join('.');
    return `${tag}${cls ? '.' + cls : ''}:${i}`;
  };
  const pathOf = (el) => { const p = []; for (let e = el; e && e !== document.body; e = e.parentElement) { p.unshift(seg(e)); if (e.id) break; } return p.join('>'); };

  const COLOR_PROPS = ['color', 'backgroundColor', 'backgroundImage', 'boxShadow', 'textShadow', 'fill', 'stroke', 'outlineColor', 'textDecorationColor', 'caretColor'];
  const pick = (cs) => {
    const o = {};
    for (const p of COLOR_PROPS) { const v = cs[p]; if (v && v !== 'none' && v !== 'auto') o[p] = norm(v); }
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none') o[`border${side}Color`] = norm(cs[`border${side}Color`]);
    }
    o.opacity = cs.opacity;
    o.font = `${cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()}|${cs.fontSize}|${cs.fontWeight}`;
    return o;
  };

  const els = {};
  const skip = (el) => el.closest('[data-seasonal]') || /^(SCRIPT|STYLE|NOSCRIPT|META|LINK|TEMPLATE|BR)$/.test(el.tagName);
  for (const el of document.body.querySelectorAll('*')) {
    if (skip(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    const rec = { r: [r.left, r.top + scrollY, r.width, r.height].map(n => Math.round(n * 2) / 2), s: pick(cs) };
    for (const pe of ['::before', '::after']) {
      const ps = getComputedStyle(el, pe);
      if (ps.content && ps.content !== 'none' && ps.content !== 'normal' && ps.display !== 'none') rec[pe] = pick(ps);
    }
    let key = pathOf(el); while (els[key]) key += '+';
    els[key] = rec;
  }
  // body/html themselves
  els['::html'] = { r: [0, 0, 0, 0], s: pick(getComputedStyle(document.documentElement)) };
  els['::body'] = { r: [0, 0, 0, 0], s: pick(getComputedStyle(document.body)) };

  // ---- overflow / sideways scroll ----
  const excused = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.position === 'fixed') return true; if (p !== el && /auto|scroll|hidden|clip/.test(c.overflowX)) return true; } return false; };
  const overflow = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > vw + 1 || r.left < -1) && !excused(el)) {
      if (el.classList.contains('skip-link')) continue;
      overflow.push({ p: pathOf(el), l: Math.round(r.left), r: Math.round(r.right) });
    }
  }
  const sx0 = scrollX; window.scrollTo({ left: 500, behavior: 'instant' }); const sideways = scrollX; window.scrollTo({ left: sx0, behavior: 'instant' });

  // ---- WCAG contrast on elements that own visible text ----
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a); };
  const effBg = (el) => {
    const stack = []; let approx = false;
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e);
      if (c.backgroundImage && c.backgroundImage !== 'none' && e !== document.documentElement) approx = true;
      const bg = parse(c.backgroundColor); if (bg && bg[3] > 0) { stack.push(bg); if (bg[3] >= 1) break; }
    }
    let col = [255, 255, 255, 1]; // canvas default
    for (let i = stack.length - 1; i >= 0; i--) col = over(stack[i], col);
    return { col, approx };
  };
  const fails = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (skip(el)) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.right < 0 || r.left > vw) continue; // off-canvas (skip links etc.)
    if (cs.webkitTextFillColor && /rgba\(0, 0, 0, 0\)|transparent/.test(cs.webkitTextFillColor)) continue; // gradient-clipped text
    const fg = parse(cs.color); if (!fg) continue;
    const { col: bg, approx } = effBg(el);
    const f = over(fg, bg);
    const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
    if (ratio < need) fails.push({ p: pathOf(el), t: el.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2), need, fg: normOne(cs.color), bg: fmt(...bg.slice(0, 3), 1), approx });
  }

  // ---- gutters: content-box left inset of each top-level landmark (non-fixed) ----
  const gutters = [];
  for (const el of document.querySelectorAll('body > :is(nav, header, section, main, footer, div), main > :is(section, footer, div.wrap, div.container)')) {
    if (skip(el)) continue;
    const c = getComputedStyle(el); if (c.position === 'fixed' || c.display === 'none') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.width < vw * 0.6) continue;
    // where the first text-bearing descendant actually starts
    let first = null;
    for (const d of el.querySelectorAll('h1,h2,h3,p,span,a,li,label,input,button,table')) {
      const dr = d.getBoundingClientRect(); const dc = getComputedStyle(d);
      if (dr.width && dr.height && dc.visibility !== 'hidden' && !d.closest('[data-seasonal]') && dc.textAlign !== 'center' && getComputedStyle(d.parentElement).textAlign !== 'center') { first = Math.round(dr.left); break; }
    }
    gutters.push({ p: pathOf(el), pad: Math.round(r.left + parseFloat(c.paddingLeft) + parseFloat(c.borderLeftWidth)), text: first });
  }

  return { vw, scrollW: document.documentElement.scrollWidth, sideways, theme: document.documentElement.dataset.theme || null,
           overflow, contrastFails: fails, gutters, elements: els };
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars', '--font-render-hinting=none'] });
const summary = [];
try {
  for (const w of WIDTHS) {
    for (const u of PAGES) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
      await page.setRequestInterception(true);
      page.on('request', (rq) => (BLOCK.some(re => re.test(rq.url())) ? rq.abort() : rq.continue()));
      await page.evaluateOnNewDocument((theme, live) => {
        try { if (theme !== 'none') localStorage.setItem('sc-theme', theme); else localStorage.removeItem('sc-theme'); } catch (e) {}
        try { sessionStorage.setItem('sc-theme-hint-shown', '1'); } catch (e) {}
        if (!live) {
          const css = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}';
          const add = () => { const s = document.createElement('style'); s.setAttribute('data-harness', ''); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
          if (document.head) add(); else document.addEventListener('DOMContentLoaded', add, { once: true });
        }
      }, THEME, LIVE);
      let err = null;
      try {
        await page.goto(BASE + u, { waitUntil: 'networkidle2', timeout: 45000 });
        await page.evaluate(() => document.fonts && document.fonts.ready);
        await new Promise(r => setTimeout(r, LIVE ? 2500 : 400));
        const data = await page.evaluate(collect);
        data.url = u; data.width = w; data.requested = THEME;
        const file = path.join(OUT, `${w}__${slug(u)}.json`);
        fs.writeFileSync(file, JSON.stringify(data));
        if (SHOTS) await page.screenshot({ path: path.join(OUT, `${w}__${slug(u)}.png`), fullPage: true });
        summary.push({ w, u, theme: data.theme, els: Object.keys(data.elements).length, overflow: data.overflow.length, sideways: data.sideways, contrastFails: data.contrastFails.length });
      } catch (e) { err = String(e.message || e); summary.push({ w, u, error: err }); }
      await page.close();
    }
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 1));
for (const s of summary) console.log(s.error ? `ERR  ${s.w} ${s.u}  ${s.error}` : `${String(s.w).padEnd(5)} ${s.u.padEnd(36)} theme=${s.theme ?? '-'} els=${s.els} overflow=${s.overflow} sideways=${s.sideways} contrastFails=${s.contrastFails}`);
