// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
//
// Sassy Browser release state, resolved from what is actually uploaded.
//
// The version a visitor sees must be the version of the file they download, so
// it is read from the R2 objects behind sassycreates.sassyconsultingllc.com
// (the DOWNLOADS bucket), never typed into HTML. Per platform, first hit wins:
//
//   1. customMetadata.version on the object (set it at upload time to be explicit)
//   2. a versioned sibling with the same ETag, e.g. sassy-browser-0.16.1-linux-x86_64.tar.gz
//   3. Windows only: ProductVersion from the exe's own VERSIONINFO resource
//      (PE headers + .rsrc section via ranged reads; never the whole binary)
//
// The GitHub probe (optional, needs the GITHUB_TOKEN secret: fine-grained,
// read-only Contents + Metadata on the ACE repo) adds the latest release tag,
// main HEAD and Cargo.toml version on main, so drift between "what is uploaded"
// and "what is released" shows up in /api/browser/release.
//
// Results are memoised per isolate and in the edge cache for CACHE_TTL seconds.
// Everything fails soft: a failed lookup yields null, and the static HTML keeps
// its last-known values.

const PLATFORMS = {
  windows: { key: "sassy-browser.exe", versioned: /^sassy-browser-(\d+\.\d+\.\d+)-windows-x86_64\.exe$/ },
  linux: { key: "sassy-browser-linux-x86_64.tar.gz", versioned: /^sassy-browser-(\d+\.\d+\.\d+)-linux-x86_64\.tar\.gz$/ },
};
const CHECKSUMS_KEY = "sassy-browser-SHA256SUMS.txt";
const PUBLIC_BASE = "https://sassycreates.sassyconsultingllc.com/";
const DEFAULT_REPO = "sassyconsultingllc/ACE";
const CACHE_TTL = 300;
const CACHE_KEY = "https://sassyconsultingllc.com/__internal/browser-release/v2";
const SEMVER = /^\d+\.\d+\.\d+$/;

let memo = null; // { at, data }

export function cmpSemver(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
const bare = (tag) => (tag || "").replace(/^v/i, "");
const mb = (bytes) => (bytes ? Math.round(bytes / 1e6) : null);

// ---- PE VERSIONINFO ---------------------------------------------------------

async function rangeBytes(bucket, key, offset, length) {
  const obj = await bucket.get(key, { range: { offset, length } });
  return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
}

// Locate .rsrc via the PE section table, then read ProductVersion out of it.
async function peProductVersion(bucket, key, size) {
  const head = await rangeBytes(bucket, key, 0, 4096);
  if (!head || head[0] !== 0x4d || head[1] !== 0x5a) return null; // "MZ"
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const pe = dv.getUint32(0x3c, true);
  if (pe + 24 > head.length || dv.getUint32(pe, true) !== 0x00004550) return null; // "PE\0\0"
  const sections = dv.getUint16(pe + 6, true);
  const optSize = dv.getUint16(pe + 20, true);
  let off = pe + 24 + optSize;
  for (let i = 0; i < sections && off + 40 <= head.length; i++, off += 40) {
    const name = String.fromCharCode(...head.subarray(off, off + 8)).replace(/\0+$/, "");
    if (name !== ".rsrc") continue;
    const rawSize = dv.getUint32(off + 16, true), rawPtr = dv.getUint32(off + 20, true);
    if (!rawSize || rawPtr + rawSize > size || rawSize > 32 * 1024 * 1024) return null;
    const rsrc = await rangeBytes(bucket, key, rawPtr, rawSize);
    return rsrc ? findVersionString(rsrc, "ProductVersion") || findVersionString(rsrc, "FileVersion") : null;
  }
  return null;
}

// VERSIONINFO strings are UTF-16LE: key, NUL padding to a 4-byte boundary, value.
export function findVersionString(bytes, keyName) {
  const needle = new Uint8Array(keyName.length * 2 + 2); // key + UTF-16 NUL terminator
  for (let k = 0; k < keyName.length; k++) needle[k * 2] = keyName.charCodeAt(k);
  let at = -1;
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    if (bytes[i] !== needle[0]) continue;
    for (let j = 1; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    at = i;
    break;
  }
  if (at < 0) return null;
  let i = at + needle.length;
  while (i + 1 < bytes.length && bytes[i] === 0 && bytes[i + 1] === 0) i += 2; // alignment padding
  let out = "";
  for (; i + 1 < bytes.length && out.length < 40; i += 2) {
    const c = bytes[i] | (bytes[i + 1] << 8);
    if (!c) break;
    out += String.fromCharCode(c);
  }
  const m = out.match(/\d+\.\d+\.\d+/);
  return m ? m[0] : null;
}

// ---- R2 resolution ----------------------------------------------------------

async function listVersioned(bucket) {
  const out = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await bucket.list({ prefix: "sassy-browser-", cursor, limit: 1000 });
    out.push(...res.objects);
    if (!res.truncated) break;
    cursor = res.cursor;
  }
  return out;
}

