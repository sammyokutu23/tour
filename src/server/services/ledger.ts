import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/client";

export type LedgerAccount = "cash" | "provider_payable" | "platform_revenue" | "tax_payable" | "processing_fees" | "suspense";
export type LedgerEntryType = "payment_captured" | "refund_issued" | "payout_sent" | "unallocated_payment" | "adjustment";

export interface LedgerLine {
  account: LedgerAccount;
  amountMinor: number;
  providerId?: string | null;
  bookingItemId?: string | null;
  memo?: string;
}

export class UnbalancedLedgerError extends Error {}

/**
 * Posts a balanced double-entry transaction (debits positive, credits negative). Zero lines are
 * dropped. Throws before writing anything if the lines don't sum to zero.
 */
export async function postLedger(
  db: Queryable,
  entry: {
    type: LedgerEntryType;
    currency: string;
    bookingId?: string | null;
    paymentAttemptId?: string | null;
    refundId?: string | null;
    payoutId?: string | null;
    createdBy?: string | null;
    lines: LedgerLine[];
  },
): Promise<string> {
  const lines = entry.lines.filter((l) => l.amountMinor !== 0);
  const sum = lines.reduce((s, l) => s + l.amountMinor, 0);
  if (sum !== 0) throw new UnbalancedLedgerError(`Ledger transaction does not balance (off by ${sum})`);
  if (lines.some((l) => !Number.isInteger(l.amountMinor))) throw new UnbalancedLedgerError("Ledger amounts must be integers");
  const txnId = randomUUID();
  for (const l of lines) {
    await db.query(
      `insert into ledger_entries (txn_id, entry_type, account, provider_id, booking_id, booking_item_id, payment_attempt_id, refund_id, payout_id,
                                   amount_minor, currency, memo, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        txnId,
        entry.type,
        l.account,
        l.providerId ?? null,
        entry.bookingId ?? null,
        l.bookingItemId ?? null,
        entry.paymentAttemptId ?? null,
        entry.refundId ?? null,
        entry.payoutId ?? null,
        l.amountMinor,
        entry.currency,
        l.memo ?? null,
        entry.createdBy ?? null,
      ],
    );
  }
  return txnId;
}

/** Amount the platform owes a provider (credit balance of provider_payable, shown as positive). */
export async function providerBalance(db: Queryable, providerId: string): Promise<{ currency: string; owedMinor: number }[]> {
  const { rows } = await db.query<{ currency: string; owed: number }>(
    `select currency, -sum(amount_minor)::bigint as owed from ledger_entries
      where account = 'provider_payable' and provider_id = $1 group by currency`,
    [providerId],
  );
  return rows.map((r) => ({ currency: r.currency, owedMinor: r.owed }));
}
