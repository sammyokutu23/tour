import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { Queryable } from "../db/client";
import type { PaymentProvider, ParsedWebhook, VerifiedStatus } from "./types";
import { PaymentProviderError } from "./types";

/**
 * DEVELOPMENT SANDBOX — no real money moves. Simulates a hosted-checkout provider backed by the
 * sandbox_transactions table, with HMAC-signed webhooks so the full callback pipeline (signature
 * check, idempotency, status verification) is exercised exactly as it would be in production.
 */

export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";

export function sandboxSecret(): string {
  const secret = process.env.SANDBOX_WEBHOOK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new PaymentProviderError("SANDBOX_WEBHOOK_SECRET is required");
  return "dev-only-sandbox-secret";
}

export function signSandboxPayload(body: string, secret = sandboxSecret()): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function sandboxEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PAYMENTS_SANDBOX_ENABLED === "true";
}

export function createSandboxProvider(db: Queryable): PaymentProvider {
  return {
    id: "sandbox",
    label: "Sandbox payment (test mode — no real money)",
    isSandbox: true,

    async initiate(input) {
      if (!sandboxEnabled()) throw new PaymentProviderError("The sandbox payment provider is disabled in this environment.");
      const reference = `SBX-${randomUUID()}`;
      await db.query("insert into sandbox_transactions (reference, amount_minor, currency) values ($1, $2, $3)", [
        reference,
        input.amountMinor,
        input.currency,
      ]);
      return {
        providerReference: reference,
        redirectUrl: `/checkout/sandbox/${encodeURIComponent(reference)}?return=${encodeURIComponent(input.returnUrl)}`,
        instruction: "You'll be taken to the sandbox checkout page to approve or decline this test payment.",
      };
    },

    async queryStatus(reference): Promise<VerifiedStatus> {
      const { rows } = await db.query<{ status: string; amount_minor: number; currency: string }>(
        "select status, amount_minor, currency from sandbox_transactions where reference = $1",
        [reference],
      );
      const tx = rows[0];
      if (!tx) return { status: "failed", amountMinor: null, currency: null, receipt: null, failureReason: "Unknown sandbox transaction" };
      const status = tx.status === "succeeded" || tx.status === "refunded" ? "succeeded" : tx.status === "failed" ? "failed" : "pending";
      return {
        status,
        amountMinor: tx.amount_minor,
        currency: tx.currency,
        receipt: status === "succeeded" ? reference.slice(-10).toUpperCase() : null,
        failureReason: status === "failed" ? "Declined in sandbox" : null,
      };
    },

    async parseWebhook(rawBody, headers): Promise<ParsedWebhook> {
      const given = headers.get(SANDBOX_SIGNATURE_HEADER) ?? "";
      const expected = signSandboxPayload(rawBody);
      const signatureValid =
        given.length === expected.length && timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
      let body: { eventId?: string; type?: string; reference?: string };
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new PaymentProviderError("Malformed sandbox webhook");
      }
      if (!body.eventId || !body.reference || !body.type) throw new PaymentProviderError("Incomplete sandbox webhook");
      return {
        eventId: String(body.eventId),
        eventType: String(body.type),
        providerReference: String(body.reference),
        signatureValid,
        safePayload: { type: body.type, reference: body.reference },
      };
    },

    async refund(input) {
      const { rowCount } = await db.query(
        `update sandbox_transactions set refunded_minor = refunded_minor + $2, updated_at = now(),
                status = case when refunded_minor + $2 >= amount_minor then 'refunded' else status end
          where reference = $1 and status in ('succeeded', 'refunded') and refunded_minor + $2 <= amount_minor`,
        [input.providerReference, input.amountMinor],
      );
      if (!rowCount) return { status: "failed", providerReference: null, message: "Sandbox refund rejected" };
      return { status: "succeeded", providerReference: `SBX-RF-${input.refundId.slice(0, 8)}` };
    },
  };
}

/** Simulates the payer's decision on the sandbox checkout page and builds the signed webhook. */
export async function completeSandboxPayment(db: Queryable, reference: string, outcome: "succeeded" | "failed") {
  if (!sandboxEnabled()) throw new PaymentProviderError("Sandbox disabled");
  const { rowCount } = await db.query(
    "update sandbox_transactions set status = $2, updated_at = now() where reference = $1 and status = 'pending'",
    [reference, outcome],
  );
  const body = JSON.stringify({ eventId: `evt_${randomUUID()}`, type: `payment.${outcome}`, reference });
  return { changed: rowCount > 0, body, signature: signSandboxPayload(body) };
}
