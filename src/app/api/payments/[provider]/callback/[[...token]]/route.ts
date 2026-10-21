import { getDb } from "@/server/db";
import { handlePaymentWebhook } from "@/server/services/bookings";
import { PaymentProviderError } from "@/server/payments";

/**
 * Payment provider callbacks. Every event is persisted and deduplicated, and the payment status is
 * re-verified with the provider before any booking state changes. Responds 200 for processed or
 * duplicate events so providers stop retrying; 400 for malformed payloads.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await request.text();
  if (raw.length > 64_000) return Response.json({ error: "Payload too large" }, { status: 413 });
  try {
    const result = await handlePaymentWebhook(await getDb(), provider, raw, request.headers, new URL(request.url));
    const status = result === "invalid_signature" ? 401 : 200;
    // Daraja expects this acknowledgement shape; other providers ignore the body.
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted", result }, { status });
  } catch (err) {
    if (err instanceof PaymentProviderError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[payments] callback failed", provider, (err as Error).message);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
