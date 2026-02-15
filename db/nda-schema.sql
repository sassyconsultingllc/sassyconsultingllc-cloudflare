-- NDA D1 Schema for Sassy Consulting LLC
-- Run: wrangler d1 execute contact-submissions --file=db/nda-schema.sql

CREATE TABLE IF NOT EXISTS nda_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agreement_no TEXT UNIQUE NOT NULL,
  signer_name TEXT NOT NULL,
  signer_org TEXT DEFAULT '',
  signer_address TEXT NOT NULL,
  signer_jurisdiction TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_title TEXT NOT NULL,
  signer_initials TEXT NOT NULL,
  signature_mode TEXT NOT NULL CHECK(signature_mode IN ('draw', 'type')),
  signature_data TEXT NOT NULL,
  consent_read INTEGER NOT NULL DEFAULT 0,
  consent_electronic INTEGER NOT NULL DEFAULT 0,
  consent_bind INTEGER NOT NULL DEFAULT 0,
  consent_retention INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT DEFAULT '',
  country TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  timezone TEXT DEFAULT '',
  screen_res TEXT DEFAULT '',
  doc_hash TEXT NOT NULL,
  download_token TEXT UNIQUE NOT NULL,
  token_expires_at TEXT NOT NULL,
  download_count INTEGER DEFAULT 0,
  signed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nda_download_token ON nda_signatures(download_token);
CREATE INDEX IF NOT EXISTS idx_nda_signer_email ON nda_signatures(signer_email);
CREATE INDEX IF NOT EXISTS idx_nda_agreement_no ON nda_signatures(agreement_no);

CREATE TABLE IF NOT EXISTS nda_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  metadata TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nda_log_action ON nda_access_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_nda_log_ip ON nda_access_log(ip, created_at);