async function resolvePlatform(bucket, name, spec, siblings) {
  const obj = await bucket.head(spec.key);
  if (!obj) return { available: false, version: null };
  const base = {
    available: true,
    filename: spec.key,
    href: PUBLIC_BASE + spec.key,
    size_bytes: obj.size,
    size_mb: mb(obj.size),
    uploaded_at: obj.uploaded ? obj.uploaded.toISOString() : null,
  };
  const meta = obj.customMetadata && obj.customMetadata.version;
  if (meta && SEMVER.test(bare(meta))) return { ...base, version: bare(meta), source: "r2-metadata" };

  const twin = siblings.find((o) => spec.versioned.test(o.key) && o.etag === obj.etag && o.size === obj.size);
  if (twin) return { ...base, version: twin.key.match(spec.versioned)[1], source: "r2-versioned-copy" };

  if (name === "windows") {
    try {
      const v = await peProductVersion(bucket, spec.key, obj.size);
      if (v) return { ...base, version: v, source: "pe-versioninfo" };
    } catch (e) { /* fall through */ }
  }
  return { ...base, version: null, source: null };
}

// ---- GitHub probe -----------------------------------------------------------

async function gh(env, path, accept = "application/vnd.github+json") {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sassyconsultingllc-worker",
    },
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) throw new Error(`GitHub ${path.split("?")[0]} -> ${res.status}`);
  return accept.endsWith("raw") ? res.text() : res.json();
}

