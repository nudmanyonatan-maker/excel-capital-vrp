import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { createBorrower } from "@/lib/repo/borrowers";
import { addRecipient, getRecipientById, updateRecipient } from "@/lib/repo/destinations";
import {
  archivePayoutAccount,
  createPayoutAccount,
  linkRecipientsToPayoutAccount,
  listUnlinkedRecipients,
} from "@/lib/repo/payout-accounts";
import {
  choosePayoutAccount,
  groupUnlinkedAccounts,
  payoutChoicesFor,
  recipientFieldsFrom,
} from "@/lib/payout-accounts";
import { protectString } from "@/lib/crypto";
import type { StaffUser } from "@/lib/types";

const KEY = "test-encryption-key";
const operator: StaffUser = {
  id: "op",
  email: "op@example.com",
  role: "operator",
  created_at: "",
  last_login_at: null,
};

let n = 0;
async function approvedAccount(label = `Account ${n++}`, account = "11112222", sort = "334455") {
  return createPayoutAccount(env.DB, {
    label,
    name: "Excel Capital",
    accountNumber: (await protectString(account, KEY))!,
    sortCode: (await protectString(sort, KEY))!,
    createdBy: null,
  });
}

/**
 * Staff used to type the account a borrower's repayments go to, so anyone who
 * could onboard a borrower could send that borrower's money to themselves. Now
 * they choose from a list only an admin can add to, and every action re-checks
 * the choice on the server.
 */
describe("choosing where repayments go", () => {
  it("accepts an approved account", async () => {
    const account = await approvedAccount();
    const result = await choosePayoutAccount(env.DB, operator, account.id);
    expect(result.ok && result.account.id).toBe(account.id);
  });

  it("refuses an id that is not on the list", async () => {
    const result = await choosePayoutAccount(env.DB, operator, "made-up-id");
    expect(result.ok).toBe(false);
  });

  it("refuses an account an admin has removed", async () => {
    const account = await approvedAccount();
    await archivePayoutAccount(env.DB, account.id);
    expect((await choosePayoutAccount(env.DB, operator, account.id)).ok).toBe(false);
    const offered = await payoutChoicesFor(env.DB, operator, KEY);
    expect(offered.map((c) => c.id)).not.toContain(account.id);
  });

  it("refuses an empty choice", async () => {
    expect((await choosePayoutAccount(env.DB, operator, "")).ok).toBe(false);
  });

  it("only ever sends masked details to the browser", async () => {
    const account = await approvedAccount("Masked", "87654321", "112233");
    const choice = (await payoutChoicesFor(env.DB, operator, KEY)).find((c) => c.id === account.id)!;
    expect(choice.masked).toBe("••••4321 / ••-••-33");
    expect(JSON.stringify(choice)).not.toContain("87654321");
  });
});

describe("a borrower's account copies the approved one", () => {
  it("records which approved account it came from", async () => {
    const account = await approvedAccount();
    const b = await createBorrower(env.DB, { legalName: `Payout ${n++} Ltd`, createdBy: null });
    const recipient = await addRecipient(env.DB, b.id, recipientFieldsFrom(account));
    expect(recipient.payout_account_id).toBe(account.id);
    expect(recipient.account_number).toBe(account.account_number);
  });

  it("switching before any link was sent is a plain save", async () => {
    const first = await approvedAccount();
    const second = await approvedAccount("Third", "44443333", "221100");
    const b = await createBorrower(env.DB, { legalName: `Payout ${n++} Ltd`, createdBy: null });
    const recipient = await addRecipient(env.DB, b.id, recipientFieldsFrom(first));
    const { detachedFromPlaid } = await updateRecipient(env.DB, recipient.id, recipientFieldsFrom(second));
    expect(detachedFromPlaid).toBe(false);
  });

  it("re-choosing the same account does not make the borrower approve again", async () => {
    const account = await approvedAccount();
    const b = await createBorrower(env.DB, { legalName: `Payout ${n++} Ltd`, createdBy: null });
    const recipient = await addRecipient(env.DB, b.id, recipientFieldsFrom(account));
    const { detachedFromPlaid } = await updateRecipient(env.DB, recipient.id, recipientFieldsFrom(account));
    expect(detachedFromPlaid).toBe(false);
  });

  it("switching to another approved account re-registers it with the bank", async () => {
    const first = await approvedAccount();
    const second = await approvedAccount("Second", "99998888", "776655");
    const b = await createBorrower(env.DB, { legalName: `Payout ${n++} Ltd`, createdBy: null });
    const recipient = await addRecipient(env.DB, b.id, recipientFieldsFrom(first));
    await env.DB.prepare("UPDATE recipients SET plaid_recipient_id = 'registered' WHERE id = ?")
      .bind(recipient.id)
      .run();
    const { detachedFromPlaid } = await updateRecipient(env.DB, recipient.id, recipientFieldsFrom(second));
    expect(detachedFromPlaid).toBe(true);
    expect((await getRecipientById(env.DB, recipient.id))?.plaid_recipient_id).toBeNull();
    expect((await getRecipientById(env.DB, recipient.id))?.payout_account_id).toBe(second.id);
  });
});

describe("adopting accounts typed in before the list existed", () => {
  it("groups rows holding the same account even though each is encrypted differently", async () => {
    const b1 = await createBorrower(env.DB, { legalName: `Legacy ${n++} Ltd`, createdBy: null });
    const b2 = await createBorrower(env.DB, { legalName: `Legacy ${n++} Ltd`, createdBy: null });
    const digits = `5${String(n).padStart(7, "0")}`;
    const r1 = await addRecipient(env.DB, b1.id, {
      name: "Excel Capital",
      accountNumber: await protectString(digits, KEY),
      sortCode: await protectString("102030", KEY),
    });
    const r2 = await addRecipient(env.DB, b2.id, {
      name: "Excel Capital",
      accountNumber: await protectString(digits, KEY),
      sortCode: await protectString("10-20-30", KEY),
    });
    expect(r1.account_number).not.toBe(r2.account_number);

    const groups = await groupUnlinkedAccounts(await listUnlinkedRecipients(env.DB), KEY);
    const group = groups.find((g) => g.recipientIds.includes(r1.id))!;
    expect(group.recipientIds).toContain(r2.id);
    // The key that goes into the form reveals nothing about the account.
    expect(group.key).toBe(r1.id);
  });

  it("links only rows that are not linked yet", async () => {
    const account = await approvedAccount();
    const other = await approvedAccount();
    const b = await createBorrower(env.DB, { legalName: `Legacy ${n++} Ltd`, createdBy: null });
    const linked = await addRecipient(env.DB, b.id, recipientFieldsFrom(other));
    const loose = await addRecipient(env.DB, b.id, { name: "Excel Capital" });

    const changed = await linkRecipientsToPayoutAccount(env.DB, [linked.id, loose.id], account.id);

    expect(changed).toBe(1);
    expect((await getRecipientById(env.DB, linked.id))?.payout_account_id).toBe(other.id);
    expect((await getRecipientById(env.DB, loose.id))?.payout_account_id).toBe(account.id);
  });
});
