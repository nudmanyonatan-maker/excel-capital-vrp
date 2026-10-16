/**
 * What staff should do about a failed bank connection, by error code.
 *
 * The red box on a borrower's page used to show only Plaid's display message,
 * which is written for the borrower ("Authorise your payment consent again or
 * select a different bank") and tells a sales rep nothing. The Help page had its
 * own table that said PAYMENT_CONSENT_CANCELLED meant the borrower backed out,
 * which sent reps chasing borrowers who had done nothing wrong: NatWest reports
 * its own error page with exactly that code (The Play Company, 16 October, three
 * times). One list feeds both, so the page and the Help can no longer disagree.
 */
export interface SetupFailureAdvice {
  code: string;
  advice: string;
}

export const SETUP_FAILURE_ADVICE: SetupFailureAdvice[] = [
  {
    code: "PAYMENT_CONSENT_CANCELLED",
    advice:
      "Their bank stopped the approval before it finished. Either they backed out, or their bank showed its own " +
      "error page (NatWest does this). If it keeps happening at the same bank, check the business account on " +
      "file matches the one they are approving from, and that the person approving can make payments from it in " +
      "their online banking. Then ask them to open the same link again.",
  },
  {
    code: "PAYMENT_REJECTED",
    advice:
      "Their bank refused the mandate. Check the business account on file is the one they are approving from, " +
      "correct it on Edit if not, then send a new setup link.",
  },
  {
    code: "PLAID_SCRIPT_BLOCKED",
    advice:
      "The setup page could not load the bank connection on their device, usually because of an ad blocker, a " +
      "work web filter, or opening the link inside an email app. Ask them to open the link in Safari or Chrome.",
  },
  {
    code: "PAYMENT_CONSENT_INVALID_CONSTRAINTS",
    advice: "Fixed on 5 October for Monzo. Send them a new setup link and ask them to try again.",
  },
  {
    code: "PAYMENT_INVALID_SCHEDULE",
    advice: "Fixed on 13 October. Send them a new setup link and ask them to try again.",
  },
];

export const FALLBACK_SETUP_FAILURE_ADVICE =
  "Send a new link and ask them to try once more. If it fails again, send Yonatan the Plaid session shown here.";

export function setupFailureAdvice(errorCode: string | null): string {
  return SETUP_FAILURE_ADVICE.find((a) => a.code === errorCode)?.advice ?? FALLBACK_SETUP_FAILURE_ADVICE;
}
