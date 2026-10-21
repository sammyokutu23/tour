import { timingSafeEqual } from "node:crypto";
import type { PaymentProvider, ParsedWebhook, VerifiedStatus } from "./types";
import { PaymentProviderError } from "./types";
import { toZoned } from "@/lib/time";

/**
 * Safaricom Daraja — M-Pesa Express (STK Push) adapter.
 *
 * STATUS: implemented against Daraja's published request/response shapes but NOT yet exercised
 * against the Daraja sandbox (no credentials in this environment). Enable only after completing the
 * checklist in docs/payments.md.
 *
 * Daraja callbacks are not signed. Defences used here:
 *  1. The callback URL contains a long random secret (MPESA_CALLBACK_TOKEN) checked in constant time.
 *  2. The callback is never trusted on its own: status is re-verified with the STK Push Query API.
 *  3. Optional source-IP allowlisting should be configured at the edge (see docs/payments.md).
 */

interface MpesaConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  callbackToken: string;
}

export function mpesaConfig(): MpesaConfig | null {
  const env = process.env;
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET || !env.MPESA_SHORTCODE || !env.MPESA_PASSKEY || !env.MPESA_CALLBACK_TOKEN) {
    return null;
  }
  return {
    baseUrl: env.MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke",
    consumerKey: env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
    shortCode: env.MPESA_SHORTCODE,
    passkey: env.MPESA_PASSKEY,
    callbackToken: env.MPESA_CALLBACK_TOKEN,
  };
}

/** Normalises Kenyan mobile numbers to 2547XXXXXXXX / 2541XXXXXXXX. Returns null when invalid. */
export function normaliseKenyanPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  let n = digits;
  if (n.startsWith("0")) n = `254${n.slice(1)}`;
  else if (n.length === 9 && /^[17]/.test(n)) n = `254${n}`;
  return /^254[17]\d{8}$/.test(n) ? n : null;
}

function timestamp(now = new Date()): string {
  const z = toZoned(now, "Africa/Nairobi");
  const seconds = String(new Date(now).getUTCSeconds()).padStart(2, "0");
  return `${z.date.replaceAll("-", "")}${z.time.replace(":", "")}${seconds}`;
}

export function createMpesaProvider(config: MpesaConfig): PaymentProvider {
  let cachedToken: { token: string; expires: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
    const basic = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
    const res = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) throw new PaymentProviderError(`M-Pesa auth failed (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in: string | number };
    cachedToken = { token: body.access_token, expires: Date.now() + Number(body.expires_in) * 1000 };
    return body.access_token;
  }

  function password(ts: string) {
    return Buffer.from(`${config.shortCode}${config.passkey}${ts}`).toString("base64");
  }

  return {
    id: "mpesa",
    label: "M-Pesa",
    isSandbox: config.baseUrl.includes("sandbox"),

    async initiate(input) {
      if (input.currency !== "KES") throw new PaymentProviderError("M-Pesa payments must be in KES");
      if (input.amountMinor % 100 !== 0) throw new PaymentProviderError("M-Pesa only accepts whole-shilling amounts");
      const phone = input.phone ? normaliseKenyanPhone(input.phone) : null;
      if (!phone) throw new PaymentProviderError("Enter a valid Safaricom mobile number");
      const ts = timestamp();
      const res = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          BusinessShortCode: config.shortCode,
          Password: password(ts),
          Timestamp: ts,
          TransactionType: "CustomerPayBillOnline",
          Amount: input.amountMinor / 100,
          PartyA: phone,
          PartyB: config.shortCode,
          PhoneNumber: phone,
          CallBackURL: `${input.callbackUrl}/${config.callbackToken}`,
          AccountReference: input.bookingReference.slice(0, 12),
          TransactionDesc: input.description.slice(0, 13),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ResponseCode?: string; CheckoutRequestID?: string; errorMessage?: string };
      if (!res.ok || body.ResponseCode !== "0" || !body.CheckoutRequestID) {
        throw new PaymentProviderError(body.errorMessage ?? "M-Pesa could not start the payment");
      }
      return {
        providerReference: body.CheckoutRequestID,
        redirectUrl: null,
        instruction: "Check your phone and enter your M-Pesa PIN to approve the payment.",
      };
    },

    async queryStatus(checkoutRequestId): Promise<VerifiedStatus> {
      const ts = timestamp();
      const res = await fetch(`${config.baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ BusinessShortCode: config.shortCode, Password: password(ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
      });
      const body = (await res.json().catch(() => ({}))) as { ResultCode?: string; ResultDesc?: string; errorCode?: string };
      if (body.ResultCode === undefined) {
        // Daraja returns an error while the request is still being processed.
        return { status: "pending", amountMinor: null, currency: null, receipt: null, failureReason: null };
      }
      if (String(body.ResultCode) === "0") {
        // The query API does not return the amount or receipt; those come from the verified callback.
        return { status: "succeeded", amountMinor: null, currency: "KES", receipt: null, failureReason: null };
      }
      return { status: "failed", amountMinor: null, currency: "KES", receipt: null, failureReason: body.ResultDesc ?? "Payment not completed" };
    },

    async parseWebhook(rawBody, _headers, url): Promise<ParsedWebhook> {
      const token = url.pathname.split("/").pop() ?? "";
      const signatureValid =
        token.length === config.callbackToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(config.callbackToken));
      let body: { Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; CallbackMetadata?: { Item?: { Name: string; Value?: unknown }[] } } } };
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new PaymentProviderError("Malformed M-Pesa callback");
      }
      const cb = body.Body?.stkCallback;
      if (!cb?.CheckoutRequestID) throw new PaymentProviderError("Incomplete M-Pesa callback");
      const items = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
      return {
        eventId: `${cb.CheckoutRequestID}:${cb.ResultCode}`,
        eventType: cb.ResultCode === 0 ? "payment.succeeded" : "payment.failed",
        providerReference: cb.CheckoutRequestID,
        signatureValid,
        // Phone numbers are deliberately not persisted.
        safePayload: { resultCode: cb.ResultCode, amount: items.Amount ?? null, receipt: items.MpesaReceiptNumber ?? null },
      };
    },

    async refund() {
      // Daraja reversals require initiator credentials and a separate approval flow; refunds are
      // therefore processed manually by finance and recorded in the admin dashboard.
      return { status: "manual_required", providerReference: null, message: "M-Pesa reversals are processed manually." };
    },
  };
}
