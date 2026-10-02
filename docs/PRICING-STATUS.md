<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
   CodeMark: SCLLC1-Projects-NWFPCEXXEU67
-->
<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
-->
# Pricing & checkout status

Last verified: 2026-08-18 (live probes against production). Unchanged since
2026-07-31 — `sassy-talk` and `winforensics` have now been unbuyable by card for
**18 days**. Everything below still describes the live state.

This is the single place that records **what is priced, what can actually be
bought today, and what it takes to close the gap.** Keep it in sync with
`PRODUCTS` in `src/worker.js`, the `CATALOG` map in `public/store.html`, the
`UNWIRED` list in `public/checkout.js`, and the price table on `/store`.

## Current state

| Slug | Price | LS variant | `/api/checkout` today | Site behaviour |
|---|---|---|---|---|
| `mcp-pro` | $25 one-time | `1753676` via `LS_VARIANT_MCP_PRO` | **200** — works | Live buy button |
| `sassy-talk` | $3.99 one-time | none | **503** | Routes to `/contact` |
| `winforensics` | $9.99 one-time | none | **503** | Routes to `/contact` |
| `sector-scope` | $9.99 when it ships | `1874036` (published, unused) | **409** (`available:false`) | "Not on sale yet" |
| `website-creator` | $2 when it ships | n/a | **409** (`available:false`) | "Not on sale yet" |
| `mcp-forensics`, `mcp-team` | retired | n/a | **409** | Not shown |

Everything else we ship is free: SassyMCP itself (all 274 tools), Sassy Browser
(donation-funded), Sassy Brain, Foodie Finder, Rebel Tuner.

## Why sassy-talk and winforensics 503

`handleCheckout` resolves a variant in this order:

1. `LS_VARIANT_<PRODUCT>` secret, else
2. `LS_FALLBACK_VARIANT` + `custom_price` when `lsFallbackOk` is set, else
3. 503 with the "briefly offline … email us" message.

`LS_FALLBACK_VARIANT` was **deleted** when `mcp-pro` got its own dedicated
variant (see `LEMONSQUEEZY-ALL-OR-NOTHING.md`), and neither
`LS_VARIANT_SASSY_TALK` nor `LS_VARIANT_WINFORENSICS` was ever set. So both SKUs
fall straight through to step 3. `wrangler secret list` confirms only
`LS_VARIANT_MCP_PRO` exists.

Note that **license delivery for both of these does not depend on Lemon Squeezy
at all** — Sassy-Talk keys are minted by the PTT relay and WinForensics keys by
`winforensics-license-api`. The only thing missing is a variant to charge against.

## What can and cannot be automated

**Variant creation cannot.** The Lemon Squeezy REST API has POST endpoints for
customers, discounts, checkouts, webhooks and usage records only. Products,
variants and prices are read-only — confirmed against the live API reference on
2026-08-18. The feature request for it
([nolt #279](https://lemonsqueezy.nolt.io/279)) is three years old with no
official response. Creating the product is dashboard work, roughly five minutes
per SKU, and there is no supported way around it.

**Everything after that is automated.** `scripts/wire-variant.ps1` takes the ID
the dashboard hands you and does the rest:

```powershell
.\scripts\wire-variant.ps1 -Product winforensics -VariantId <id>
.\scripts\wire-variant.ps1 -Product sassy-talk   -VariantId <id>
```

It validates the variant against the LS API (published? right price? minting
license keys we don't want?), sets `LS_VARIANT_<PRODUCT>`, flips the schema.org
availability on `/store`, deploys, then probes production and prints a live
checkout URL. Turn **Generate license keys OFF** on both new variants — relay
and `winforensics-license-api` mint the real keys, and an LS key on top of that
is a second, useless key in the buyer's inbox.

## The site no longer needs reverting

There used to be three hand edits to undo "the same day" a variant was wired.
That step is deleted, and it is why this page sat stale for 18 days while two
shipping products pointed at a contact form.

`GET /api/catalog` now derives purchasability from the same variant resolution
`/api/checkout` performs. `public/store.html` and `public/checkout.js` read it at
load and reconcile themselves: buy button and no notice when a SKU is sellable,
`/contact` route and the honest notice when it is not. Set a secret, deploy, and
the storefront corrects itself. There is no longer a window where the site can
claim something the worker will refuse.

The markup ships in the honest "request a link" state, so a failed `/api/catalog`
fetch degrades to truthful copy rather than to a buy button that 503s.

**Fallback option, still available.** `npx wrangler secret put LS_FALLBACK_VARIANT`
set to `1753676` turns every `lsFallbackOk` SKU on at once via `custom_price`.
One command, no dashboard. Downside is unchanged: the underlying LS product is
still "SassyMCP" and that variant generates license keys, so buyers get an unused
key alongside their real one. Reasonable as a stopgap for a day, not as the
permanent answer.

Re-probe any time:

```bash
curl -s https://sassyconsultingllc.com/api/catalog | jq '.products | map_values(.purchasable)'
```
