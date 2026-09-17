import { webhookDeliveryId } from "./delivery-id";
import { PlaidApiError } from "./real";
import type {
  PlaidClient,
  RecipientInput,
  ConsentConstraints,
  CreateRecipientResult,
  CreateConsentResult,
  CreateLinkTokenResult,
  ExecutePaymentResult,
  ExecutePaymentInput,
  GetPaymentResult,
  ListedPayment,
  GetConsentResult,
  WebhookVerification,
} from "./types";

/**
 * Deterministic mock used when Plaid credentials are absent (local dev, tests,
 * and pre-integration stages). It mimics the shape and the important behaviours
 * of Plaid VRP so the entire flow, setup, consent, execute, webhook, is
 * exercisable end-to-end without real credentials.
 *
 * Behaviour: executePayment returns PAYMENT_STATUS_INITIATED (the realistic
 * Faster Payments "submitted" signal). getPayment reports SETTLED so a polling
 * or cron reconciliation path can complete in dev.
 */
export class MockPlaidClient implements PlaidClient {
  readonly mode = "mock" as const;

  async createRecipient(input: RecipientInput): Promise<CreateRecipientResult> {
    return { recipientId: `mock-recipient-${hash(input.name)}` };
  }

  async createConsent(
    recipientId: string,
    reference: string,
    constraints: ConsentConstraints,
  ): Promise<CreateConsentResult> {
    return {
      consentId: `mock-consent-${hash(recipientId + reference)}`,
      rawConstraints: constraints,
    };
  }

  async createLinkToken(params: {
    consentId: string;
  }): Promise<CreateLinkTokenResult> {
    return {
      linkToken: `mock-link-token-${params.consentId}`,
      expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
  }

  async getConsent(consentId: string): Promise<GetConsentResult> {
    return { consentId, status: "AUTHORISED" };
  }

  /**
   * Remembers every key it has accepted, with the parameters it saw, exactly as
   * Plaid does. Per instance, so each test starts clean.
   */
  private readonly seenKeys = new Map<string, string>();

  /**
   * Refuses what the real Plaid refuses.
   *
   * This mock used to accept anything: any amount, any key, any character, the
   * same key twice with different amounts. So every one of Plaid's ordinary
   * refusals was invisible until it reached production, and three of them did,
   * one after another, on the same borrower over two days:
   *
   *   - a GBP 0.01 collection, under Plaid's GBP 1.00 minimum
   *   - the corrected GBP 1.00 retry, reusing that instalment's key with a
   *     different amount
   *   - the new key for it, built with a "#" the provider will not accept
   *
   * Each one cost a round trip with the operator and told them nothing. A mock
   * that accepts everything tests only that we can construct a request, which is
   * never the part that breaks.
   */
  async executePayment(input: ExecutePaymentInput): Promise<ExecutePaymentResult> {
    if (!/^[A-Za-z0-9_-]+$/.test(input.idempotencyKey)) {
      throw new PlaidApiError(
        "INVALID_FIELD",
        "invalid idempotency key",
        400,
        "mock-request",
      );
    }
    if (input.idempotencyKey.length > 128) {
      throw new PlaidApiError("INVALID_FIELD", "idempotency key too long", 400, "mock-request");
    }
    if (input.amountMinor < 100) {
      throw new PlaidApiError(
        "INVALID_FIELD",
        "amount.value must be >= 100 denominated in the smallest unit of currency (e.g \u00a31.00 or \u20ac1.00)",
        400,
        "mock-request",
      );
    }

    // Plaid ties a key to the parameters it was first used with: the same key
    // again with the same parameters is the idempotent replay that keys exist
    // for, and with different ones is an error rather than a second payment.
    const fingerprint = `${input.amountMinor}:${input.currency ?? "GBP"}:${input.reference ?? ""}`;
    const seen = this.seenKeys.get(input.idempotencyKey);
    if (seen !== undefined && seen !== fingerprint) {
      throw new PlaidApiError(
        "INVALID_FIELD",
        "idempotency key reused with different payment parameters",
        400,
        "mock-request",
      );
    }
    this.seenKeys.set(input.idempotencyKey, fingerprint);

    return {
      paymentId: `mock-payment-${hash(input.idempotencyKey)}`,
      status: "PAYMENT_STATUS_INITIATED",
      requestId: "mock-request",
    };
  }

  async getPayment(paymentId: string): Promise<GetPaymentResult> {
    return { paymentId, status: "PAYMENT_STATUS_SETTLED", requestId: "mock-request" };
  }

  async listPayments(): Promise<ListedPayment[]> {
    return [];
  }

  async verifyWebhook(rawBody: string): Promise<WebhookVerification> {
    // In mock mode we trust the body (no signing key). Shape mirrors the real path.
    try {
      const parsed = JSON.parse(rawBody) as {
        payment_id?: string;
        new_payment_status?: string;
        webhook_type?: string;
        event_id?: string;
        timestamp?: string;
        consent_id?: string;
        new_consent_status?: string;
      };
      return {
        verified: true,
        type: parsed.webhook_type ?? "PAYMENT_INITIATION",
        paymentId: parsed.payment_id ?? null,
        newStatus: parsed.new_payment_status ?? null,
        consentId: parsed.consent_id ?? null,
        newConsentStatus: parsed.new_consent_status ?? null,
        eventId: webhookDeliveryId(parsed),
      };
    } catch {
      return {
        verified: false,
        type: null,
        paymentId: null,
        newStatus: null,
        consentId: null,
        newConsentStatus: null,
        eventId: null,
      };
    }
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
