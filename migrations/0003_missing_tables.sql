-- ============================================================================
-- Sassy Consulting LLC - Missing Tables Backfill
-- Copyright (c) 2025 Sassy Consulting LLC
-- ============================================================================
-- Adds tables referenced by the worker that were never declared in earlier
-- migrations. Idempotent (CREATE TABLE IF NOT EXISTS) so it is safe to run
-- against any existing D1 database.
-- ============================================================================

-- Contact form submissions (used by /api/contact and /api/app-tester).
CREATE TABLE IF NOT EXISTS contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_submissions(created_at);

-- NDA signatures (used by /api/nda/sign and /api/nda/download).
CREATE TABLE IF NOT EXISTS nda_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agreement_no TEXT UNIQUE NOT NULL,
    signer_name TEXT NOT NULL,
    signer_org TEXT,
    signer_address TEXT NOT NULL,
    signer_jurisdiction TEXT NOT NULL,
    signer_email TEXT NOT NULL,
    signer_title TEXT NOT NULL,
    signer_initials TEXT NOT NULL,
    signature_mode TEXT NOT NULL,
    signature_data TEXT NOT NULL,
    consent_read INTEGER NOT NULL,
    consent_electronic INTEGER NOT NULL,
    consent_bind INTEGER NOT NULL,
    consent_retention INTEGER NOT NULL,
    ip_address TEXT,
    country TEXT,
    user_agent TEXT,
    timezone TEXT,
    screen_res TEXT,
    doc_hash TEXT NOT NULL,
    download_token TEXT UNIQUE,
    token_expires_at TEXT,
    download_count INTEGER DEFAULT 0,
    signed_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nda_email ON nda_signatures(signer_email);
CREATE INDEX IF NOT EXISTS idx_nda_token ON nda_signatures(download_token);
CREATE INDEX IF NOT EXISTS idx_nda_agreement ON nda_signatures(agreement_no);

-- NDA access log (verify-code attempts + sign/download events).
CREATE TABLE IF NOT EXISTS nda_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    action TEXT NOT NULL,
    success INTEGER NOT NULL,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nda_log_action ON nda_access_log(action);
CREATE INDEX IF NOT EXISTS idx_nda_log_created ON nda_access_log(created_at);
