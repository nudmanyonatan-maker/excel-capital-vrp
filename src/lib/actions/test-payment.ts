"use server";

import { revalidatePath } from "next/cache";
import { getDb, getEnv } from "@/lib/db";
import { hasRole, requireRole } from "@/lib/auth";
import { collectPaymentCoordinated } from "@/lib/durable/coordinated-collect";
import { resolveCollectionDestination } from "@/lib/repo/destinations";
import {
  checkAmountAgainstConsent,
  SALES_DAILY_TEST_LIMIT_MINOR,
  TEST_AMOUNT_MINOR,
} from "@/lib/payment-limits";
import { createOrGetPaymentIntent, amountStartedBySince } from "@/lib/repo/payment-intents";
import { manualKey } from "@/lib/idempotency";
import { uniqueReferenceFromBase } from "@/lib/reference";
import { newId } from "@/lib/ids";
import { formatMinor } from "@/lib/money";
import { collectOrReportUnknown, neverCrash, type ActionState } from "@/lib/collect-messages";

/**
 * Send £1 to check a borrower's bank connection really works.
 *
 * This is the one way a sales rep can move money, and it is boxed in on every
 * side: the amount is fixed at £1 rather than typed, it goes to the borrower's
 * default account, which the rep chose from the admin's approved list, and a
 * rep can send at most £5 of tests in 24 hours. It never touches the repayment
 * schedule, so it cannot collect an instalment early or count towards the loan.
 *
 * Operators and admins can use it too, without the daily limit: they can take
 * any one-off payment anyway, and the test is simply the quicker button.
 */
export async function sendTestPaymentAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return neverCrash("send test payment", async () => {
    const user = await requireRole("sales");
    const db = getDb();
    const env = getEnv();
    const borrowerId = String(fd.get("borrowerId") ?? "");
    if (!borrowerId) return { message: "Something went wrong: no borrower was selected.", tone: "error" };
    if (String(env.COLLECTIONS_ENABLED) !== "true") {
      return { message: "Collections are switched off right now, so nothing was sent.", tone: "info" };
    }

    // The default account only, never one named by the form: a rep has no
    // business choosing between a borrower's accounts.
    const destination = await resolveCollectionDestination(db, borrowerId, null);
    if (!destination.ok) return { message: destination.reason, tone: "error" };
    const problem = checkAmountAgainstConsent(TEST_AMOUNT_MINOR, destination.destination.consent);
    if (problem) return { message: problem, tone: "error" };

    if (!hasRole(user, "operator")) {
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const sent = await amountStartedBySince(db, user.id, since);
      if (sent + TEST_AMOUNT_MINOR > SALES_DAILY_TEST_LIMIT_MINOR) {
        return {
          message: `You have sent ${formatMinor(sent, "GBP")} of test payments in the last 24 hours, which is the limit. Ask the accounts team if you need another one.`,
          tone: "error",
        };
      }
    }

    const nonce = String(fd.get("nonce") ?? "") || newId();
    const idempotencyKey = manualKey(borrowerId, nonce);
    const reference = uniqueReferenceFromBase("TEST", idempotencyKey);
    const intent = await createOrGetPaymentIntent(db, {
      id: nonce,
      borrowerId,
      scheduleId: null,
      kind: "manual",
      amountMinor: TEST_AMOUNT_MINOR,
      currency: "GBP",
      reference,
      idempotencyKey,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });

    const result = await collectOrReportUnknown(() =>
      collectPaymentCoordinated(env, {
        borrowerId,
        amountMinor: TEST_AMOUNT_MINOR,
        reference,
        idempotencyKey,
        consentId: destination.destination.consent!.id,
        scheduleId: null,
        scheduledFor: null,
        intentId: intent.id,
        actorStaffId: user.id,
      }),
    );

    revalidatePath(`/borrowers/${borrowerId}`);
    revalidatePath("/payments");
    return { message: result.message, tone: result.tone };
  });
}
