/** Domain-shaped types for our Plaid Payment Initiation / VRP usage. */

export interface RecipientInput {
  name: string;
  accountNumber?: string | null;
  sortCode?: string | null;
}

/**
 * Where a mandate's spending period starts: on the day it was approved.
 *
 * The only alignment every bank accepts. Plaid: "If the institution is Monzo,
 * only CONSENT alignments are supported." We used CALENDAR, and every borrower
 * who chose Monzo was refused with PAYMENT_CONSENT_INVALID_CONSTRAINTS. The
 * consent is created before the borrower picks a bank, so there is no way to
 * choose per bank: it has to be the one they all take.
 *
 * Nothing here depends on the choice. The bank enforces the per-period cap;
 * we never count spending against it ourselves.
 */
export const CONSENT_PERIOD_ALIGNMENT = "CONSENT";

export interface ConsentConstraints {
  currency: string; // e.g. "GBP"
  maxPaymentAmountMinor?: number | null;
  period?: string | null; // "DAY" | "WEEK" | "MONTH" ...
  periodicAlignment?: string | null; // "CALENDAR" | "CONSENT"
  periodicMaxAmountMinor?: number | null;
  validFrom?: string | null; // ISO datetime
  validTo?: string | null; // ISO datetime
}

export interface CreateRecipientResult {
  recipientId: string;
}

export interface CreateConsentResult {
  consentId: string;
  rawConstraints: unknown;
}

export interface CreateLinkTokenResult {
  linkToken: string;
  expiration: string;
}

export interface ExecutePaymentInput {
  consentId: string;
  amountMinor: number;
  currency: string;
  reference: string;
  idempotencyKey: string;
}

export interface ExecutePaymentResult {
  paymentId: string;
  status: string; // raw Plaid status, e.g. PAYMENT_STATUS_INITIATED
  requestId: string | null;
}

export interface GetPaymentResult {
  paymentId: string;
  status: string;
  requestId: string | null;
}

export interface ListedPayment {
  paymentId: string;
  status: string;
  reference: string | null;
  amountMinor: number | null;
  currency: string | null;
}

export interface GetConsentResult {
  consentId: string;
  status: string; // e.g. AUTHORISED / REVOKED / EXPIRED
}

export interface WebhookVerification {
  verified: boolean;
  type: string | null;
  paymentId: string | null;
  newStatus: string | null;
  consentId: string | null;
  newConsentStatus: string | null;
  eventId: string | null;
}

/** The surface the rest of the app depends on. Real and Mock both implement it. */
export interface PlaidClient {
  readonly mode: "real" | "mock";
  createRecipient(input: RecipientInput): Promise<CreateRecipientResult>;
  createConsent(
    recipientId: string,
    reference: string,
    constraints: ConsentConstraints,
  ): Promise<CreateConsentResult>;
  createLinkToken(params: {
    consentId: string;
    borrowerId: string;
    webhookUrl?: string | null;
    redirectUri?: string | null;
  }): Promise<CreateLinkTokenResult>;
  getConsent(consentId: string): Promise<GetConsentResult>;
  executePayment(input: ExecutePaymentInput): Promise<ExecutePaymentResult>;
  getPayment(paymentId: string): Promise<GetPaymentResult>;
  listPayments(consentId: string): Promise<ListedPayment[]>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification>;
}
