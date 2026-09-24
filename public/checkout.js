// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-sassyconsultingllc_cloudflare-4ZNI5BQAVPLP
// Legacy buy buttons (buyProduct('...') on the product pages) route to the
// unified /store page, which collects the email required by /api/checkout and
// opens the Lemon Squeezy checkout. Kept as a thin shim so existing onclick
// handlers keep working without per-page rewrites.
//
// Which products can be bought is no longer hardcoded here. /api/catalog
// derives it from the same variant resolution /api/checkout performs, so
// wiring an LS_VARIANT_* secret and deploying is the whole job — no companion
// edit to this file, no window where the site lies about what it sells.
// The old UNWIRED array is gone; do not reintroduce it.
(function () {
  var catalog = null;

  // Preload so the first click is instant. A failed fetch leaves catalog null,
  // which falls through to /store — the worker still answers honestly there.
  try {
    fetch('/api/catalog', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.products) catalog = d.products; })
      .catch(function () { /* offline or blocked: fall through to /store */ });
  } catch (e) { /* no fetch: fall through to /store */ }

  function route(product) {
    var entry = catalog && catalog[product];
    // Only divert to /contact when we positively know the sale cannot complete.
    // Unknown state must not send a ready buyer to a contact form.
    if (entry && entry.purchasable === false) {
      window.location.href = '/contact?product=' + encodeURIComponent(product);
      return;
    }
    window.location.href = '/store?buy=' + encodeURIComponent(product);
  }

  window.buyProduct = function (product) {
    if (catalog) return route(product);
    // Catalog not back yet: fetch it, but never make the buyer wait on us.
    var settled = false;
    var go = function () { if (!settled) { settled = true; route(product); } };
    setTimeout(go, 1200);
    fetch('/api/catalog', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.products) catalog = d.products; go(); })
      .catch(go);
  };
})();
