-- Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
-- Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
-- 0005: the deployed licenses table (contact-submissions D1) never got the
-- `revoked` column the worker's validation + gated-download paths reference.
-- Discovered 2026-07-15: /api/validate 500'd with "no such column: revoked".
-- The worker now SELECT *s so it tolerates the old schema; apply this to make
-- revocation actually persistable:
--   npx.cmd wrangler d1 execute contact-submissions --remote --file migrations/0005_add_revoked_column.sql
ALTER TABLE licenses ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0;
