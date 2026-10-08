/**
 * The plain-English explanation behind every "i" on the platform.
 *
 * One dictionary so a field means the same thing on every form it appears on,
 * and so the Help tab and the tooltips cannot drift apart. Written for someone
 * who has never used the platform and has nobody to ask.
 */
export const TIPS = {
  // Business
  legalName:
    "The company's registered name. Start typing in the search above to fill it in from Companies House.",
  companyNumber:
    "The 8-character number from Companies House. It stops the same company being onboarded twice.",
  contactEmail:
    "The setup link is emailed here. Use the person who can approve payments at the company's bank.",
  contactPhone: "Optional. For your own records.",

  // Where the money goes
  payoutAccount:
    "Which of our bank accounts the borrower's repayments are paid into. Only an admin can add accounts to this list, so nobody can type in their own.",
  destinationLabel:
    "A name only staff see, like \"Backup account\". Leave it blank to use the account's own name.",

  // Schedule
  amount: "How much is taken each time a repayment is due.",
  frequency:
    "How often a repayment is taken. Daily lets you pick which weekdays, for example Monday to Friday only.",
  intervalDays: "Only for Custom: a repayment is taken every this many days.",
  startDate: "The first day a repayment is taken.",
  endMode:
    "When repayments stop: after a set number of payments, on a date, or once a total amount has been collected.",
  endCount: "Only used when repayments stop after a number of payments.",
  endDate: "Only used when repayments stop on a date.",
  endTotal: "Only used when repayments stop once this much has been collected in total.",
  scheduleDestination:
    "Which of the borrower's approved accounts scheduled repayments go to. Only shows when they have more than one.",

  // Limits the borrower approves
  maxPaymentAmount:
    "The most their bank will ever let us take in one payment. Set it above the normal repayment, for example repayment plus 20%, so a late fee still fits.",
  consentPeriod:
    "The window the next limit covers: a day, week, month or year, counted from the day the borrower approves.",
  periodicMaxAmount:
    "The most we can take in total within one period. It must be at least the single payment limit.",
  consentValidFrom: "Optional. The borrower's approval cannot be used before this date.",
  consentValidTo:
    "Optional. The borrower's approval stops working after this date. Leave it blank for no end date.",

  // Buttons on a borrower
  executeNow:
    "Takes today's scheduled repayment now instead of waiting for the nightly run. You are asked to confirm first.",
  setupLink:
    "Makes a secure link for the borrower to approve payments with their bank. It lasts 72 hours and is emailed to the contact email if email is set up. Otherwise copy it and send it yourself.",
  testPayment:
    "Takes £1 to prove the borrower's bank connection really works. Sales reps can send up to £5 of tests in any 24 hours.",
  oneOff:
    "Takes an extra amount outside the schedule, such as a late fee or a missed payment. It must fit within the limits the borrower approved.",
  pause: "Stops every collection for this borrower until you resume. Nothing is taken while paused.",
  archive:
    "Hides the borrower from the list but keeps all their records. Only possible once collections are paused and no approval is live.",

  // Admin: approved accounts
  payoutLabel: "The name staff see in the drop-down when they choose where repayments go.",
  payoutName:
    "The name on the account exactly as your bank has it. 18 characters at most, or some banks refuse it.",
  payoutAccountNumber: "8 digits.",
  payoutSortCode: "6 digits. Dashes are fine.",
  salesCanUse:
    "Sales reps only see accounts opened to sales. Admins and operators can choose any account on the list.",

  // Admin: staff
  staffEmail: "The address they sign in with.",
  staffRole: "What they are allowed to do. See \"What each role can do\" above.",

  // One-off payment
  oneOffAmount: "In pounds. At least £1.00, and no more than the borrower's single payment limit.",
  oneOffReason: "Shown on the borrower's bank statement, for example \"Late fee\". Keep it short.",
} as const;

export type TipKey = keyof typeof TIPS;
