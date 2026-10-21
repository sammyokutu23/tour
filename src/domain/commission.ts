import { applyBps } from "@/lib/money";

export interface CommissionRule {
  id: string;
  providerId: string | null;
  providerKind: "guide" | "operator" | null;
  categoryId: string | null;
  commissionBps: number;
  createdAt: Date;
}

export interface CommissionContext {
  providerId: string;
  providerKind: "guide" | "operator";
  categoryId: string | null;
}

export interface ResolvedCommission {
  ruleId: string | null;
  commissionBps: number;
}

/**
 * Picks the most specific active rule: provider > category > provider kind > platform default.
 * Within the same specificity the most recently created rule wins.
 */
export function resolveCommission(
  rules: CommissionRule[],
  ctx: CommissionContext,
  defaultBps: number,
): ResolvedCommission {
  const specificity = (r: CommissionRule): number => {
    if (r.providerId) return r.providerId === ctx.providerId ? 3 : -1;
    if (r.categoryId) return r.categoryId === ctx.categoryId ? 2 : -1;
    if (r.providerKind) return r.providerKind === ctx.providerKind ? 1 : -1;
    return 0;
  };
  const best = rules
    .map((r) => ({ r, s: specificity(r) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || b.r.createdAt.getTime() - a.r.createdAt.getTime())[0];
  return best ? { ruleId: best.r.id, commissionBps: best.r.commissionBps } : { ruleId: null, commissionBps: defaultBps };
}

/** Splits a line's net value between platform commission and provider earnings. Always sums exactly. */
export function splitCommission(lineTotalMinor: number, commissionBps: number) {
  if (commissionBps < 0 || commissionBps > 5000) throw new Error("Commission outside allowed range");
  const commissionMinor = applyBps(lineTotalMinor, commissionBps);
  return { commissionMinor, providerEarningsMinor: lineTotalMinor - commissionMinor };
}
