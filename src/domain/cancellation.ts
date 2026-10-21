import { applyBpsFloor } from "@/lib/money";

export type CancellationPolicy = "flexible" | "moderate" | "strict";

interface Tier {
  minHoursBefore: number;
  refundBps: number;
}

export const POLICY_TIERS: Record<CancellationPolicy, Tier[]> = {
  flexible: [{ minHoursBefore: 24, refundBps: 10_000 }],
  moderate: [
    { minHoursBefore: 5 * 24, refundBps: 10_000 },
    { minHoursBefore: 24, refundBps: 5_000 },
  ],
  strict: [
    { minHoursBefore: 14 * 24, refundBps: 10_000 },
    { minHoursBefore: 7 * 24, refundBps: 5_000 },
  ],
};

export const POLICY_SUMMARY: Record<CancellationPolicy, string> = {
  flexible: "Full refund if cancelled at least 24 hours before the start time.",
  moderate: "Full refund at least 5 days before; 50% refund at least 24 hours before.",
  strict: "Full refund at least 14 days before; 50% refund at least 7 days before.",
};

export function refundBpsFor(policy: CancellationPolicy, startsAt: Date, now: Date): number {
  const hoursBefore = (startsAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursBefore <= 0) return 0;
  const tier = POLICY_TIERS[policy].find((t) => hoursBefore >= t.minHoursBefore);
  return tier?.refundBps ?? 0;
}

export interface RefundableItem {
  id: string;
  policy: CancellationPolicy;
  startsAt: Date;
  lineTotalMinor: number;
  commissionMinor: number;
  status: "active" | "cancelled" | "completed";
}

export interface RefundPlan {
  items: { id: string; refundBps: number; refundMinor: number; commissionReversalMinor: number }[];
  serviceFeeRefundMinor: number;
  taxRefundMinor: number;
  totalRefundMinor: number;
}

/**
 * Computes the refund owed when a traveller cancels. `initiator: "provider" | "platform"` means the
 * traveller is not at fault and receives a full refund regardless of policy.
 */
export function planRefund(
  items: RefundableItem[],
  fees: { serviceFeeMinor: number; taxMinor: number },
  now: Date,
  initiator: "traveller" | "provider" | "platform",
): RefundPlan {
  const active = items.filter((i) => i.status === "active");
  const planned = active.map((i) => {
    const bps = initiator === "traveller" ? refundBpsFor(i.policy, i.startsAt, now) : 10_000;
    const refundMinor = applyBpsFloor(i.lineTotalMinor, bps);
    return { id: i.id, refundBps: bps, refundMinor, commissionReversalMinor: applyBpsFloor(i.commissionMinor, bps) };
  });
  const lineTotal = active.reduce((s, i) => s + i.lineTotalMinor, 0);
  const lineRefund = planned.reduce((s, i) => s + i.refundMinor, 0);
  // Fees are refunded in the same proportion as the underlying services.
  const ratio = (amount: number) => (lineTotal === 0 ? 0 : Math.floor((amount * lineRefund) / lineTotal));
  const serviceFeeRefundMinor = ratio(fees.serviceFeeMinor);
  const taxRefundMinor = ratio(fees.taxMinor);
  return {
    items: planned,
    serviceFeeRefundMinor,
    taxRefundMinor,
    totalRefundMinor: lineRefund + serviceFeeRefundMinor + taxRefundMinor,
  };
}
