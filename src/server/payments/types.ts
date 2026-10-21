/**
 * Payment provider abstraction. The booking engine only talks to this interface, so M-Pesa, a card
 * processor or the development sandbox are interchangeable. Providers never decide booking state:
 * they report verified payment status, and the booking engine applies it.
 */

export type PaymentProviderId = "sandbox" | "mpesa" | "card";

export interface InitiateInput {
  attemptId: string;
  bookingReference: string;
  amountMinor: number;
  currency: string;
  description: string;
  /** E.164 without '+', e.g. 2547XXXXXXXX (M-Pesa only) */
  phone?: string;
  callbackUrl: string;
  returnUrl: string;
}

export interface InitiateResult {
  providerReference: string;
  /** Where to send the traveller next, if the provider uses a hosted page. */
  redirectUrl: string | null;
  /** Human-readable instruction, e.g. "Check your phone to approve the M-Pesa request". */
  instruction: string;
}

export interface VerifiedStatus {
  status: "pending" | "succeeded" | "failed";
  amountMinor: number | null;
  currency: string | null;
  receipt: string | null;
  failureReason: string | null;
}

export interface ParsedWebhook {
  eventId: string;
  eventType: string;
  providerReference: string;
  signatureValid: boolean;
  /** Payload with sensitive values removed, safe to persist. */
  safePayload: Record<string, unknown>;
}

export interface RefundResult {
  status: "succeeded" | "pending" | "manual_required" | "failed";
  providerReference: string | null;
  message?: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;
  /** True for development/test providers that never move real money. */
  readonly isSandbox: boolean;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Asks the provider for the authoritative status of a payment. */
  queryStatus(providerReference: string): Promise<VerifiedStatus>;
  /** Parses and authenticates an incoming webhook/callback request. */
  parseWebhook(rawBody: string, headers: Headers, url: URL): Promise<ParsedWebhook>;
  refund(input: { providerReference: string; amountMinor: number; currency: string; refundId: string }): Promise<RefundResult>;
}

export class PaymentProviderError extends Error {}
