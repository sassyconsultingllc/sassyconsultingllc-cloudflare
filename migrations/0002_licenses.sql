-- ============================================================================
-- Sassy Consulting LLC - License System Schema
-- Copyright (c) 2025 Sassy Consulting LLC
-- ============================================================================

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    product TEXT NOT NULL,
    tier TEXT DEFAULT 'standard',
    stripe_session_id TEXT,
    stripe_customer_id TEXT,
    activated_at DATETIME,
    revoked INTEGER DEFAULT 0,
    revoked_at DATETIME,
    revoke_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_product ON licenses(product);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);

-- License activations (track where licenses are used)
CREATE TABLE IF NOT EXISTS license_activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL,
    machine_hash TEXT,
    ip_hash TEXT,
    activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (license_key) REFERENCES licenses(license_key)
);

-- Products catalog
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    stripe_price_id TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default products ($2.00 each)
INSERT OR IGNORE INTO products (slug, name, description, price_cents) VALUES
    ('sassy-talk', 'Sassy-Talk', 'Encrypted walkie-talkie for Android & Windows', 200),
    ('winforensics', 'WinForensics', 'Digital forensics toolkit', 200),
    ('mybestsites-pro', 'My Best Sites Pro', 'All templates, AI content, no branding', 200),
    ('mybestsites-agency', 'My Best Sites Agency', 'Pro + white-label, resell, API', 200);
