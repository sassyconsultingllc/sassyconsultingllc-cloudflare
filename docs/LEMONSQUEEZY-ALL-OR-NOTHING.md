<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
   CodeMark: SCLLC1-Projects-JRPFK64WHJ6J
-->
# Lemon Squeezy — SassyMCP licensing (live)

Last updated: 2026-11-08

## Commercial truth (do not re-fragment)

- **SassyMCP v1.13+** ships every tool group unlocked for everyone. There is no Pro / Forensics / Team feature gate, and there never will be again: no tool gets put behind a paywall.
- **License (SassyMCP `LICENSE` v2.0, 2026-11-08): free for personal use, commercial license for work.** A license changes the *right to use it for work*, never the features. Plain-English terms: `LICENSING.md` in the SassyMCP repo.
- The website sells two SassyMCP SKUs:
  - **SassyMCP Commercial License** (`mcp-commercial`, **$99 one-time per seat**): covers one person's work use on 2 machines. **This is the revenue line.**
  - **SassyMCP Supporter** (`mcp-pro` slug, $25 one-time): an optional tip for individuals. Badge only, and it does **not** grant commercial rights.
- **CuratedMCP** (curatedmcp.com) is an external directory listing, not a product brand. List as **Free**; do not use their paid Stripe rev-share tiers. (As of 2026-09-20 we were not actually listed there; see SassyMCP `docs/launch/07-directories.md`.)
- Do **not** create LS products named Forensics or Team.

## Turning on the commercial SKU (do once)

The worker, store card, and buyer email are already wired (`mcp-commercial`). Until the variant secret exists, `/api/catalog` reports it unpurchasable and the store card shows "email us for a checkout link or invoice."

1. **Lemon Squeezy dashboard** (LIVE store "Sassy Consulting LLC Apps", 377151) → New product:
   - Name: **SassyMCP Commercial License**
   - Price: **$99**, single payment (not subscription)
   - **Generate license keys: ON**. **Activation limit: 2**. **License length: unlimited.** (Dashboard-only settings; the API can't set them.)
   - Description: "Commercial-use license for one person. SassyMCP is free for personal use; this covers using it for work. All tools are included in every copy."
2. Copy the new **variant ID**.
3. Set the worker secret: `npx wrangler secret put LS_VARIANT_MCP_COMMERCIAL`, then paste the ID. Secrets take effect without a code deploy, so the store's buy button goes live on the next page load.
4. **SassyMCP repo:** add `"<variant id>": {"tier": "commercial", "addons": []}` to `DEFAULT_VARIANT_MAP` in `sassymcp/_lemonsqueezy.py` so activated keys display the right tier. (Until then they display "free". That's cosmetic, since no tool is gated.)
5. **Test:** `node scripts/smoke-store.mjs --products mcp-commercial` should print a checkout URL.

## Live wiring (verified 2026-11-08)

| Store slug | Checkout | Notes |
|---|---|---|
| `mcp-commercial` | **not yet**: needs `LS_VARIANT_MCP_COMMERCIAL` (steps above) | LS product **SassyMCP Commercial License** $99; license keys ON; activation limit 2. No fallback path, because the key must belong to this product. |
| `mcp-pro` | **200** via dedicated variant `LS_VARIANT_MCP_PRO` (**`1753676`**) | LS product **SassyMCP** $25; Generate license keys ON; activation limit 2; unlimited length. App activates against LS's own license API, so the LS-native key is required. |
| `sassy-talk` | **200** via dedicated variant `LS_VARIANT_SASSY_TALK` | Relay worker mints the key (`issueRelayLicense`); LS key generation is OFF for this product. |
| `winforensics` | **200** via dedicated variant `LS_VARIANT_WINFORENSICS` | winforensics-license-api mints WFP- keys (`issueWinforensicsLicense`); LS key generation OFF. |

`LS_FALLBACK_VARIANT` is deleted and no live product uses it. The fallback path in `resolveVariantId`/`handleCheckout` stays as a safety net for future SKUs marked `lsFallbackOk`.

Secrets present (2026-09-14 `wrangler secret list`): `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LS_VARIANT_MCP_PRO`, `LS_VARIANT_SASSY_TALK`, `LS_VARIANT_WINFORENSICS`, `RESEND_API_KEY`, `LICENSE_RELAY_ADMIN_TOKEN`, `WINF_LICENSE_ADMIN_TOKEN`, `LICENSE_SALT`, `LEMONSQUEEZY_DONATE_URL`. The five dead `STRIPE_*` secrets were deleted 2026-09-14.

SassyMCP `DEFAULT_VARIANT_MAP` / `~/.sassymcp/lemonsqueezy.json` map `1753676` → `{tier:"pro",addons:[]}`.

**Cleanup (optional):** duplicate pending LS variant `1958269` (same product/settings). The API can't DELETE it; remove it in the LS dashboard if desired. The product name in the LS UI is still **SassyMCP** (the API can't rename it to "Supporter").

## Deploys

Merges to `main` deploy automatically through `.github/workflows/deploy.yml` once the repository secret `CLOUDFLARE_API_TOKEN` is set (Settings → Secrets and variables → Actions). Without it, the workflow fails loudly and nothing deploys.
