import { describe, expect, it } from "vitest";
import { priceLine, priceQuote, PricingError, type PriceableLine } from "@/domain/pricing";
import { resolveCommission, splitCommission, type CommissionRule } from "@/domain/commission";
import { applyBps, formatMoney } from "@/lib/money";

const line = (over: Partial<PriceableLine> = {}): PriceableLine => ({
  key: "a",
  title: "Drive",
  pricingModel: "per_person",
  currency: "KES",
  basePriceMinor: 750_000,
  childPriceMinor: 450_000,
  adults: 2,
  children: 1,
  discountRules: [],
  ...over,
});

describe("pricing", () => {
  it("prices per person with child rates", () => {
    const p = priceLine(line());
    expect(p.grossMinor).toBe(2 * 750_000 + 450_000);
    expect(p.totalMinor).toBe(p.grossMinor);
  });

  it("falls back to the adult price when there is no child price", () => {
    expect(priceLine(line({ childPriceMinor: null })).grossMinor).toBe(3 * 750_000);
  });

  it("prices per group regardless of party size", () => {
    const p = priceLine(line({ pricingModel: "per_group", basePriceMinor: 1_800_000, adults: 5, children: 0 }));
    expect(p.grossMinor).toBe(1_800_000);
    expect(p.quantityLabel).toBe("per group");
  });

  it("applies the best eligible group discount only", () => {
    const rules = [
      { id: "r1", minTravellers: 3, percentOffBps: 500 },
      { id: "r2", minTravellers: 3, percentOffBps: 1000 },
      { id: "r3", minTravellers: 10, percentOffBps: 3000 },
    ];
    const p = priceLine(line({ discountRules: rules }));
    expect(p.discountRuleId).toBe("r2");
    expect(p.discountMinor).toBe(applyBps(p.grossMinor, 1000));
  });

  it("rejects empty parties and invalid prices", () => {
    expect(() => priceLine(line({ adults: 0, children: 0 }))).toThrow(PricingError);
    expect(() => priceLine(line({ basePriceMinor: -1 }))).toThrow(PricingError);
    expect(() => priceLine(line({ basePriceMinor: 1.5 }))).toThrow(PricingError);
  });

  it("builds a quote with service fee and tax on the discounted net", () => {
    const q = priceQuote(
      [line(), line({ key: "b", pricingModel: "per_group", basePriceMinor: 1_200_000, discountRules: [{ id: "x", minTravellers: 2, percentOffBps: 1000 }] })],
      { currency: "KES", serviceFeeBps: 500, taxBps: 1600 },
    );
    const net = q.subtotalMinor - q.discountMinor;
    expect(q.discountMinor).toBe(120_000);
    expect(q.serviceFeeMinor).toBe(applyBps(net, 500));
    expect(q.taxMinor).toBe(applyBps(net + q.serviceFeeMinor, 1600));
    expect(q.totalMinor).toBe(net + q.serviceFeeMinor + q.taxMinor);
    expect(q.lines.reduce((s, l) => s + l.totalMinor, 0)).toBe(net);
  });

  it("refuses to mix currencies", () => {
    expect(() => priceQuote([line({ currency: "USD" })], { currency: "KES", serviceFeeBps: 0, taxBps: 0 })).toThrow(/USD/);
  });

  it("formats money from minor units", () => {
    expect(formatMoney(1_250_000, "KES")).toMatch(/12,500/);
  });
});

describe("commission", () => {
  const at = (s: string) => new Date(s);
  const rules: CommissionRule[] = [
    { id: "global", providerId: null, providerKind: null, categoryId: null, commissionBps: 1500, createdAt: at("2026-01-01") },
    { id: "guides", providerId: null, providerKind: "guide", categoryId: null, commissionBps: 1000, createdAt: at("2026-01-01") },
    { id: "food", providerId: null, providerKind: null, categoryId: "cat-food", commissionBps: 1100, createdAt: at("2026-01-01") },
    { id: "vip-old", providerId: "p1", providerKind: null, categoryId: null, commissionBps: 800, createdAt: at("2026-01-01") },
    { id: "vip-new", providerId: "p1", providerKind: null, categoryId: null, commissionBps: 700, createdAt: at("2026-02-01") },
  ];

  it("prefers the most specific, most recent rule", () => {
    expect(resolveCommission(rules, { providerId: "p1", providerKind: "guide", categoryId: "cat-food" }, 1200)).toEqual({ ruleId: "vip-new", commissionBps: 700 });
    expect(resolveCommission(rules, { providerId: "p2", providerKind: "operator", categoryId: "cat-food" }, 1200).ruleId).toBe("food");
    expect(resolveCommission(rules, { providerId: "p2", providerKind: "guide", categoryId: null }, 1200).ruleId).toBe("guides");
    expect(resolveCommission(rules, { providerId: "p2", providerKind: "operator", categoryId: null }, 1200).ruleId).toBe("global");
  });

  it("uses the platform default when no rule applies", () => {
    expect(resolveCommission([], { providerId: "p", providerKind: "guide", categoryId: null }, 1200)).toEqual({ ruleId: null, commissionBps: 1200 });
  });

  it("splits a line so commission + earnings always equals the line total", () => {
    for (const total of [0, 1, 99, 12_345, 1_000_001]) {
      for (const bps of [0, 1, 1000, 1250, 5000]) {
        const s = splitCommission(total, bps);
        expect(s.commissionMinor + s.providerEarningsMinor).toBe(total);
        expect(s.commissionMinor).toBeGreaterThanOrEqual(0);
      }
    }
    expect(() => splitCommission(100, 6000)).toThrow();
  });
});
