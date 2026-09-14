// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
//
// Store checkout smoke test. Hits POST /api/checkout for each live SKU and
// asserts the worker hands back a real Lemon Squeezy checkout_url — the
// end-to-end proof that LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, and the
// per-product LS_VARIANT_* secret are all wired on the deployment.
//
// It creates a real (unpaid) LS checkout session per product. No charge, no
// order, no webhook — LS discards abandoned sessions. Safe to run against prod.
//
// Usage:
//   node scripts/smoke-store.mjs                       # prod, default email
//   node scripts/smoke-store.mjs --base http://127.0.0.1:8787   # local wrangler dev
//   node scripts/smoke-store.mjs --email you@example.com
//   node scripts/smoke-store.mjs --products mcp-pro,sassy-talk
//
// Exit code is non-zero if any product fails, so it drops straight into CI.

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = opt("base", "https://sassyconsultingllc.com").replace(/\/$/, "");
const EMAIL = opt("email", "smoke-test@sassyconsultingllc.com");
const PRODUCTS = opt("products", "mcp-pro,sassy-talk,winforensics")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function checkSku(product) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, email: EMAIL }),
    });
    const ms = Date.now() - started;
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON body */ }
    const url = data && data.checkout_url;
    if (res.ok && url && /^https?:\/\//.test(url)) {
      const host = new URL(url).host;
      console.log(`  PASS  ${product.padEnd(14)} ${res.status}  ${host}  (${ms}ms)`);
      return true;
    }
    const why = (data && data.error) || `no checkout_url (HTTP ${res.status})`;
    console.log(`  FAIL  ${product.padEnd(14)} ${res.status}  ${why}`);
    return false;
  } catch (e) {
    console.log(`  FAIL  ${product.padEnd(14)} —    ${e.message}`);
    return false;
  }
}

console.log(`Store checkout smoke test → ${BASE}  (email: ${EMAIL})`);
const results = [];
for (const p of PRODUCTS) results.push(await checkSku(p));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} products wired.`);
process.exit(passed === results.length ? 0 : 1);
