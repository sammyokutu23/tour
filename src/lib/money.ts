/** Money helpers. All amounts are integer minor units (e.g. KES cents) with an ISO-4217 code. */

export const MINOR_UNITS: Record<string, number> = { KES: 100, USD: 100 };

export function toMinor(major: number, currency = "KES"): number {
  const factor = MINOR_UNITS[currency] ?? 100;
  return Math.round(major * factor);
}

export function formatMoney(minor: number, currency = "KES", opts: { compact?: boolean } = {}): string {
  const factor = MINOR_UNITS[currency] ?? 100;
  const major = minor / factor;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.compact || Number.isInteger(major) ? 0 : 2,
    minimumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(major);
}

/** Multiplies an amount by a basis-point rate (1 bp = 0.01%) with half-up rounding. */
export function applyBps(minor: number, bps: number): number {
  if (!Number.isInteger(minor) || !Number.isInteger(bps)) throw new Error("applyBps requires integers");
  return Math.round((minor * bps) / 10_000);
}

/** Same as applyBps but always rounds down; used for refunds so we never over-refund. */
export function applyBpsFloor(minor: number, bps: number): number {
  if (!Number.isInteger(minor) || !Number.isInteger(bps)) throw new Error("applyBpsFloor requires integers");
  return Math.floor((minor * bps) / 10_000);
}
