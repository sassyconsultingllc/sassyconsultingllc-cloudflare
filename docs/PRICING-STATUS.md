<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
-->
# Pricing & checkout status

Last verified: 2026-07-31 (live probes against production).

This is the single place that records **what is priced, what can actually be
bought today, and what it takes to close the gap.** Keep it in sync with
`PRODUCTS` in `src/worker.js`, the `CATALOG` map in `public/store.html`, the
`UNWIRED` list in `public/checkout.js`, and the price table on `/store`.

## Current state

| Slug | Price | LS variant | `/api/checkout` today | Site behaviour |
|---|---|---|---|---|
| `mcp-pro` | $25 one-time | `1753676` via `LS_VARIANT_MCP_PRO` | **200** — works | Live buy button |
| `sassy-talk` | $3.99 one-time | none | **503** | Routes to `/contact` |
| `winforensics` | $2 one-time | none | **503** | Routes to `/contact` |
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

## Two ways to close it

**Option A — dedicated LS products (preferred, ~10 min in the dashboard).**
Create a real product + variant for each in Lemon Squeezy, then:

```bash
npx wrangler secret put LS_VARIANT_SASSY_TALK
npx wrangler secret put LS_VARIANT_WINFORENSICS
```

Buyers see the correct product name on the LS receipt, and pricing lives in the
dashboard where it belongs.

**Option B — restore the shared fallback (one command, less tidy).**

```bash
npx wrangler secret put LS_FALLBACK_VARIANT
```

Set it to `1753676`. The worker then charges `priceCents` from `PRODUCTS` via
`custom_price` and overrides the displayed name and description. Downside: the
underlying LS product is still "SassyMCP", and that variant has license-key
generation on, so buyers get an unused LS key alongside their real one.

## After either option, revert the site guards

These three edits made the site honest while checkout is down. Undo them the
same day a variant is wired, or the buttons stay pointed at `/contact`:

1. `public/store.html` — re-add `sassy-talk` and `winforensics` to `CATALOG`,
   drop the two `.note` blocks, restore the `data-buy` buttons.
2. `public/checkout.js` — empty the `UNWIRED` array.
3. `public/store.html`, `public/sassy-talk.html`, `public/winforensics.html`,
   `public/index.html` — remove the "card checkout is temporarily offline"
   copy and the "Request … link" button labels.

Then re-probe:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://sassyconsultingllc.com/api/checkout -H "Content-Type: application/json" -H "Origin: https://sassyconsultingllc.com" -d '{"product":"sassy-talk","email":"you@example.com"}'
```

200 with a `checkout_url` means it is live.
