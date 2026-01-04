# Sassy Consulting LLC - Full Stack Site

Cloudflare Workers site with Stripe payments, license generation, network analysis, and product downloads.

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
│   └── checkout.js       # Stripe checkout handler
├── src/
│   └── worker.js         # Cloudflare Worker (API routes)
├── migrations/
│   └── 0001_init.sql     # D1 database schema
├── .env.example          # Environment variable template
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

### 4. Configure Stripe

1. Create Stripe account at https://dashboard.stripe.com
2. Create products for each app ($2.00 each, one-time payment):
   - Sassy-Talk
   - WinForensics
   - Website Creator
3. Copy the price IDs

### 5. Set Secrets

```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_PRICE_SASSY_TALK
wrangler secret put STRIPE_PRICE_WINFORENSICS
wrangler secret put STRIPE_PRICE_WEBSITE_CREATOR
wrangler secret put LICENSE_SALT
```

### 6. Deploy

```bash
wrangler deploy
```

### 7. Configure Stripe Webhook

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://sassyconsultingllc.com/api/webhook`
3. Select events: `checkout.session.completed`
4. Copy signing secret and set as STRIPE_WEBHOOK_SECRET

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/analyze | POST | Network analysis |
| /api/checkout | POST | Create Stripe checkout session |
| /api/verify | POST | Verify payment, get license |
| /api/webhook | POST | Stripe webhook handler |
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

- STRIPE_SECRET_KEY - Stripe API key
- STRIPE_WEBHOOK_SECRET - Webhook signing secret
- STRIPE_PRICE_* - Price IDs for each product
- LICENSE_SALT - Salt for license key generation
- POSTMARK_API_KEY - (Optional) Email delivery

## Copyright

Copyright (c) 2025 Sassy Consulting LLC. All rights reserved.
Veteran-Owned Business.
