// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-sassyconsultingllc_cloudflare-4ZNI5BQAVPLP
// Legacy buy buttons (buyProduct('...') on the product pages) route to the
// unified /store page, which collects the email required by /api/checkout and
// opens the Lemon Squeezy checkout. Kept as a thin shim so existing onclick
// handlers keep working without per-page rewrites.
//
// Products with no Lemon Squeezy variant wired are listed in UNWIRED. For those
// /api/checkout answers 503, and /store no longer carries them in its CATALOG,
// so sending a buyer there would silently do nothing. Route them to /contact
// instead — which is exactly what the worker's own 503 message asks people to
// do. Remove a slug from UNWIRED the same day its LS_VARIANT_* secret is set;
// see docs/PRICING-STATUS.md.
var UNWIRED = ['sassy-talk', 'winforensics'];

function buyProduct(product) {
    if (UNWIRED.indexOf(product) !== -1) {
        window.location.href = '/contact?product=' + encodeURIComponent(product);
        return;
    }
    window.location.href = '/store?buy=' + encodeURIComponent(product);
}
