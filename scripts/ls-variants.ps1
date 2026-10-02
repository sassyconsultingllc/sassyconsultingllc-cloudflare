# Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
# Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
# CodeMark: SCLLC1-Projects-N7UL7CAW4ZEJ
<#
    Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
    Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.

.SYNOPSIS
    List every Lemon Squeezy product and its variant IDs.

.DESCRIPTION
    The dashboard URL only exposes the *product* ID; LS_VARIANT_* secrets need the
    *variant* ID, which the UI never shows directly. This reads the API key from
    the environment or .env, calls the read-only variants endpoint, and prints a
    table you can feed straight into wire-variant.ps1.

    The key is read into a local variable and never printed, never passed as a
    command-line argument, and never written to disk.

.EXAMPLE
    .\scripts\ls-variants.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

$lsKey = $env:LEMONSQUEEZY_API_KEY
if (-not $lsKey) {
    $envFile = Join-Path $repo '.env'
    if (Test-Path $envFile) {
        $line = Select-String -Path $envFile -Pattern '^\s*LEMONSQUEEZY_API_KEY\s*=' -ErrorAction SilentlyContinue |
                Select-Object -First 1
        if ($line) { $lsKey = ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'") }
    }
}
if (-not $lsKey) { throw 'No LEMONSQUEEZY_API_KEY found in environment or .env' }

$headers = @{
    'Authorization' = "Bearer $lsKey"
    'Accept'        = 'application/vnd.api+json'
}

$rows = @()
$url  = 'https://api.lemonsqueezy.com/v1/variants?page[size]=100'

# Paginate. No caps: if the store grows past one page, follow every next link.
while ($url) {
    $resp = Invoke-RestMethod -Method GET -Uri $url -Headers $headers
    foreach ($v in $resp.data) {
        $a = $v.attributes
        $rows += [pscustomobject]@{
            VariantId   = $v.id
            ProductId   = $a.product_id
            Name        = $a.name
            Status      = $a.status
            PriceCents  = $a.price
            LicenseKeys = [bool]$a.has_license_keys
        }
    }
    $url = $resp.links.next
}

$rows | Sort-Object ProductId, VariantId | Format-Table -AutoSize

Write-Host ''
Write-Host 'Wire one with:' -ForegroundColor Cyan
Write-Host '  .\scripts\wire-variant.ps1 -Product <slug> -VariantId <VariantId>' -ForegroundColor Cyan
Write-Host ''
Write-Host 'LicenseKeys True on sassy-talk / winforensics means buyers get a second,' -ForegroundColor Yellow
Write-Host 'useless key. Turn "Generate license keys" OFF for those in the dashboard.' -ForegroundColor Yellow