async function probeRepo(env) {
  if (!env.GITHUB_TOKEN) return { available: false, reason: "GITHUB_TOKEN secret not set" };
  const repo = env.BROWSER_REPO || DEFAULT_REPO;
  try {
    const [rel, head, cargo] = await Promise.all([
      gh(env, `/repos/${repo}/releases/latest`),
      gh(env, `/repos/${repo}/commits/main`),
      gh(env, `/repos/${repo}/contents/Cargo.toml?ref=main`, "application/vnd.github.raw"),
    ]);
    const cargoVersion = ((cargo.match(/^\s*version\s*=\s*"([^"]+)"/m) || [])[1]) || null;
    return {
      available: true,
      latest_release: bare(rel.tag_name),
      released_at: rel.published_at || null,
      main_sha: head.sha ? head.sha.slice(0, 8) : null,
      main_committed_at: head.commit && head.commit.committer ? head.commit.committer.date : null,
      main_cargo_version: cargoVersion,
    };
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}

// ---- Assembly ---------------------------------------------------------------

function computeDrift(d) {
  const drift = [];
  const w = d.windows, l = d.linux, r = d.repo;
  if (w.version && l.version && w.version !== l.version) {
    drift.push({ code: "platform_mismatch", detail: `Windows build is ${w.version}, Linux build is ${l.version}` });
  }
  for (const [name, p] of [["windows", w], ["linux", l]]) {
    if (p.available && !p.version) drift.push({ code: "version_unknown", detail: `${name} build version could not be determined; set customMetadata.version on the upload` });
    if (r.available && p.version && r.latest_release) {
      const c = cmpSemver(p.version, r.latest_release);
      if (c > 0) drift.push({ code: "build_ahead_of_release", detail: `${name} build ${p.version} is newer than the latest release v${r.latest_release}` });
      if (c < 0) drift.push({ code: "build_behind_release", detail: `${name} build ${p.version} is older than the latest release v${r.latest_release}` });
    }
  }
  if (r.available && r.main_cargo_version && r.latest_release && cmpSemver(r.main_cargo_version, r.latest_release) > 0) {
    drift.push({ code: "unreleased_version_on_main", detail: `main is at ${r.main_cargo_version}, latest release is v${r.latest_release}` });
  }
  for (const name of d.checksums.missing || []) {
    drift.push({ code: "checksums_stale", detail: `${CHECKSUMS_KEY} has no entry for the current ${name} build (${d[name].version}); regenerate it` });
  }
  return drift;
}

// The SUMS file lists versioned names (sassy-browser-0.16.1-linux-x86_64.tar.gz).
// A current build whose versioned name is absent was uploaded without a fresh
// checksum. Comparing upload times instead misfires: one release batch writes
// the SUMS file seconds before the binaries.
const VERSIONED_NAME = {
  windows: (v) => `sassy-browser-${v}-windows-x86_64.exe`,
  linux: (v) => `sassy-browser-${v}-linux-x86_64.tar.gz`,
};
async function checksumState(bucket, builds) {
  const obj = await bucket.get(CHECKSUMS_KEY);
  if (!obj) return { href: null, uploaded_at: null, missing: [] };
  const text = obj.size <= 64 * 1024 ? await obj.text() : "";
  const listed = new Set(text.split(/\r?\n/).map((ln) => ln.trim().split(/\s+/).pop()).filter(Boolean));
  const missing = Object.keys(VERSIONED_NAME).filter((n) => builds[n].version && !listed.has(VERSIONED_NAME[n](builds[n].version)));
  return { href: PUBLIC_BASE + CHECKSUMS_KEY, uploaded_at: obj.uploaded ? obj.uploaded.toISOString() : null, missing };
}

async function build(env) {
  const bucket = env.DOWNLOADS;
  if (!bucket) return null;
  const siblings = await listVersioned(bucket);
  const [windows, linux, repo] = await Promise.all([
    resolvePlatform(bucket, "windows", PLATFORMS.windows, siblings),
    resolvePlatform(bucket, "linux", PLATFORMS.linux, siblings),
    probeRepo(env),
  ]);
  let checksums = { href: null, uploaded_at: null, missing: [] };
  try { checksums = await checksumState(bucket, { windows, linux }); } catch (e) { /* soft */ }
  const versions = [windows.version, linux.version].filter(Boolean).sort(cmpSemver);
  const data = {
    version: versions.length ? versions[versions.length - 1] : null,
    windows,
    linux,
    checksums,
    repo,
    checked_at: new Date().toISOString(),
  };
  data.drift = computeDrift(data);
  return data;
}

// Cached release state. Never throws; returns null if nothing could be read.
export async function getBrowserRelease(env, ctx, { fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && memo && now - memo.at < CACHE_TTL * 1000) return memo.data;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (!fresh && cache) {
    try {
      const hit = await cache.match(CACHE_KEY);
      if (hit) { const data = await hit.json(); memo = { at: now, data }; return data; }
    } catch (e) { /* cache miss */ }
  }
  let data = null;
  try { data = await build(env); } catch (e) { data = null; }
  if (data) {
    memo = { at: now, data };
    if (cache) {
      const put = cache.put(CACHE_KEY, new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_TTL}` },
      })).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(put);
    }
  }
  return data;
}

// ---- HTML injection ---------------------------------------------------------
//
// Markup contract (server-rendered, so crawlers and people read the same value):
//   <span data-sb-version="latest|windows|linux">0.16.1</span>   version text
//   <span data-sb-size="windows|linux">86</span>                 size in MB
//   <a data-sb-href="windows|linux">                             download link
//   <script type="application/ld+json" data-sb-jsonld>           softwareVersion,
//       fileSize and dateModified of the SoftwareApplication node are refreshed
// The static text is the fallback when R2 cannot be read.

export function rewriteBrowserRelease(response, env, ctx) {
  let pending = null;
  const release = () => (pending ||= getBrowserRelease(env, ctx));
  const pick = (d, which) => (which === "latest" ? d && d.version : d && d[which] && d[which].version);

  let ld = "";
  return new HTMLRewriter()
    .on("[data-sb-version]", {
      async element(el) {
        const v = pick(await release(), el.getAttribute("data-sb-version"));
        if (v) el.setInnerContent(v);
      },
    })
    .on("[data-sb-size]", {
      async element(el) {
        const d = await release();
        const p = d && d[el.getAttribute("data-sb-size")];
        if (p && p.size_mb) el.setInnerContent(String(p.size_mb));
      },
    })
    .on("[data-sb-href]", {
      async element(el) {
        const d = await release();
        const p = d && d[el.getAttribute("data-sb-href")];
        if (p && p.href) el.setAttribute("href", p.href);
      },
    })
    .on("script[data-sb-jsonld]", {
      async text(chunk) {
        ld += chunk.text;
        if (!chunk.lastInTextNode) { chunk.remove(); return; }
        const d = await release();
        let out = ld;
        ld = "";
        try {
          const doc = JSON.parse(out);
          const nodes = Array.isArray(doc["@graph"]) ? doc["@graph"] : [doc];
          const app = nodes.find((n) => n["@type"] === "SoftwareApplication");
          if (app && d && d.version) {
            app.softwareVersion = d.version;
            const w = d.windows && d.windows.size_mb, l = d.linux && d.linux.size_mb;
            if (w || l) app.fileSize = [w && `${w}MB (Windows)`, l && `${l}MB (Linux)`].filter(Boolean).join(", ");
            const dates = [d.windows && d.windows.uploaded_at, d.linux && d.linux.uploaded_at].filter(Boolean).sort();
            if (dates.length) app.dateModified = dates[dates.length - 1].slice(0, 10);
          }
          // Re-serialise with </ escaped so no value can close the script tag.
          out = JSON.stringify(doc, null, 2).replace(/<\//g, "<\\/");
        } catch (e) { /* leave the static block untouched */ }
        chunk.replace(out, { html: true });
      },
    })
    .transform(response);
}

// Public and cache-backed: at most one R2 + GitHub probe per CACHE_TTL per
// colo, whatever the request rate. There is deliberately no public bypass.
export async function handleBrowserRelease(request, env, ctx, headers) {
  const data = await getBrowserRelease(env, ctx);
  return new Response(JSON.stringify(data || { error: "release state unavailable" }, null, 2), {
    status: data ? 200 : 503,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": `public, max-age=${data ? 60 : 0}` },
  });
}
