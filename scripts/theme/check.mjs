// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// node scripts/theme/check.mjs <file.html|file.css>
// Mechanical post-migration checks against docs/THEMING.md. Prints JSON:
// { ok, errors:[...], literals:[{line, text, ctx}], ... }. Exit 1 on errors.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const isCss = file.endsWith('.css');
const lines = src.split('\n');
const lineOf = (idx) => src.slice(0, idx).split('\n').length;

const ROLES = new Set([
  'bg', 'bg-2', 'bg-3', 'surface', 'surface-2', 'nav-bg', 'overlay', 'border', 'border-2',
  'text', 'text-2', 'text-3', 'text-4', 'accent', 'accent-2', 'accent-3', 'accent-ink',
  'ok', 'warn', 'bad', 'info', 'neutral',
  'hue-1', 'hue-2', 'hue-3', 'hue-4', 'hue-5', 'hue-6', 'hue-7', 'hue-8',
  'gradient-brand', 'gradient-glow', 'font-sans', 'font-display', 'font-mono',
  'leaf-1', 'leaf-2', 'leaf-3', 'leaf-4', 'leaf-5', 'leaf-6',
].map(r => '--sc-' + r));
const KNOBS = new Set(['--sc-gutter', '--sc-radius-card', '--sc-radius-btn', '--sc-shadow-card']);

const errors = [], warnings = [], literals = [];

// Blank out comments (keep offsets) so commented-out colours are not reported.
// CSS comments are stripped only INSIDE css regions: a JS comment such as
// "load /status/*.json" contains "/*" and a file-wide strip corrupts the script.
const strip = (s, re) => s.replace(re, (m) => m.replace(/[^\n]/g, ' '));
const cssStrip = (s) => strip(s, /\/\*[\s\S]*?\*\//g);
// HTML comments are blanked outside <script>/<style> only.
let scan = isCss ? cssStrip(src) : src.replace(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)|<!--[\s\S]*?-->/gi, (m, keep) => keep ? m : m.replace(/[^\n]/g, ' '));

