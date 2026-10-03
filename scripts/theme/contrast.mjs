// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
//
// Contrast gate for a theme defined in public/theme/tokens.css.
//   node scripts/theme/contrast.mjs [theme=fall]
// Reads html[data-theme="<theme>"] and every html[data-theme="<theme>"][data-page=...]
// block, then checks the pairs the standard promises (docs/THEMING.md). Exit 1 on failure.
import fs from 'node:fs';
import path from 'node:path';

const theme = process.argv[2] || 'fall';
const css = fs.readFileSync(path.join(process.cwd(), 'public/theme/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
const vars = (body) => Object.fromEntries([...body.matchAll(/(--sc-[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const base = {};
const accents = {};
for (const b of blocks) {
  if (!b.sel.includes(`data-theme="${theme}"`)) continue;
  const v = vars(b.body);
  const pages = [...b.sel.matchAll(/data-page="([\w-]+)"/g)].map(m => m[1]);
  if (!pages.length) Object.assign(base, v);
  else accents[pages.join(', ')] = v;
}
if (!Object.keys(base).length) { console.error(`no html[data-theme="${theme}"] block in tokens.css`); process.exit(2); }

const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const isHex = (v) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v || '');
const lum = (h) => hex(h).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let checks = 0, fails = 0;
const need = (label, fg, bg, min) => {
  if (!isHex(fg) || !isHex(bg)) return;
  checks++;
  const r = ratio(fg, bg);
  if (r < min) { fails++; console.log(`FAIL ${r.toFixed(2)} < ${min}  ${label}  (${fg} on ${bg})`); }
};
const SURF = ['--sc-bg', '--sc-bg-2', '--sc-bg-3', '--sc-surface', '--sc-surface-2'];
for (const t of ['--sc-text', '--sc-text-2', '--sc-text-3', '--sc-text-4']) for (const s of SURF) need(`${t} on ${s}`, base[t], base[s], 4.5);
for (const t of ['--sc-ok', '--sc-warn', '--sc-bad', '--sc-info']) for (const s of SURF) need(`${t} on ${s}`, base[t], base[s], 4.5);
for (let i = 1; i <= 8; i++) need(`--sc-hue-${i} on --sc-surface`, base[`--sc-hue-${i}`], base['--sc-surface'], 4.5);
const variants = { '(default)': {}, ...accents };
for (const [name, v] of Object.entries(variants)) {
  const a = { ...base, ...v };
  for (const s of SURF) need(`${name}: accent as text on ${s}`, a['--sc-accent'], a[s], 4.5);
  need(`${name}: ink on accent`, a['--sc-accent-ink'], a['--sc-accent'], 7);
  need(`${name}: ink on accent-2`, a['--sc-accent-ink'], a['--sc-accent-2'], 7);
  need(`${name}: accent-3 as text on bg`, a['--sc-accent-3'], a['--sc-bg'], 4.5);
}
if (isHex(base['--sc-ok']) && isHex(base['--sc-bad'])) {
  checks++;
  const gap = Math.abs(lum(base['--sc-ok']) - lum(base['--sc-bad']));
  if (gap < 0.12) { fails++; console.log(`FAIL ok/bad luminance gap ${gap.toFixed(3)} < 0.12 (colour-blind distinguishability)`); }
}
console.log(`${theme}: ${checks} contrast checks, ${fails} failures, ${Object.keys(accents).length} per-page accent blocks`);
process.exit(fails ? 1 : 0);
