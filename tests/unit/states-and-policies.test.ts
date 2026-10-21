import { describe, expect, it } from "vitest";
import { bookingMachine, paymentStatusMachine, tripMachine, providerMachine, InvalidTransitionError, BOOKING_STATUSES } from "@/domain/states";
import { planRefund, refundBpsFor } from "@/domain/cancellation";
import { bookingAccess, canViewTrip, requireAdmin, requireProvider, ForbiddenError, AuthRequiredError, type Actor } from "@/domain/authz";
import { rankGuides, isEligible, type GuideCandidate } from "@/domain/ranking";

describe("booking state machine", () => {
  it("allows the happy path", () => {
    const path = ["pending_provider", "awaiting_payment", "payment_pending", "confirmed", "in_progress", "completed"] as const;
    for (let i = 1; i < path.length; i++) expect(bookingMachine.can(path[i - 1], path[i])).toBe(true);
  });

  it("rejects skipping provider acceptance or reviving terminal states", () => {
    expect(() => bookingMachine.assert("pending_provider", "confirmed")).toThrow(InvalidTransitionError);
    expect(bookingMachine.can("cancelled", "confirmed")).toBe(false);
    expect(bookingMachine.can("expired", "awaiting_payment")).toBe(false);
    for (const s of ["completed", "cancelled", "expired", "provider_declined"] as const) expect(bookingMachine.isTerminal(s)).toBe(true);
  });

  it("defines transitions for every status", () => {
    for (const s of BOOKING_STATUSES) expect(Array.isArray(bookingMachine.transitions[s])).toBe(true);
  });

  it("keeps payment status separate and forbids un-refunding", () => {
    expect(paymentStatusMachine.can("unpaid", "pending")).toBe(true);
    expect(paymentStatusMachine.can("paid", "refunded")).toBe(true);
    expect(paymentStatusMachine.can("refunded", "paid")).toBe(false);
    expect(paymentStatusMachine.can("unpaid", "refunded")).toBe(false);
  });

  it("only lets drafts and quotes be edited, and reverts quotes to draft", () => {
    expect(tripMachine.can("quoted", "draft")).toBe(true);
    expect(tripMachine.can("confirmed", "draft")).toBe(false);
  });

  it("requires review before a provider is approved", () => {
    expect(providerMachine.can("draft", "approved")).toBe(false);
    expect(providerMachine.can("submitted", "approved")).toBe(true);
  });
});

describe("cancellation policy", () => {
  const start = new Date("2026-11-20T06:00:00Z");
  const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

  it("uses policy tiers", () => {
    expect(refundBpsFor("flexible", start, hoursBefore(25))).toBe(10_000);
    expect(refundBpsFor("flexible", start, hoursBefore(23))).toBe(0);
    expect(refundBpsFor("moderate", start, hoursBefore(5 * 24))).toBe(10_000);
    expect(refundBpsFor("moderate", start, hoursBefore(48))).toBe(5_000);
    expect(refundBpsFor("strict", start, hoursBefore(8 * 24))).toBe(5_000);
    expect(refundBpsFor("strict", start, hoursBefore(3 * 24))).toBe(0);
    expect(refundBpsFor("flexible", start, new Date(start.getTime() + 1))).toBe(0);
  });

  it("refunds fees in proportion and never over-refunds", () => {
    const plan = planRefund(
      [
        { id: "a", policy: "flexible", startsAt: start, lineTotalMinor: 10_001, commissionMinor: 1_200, status: "active" },
        { id: "b", policy: "strict", startsAt: start, lineTotalMinor: 30_000, commissionMinor: 3_600, status: "active" },
        { id: "c", policy: "flexible", startsAt: start, lineTotalMinor: 5_000, commissionMinor: 600, status: "cancelled" },
      ],
      { serviceFeeMinor: 2_000, taxMinor: 0 },
      hoursBefore(48),
      "traveller",
    );
    expect(plan.items.map((i) => i.refundMinor)).toEqual([10_001, 0]);
    expect(plan.serviceFeeRefundMinor).toBe(Math.floor((2_000 * 10_001) / 40_001));
    expect(plan.totalRefundMinor).toBeLessThanOrEqual(40_001 + 2_000);
  });

  it("gives a full refund when the provider cancels", () => {
    const plan = planRefund(
      [{ id: "a", policy: "strict", startsAt: start, lineTotalMinor: 30_000, commissionMinor: 3_600, status: "active" }],
      { serviceFeeMinor: 1_500, taxMinor: 300 },
      hoursBefore(1),
      "provider",
    );
    expect(plan.totalRefundMinor).toBe(31_800);
    expect(plan.items[0].commissionReversalMinor).toBe(3_600);
  });
});

