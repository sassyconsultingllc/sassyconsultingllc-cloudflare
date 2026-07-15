# Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
# Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
# CodeMark: SCLLC1-sassyconsultingllc_cloudflare-HKQS4GWQ7PDD
#requires -Version 7
<#
.SYNOPSIS
  One-shot Lemon Squeezy store wiring. Run AFTER creating the six products in
  the LS dashboard (https://app.lemonsqueezy.com -> Store "Sassy Apps" 382820):

    SassyMCP Pro            $49
    SassyMCP Forensics      $29   (add-on)
    SassyMCP Team           $199
    Sassy-Talk              $3.99
    WinForensics-Pro        $2
    Website Creator         $2

  What it does:
    1. Sets LEMONSQUEEZY_STORE_ID on the worker.
    2. Creates the order_created/subscription_created webhook (if missing)
       with a fresh signing secret and sets LEMONSQUEEZY_WEBHOOK_SECRET.
    3. Pulls every variant from the LS API, maps product names to the
       PRODUCTS slugs in src/worker.js, and sets each LS_VARIANT_* secret.

.NOTES
  Reads the API key from $env:LEMON_SQUEEZY_TEST_KEY (or pass -ApiKey).
  Run from repo root: pwsh -File scripts/finish-lemonsqueezy.ps1
#>

[CmdletBinding()]
param(
    [string]$ApiKey = $env:LEMON_SQUEEZY_TEST_KEY,
    [string]$StoreId = '382820',
    [string]$WebhookUrl = 'https://sassyconsultingllc.com/api/webhook'
)

$ErrorActionPreference = 'Stop'
if (-not $ApiKey) { throw "No API key. Set LEMON_SQUEEZY_TEST_KEY or pass -ApiKey." }

$h = @{ Authorization = "Bearer $ApiKey"; Accept = 'application/vnd.api+json' }
$hPost = $h + @{ 'Content-Type' = 'application/vnd.api+json' }

function Set-WorkerSecret([string]$Name, [string]$Value) {
    $Value | npx wrangler secret put $Name | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "wrangler secret put $Name failed" }
    Write-Host "  secret set: $Name" -ForegroundColor Green
}

# ── 1. Store ID ─────────────────────────────────────────────────────────────
Write-Host "[1/3] LEMONSQUEEZY_STORE_ID = $StoreId"
Set-WorkerSecret 'LEMONSQUEEZY_STORE_ID' $StoreId

# ── 2. Webhook ──────────────────────────────────────────────────────────────
Write-Host "[2/3] webhook -> $WebhookUrl"
$existing = (Invoke-RestMethod -Uri 'https://api.lemonsqueezy.com/v1/webhooks' -Headers $h).data |
    Where-Object { $_.attributes.url -eq $WebhookUrl }
if ($existing) {
    Write-Host "  webhook already exists (id=$($existing[0].id), test_mode=$($existing[0].attributes.test_mode))."
    Write-Host "  NOTE: its secret is not retrievable; if LEMONSQUEEZY_WEBHOOK_SECRET is unset," -ForegroundColor Yellow
    Write-Host "  delete the webhook in the dashboard and re-run this script." -ForegroundColor Yellow
} else {
    $secret = -join ((1..20) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
    $body = @{ data = @{
        type = 'webhooks'
        attributes = @{ url = $WebhookUrl; events = @('order_created','subscription_created'); secret = $secret }
        relationships = @{ store = @{ data = @{ type = 'stores'; id = $StoreId } } }
    } } | ConvertTo-Json -Depth 6
    $r = Invoke-RestMethod -Uri 'https://api.lemonsqueezy.com/v1/webhooks' -Method Post -Headers $hPost -Body $body
    Write-Host "  webhook created (id=$($r.data.id), test_mode=$($r.data.attributes.test_mode))"
    if ($r.data.attributes.test_mode) {
        Write-Host "  WARNING: webhook is TEST MODE — live orders will NOT fire it." -ForegroundColor Yellow
        Write-Host "  Activate the store + use a live API key, then re-run." -ForegroundColor Yellow
    }
    Set-WorkerSecret 'LEMONSQUEEZY_WEBHOOK_SECRET' $secret
}

# ── 3. Variant IDs ──────────────────────────────────────────────────────────
Write-Host "[3/3] variant mapping"
$products = (Invoke-RestMethod -Uri 'https://api.lemonsqueezy.com/v1/products?page[size]=100' -Headers $h).data
$variants = (Invoke-RestMethod -Uri 'https://api.lemonsqueezy.com/v1/variants?page[size]=100' -Headers $h).data
if (-not $products) { throw "Store has no products. Create them in the LS dashboard first (see .SYNOPSIS)." }

# Product-name pattern -> worker slug. Evaluated top-down; first match wins,
# so the more specific SassyMCP patterns come before the bare 'forensics'.
$slugMap = [ordered]@{
    'mcp-forensics'   = 'sassymcp.*forensics|forensics.*add'
    'mcp-team'        = 'sassymcp.*team|mcp team'
    'mcp-pro'         = 'sassymcp'
    'winforensics'    = 'winforensics'
    'sassy-talk'      = 'sassy[- ]?talk'
    'website-creator' = 'website creator'
}

$assigned = @{}
foreach ($p in $products) {
    $name = $p.attributes.name
    $slug = ($slugMap.GetEnumerator() | Where-Object { $name -imatch $_.Value } | Select-Object -First 1).Key
    if (-not $slug) { Write-Warning "no slug match for LS product '$name' — skipped"; continue }
    if ($assigned.Contains($slug)) { Write-Warning "'$name' also matched '$slug' (already taken) — skipped"; continue }
    $variant = $variants | Where-Object { "$($_.attributes.product_id)" -eq "$($p.id)" } | Select-Object -First 1
    if (-not $variant) { Write-Warning "product '$name' has no variant — skipped"; continue }
    $assigned[$slug] = $variant.id
    $envName = 'LS_VARIANT_' + $slug.ToUpper().Replace('-', '_')
    Write-Host "  $name -> $slug (variant $($variant.id))"
    Set-WorkerSecret $envName "$($variant.id)"
}

$expected = @('mcp-pro','mcp-forensics','mcp-team','sassy-talk','winforensics','website-creator')
$missing = $expected | Where-Object { -not $assigned.Contains($_) }
if ($missing) {
    Write-Host "`nMISSING (create these products in the dashboard, then re-run): $($missing -join ', ')" -ForegroundColor Yellow
} else {
    Write-Host "`nAll six products wired. Checkout is live once the worker is deployed." -ForegroundColor Green
}