// Regions that can carry colour: <style> blocks, style="" attrs, SVG colour attrs, <script> bodies.
const regions = [];
if (isCss) regions.push({ kind: 'css', start: 0, text: scan });
else {
  for (const m of scan.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) regions.push({ kind: 'css', start: m.index + m[0].indexOf(m[1]), text: cssStrip(m[1]) });
  const outside = scan.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of outside.matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)) { const t = m[2] ?? m[3]; regions.push({ kind: 'inline-style', start: m.index + m[0].indexOf(t), text: t }); }
  for (const m of outside.matchAll(/\s(fill|stroke|stop-color|flood-color|color|bgcolor)\s*=\s*("([^"]*)"|'([^']*)')/gi)) { const t = m[3] ?? m[4]; regions.push({ kind: 'svg-attr', start: m.index + m[0].indexOf(t), text: t }); }
  for (const m of src.matchAll(/<script\b(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)) regions.push({ kind: 'js', start: m.index + m[0].indexOf(m[1]), text: m[1] });
  // var() scanning below must not see CSS comments either
  scan = scan.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => cssStrip(m));
}

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(\s*[\d.]/g;
const NAMED_RE = /(?:^|[\s:,(])(white|black|red|green|blue|yellow|orange|gray|grey|silver|purple|pink|gold|cyan|magenta|lime|navy|teal|maroon|olive|aqua|fuchsia|crimson|coral|salmon|tomato|wheat|beige|ivory|khaki|indigo|violet)(?=[\s;,)!"']|$)/gi;
for (const r of regions) {
  const scanRe = (re, named) => {
    for (const m of r.text.matchAll(re)) {
      const idx = r.start + m.index + (named ? m[0].indexOf(m[1]) : 0);
      // ignore hex that is actually a URL fragment / id selector inside JS like '#apps'
      if (!named && r.kind === 'js' && /^#[0-9a-fA-F]+$/.test(m[0]) && !/['"`]#[0-9a-fA-F]{3,8}['"`]/.test(src.slice(idx - 1, idx + m[0].length + 1)) && !/(color|fill|stroke|background|style)/i.test(lines[lineOf(idx) - 1])) continue;
      // CSS id/hash selectors like #tools, #fff-section are not colours: require a value context in css
      if (!named && r.kind === 'css') {
        const before = r.text.slice(Math.max(0, m.index - 200), m.index);
        const lastOpen = before.lastIndexOf('{'), lastClose = before.lastIndexOf('}'), lastColon = before.lastIndexOf(':'), lastSemi = before.lastIndexOf(';');
        const inDecl = lastOpen > lastClose && lastColon > Math.max(lastSemi, lastOpen);
        if (!inDecl && !/@keyframes|@media/.test(before)) continue;
      }
      if (named && r.kind === 'css') {
        const before = r.text.slice(Math.max(0, m.index - 120), m.index + 1);
        if (!/:[^;{}]*$/.test(before)) continue; // only inside a declaration value
        if (/(font|content|grid-area|animation|transition|counter|list-style|cursor)[\w-]*\s*:[^;]*$/i.test(before)) continue;
      }
      if (named && r.kind === 'js') continue; // named words in JS are too ambiguous; reviewer covers them
      const ln = lineOf(idx);
      literals.push({ line: ln, kind: r.kind, value: named ? m[1] : (m[0].startsWith('#') ? m[0] : src.slice(idx, src.indexOf(')', idx) + 1)), ctx: lines[ln - 1].trim().slice(0, 140) });
    }
  };
  scanRe(COLOR_RE, false);
  if (r.kind !== 'js') scanRe(NAMED_RE, true);
}

// var() usage checks
const defined = new Set([...scan.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
// custom properties set at runtime: el.style.setProperty('--x', ...)
for (const m of src.matchAll(/setProperty\(\s*['"`](--[\w-]+)['"`]/g)) defined.add(m[1]);
for (const m of scan.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
  const name = m[1], hasFallback = !!m[2], ln = lineOf(m.index);
  if (name.startsWith('--sc-')) {
    if (KNOBS.has(name)) { if (!hasFallback) errors.push(`L${ln}: layout knob ${name} used without a fallback (original theme does not define it)`); }
    else if (!ROLES.has(name)) errors.push(`L${ln}: unknown role ${name}`);
  } else if (!defined.has(name)) errors.push(`L${ln}: var(${name}) is not defined in this file and is not an --sc-* role (deleted token still referenced?)`);
}

// CSS brace balance per css region
for (const r of regions.filter(r => r.kind === 'css')) {
  let depth = 0, minDepth = 0;
  for (const ch of r.text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '')) { if (ch === '{') depth++; else if (ch === '}') { depth--; minDepth = Math.min(minDepth, depth); } }
  if (depth !== 0 || minDepth < 0) errors.push(`CSS block starting L${lineOf(r.start)}: unbalanced braces (net ${depth}, min ${minDepth})`);
}

// JS syntax
for (const r of regions.filter(r => r.kind === 'js')) {
  try { new vm.Script(r.text, { filename: 'inline' }); }
  catch (e) { errors.push(`inline <script> at L${lineOf(r.start)}: ${e.message}`); }
}

// HTML structure checks
if (!isCss) {
  const htmlTag = (src.match(/<html\b[^>]*>/i) || [''])[0];
  if (!/data-page="[\w-]+"/.test(htmlTag)) errors.push('<html> lacks data-page="<key>"');
  const iScript = src.indexOf('/theme/seasonal.js'), iTokens = src.indexOf('/theme/tokens.css'), iFall = src.indexOf('/theme/fall.css');
  const headEnd = src.search(/<\/head>/i);
  if (iScript < 0 || iTokens < 0 || iFall < 0) errors.push('missing one of /theme/seasonal.js, /theme/tokens.css, /theme/fall.css');
  else {
    if (!(iScript < iTokens)) errors.push('seasonal.js must come before tokens.css');
    if (iFall > headEnd) errors.push('fall.css must be inside <head>');
    const styleIdxs = [...src.matchAll(/<style\b/gi)].map(m => m.index).filter(i => i < headEnd);
    const linkIdxs = [...src.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)].filter(m => !/\/theme\//.test(m[0]) && m.index < headEnd).map(m => m.index);
    if (iTokens > Math.min(...styleIdxs, Infinity)) errors.push('tokens.css must come before the first page <style>');
    if (iFall < Math.max(...styleIdxs, ...linkIdxs, -1)) errors.push('fall.css must come after the last page <style>/stylesheet in <head>');
    if (/<script[^>]*seasonal\.js[^>]*(async|defer)/i.test(src)) errors.push('seasonal.js must be synchronous (no async/defer)');
  }
  if (!/data-theme-toggle/.test(src)) errors.push('no element carries data-theme-toggle');
  const tog = src.match(/<[^>]*data-theme-toggle[^>]*>/g) || [];
  if (tog.some(t => /tabindex|role=/.test(t))) warnings.push('data-theme-toggle element sets tabindex/role itself; seasonal.js adds these');
}

const out = { file: path.basename(file), ok: errors.length === 0, errors, warnings, literalCount: literals.length, literals };
console.log(JSON.stringify(out, null, 1));
process.exit(errors.length ? 1 : 0);
