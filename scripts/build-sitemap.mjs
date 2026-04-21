#!/usr/bin/env node
// Auto-generates public/sitemap.xml from:
//   1. Every .html file under public/ (minus excludes)
//   2. Extra R2/dynamic URLs declared in scripts/sitemap.extras.json
// Runs automatically before `wrangler deploy` via the "predeploy" npm hook.
// Edit the excludes/priorities tables below to control output.

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const EXTRAS_FILE = join(ROOT, "scripts", "sitemap.extras.json");
const OUT_FILE = join(PUBLIC_DIR, "sitemap.xml");
const SITE = "https://sassyconsultingllc.com";

// Paths (relative to public/, without leading slash) to exclude from the sitemap.
// Supports exact match and prefix match (trailing /).
const EXCLUDE = new Set([
  "404.html",
  "contact-success.html",
  "success.html",
  "checkout/",           // transactional funnel pages
  "browser-v2.html",     // historical, no file exists
]);

// Prefix-based priority + changefreq. First matching prefix wins.
// Path is the public-relative POSIX path WITHOUT .html, no leading slash.
// "" matches the root.
const RULES = [
  { match: "",                    priority: "1.0", changefreq: "weekly" },
  { match: "browser",             priority: "0.9", changefreq: "weekly" },
  { match: "pricing",             priority: "0.8", changefreq: "monthly" },
  { match: "sassy-talk",          priority: "0.8", changefreq: "monthly" },
  { match: "winforensics",        priority: "0.8", changefreq: "monthly" },
  { match: "website-creator",     priority: "0.8", changefreq: "monthly" },
  { match: "my-best-sites",       priority: "0.7", changefreq: "monthly" },
  { match: "aboutme",             priority: "0.7", changefreq: "monthly" },
  { match: "app-testers",         priority: "0.6", changefreq: "monthly" },
  { match: "guides/",             priority: "0.5", changefreq: "monthly" },
  { match: "contact",             priority: "0.5", changefreq: "yearly" },
  { match: "privacy/",            priority: "0.4", changefreq: "yearly" },
  { match: "nda",                 priority: "0.3", changefreq: "yearly" },
];

const DEFAULT_RULE = { priority: "0.5", changefreq: "monthly" };

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".html")) out.push(full);
  }
  return out;
}

function toPath(file) {
  // e.g. public/privacy/sassytalk/index.html -> privacy/sassytalk
  //      public/pricing.html                 -> pricing
  //      public/index.html                   -> ""
  let rel = relative(PUBLIC_DIR, file).split(sep).join(posix.sep);
  if (rel.endsWith("/index.html")) rel = rel.slice(0, -"/index.html".length);
  else if (rel === "index.html") rel = "";
  else if (rel.endsWith(".html")) rel = rel.slice(0, -".html".length);
  return rel;
}

function isExcluded(relPath, fileRelPath) {
  if (EXCLUDE.has(fileRelPath)) return true;
  for (const entry of EXCLUDE) {
    if (entry.endsWith("/") && fileRelPath.startsWith(entry)) return true;
  }
  return false;
}

function ruleFor(relPath) {
  for (const r of RULES) {
    if (r.match === "" && relPath === "") return r;
    if (r.match && (relPath === r.match || relPath.startsWith(r.match + "/") || (r.match.endsWith("/") && relPath.startsWith(r.match)))) {
      return r;
    }
  }
  return DEFAULT_RULE;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function urlFor(relPath) {
  return relPath === "" ? `${SITE}/` : `${SITE}/${relPath}`;
}

function main() {
  const files = walk(PUBLIC_DIR);
  const entries = [];
  const seen = new Set();

  for (const f of files) {
    const fileRel = relative(PUBLIC_DIR, f).split(sep).join(posix.sep);
    const relPath = toPath(f);
    if (isExcluded(relPath, fileRel)) continue;
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    const rule = ruleFor(relPath);
    entries.push({
      loc: urlFor(relPath),
      lastmod: today(),
      changefreq: rule.changefreq,
      priority: rule.priority,
    });
  }

  // Extras: R2-hosted or dynamically-routed URLs that aren't files in public/.
  // Format: [{ "path": "privacy/tuner", "priority": "0.4", "changefreq": "yearly" }]
  if (existsSync(EXTRAS_FILE)) {
    const extras = JSON.parse(readFileSync(EXTRAS_FILE, "utf8"));
    for (const x of extras) {
      const rel = x.path.replace(/^\/+/, "").replace(/\/+$/, "");
      if (seen.has(rel)) continue;
      seen.add(rel);
      const rule = ruleFor(rel);
      entries.push({
        loc: urlFor(rel),
        lastmod: x.lastmod || today(),
        changefreq: x.changefreq || rule.changefreq,
        priority: x.priority || rule.priority,
      });
    }
  }

  // Stable order: root first, then by priority desc, then alpha.
  entries.sort((a, b) => {
    if (a.loc === `${SITE}/`) return -1;
    if (b.loc === `${SITE}/`) return 1;
    const p = parseFloat(b.priority) - parseFloat(a.priority);
    return p !== 0 ? p : a.loc.localeCompare(b.loc);
  });

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries.map(e => [
      `  <url>`,
      `    <loc>${e.loc}</loc>`,
      `    <lastmod>${e.lastmod}</lastmod>`,
      `    <changefreq>${e.changefreq}</changefreq>`,
      `    <priority>${e.priority}</priority>`,
      `  </url>`,
    ].join("\n")),
    `</urlset>`,
    ``,
  ].join("\n");

  writeFileSync(OUT_FILE, xml);
  console.log(`[sitemap] wrote ${entries.length} URLs to ${relative(ROOT, OUT_FILE)}`);
}

main();