describe("authorization policies", () => {
  const traveller: Actor = { userId: "u1", roles: ["traveller"], providerId: null };
  const other: Actor = { userId: "u2", roles: ["traveller"], providerId: null };
  const guide: Actor = { userId: "g", roles: ["traveller", "guide"], providerId: "p1" };
  const otherGuide: Actor = { userId: "g2", roles: ["traveller", "guide"], providerId: "p2" };
  const admin: Actor = { userId: "a", roles: ["admin"], providerId: null };
  const support: Actor = { userId: "s", roles: ["support"], providerId: null };
  const booking = { travellerId: "u1", providerIds: ["p1"] };

  it("denies by default", () => {
    expect(bookingAccess(null, booking)).toBeNull();
    expect(bookingAccess(other, booking)).toBeNull();
    expect(bookingAccess(otherGuide, booking)).toBeNull();
  });

  it("grants scoped access", () => {
    expect(bookingAccess(traveller, booking)).toBe("traveller");
    expect(bookingAccess(guide, booking)).toBe("provider");
    expect(bookingAccess(admin, booking)).toBe("admin");
    expect(bookingAccess(support, booking)).toBe("support");
  });

  it("keeps trips private to their owner", () => {
    expect(canViewTrip(traveller, { ownerId: "u1" })).toBe(true);
    expect(canViewTrip(admin, { ownerId: "u1" })).toBe(false);
  });

  it("guards role-only operations", () => {
    expect(() => requireAdmin(null)).toThrow(AuthRequiredError);
    expect(() => requireAdmin(support)).toThrow(ForbiddenError);
    expect(() => requireProvider({ ...guide, providerId: null })).toThrow(ForbiddenError);
  });
});

describe("guide ranking", () => {
  const base: GuideCandidate = {
    id: "x",
    availableOnDate: null,
    servesDestination: null,
    canHostGroup: true,
    languagesRequested: [],
    languages: ["English"],
    specialtiesRequested: [],
    specialties: [],
    ratingAvg: null,
    reviewCount: 0,
    completedBookings: 0,
    providerCancellations: 0,
    fromPriceMinor: 1000,
  };

  it("never ranks an unavailable guide", () => {
    expect(isEligible({ ...base, availableOnDate: false })).toBe(false);
    const ranked = rankGuides([{ ...base, id: "busy", availableOnDate: false, ratingAvg: 5, reviewCount: 100 }, { ...base, id: "free", availableOnDate: true }]);
    expect(ranked.map((r) => r.id)).toEqual(["free"]);
  });

  it("favours language match and established ratings over a single 5-star review", () => {
    const ranked = rankGuides(
      [
        { ...base, id: "one-review", ratingAvg: 5, reviewCount: 1 },
        { ...base, id: "established", ratingAvg: 4.8, reviewCount: 40 },
        { ...base, id: "speaks", languages: ["English", "French"], languagesRequested: ["French"] },
      ].map((c) => ({ ...c, languagesRequested: ["French"] })),
    );
    expect(ranked[0].id).toBe("speaks");
    expect(ranked.findIndex((r) => r.id === "established")).toBeLessThan(ranked.findIndex((r) => r.id === "one-review"));
  });
});
