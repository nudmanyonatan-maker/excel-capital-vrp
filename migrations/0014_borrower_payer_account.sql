-- The borrower's own business bank account: the only account their mandate can
-- be approved from.
--
-- Borrowers were approving mandates from accounts that are not the business's
-- (a director's personal account, for one), and Excel Capital may only collect
-- from the business. Plaid can lock a consent to one payer account
-- (payer_details on /payment_initiation/consent/create), so the bank refuses
-- any other. These hold that account, encrypted at the app layer like every
-- other account number, and are sent with each mandate this borrower is asked
-- to approve.
--
-- Additive only: ADD COLUMN, no rebuild. Existing borrowers have none and keep
-- working exactly as before.
ALTER TABLE borrowers ADD COLUMN payer_account_number TEXT;
ALTER TABLE borrowers ADD COLUMN payer_sort_code TEXT;
