# Lemon Squeezy — all-or-nothing MCP (live)

Last updated: 2026-07-28

## Commercial truth (do not re-fragment)

- **SassyMCP v1.13+** ships every tool group unlocked. There is no Pro / Forensics / Team feature gate.
- The website sells one optional **SassyMCP Supporter** SKU (`mcp-pro` slug, $25 one-time). It buys a badge + 2 seats, not tools.
- **CuratedMCP** (curatedmcp.com) is an external directory listing, not a product brand. List as **Free**; do not use their paid Stripe rev-share tiers.
- Do **not** create LS products named Forensics or Team.

## Live wiring (2026-07-28)

| Store slug | Checkout | Notes |
|---|---|---|
| `mcp-pro` | **200** via dedicated variant **`1753676`** | LS product **SassyMCP** $25; Generate license keys ON; activation limit 2; unlimited length. `LS_VARIANT_MCP_PRO=1753676`. `LS_FALLBACK_VARIANT` **deleted**. |
| `sassy-talk` | fallback OK while dedicated variant unset | Relay mints keys |
| `winforensics` | fallback OK while dedicated variant unset | WFP- keys from winforensics-license-api |

SassyMCP `DEFAULT_VARIANT_MAP` / `~/.sassymcp/lemonsqueezy.json` map `1753676` → `{tier:"pro",addons:[]}`.

**Cleanup (optional):** duplicate pending LS variant `1958269` (same product/settings) — API cannot DELETE; remove in LS dashboard if desired. Product name in LS UI is still **SassyMCP** (API cannot rename to “Supporter”).

## CuratedMCP

Resubmitted 2026-07-28 (Free + SHA256 `.mcpb` + tip → https://sassyconsultingllc.com/store#sassymcp). See SassyMCP `docs/launch/07-directories.md`.
