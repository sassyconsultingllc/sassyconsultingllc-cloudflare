// Standalone test for the SCRUBBED-FILE PDF PIPELINE helpers.
//
// Functions copied verbatim from src/worker.js. If you edit either copy,
// update the other — this file exists so the PDF generator and base64
// encoder can be exercised in pure Node without a worker runtime.
//
// Run:  node scripts/test/scrub-pdf.test.mjs

import { writeFileSync } from 'node:fs';

// ── COPY of buildPdfFromText from src/worker.js ────────────────────────
function buildPdfFromText(text, header) {
  const FONT_SIZE = 9;
  const LINE_HEIGHT = 11;
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN_L = 50;
  const MARGIN_T = 60;
  const CHARS_PER_LINE = 94;
  const LINES_PER_PAGE = 60;
  const MAX_PAGES = 500;

  const escPdf = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const wrapped = [];
  for (const rl of String(text || "").split("\n")) {
    if (rl.length === 0) { wrapped.push(""); continue; }
    const expanded = rl.replace(/\t/g, "    ");
    if (expanded.length <= CHARS_PER_LINE) { wrapped.push(expanded); continue; }
    for (let i = 0; i < expanded.length; i += CHARS_PER_LINE) {
      wrapped.push(expanded.slice(i, i + CHARS_PER_LINE));
    }
  }
  const maxLines = MAX_PAGES * LINES_PER_PAGE;
  let truncated = false;
  if (wrapped.length > maxLines) {
    wrapped.length = maxLines - 1;
    wrapped.push("... [output truncated at " + maxLines + " lines]");
    truncated = true;
  }
  if (wrapped.length === 0) wrapped.push("(empty)");

  const pages = [];
  for (let i = 0; i < wrapped.length; i += LINES_PER_PAGE) {
    pages.push(wrapped.slice(i, i + LINES_PER_PAGE));
  }
  const N = pages.length;

  const pageObj = (i) => 3 + i;
  const contentObj = (i) => 3 + N + i;
  const fontObj = 3 + 2 * N;

  const objects = [];
  objects.push("<</Type /Catalog /Pages 2 0 R>>");
  const kids = [];
  for (let i = 0; i < N; i++) kids.push(`${pageObj(i)} 0 R`);
  objects.push(`<</Type /Pages /Kids [${kids.join(" ")}] /Count ${N}>>`);
  for (let i = 0; i < N; i++) {
    objects.push(
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Contents ${contentObj(i)} 0 R ` +
      `/Resources <</Font <</F1 ${fontObj} 0 R>>>>>>`
    );
  }
  for (let i = 0; i < N; i++) {
    let stream = "";
    const safeHeader = escPdf(`${header || "Scrubbed output"} - page ${i + 1} of ${N}`);
    stream += `BT /F1 ${FONT_SIZE} Tf ${MARGIN_L} ${PAGE_H - 30} Td (${safeHeader}) Tj ET\n`;
    stream += `BT /F1 ${FONT_SIZE} Tf ${MARGIN_L} ${PAGE_H - MARGIN_T} Td ${LINE_HEIGHT} TL `;
    for (let j = 0; j < pages[i].length; j++) {
      stream += `(${escPdf(pages[i][j])}) Tj T* `;
    }
    stream += "ET";
    objects.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
  }
  objects.push("<</Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding>>");

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  const totalEntries = objects.length + 1;
  pdf += `xref\n0 ${totalEntries}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${totalEntries} /Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return { bytes, pageCount: N, lineCount: wrapped.length, truncated };
}

// ── COPY of uint8ToBase64 from src/worker.js ───────────────────────────
function uint8ToBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(bin);
}

// ── Tests ──────────────────────────────────────────────────────────────
let failures = 0;
function assert(name, cond, detail) {
  if (cond) {
    console.log(`  OK   ${name}`);
  } else {
    console.error(`  FAIL ${name}${detail ? " — " + detail : ""}`);
    failures++;
  }
}

console.log("\nT1: empty input");
const t1 = buildPdfFromText("", "empty test");
const t1Str = Buffer.from(t1.bytes).toString("binary");
assert("starts with %PDF-1.4", t1Str.startsWith("%PDF-1.4"));
assert("ends with %%EOF", t1Str.endsWith("%%EOF\n"));
assert("page count >= 1", t1.pageCount >= 1, "got " + t1.pageCount);
assert("line count == 1 (empty placeholder)", t1.lineCount === 1, "got " + t1.lineCount);

console.log("\nT2: typical app-tester scrub (small)");
const sample = `App crash report - 2026-05-20

Steps to reproduce:
  1. Open the app
  2. Tap Settings
  3. Tap Export data
  4. Observe crash

Stack trace (Android logcat):
05-20 14:23:11.412 E/AndroidRuntime: FATAL EXCEPTION: main
    java.lang.NullPointerException: Attempt to invoke virtual method
        on a null object reference
    at com.example.ExportActivity.onClick(ExportActivity.java:127)

Expected: data exports as CSV to Downloads/
Actual:   app crashes, no toast`;
const t2 = buildPdfFromText(sample, "crash report - Brick 2.0");
const t2Str = Buffer.from(t2.bytes).toString("binary");
assert("starts %PDF-1.4", t2Str.startsWith("%PDF-1.4"));
assert("ends %%EOF", t2Str.endsWith("%%EOF\n"));
assert("contains Catalog object", t2Str.includes("/Type /Catalog"));
assert("contains Pages object", t2Str.includes("/Type /Pages"));
assert("contains Courier font", t2Str.includes("/BaseFont /Courier"));
assert("at least 1 page object", (t2Str.match(/\/Type \/Page \//g) || []).length >= 1);
writeFileSync("V:/Projects/sassyconsultingllc-cloudflare/scripts/test/scrub-fixture.pdf", t2.bytes);
console.log("  wrote scripts/test/scrub-fixture.pdf (" + t2.bytes.length + " bytes) — open this in any PDF reader to eyeball");

console.log("\nT3: long input → multi-page + line wrap");
const big = Array.from({length: 3000}, (_, i) => "line " + i + " - " + "x".repeat(120)).join("\n");
const t3 = buildPdfFromText(big, "big test");
assert("multi-page", t3.pageCount >= 50, "got " + t3.pageCount);
assert("wrap inflated line count", t3.lineCount > 3000, "got " + t3.lineCount);
assert("not truncated below cap", t3.truncated === false);

console.log("\nT4: hard cap truncation");
const huge = Array.from({length: 40000}, () => "filler").join("\n");
const t4 = buildPdfFromText(huge, "huge test");
assert("truncated flag set", t4.truncated === true);
assert("page count at cap (500)", t4.pageCount === 500, "got " + t4.pageCount);

console.log("\nT5: xref offsets point at obj headers");
const text = Buffer.from(t2.bytes).toString("binary");
const xrefIdx = text.lastIndexOf("xref\n");
const xlines = text.slice(xrefIdx).split("\n");
let badOffsets = 0;
let goodOffsets = 0;
const xrefEntryRe = /^\d{10} \d{5} n/;
const objHeaderRe = /^\d+ 0 obj/;
for (let i = 3; i < xlines.length; i++) {
  if (!xrefEntryRe.test(xlines[i])) break;
  const off = parseInt(xlines[i].slice(0, 10), 10);
  if (!objHeaderRe.test(text.slice(off, off + 20))) badOffsets++;
  else goodOffsets++;
}
assert("all xref offsets land on obj headers", badOffsets === 0, `bad=${badOffsets}, good=${goodOffsets}`);

console.log("\nT6: PDF special-char escaping");
const specials = "hello (world) and \\backslash and ) close-paren";
const t6 = buildPdfFromText(specials, "esc test");
const t6Str = Buffer.from(t6.bytes).toString("binary");
assert("parens escaped", t6Str.includes("\\(world\\)"));
assert("backslash escaped", t6Str.includes("\\\\backslash"));
assert("dangling close-paren escaped", t6Str.includes("close-paren") && t6Str.includes(" \\) "));

console.log("\nT7: base64 chunked encoder roundtrip");
const b64 = uint8ToBase64(t2.bytes);
const decoded = Buffer.from(b64, "base64");
assert("base64 roundtrip size", decoded.length === t2.bytes.length);
assert("base64 roundtrip bytes", decoded.equals(Buffer.from(t2.bytes)));

console.log("\nT8: 100k chunked base64 (stress test)");
const bigBytes = new Uint8Array(100000);
for (let i = 0; i < bigBytes.length; i++) bigBytes[i] = i & 0xff;
const bigB64 = uint8ToBase64(bigBytes);
const bigDecoded = Buffer.from(bigB64, "base64");
assert("100k roundtrip size", bigDecoded.length === bigBytes.length);

console.log(`\n${failures === 0 ? "✓ ALL TESTS PASSED" : "✗ " + failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
