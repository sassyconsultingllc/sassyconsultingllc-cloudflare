<!--
   Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
   Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
   CodeMark: SCLLC1-sassyconsultingllc_cloudflare-TEOQTJWWOZYO
-->
# Sassy Consulting LLC - Full Stack Site

Cloudflare Workers site with Lemon Squeezy payments, license generation, network analysis, and product downloads.

## Structure

```
sassyconsultingllc-fullstack/
├── public/               # Static files
│   ├── index.html        # Main page with products + network dashboard
│   ├── sassy-talk.html   # Product page with buy button
│   ├── winforensics.html # Product page with buy button
│   ├── website-creator.html
│   ├── browser.html      # Coming soon
│   ├── success.html      # Post-purchase license display
│   ├── styles.css        # Dark theme styles
│   ├── app.js            # Dashboard JavaScript
│   └── checkout.js       # Lemon Squeezy checkout handler
├── src/
│   └── worker.js         # Cloudflare Worker (API routes)
├── migrations/
│   └── 0001_init.sql     # D1 database schema
├── wrangler.toml         # Cloudflare config
└── package.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create D1 Database

```bash
wrangler d1 create sassy-db
# Copy the database_id to wrangler.toml
wrangler d1 execute sassy-db --file=./migrations/0001_init.sql
```

### 3. Create R2 Bucket

```bash
wrangler r2 bucket create sassy-downloads
```

### 4. Configure Lemon Squeezy

1. Create a Lemon Squeezy store at https://app.lemonsqueezy.com
2. Create products + variants for each SKU (one-time for apps, monthly+annual subscriptions for MCP tiers):
   - Sassy-Talk                  (one-time)
   - WinForensics                (one-time)
   - Website Creator             (one-time)
   - SassyMCP Pro                (subscription: Monthly + Annual variants)
   - SassyMCP Team               (subscription: Monthly + Annual variants)
   - Sassy Browser Donation      (one-time, customer-named price)
3. Note the store ID and each variant ID from the dashboard URLs.
4. Generate an API key at Settings > API.
5. Configure a webhook (see step 7) and copy the signing secret.

### 5. Set Secrets

```bash
wrangler secret put LEMONSQUEEZY_API_KEY
wrangler secret put LEMONSQUEEZY_STORE_ID
wrangler secret put LEMONSQUEEZY_WEBHOOK_SECRET
wrangler secret put LEMONSQUEEZY_DONATE_URL          # full URL e.g. https://sassyconsultingllc.lemonsqueezy.com/buy/<variant-id>
wrangler secret put LS_VARIANT_SASSY_TALK
wrangler secret put LS_VARIANT_WINFORENSICS
wrangler secret put LS_VARIANT_WEBSITE_CREATOR
wrangler secret put LS_VARIANT_MCP_PRO          # one-time; catalog moved off subscriptions
wrangler secret put LS_VARIANT_MCP_FORENSICS
wrangler secret put LS_VARIANT_MCP_TEAM
wrangler secret put LICENSE_SALT
wrangler secret put WINF_LICENSE_ADMIN_TOKEN    # same value as ISSUE_ADMIN_TOKEN on winforensics-license-api; lets the webhook mint WFP- keys the desktop app can activate, and authenticates PUT /api/admin/gated-upload (release pipeline)
wrangler secret put RESEND_API_KEY              # optional: enables buyer license-key emails via Resend (verify the sending domain there first); unset = success page + LS receipt only
```

The `_MONTHLY` / `_ANNUAL` suffixed variants are only read for products with
`mode: "subscription"` in `PRODUCTS` (src/worker.js). Every current product is
one-time (`mode: "payment"`), so only the base `LS_VARIANT_<PRODUCT>` vars above
are required.

```bash
```

### 6. Deploy

```bash
wrangler deploy
```

### 7. Configure Lemon Squeezy Webhook

1. Go to Lemon Squeezy Dashboard > Settings > Webhooks
2. Add endpoint: `https://sassyconsultingllc.com/api/webhook`
3. Select events: `order_created`, `subscription_created`
4. Copy the signing secret and set as `LEMONSQUEEZY_WEBHOOK_SECRET`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/analyze | POST | Network analysis |
| /api/checkout | POST | Create Lemon Squeezy checkout session |
| /api/verify | POST | Verify payment, get license |
| /api/webhook | POST | Lemon Squeezy webhook handler (HMAC-SHA256 via `X-Signature`) |
| /donate | GET | 302 redirect to `LEMONSQUEEZY_DONATE_URL` |
| /api/validate | POST | Validate license key |
| /api/vpn-recommendations | GET | VPN recommendations |
| /api/downloads | GET | Download list |
| /download/{product}/{platform}/{file} | GET | File download |

## Products

All products are $2.00 one-time purchase:

- **Sassy-Talk**: Encrypted walkie-talkie (Android/Windows)
- **WinForensics**: Digital forensics toolkit (Windows)
- **Website Creator**: AI WordPress builder

## License Key Format

```
SASSY-PROD-XXXX-XXXX-XXXX
```

Where PROD is first 4 chars of product name (e.g., SASS, WINF, WEBS).

## Local Development

```bash
npm run dev
# Opens http://localhost:8787
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

- LEMONSQUEEZY_API_KEY - Lemon Squeezy API bearer token
- LEMONSQUEEZY_STORE_ID - Numeric store ID
- LEMONSQUEEZY_WEBHOOK_SECRET - Webhook HMAC-SHA256 signing secret
- LEMONSQUEEZY_DONATE_URL - Full hosted-checkout URL for the donation variant
- LS_VARIANT_* - Variant IDs per product / billing cycle (see Setup step 5)
- LICENSE_SALT - Salt for license key generation
- RESEND_API_KEY - (Optional) Transactional email delivery

## Project Stats

| Metric | Value |
|--------|-------|
| Primary Language | JavaScript (Worker), Rust (Contact Form Handler) |
| JS Source Files | 3 (checkout.js, glossary.js, browser.js) |
| Rust Source Files | 5 (lib.rs, models.rs, validator.rs, errors.rs, email.rs) |
| HTML Pages | 11 (index, contact, pricing, aboutme, sassy-talk, winforensics, etc.) |
| CSS Files | 2 (styles.css, design-system.css) |
| SQL Migrations | 3 (0001_init.sql, 0002_licenses.sql, nda-schema.sql) |
| Infrastructure | Cloudflare Workers, D1, R2, Lemon Squeezy |

## Copyright

Copyright (c) 2025 Sassy Consulting LLC. All rights reserved.
Veteran-Owned Business.

Last Updated: 2026-05-15
