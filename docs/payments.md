# Payments

## Design

The booking engine talks only to the `PaymentProvider` interface (`src/server/payments/types.ts`):

```ts
initiate(input) → { providerReference, redirectUrl | null, instruction }
queryStatus(ref) → { status: pending | succeeded | failed, amountMinor, currency, receipt }
parseWebhook(rawBody, headers, url) → { eventId, eventType, providerReference, signatureValid, safePayload }
refund(input) → { status: succeeded | pending | manual_required | failed, providerReference }
```

Rules the engine enforces regardless of provider:

1. Payment is only possible once every provider has accepted. The amount comes from the booking record, never the browser.
2. Checkout is idempotent per key. Only one attempt can be pending per two-minute window, and the provider is called outside DB transactions.
3. Callbacks are stored first (`payment_events`, unique per provider event id; duplicates return `duplicate`). Invalid signatures are recorded and rejected.
4. **The callback is never trusted alone.** Status is re-checked with `queryStatus`, then `applyVerifiedPayment` locks the attempt and booking:
   - pending → no change
   - failed → recorded, and the booking returns to awaiting payment
   - success after failure → allowed
   - failure after success → ignored
   - amount mismatch → held for review and a dispute case is opened
   - success for an expired or cancelled booking → posted to `suspense` and a refund is queued
5. Confirmation posts a balanced ledger transaction, converts holds to confirmed and snapshots the confirmed itinerary.
6. `reconcilePendingPayments` (background job) re-queries attempts that have been pending more than two minutes, so a lost callback can't strand a booking.

## Sandbox provider (development & test)

`src/server/payments/sandbox.ts`, backed by `sandbox_transactions`. Clearly labelled in the UI (“Test mode — no real money is moved”).

- It redirects to `/checkout/sandbox/[reference]`, where the payer chooses *Approve* or *Decline*.
- That produces an **HMAC-SHA256-signed webhook** processed by exactly the same handler as production callbacks.
- It is disabled when `NODE_ENV=production` unless `PAYMENTS_SANDBOX_ENABLED=true` (staging only). It requires `SANDBOX_WEBHOOK_SECRET` in production mode.

## M-Pesa (Safaricom Daraja, M-Pesa Express / STK Push)

`src/server/payments/mpesa.ts` is implemented against Daraja’s documented request and response shapes:

- OAuth `GET /oauth/v1/generate?grant_type=client_credentials`
- `POST /mpesa/stkpush/v1/processrequest`
- `POST /mpesa/stkpushquery/v1/query`
- the `Body.stkCallback` callback

**Status: not yet exercised against the Daraja sandbox, because no credentials were available.** The provider appears automatically when all `MPESA_*` variables are set.

Setup checklist:

1. Create an app on the Safaricom developer portal and obtain the consumer key and secret. Use the sandbox shortcode and passkey first (`MPESA_ENV=sandbox`).
2. Set `MPESA_CALLBACK_TOKEN` to a long random value. The callback URL becomes `${APP_URL}/api/payments/mpesa/callback/<token>` and is checked in constant time, because Daraja callbacks are not signed.
3. `APP_URL` must be public HTTPS (use a tunnel when testing locally).
4. Optionally restrict the callback route to Safaricom’s published IP ranges at the edge (Vercel Firewall).
5. Amounts must be whole shillings; the adapter refuses fractional amounts.
6. Run a sandbox payment end to end, then a duplicate callback, then a failed payment. Confirm the `payment_events` results (`confirmed`, `duplicate`, `failed_recorded`).
7. For production go-live you'll need: a paybill or till, the production passkey, and the Daraja go-live approval process.

**Refunds:** STK Push has no automatic refund. Daraja reversals need initiator credentials and approvals, so the adapter returns `manual_required`. Finance processes the reversal and records the reference in **Admin → Refunds**, which posts the ledger entry.

## Card payments

Not implemented. Add an adapter that implements `PaymentProvider` (hosted checkout and a webhook with signature verification), then register it in `src/server/payments/index.ts`. Never collect card numbers on the platform.

## Payouts

Earnings become *eligible* once the related booking is completed (or cancelled with the provider’s retained share). An admin creates a payout up to the eligible balance (the provider row is locked to prevent over-allocation), sends money outside the platform (bank or M-Pesa B2C), then records the transfer reference. That posts `provider_payable +` / `cash −`.

## Commission

The rule is resolved per item at booking time (provider → category → provider type → platform default, which is 12%) and stored on the item with the rule id. Changing rules or settings affects new bookings only.
