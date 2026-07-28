# Lemon Squeezy — remaining Shane steps (all-or-nothing MCP)

Last updated: 2026-07-28

## Commercial truth (do not re-fragment)

- **SassyMCP v1.13+** ships every tool group unlocked. There is no Pro / Forensics / Team feature gate.
- The website sells one optional **SassyMCP Supporter** SKU (`mcp-pro` slug, $25 one-time). It buys a badge + 2 seats, not tools.
- **CuratedMCP** (curatedmcp.com) is an external directory listing, not a product brand. List as **Free**; do not use their paid Stripe rev-share tiers.
- Do **not** create LS products named Forensics or Team.

## Already working (no login required for buyers)

| Store slug | Checkout | Notes |
|---|---|---|
| `mcp-pro` | 200 via `LS_FALLBACK_VARIANT` + `custom_price` | Foodie Finder variant with license keys ON; map variant → `{tier:"pro",addons:[]}` in SassyMCP |
| `sassy-talk` | fallback OK | Relay mints keys |
| `winforensics` | fallback OK | WFP- keys from winforensics-license-api |

## Shane dashboard steps (optional cleanup)

1. Log into https://app.lemonsqueezy.com → LIVE store **Sassy Consulting LLC Apps** (`377151`).
2. Create **one** product: **SassyMCP Supporter**, price **$25**, **Generate license keys: ON**, activation limit **2**.
3. Do not create Forensics / Team / Website Creator (no artifact for Website Creator).
4. From repo root:
   ```powershell
   $env:LEMON_SQUEEZY_API_KEY = '<live key>'
   pwsh -File scripts/finish-lemonsqueezy.ps1
   ```
5. After secrets are set: `npx wrangler secret delete LS_FALLBACK_VARIANT` (only once dedicated mcp-pro variant is live).
6. Bake the new variant ID into `V:\Projects\SassyMCP\sassymcp\_lemonsqueezy.py` `DEFAULT_VARIANT_MAP` and cut a SassyMCP release if needed.

## CuratedMCP resubmit

1. Confirm v1.14.0+ build (SelfMod gated; no raw token on stdout).
2. Submit SHA256-pinned `.mcpb` (or PyPI), pricing=Free, no metering claims.
3. Point “support / tip” at https://sassyconsultingllc.com/store#sassymcp — not CuratedMCP paid tiers.
