# Lemon Squeezy — all-or-nothing MCP (live)

Last updated: 2026-09-14

## Commercial truth (do not re-fragment)

- **SassyMCP v1.13+** ships every tool group unlocked. There is no Pro / Forensics / Team feature gate.
- The website sells one optional **SassyMCP Supporter** SKU (`mcp-pro` slug, $25 one-time). It buys a badge + 2 seats, not tools.
- **CuratedMCP** (curatedmcp.com) is an external directory listing, not a product brand. List as **Free**; do not use their paid Stripe rev-share tiers.
- Do **not** create LS products named Forensics or Team.

## Live wiring (verified 2026-09-14)

All three live SKUs now check out against their own dedicated LS variants;
`LS_FALLBACK_VARIANT` is deleted and no longer referenced by any live product
(the worker's fallback path in `resolveVariantId`/`handleCheckout` stays as a
safety net for any future SKU that has `lsFallbackOk` but no dedicated variant).

| Store slug | Checkout | Notes |
|---|---|---|
| `mcp-pro` | **200** via dedicated variant `LS_VARIANT_MCP_PRO` (**`1753676`**) | LS product **SassyMCP** $25; Generate license keys ON; activation limit 2; unlimited length. App activates against LS's own license API, so the LS-native key is required. |
| `sassy-talk` | **200** via dedicated variant `LS_VARIANT_SASSY_TALK` | Relay worker mints the key (`issueRelayLicense`); LS key generation is OFF for this product. |
| `winforensics` | **200** via dedicated variant `LS_VARIANT_WINFORENSICS` | winforensics-license-api mints WFP- keys (`issueWinforensicsLicense`); LS key generation OFF. |

Confirmed present in `wrangler secret list` (2026-09-14): `LEMONSQUEEZY_API_KEY`,
`LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LS_VARIANT_MCP_PRO`,
`LS_VARIANT_SASSY_TALK`, `LS_VARIANT_WINFORENSICS`, `RESEND_API_KEY`,
`LICENSE_RELAY_ADMIN_TOKEN`, `WINF_LICENSE_ADMIN_TOKEN`, `LICENSE_SALT`,
`LEMONSQUEEZY_DONATE_URL`. `LS_FALLBACK_VARIANT` absent (correct).

**Dead Stripe secrets to delete (Stripe suspended; no `STRIPE_*` var is read by
the worker):** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MCP_PRO_MONTHLY`,
`STRIPE_PRICE_MCP_PRO_ANNUAL`, `STRIPE_PRICE_MCP_TEAM_MONTHLY`,
`STRIPE_PRICE_MCP_TEAM_ANNUAL`.

SassyMCP `DEFAULT_VARIANT_MAP` / `~/.sassymcp/lemonsqueezy.json` map `1753676` → `{tier:"pro",addons:[]}`.

**Cleanup (optional):** duplicate pending LS variant `1958269` (same product/settings) — API cannot DELETE; remove in LS dashboard if desired. Product name in LS UI is still **SassyMCP** (API cannot rename to “Supporter”).

## CuratedMCP

Resubmitted 2026-07-28 (Free + SHA256 `.mcpb` + tip → https://sassyconsultingllc.com/store#sassymcp). See SassyMCP `docs/launch/07-directories.md`.
