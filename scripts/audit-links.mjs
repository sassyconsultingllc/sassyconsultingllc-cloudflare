#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "v:/Projects/sassyconsultingllc-cloudflare";
const PUBLIC_DIR = join(ROOT, "public");

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

function toPosixPath(p) {
  return p.split(sep).join("/");
}

const htmlFiles = walk(PUBLIC_DIR);
const pathToFile = new Map();
for (const file of htmlFiles) {
  const rel = toPosixPath(relative(PUBLIC_DIR, file));
  const noHtml = rel.endsWith(".html") ? rel.slice(0, -5) : rel;
  pathToFile.set(`/${rel}`, file);
  pathToFile.set(`/${noHtml}`, file);
  if (noHtml.endsWith("/index")) {
    pathToFile.set(`/${noHtml.slice(0, -6)}`, file);
  }
}

function resolveInternalRoute(routePath) {
  if (routePath === "" || routePath === "/") return join(PUBLIC_DIR, "index.html");

  // Dynamic routes intentionally resolved by the Worker.
  if (
    routePath.startsWith("/api/") ||
    routePath.startsWith("/download/") ||
    routePath.startsWith("/privacy/")
  ) {
    return "dynamic";
  }

  const candidates = [routePath, `${routePath}.html`, `${routePath}/index.html`];
  for (const c of candidates) {
    const rel = c.replace(/^\//, "");
    const candidate = join(PUBLIC_DIR, rel);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Keep checking.
    }
  }

  return pathToFile.get(routePath) ?? null;
}

function getIdsFromHtml(filePath) {
  const text = readFileSync(filePath, "utf8");
  const ids = new Set();
  const idRe = /\sid=["']([^"']+)["']/gi;
  let match;
  while ((match = idRe.exec(text)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

const idCache = new Map();
const issues = [];
const attrRe = /(?:href|src|action)="([^"]+)"/g;

for (const filePath of htmlFiles) {
  const fromPath = `/${toPosixPath(relative(PUBLIC_DIR, filePath))}`;
  const html = readFileSync(filePath, "utf8");

  let match;
  while ((match = attrRe.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;

    // Ignore external/non-http(s) links.
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:") ||
      raw.startsWith("javascript:") ||
      raw.startsWith("data:")
    ) {
      continue;
    }

    if (raw.startsWith("#")) {
      const id = raw.slice(1);
      if (!id) continue;
      if (!idCache.has(filePath)) idCache.set(filePath, getIdsFromHtml(filePath));
      if (!idCache.get(filePath).has(id)) {
        issues.push({
          type: "missing-anchor",
          from: fromPath,
          to: raw,
        });
      }
      continue;
    }

    if (!raw.startsWith("/")) continue;

    const [pathAndQuery, fragment] = raw.split("#");
    const routePath = pathAndQuery.split("?")[0];
    const resolved = resolveInternalRoute(routePath);

    if (!resolved) {
      issues.push({
        type: "missing-path",
        from: fromPath,
        to: raw,
      });
      continue;
    }

    if (fragment && resolved !== "dynamic") {
      if (!idCache.has(resolved)) idCache.set(resolved, getIdsFromHtml(resolved));
      if (!idCache.get(resolved).has(fragment)) {
        issues.push({
          type: "missing-target-anchor",
          from: fromPath,
          to: raw,
          target: `/${toPosixPath(relative(PUBLIC_DIR, resolved))}`,
        });
      }
    }
  }
}

if (issues.length === 0) {
  console.log("No internal link issues found.");
  process.exit(0);
}

console.log(`Found ${issues.length} internal link issue(s):`);
for (const issue of issues) {
  console.log(JSON.stringify(issue));
}

process.exit(1);
