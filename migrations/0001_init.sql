-- Sassy Consulting LLC - D1 Database Schema
-- Copyright (c) 2025 Sassy Consulting LLC

-- Connection logs (privacy-respecting analytics)
CREATE TABLE IF NOT EXISTS connection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    zip_code TEXT,
    country TEXT,
    region TEXT,
    asn TEXT,
    is_vpn INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON connection_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_country ON connection_logs(country);

-- Licenses
CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    product TEXT NOT NULL,
    stripe_session_id TEXT,
    activated INTEGER DEFAULT 0,
    activated_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_product ON licenses(product);

-- Downloads tracking
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_slug TEXT NOT NULL,
    version TEXT NOT NULL,
    platform TEXT NOT NULL,
    filename TEXT NOT NULL,
    r2_key TEXT UNIQUE NOT NULL,
    download_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_downloads_product ON downloads(product_slug);

-- VPN Providers (for recommendations)
CREATE TABLE IF NOT EXISTS vpn_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website TEXT NOT NULL,
    is_free INTEGER DEFAULT 0,
    description TEXT,
    guide_url TEXT
);

-- Known datacenter ASNs
CREATE TABLE IF NOT EXISTS known_datacenter_asns (
    asn INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'datacenter'
);

-- Seed datacenter ASNs
INSERT OR IGNORE INTO known_datacenter_asns (asn, name, type) VALUES
(13335, 'Cloudflare', 'cdn'),
(14618, 'Amazon AWS', 'cloud'),
(15169, 'Google Cloud', 'cloud'),
(8075, 'Microsoft Azure', 'cloud'),
(16509, 'Amazon AWS', 'cloud'),
(14061, 'DigitalOcean', 'cloud'),
(20473, 'Vultr', 'cloud'),
(46606, 'Unified Layer', 'hosting'),
(63949, 'Linode', 'cloud'),
(54825, 'Packet Host', 'cloud'),
(398101, 'GoDaddy', 'hosting'),
(13213, 'UK2 Group', 'hosting'),
(32934, 'Facebook', 'tech'),
(19551, 'Incapsula', 'cdn'),
(36351, 'SoftLayer', 'cloud'),
(30633, 'Leaseweb', 'hosting'),
(21859, 'Zenlayer', 'cloud');

-- Seed VPN providers
INSERT OR IGNORE INTO vpn_providers (name, website, is_free, description, guide_url) VALUES
('ProtonVPN', 'https://protonvpn.com', 1, 'Swiss-based, strict no-log policy', '/guides/protonvpn.html'),
('Windscribe', 'https://windscribe.com', 1, '10GB free per month', '/guides/windscribe.html'),
('Cloudflare WARP', 'https://1.1.1.1', 1, 'Fast and lightweight', '/guides/warp.html'),
('TunnelBear', 'https://tunnelbear.com', 1, 'Simple interface, 2GB free', '/guides/tunnelbear.html');
