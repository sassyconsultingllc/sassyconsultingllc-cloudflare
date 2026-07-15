// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-sassyconsultingllc_cloudflare-4ZNI5BQAVPLP
// Legacy buy buttons (buyProduct('...') on the product pages) route to the
// unified /store page, which collects the email required by /api/checkout and
// opens the Lemon Squeezy checkout. Kept as a thin shim so existing onclick
// handlers keep working without per-page rewrites.
function buyProduct(product) {
    window.location.href = '/store?buy=' + encodeURIComponent(product);
}
