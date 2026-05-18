-- ============================================================================
-- Sassy Consulting LLC - Stripe -> Lemon Squeezy column rename
-- Copyright (c) 2026 Sassy Consulting LLC
--
-- Payment processor migrated from Stripe (suspended) to Lemon Squeezy.
-- The columns are reused unchanged by the LS flow -- only the *names* are
-- stale. Rename so the schema matches the active worker code.
--
--   licenses.stripe_session_id -> licenses.payment_ref    (active in worker.js)
--   products.stripe_price_id   -> products.ls_variant_id  (table not queried
--                                                          by worker; rename
--                                                          for hygiene)
--
-- Note: licenses.stripe_customer_id from 0002_licenses.sql was never applied
-- to the live DB and is intentionally skipped here.
--
-- D1 / modern SQLite supports ALTER TABLE RENAME COLUMN. Apply this BEFORE
-- deploying the worker that reads `payment_ref`, otherwise live checkout
-- writes will fail until the column shows up.
-- ============================================================================

ALTER TABLE licenses RENAME COLUMN stripe_session_id TO payment_ref;
ALTER TABLE products RENAME COLUMN stripe_price_id   TO ls_variant_id;
