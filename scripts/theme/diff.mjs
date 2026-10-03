// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// node diff.mjs <baselineDir> <candidateDir> <reportBase>
// Compares computed colours, fonts, opacity and geometry element-by-element.
// Writes <reportBase>.json (every difference) and <reportBase>.md (summary).
import fs from 'node:fs';
import path from 'node:path';

const [A, B, OUTB] = process.argv.slice(2);
if (!A || !B || !OUTB) { console.error('usage: diff.mjs <a> <b> <reportBase>'); process.exit(2); }

const TOL_RGB = 2, TOL_A = 0.02, TOL_PX = 1;
const tuples = (s) => [...String(s).matchAll(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g)].map(m => m.slice(1).map(Number));
const skel = (s) => String(s).replace(/rgba\([^)]*\)/g, '#');
const sameColorStr = (x, y) => {
  if (x === y) return true;
  if (x === undefined || y === undefined) {
    // absent vs fully transparent / none are equivalent
    const v = x ?? y; return /^rgba\(\d+,\d+,\d+,0\.00\)$/.test(v) || v === 'none';
  }
  if (skel(x) !== skel(y)) return false;
  const a = tuples(x), b = tuples(y);
  if (a.length !== b.length) return false;
  return a.every((t, i) => Math.abs(t[0] - b[i][0]) <= TOL_RGB && Math.abs(t[1] - b[i][1]) <= TOL_RGB && Math.abs(t[2] - b[i][2]) <= TOL_RGB && Math.abs(t[3] - b[i][3]) <= TOL_A);
};
const cmpStyle = (sa = {}, sb = {}) => {
  const d = [];
  const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
  for (const k of keys) {
    if (k === 'font' || k === 'opacity') { if (sa[k] !== sb[k]) d.push([k, sa[k], sb[k]]); continue; }
    if (!sameColorStr(sa[k], sb[k])) d.push([k, sa[k], sb[k]]);
  }
  return d;
};

const files = fs.readdirSync(A).filter(f => f.endsWith('.json') && !f.startsWith('_'));
const report = [];
for (const f of files) {
  const pb = path.join(B, f);
  if (!fs.existsSync(pb)) { report.push({ file: f, missing: true }); continue; }
  const a = JSON.parse(fs.readFileSync(path.join(A, f), 'utf8'));
  const b = JSON.parse(fs.readFileSync(pb, 'utf8'));
  const ea = a.elements, eb = b.elements;
  const onlyA = Object.keys(ea).filter(k => !(k in eb));
  const onlyB = Object.keys(eb).filter(k => !(k in ea));
  const style = [], geo = [];
  for (const k of Object.keys(ea)) {
    if (!(k in eb)) continue;
    const x = ea[k], y = eb[k];
    for (const part of ['s', '::before', '::after']) {
      const dd = cmpStyle(x[part], y[part]);
      for (const [prop, va, vb] of dd) style.push({ k, part, prop, a: va, b: vb });
    }
    if (x.r.some((n, i) => Math.abs(n - y.r[i]) > TOL_PX)) geo.push({ k, a: x.r, b: y.r });
  }
  report.push({ file: f, url: a.url, width: a.width, onlyA, onlyB, style, geo,
    scrollW: [a.scrollW, b.scrollW], sideways: [a.sideways, b.sideways] });
}
fs.writeFileSync(OUTB + '.json', JSON.stringify(report, null, 1));

let md = `# Parity report\n\nA: ${A}\nB: ${B}\n\n| page | w | only A | only B | style diffs | geometry diffs |\n|---|---|---|---|---|---|\n`;
let tot = { oa: 0, ob: 0, s: 0, g: 0 };
for (const r of report) {
  if (r.missing) { md += `| ${r.file} | | MISSING IN B | | | |\n`; continue; }
  tot.oa += r.onlyA.length; tot.ob += r.onlyB.length; tot.s += r.style.length; tot.g += r.geo.length;
  md += `| ${r.url} | ${r.width} | ${r.onlyA.length} | ${r.onlyB.length} | ${r.style.length} | ${r.geo.length} |\n`;
}
md += `\n**Totals:** onlyA=${tot.oa} onlyB=${tot.ob} style=${tot.s} geometry=${tot.g}\n`;
for (const r of report) {
  if (r.missing || (!r.onlyA.length && !r.onlyB.length && !r.style.length && !r.geo.length)) continue;
  md += `\n## ${r.url} @ ${r.width}\n`;
  for (const x of r.style) md += `- style \`${x.k}\` ${x.part !== 's' ? x.part + ' ' : ''}**${x.prop}**: \`${x.a}\` -> \`${x.b}\`\n`;
  for (const x of r.geo) md += `- geo \`${x.k}\`: ${JSON.stringify(x.a)} -> ${JSON.stringify(x.b)}\n`;
  for (const k of r.onlyA) md += `- only-before \`${k}\`\n`;
  for (const k of r.onlyB) md += `- only-after \`${k}\`\n`;
}
fs.writeFileSync(OUTB + '.md', md);
console.log(md.split('\n').slice(0, 40 + report.length).join('\n'));
