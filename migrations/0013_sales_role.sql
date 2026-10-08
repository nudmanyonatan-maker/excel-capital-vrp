-- A Sales role for reps who onboard borrowers but never move money.
--
-- staff_users.role has CHECK (role IN ('admin','operator','viewer')), and that
-- constraint cannot be widened safely on D1: rebuilding staff_users means
-- dropping a table that audit_log, borrowers, setup_links, payment_intents,
-- settings and access_requests all reference, and migration 0004 recorded that
-- D1 rolls the whole database back on exactly that. Renaming it instead makes
-- SQLite rewrite every one of those foreign keys.
--
-- So, like 'daily' schedules in 0004, the new value is stored in an extra
-- column: a sales rep is role = 'viewer' with is_sales = 1. The mapping lives in
-- src/lib/repo/staff.ts. It fails safe on purpose: any code that ignored the
-- flag would treat a rep as a read-only viewer, never as an operator.
ALTER TABLE staff_users ADD COLUMN is_sales INTEGER NOT NULL DEFAULT 0;

-- Which approved accounts a sales rep may choose. Admins and operators may
-- choose any approved account; reps only the ones ticked here. Off by default,
-- so a newly added account is never offered to reps until an admin decides.
ALTER TABLE payout_accounts ADD COLUMN sales_can_use INTEGER NOT NULL DEFAULT 0;
