# Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
# Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
# CodeMark: SCLLC1-Projects-3KYQOPVYNZYE
<#
    Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
    Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.

.SYNOPSIS
    Wire a Lemon Squeezy variant to a store SKU, end to end.

.DESCRIPTION
    Lemon Squeezy's REST API cannot create products or variants — only
    customers, discounts, checkouts, webhooks and usage records have POST
    endpoints. The open feature request for it is three years old with no
    committed timeline. So variant *creation* is the one step that stays manual;
    everything downstream of "I have a variant ID" is automated here:

      1. Validate the variant against the LS API (exists, published, price,
         and whether it mints license keys we do not want).
      2. Set the LS_VARIANT_<PRODUCT> Worker secret.
      3. Deploy.
      4. Reconcile the JSON-LD availability on /store.
      5. Probe production and confirm a real checkout URL comes back.

    Site copy and buy buttons need no edit: /api/catalog derives purchasability
    from the same resolution /api/checkout performs, and public/store.html plus
    public/checkout.js read it at runtime.

.PARAMETER Product
    Store slug, e.g. sassy-talk, winforensics, mcp-pro, sector-scope.

.PARAMETER VariantId
    Numeric Lemon Squeezy variant ID (the number in the dashboard URL).

.PARAMETER SkipDeploy
    Set the secret and validate, but do not deploy. Useful for staging a batch.

.EXAMPLE
    .\scripts\wire-variant.ps1 -Product winforensics -VariantId 1874036
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Product,
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+$')][string]$VariantId,
    [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo

# Slug -> expected price in cents, mirroring PRODUCTS in src/worker.js. Used
# only to warn on a mismatch; the Worker never trusts this file.
$expectedCents = @{
    'sassy-talk'      = 399
    'winforensics'    = 999
    'mcp-pro'         = 2500
    'sector-scope'    = 999
    'website-creator' = 200
}

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "    !!  $msg" -ForegroundColor Yellow }

if (-not $expectedCents.ContainsKey($Product)) {
    throw "Unknown slug '$Product'. Add it to PRODUCTS in src/worker.js first."
}

$secretName = 'LS_VARIANT_' + ($Product.ToUpper() -replace '-', '_')

# ---------------------------------------------------------------------------
# 1. Validate the variant before we wire anything to it.
# ---------------------------------------------------------------------------
Write-Step "Validating variant $VariantId against the Lemon Squeezy API"

