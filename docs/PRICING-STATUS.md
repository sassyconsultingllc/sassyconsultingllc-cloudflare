<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
   CodeMark: SCLLC1-Projects-NWFPCEXXEU67
-->
# Pricing & checkout status

Last verified: 2026-10-07 (live probes against production + Lemon Squeezy API).

This is the single place that records **what is priced, what can actually be
bought today, and what it takes to close the gap.** Keep it in sync with
`PRODUCTS` in `src/worker.js`, the storefront on `/store`, and the Lemon
Squeezy dashboard for store **Sassy Consulting LLC Apps** (store id `377151`).

## Current state

| Slug | Price | LS variant | `/api/checkout` today | Site behaviour |
|---|---|---|---|---|
| `mcp-pro` | $25 one-time | `1753676` via `LS_VARIANT_MCP_PRO` (published; keys ON, 2 seats) | **200** | Live buy button |
| `sassy-talk` | $3.99 one-time | via `LS_VARIANT_SASSY_TALK` (keys OFF; relay mints) | **200** | Live buy button |
| `winforensics` | $29 Home one-time (`winforensics-tech`: $149 Technician) | via `LS_VARIANT_WINFORENSICS` (keys OFF; WFP- API mints) | **200** | Live buy button |
| `sector-scope` | $9.99 one-time | `1874036` via `LS_VARIANT_SECTOR_SCOPE` (keys ON, 2 seats, unlimited length) | **200** | Live buy button |
| `website-creator` | $2 when it ships | n/a | **409** (`available:false`) | "Not on sale yet" |
| `mcp-forensics`, `mcp-team` | retired | n/a | **409** | Not shown |

Everything else we ship is free: SassyMCP itself (all tools unlocked), Sassy
Browser (donation-funded), Sassy Brain, Foodie Finder (Play Store), Rebel Tuner.

## Lemon Squeezy hygiene (2026-10-06)

| Item | Status |
|---|---|
| Webhook `https://sassyconsultingllc.com/api/webhook` | Live, `order_created` + `subscription_created`, not test mode |
| Donate (`/donate` → Donation through website) | Pay-what-you-want, **min $1**, suggested $5 |
| Foodie Finder LS product | **Draft** — public buy link 404s (Play Store app is free) |
| SassyMCP duplicate variant `1958269` | **Deleted** in LS dashboard (2026-10-07). Only published `1753676` remains. |
| Sector Scope LS product | Still published — site refuses purchase until a build + activation exist |

`LS_FALLBACK_VARIANT` is not set. Dedicated `LS_VARIANT_*` secrets cover the
three live SKUs.

## Wiring a new variant

Lemon Squeezy's REST API cannot create or update products/variants/prices
(GET/HEAD only). Create the product in the dashboard, then:

```powershell
.\scripts\wire-variant.ps1 -Product <slug> -VariantId <id>
```

Turn **Generate license keys OFF** on `sassy-talk` and `winforensics` — relay
and `winforensics-license-api` mint the real keys. Keep keys **ON** for
`mcp-pro` (SassyMCP activates against Lemon Squeezy's license API).

`scripts/finish-lemonsqueezy.ps1` prefers a **published** variant when mapping
products (guards against re-pointing at a pending duplicate if one appears again).

## Storefront reconciliation

`GET /api/catalog` derives purchasability from the same variant resolution
`/api/checkout` performs. The storefront reads it at load: buy button when a
SKU is sellable, honest offline/contact copy when it is not.

Re-probe any time:

```bash
curl -s https://sassyconsultingllc.com/api/catalog | jq '.products | map_values(.purchasable)'
```
