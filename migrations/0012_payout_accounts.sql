-- The bank accounts repayments may be paid into, kept as one list that only an
-- admin can add to.
--
-- Until now every borrower form had free-text account number and sort code
-- fields, so anyone allowed to onboard a borrower could type their OWN account
-- and have a borrower's repayments collected into it. The client raised this as
-- their first concern before letting sales reps use the platform: staff should
-- choose WHERE money goes from accounts the business has approved, never enter
-- one.
--
-- A borrower's account rows (recipients) keep their own copy of the details,
-- because Plaid registers a recipient once and every mandate is welded to that
-- registration. payout_account_id records which approved account a row was
-- copied from. Rows created before this list existed have none, and keep
-- working exactly as they do: most are already approved at the bank and cannot
-- be changed anyway. An admin links them from Settings.
--
-- Additive only, like 0007: a new table and ADD COLUMN, no rebuild, nothing
-- renamed, so no foreign key text elsewhere is touched.

CREATE TABLE payout_accounts (
  id             TEXT PRIMARY KEY,
  -- What staff see when choosing, e.g. "Excel Capital".
  label          TEXT NOT NULL,
  -- The name on the account, sent to the borrower's bank. 18 characters at
  -- most, because HSBC refuses a longer one without saying why.
  name           TEXT NOT NULL,
  -- Encrypted at the app layer, like recipients.
  account_number TEXT NOT NULL,
  sort_code      TEXT NOT NULL,
  -- Retired from the picker, never deleted: borrower rows point here.
  archived_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by     TEXT REFERENCES staff_users(id)
);

ALTER TABLE recipients ADD COLUMN payout_account_id TEXT REFERENCES payout_accounts(id);
CREATE INDEX idx_recipients_payout_account ON recipients(payout_account_id);