# Key comes from the environment or .env — never echoed, never passed on a
# command line where it would land in the shell history or process table.
$lsKey = $env:LEMONSQUEEZY_API_KEY
if (-not $lsKey -and (Test-Path '.env')) {
    $line = Select-String -Path '.env' -Pattern '^\s*LEMONSQUEEZY_API_KEY\s*=' -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if ($line) { $lsKey = ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'") }
}

if (-not $lsKey) {
    Write-Warn2 "No LEMONSQUEEZY_API_KEY in env or .env — skipping validation."
    Write-Warn2 "A wrong ID here sells the wrong product at the wrong price. Double-check it."
} else {
    $headers = @{
        'Authorization' = "Bearer $lsKey"
        'Accept'        = 'application/vnd.api+json'
    }
    try {
        $v = Invoke-RestMethod -Method GET -Uri "https://api.lemonsqueezy.com/v1/variants/$VariantId" -Headers $headers
    } catch {
        throw "Variant $VariantId not retrievable: $($_.Exception.Message). Check the ID and the API key's store."
    }

    $a = $v.data.attributes
    Write-Ok "Name:   $($a.name)"
    Write-Ok "Status: $($a.status)"

    if ($a.status -ne 'published') {
        Write-Warn2 "Variant is '$($a.status)', not 'published'. Buyers cannot check out against a draft/pending variant."
    }

    # A variant that mints its own license keys hands the buyer a second, useless
    # key alongside the real one from the relay / winforensics-license-api. That
    # is precisely the wart documented in LEMONSQUEEZY-ALL-OR-NOTHING.md.
    if ($a.has_license_keys -eq $true -and $Product -in @('sassy-talk', 'winforensics')) {
        Write-Warn2 "This variant generates LS license keys, but $Product keys are minted elsewhere."
        Write-Warn2 "Buyers will receive two keys, one of which activates nothing. Turn 'Generate license keys' OFF in the LS dashboard."
    }

    if ($null -ne $a.price -and $a.price -ne 0) {
        $want = $expectedCents[$Product]
        if ($a.price -ne $want) {
            Write-Warn2 "LS price is $($a.price) cents; src/worker.js says $want. Reconcile before selling."
        } else {
            Write-Ok "Price matches PRODUCTS ($want cents)"
        }
    }
}

# ---------------------------------------------------------------------------
# 2. Set the secret.
# ---------------------------------------------------------------------------
Write-Step "Setting Worker secret $secretName"
$VariantId | npx.cmd wrangler secret put $secretName
if ($LASTEXITCODE -ne 0) { throw "wrangler secret put failed with exit code $LASTEXITCODE" }
Write-Ok "$secretName set"

# ---------------------------------------------------------------------------
# 3. Reconcile the JSON-LD availability on the store page.
# ---------------------------------------------------------------------------
Write-Step 'Reconciling schema.org availability on /store'
$ldName = @{
    'sassy-talk'      = 'Sassy-Talk'
    'winforensics'    = 'WinForensics-Pro'
    'mcp-pro'         = 'SassyMCP Supporter'
    'sector-scope'    = 'SectorScope'
    'website-creator' = 'Website Creator'
}[$Product]

$storePath = Join-Path $repo 'public\store.html'
$store = Get-Content $storePath -Raw
$pattern = '(?<pre>"@type":"Product","name":"' + [regex]::Escape($ldName) +
           '","offers":\{"@type":"Offer","price":"[^"]*","priceCurrency":"USD","availability":")[^"]*(?<post>")'
if ($store -match $pattern) {
    $updated = [regex]::Replace($store, $pattern, '${pre}https://schema.org/InStock${post}')
    if ($updated -ne $store) {
        Set-Content -Path $storePath -Value $updated -NoNewline -Encoding UTF8
        Write-Ok "$ldName marked InStock"
    } else {
        Write-Ok "$ldName already InStock"
    }
} else {
    Write-Warn2 "No JSON-LD entry matched for '$ldName' — update public/store.html by hand."
}

# ---------------------------------------------------------------------------
# 4. Deploy.
# ---------------------------------------------------------------------------
if ($SkipDeploy) {
    Write-Step 'Skipping deploy (-SkipDeploy). Secret is live only after you deploy.'
    Pop-Location
    return
}

Write-Step 'Deploying Worker'
npx.cmd wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "wrangler deploy failed with exit code $LASTEXITCODE" }
Write-Ok 'Deployed'

# ---------------------------------------------------------------------------
# 5. Prove it from the outside. A green deploy is not a working checkout.
# ---------------------------------------------------------------------------
Write-Step 'Probing production'
Start-Sleep -Seconds 3

$catalog = Invoke-RestMethod -Method GET -Uri 'https://sassyconsultingllc.com/api/catalog'
$entry = $catalog.products.$Product
if ($entry.purchasable) {
    Write-Ok "/api/catalog reports $Product purchasable at $($entry.price)"
} else {
    Write-Warn2 "/api/catalog still reports $Product unpurchasable (reason: $($entry.reason))"
}

$body = @{ product = $Product; email = 'ops@sassyconsultingllc.com' } | ConvertTo-Json -Compress
try {
    $resp = Invoke-RestMethod -Method POST -Uri 'https://sassyconsultingllc.com/api/checkout' `
        -Headers @{ 'Origin' = 'https://sassyconsultingllc.com' } `
        -ContentType 'application/json' -Body $body
    if ($resp.checkout_url) {
        Write-Ok 'Checkout live:'
        Write-Host "        $($resp.checkout_url)" -ForegroundColor Green
        Write-Host "`nOpen that URL and confirm the product name, price and receipt copy before announcing." -ForegroundColor Cyan
        Write-Host "Then update docs/PRICING-STATUS.md." -ForegroundColor Cyan
    } else {
        Write-Warn2 "No checkout_url in response: $($resp | ConvertTo-Json -Compress)"
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Warn2 "POST /api/checkout returned HTTP $code"
    Write-Warn2 '503 here means the secret did not take — confirm with: npx.cmd wrangler secret list'
}

Pop-Location
