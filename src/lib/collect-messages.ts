import type { CollectOutcome } from "@/lib/engine/collect";

/**
 * How a money-moving button reports back. Shared by the operator's payment
 * actions and the sales rep's £1 test, so both say the same thing about the
 * same outcome. Deliberately NOT a "use server" module: nothing here may be
 * callable from a browser.
 */
export type ActionTone = "success" | "info" | "error";
export interface ActionResult {
  message: string;
  tone: ActionTone;
}
export type ActionState = ActionResult | null;

/**
 * Turn an engine outcome into something a non-technical operator can act on.
 * The tone drives the colour of the result banner, so "nothing bad happened"
 * never looks like a failure and vice versa.
 */
/**
 * Engine reasons are a mix of short fragments ("collections paused") and full
 * sentences from destination resolution ("The borrower has not approved this
 * account yet."). Trim the trailing stop so neither reads as "yet..".
 */
function reasonFragment(reason: string): string {
  return reason.trim().replace(/\.$/, "");
}

function outcomeMessage(o: CollectOutcome): ActionResult {
  switch (o.kind) {
    case "collected":
      return { message: "Payment sent to the bank. It will show below as it settles.", tone: "success" };
    case "duplicate":
      return { message: "This payment was already sent. Nothing was charged twice.", tone: "info" };
    case "skipped":
      return { message: `Nothing was sent: ${reasonFragment(o.reason)}.`, tone: "info" };
    case "failed":
      return { message: `The payment did not go through: ${reasonFragment(o.reason)}.`, tone: "error" };
    case "unknown":
      return {
        message:
          "The bank has not confirmed this one yet. We are checking. Do not send it again.",
        tone: "info",
      };
  }
}

/**
 * Run a collection and never let an infrastructure failure become a page crash.
 *
 * By the time we get here a payment intent exists, so a thrown error means we do
 * not know whether the provider was reached. The message therefore refuses to
 * imply failure and explicitly warns against a blind retry: reconciliation will
 * resolve a payment that did go out, and a second attempt could double-charge.
 */
export async function collectOrReportUnknown(
  run: () => Promise<CollectOutcome>,
): Promise<ActionResult & { kind?: CollectOutcome["kind"] }> {
  try {
    const outcome = await run();
    return { ...outcomeMessage(outcome), kind: outcome.kind };
  } catch (error) {
    console.error("collection failed before an outcome was known", error);
    return {
      message:
        "We could not confirm whether this payment was sent. Check the Payments list before trying again, and do not send it a second time.",
      tone: "info",
    };
  }
}

/**
 * Neither payment action may ever answer an operator with a blank page.
 *
 * Both already return their refusals as state, but only for the failures they
 * anticipated. Anything thrown BEFORE that, reading settings, resolving the
 * destination, creating the payment intent, became an unhandled server exception
 * and the operator got "This page couldn't load. A server error occurred." with
 * an opaque number. That happened three times in production on the same
 * borrower, and each time it told nobody anything: not the operator, not us.
 *
 * These are the two buttons that move money, so the one thing worse than an
 * ugly message is no message. The provider error is included deliberately: the
 * people using this are the ones who can act on "amount must be at least GBP
 * 1.00", and they cannot read a stack trace or our logs.
 *
 * requireRole stays inside, so a viewer is refused in words rather than by a
 * blank page, and redirects are re-thrown because Next signals them by throwing.
 */
function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export async function neverCrash(
  what: string,
  run: () => Promise<ActionState>,
): Promise<ActionState> {
  try {
    return await run();
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error(`${what} failed`, error);
    const detail = error instanceof Error && error.message ? error.message : String(error);
    return {
      message: `Nothing was sent. ${detail}`.slice(0, 500),
      tone: "error",
    };
  }
}

