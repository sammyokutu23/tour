import { describe, expect, it } from "vitest";
import { matchGroup, overlapDays, votingOutcome, groupMachine, memberMachine, proposalMachine, MATCH_WEIGHTS, type MatchGroup } from "@/domain/travel-groups";

const group: MatchGroup = {
  destinationSlug: "maasai-mara",
  startDate: "2026-12-10",
  endDate: "2026-12-12",
  minBudgetMinor: 3_000_000,
  maxBudgetMinor: 5_000_000,
  interests: ["wildlife", "photography"],
  pace: "balanced",
  language: "English",
  placesLeft: 3,
};

describe("matching", () => {
  it("documents weights that sum to 100", () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("counts overlapping days inclusively", () => {
    expect(overlapDays("2026-12-10", "2026-12-12", "2026-12-12", "2026-12-20")).toBe(1);
    expect(overlapDays("2026-12-10", "2026-12-12", "2026-12-13", "2026-12-20")).toBe(0);
    expect(overlapDays("2026-12-10", "2026-12-12", "2026-12-01", "2026-12-31")).toBe(3);
  });

  it("gives a great match with explainable reasons", () => {
    const m = matchGroup(group, {
      destinationSlugs: ["maasai-mara"],
      startDate: "2026-12-09",
      endDate: "2026-12-14",
      budgetMaxMinor: 4_000_000,
      interests: ["wildlife"],
      pace: "balanced",
      languages: ["english"],
    });
    expect(m.score).toBe(100);
    expect(m.label).toBe("Great match");
    expect(m.reasons).toEqual(expect.arrayContaining(["Dates fit your trip", "Same destination", "Similar budget", "3 places available"]));
  });

  it("only scores criteria the traveller actually gave", () => {
    const m = matchGroup(group, { interests: ["beach"] });
    expect(m.score).toBe(0);
    expect(m.label).toBeNull();
    expect(matchGroup(group, {}).label).toBeNull();
  });

  it("penalises budgets below the group's minimum", () => {
    const m = matchGroup(group, { budgetMaxMinor: 1_000_000 });
    expect(m.score).toBe(0);
    expect(m.reasons).not.toContain("Similar budget");
  });

  it("never uses sensitive attributes — the seeker type has no such fields", () => {
    // Compile-time guarantee: MatchSeeker only accepts destinations, dates, budget, interests, pace and languages.
    const m = matchGroup(group, { pace: "relaxed" });
    expect(m.reasons.some((r) => /pace/i.test(r))).toBe(false);
  });
});

describe("voting", () => {
  it("approves on a strict majority of active members", () => {
    expect(votingOutcome("majority", 2, 0, 4)).toBe("open");
    expect(votingOutcome("majority", 3, 0, 4)).toBe("approved");
    expect(votingOutcome("majority", 1, 0, 1)).toBe("approved");
  });

  it("rejects once approval becomes impossible", () => {
    expect(votingOutcome("majority", 1, 2, 4)).toBe("rejected");
    expect(votingOutcome("majority", 0, 1, 3)).toBe("open");
  });

  it("treats votes as advisory under the organizer policy", () => {
    expect(votingOutcome("organizer", 10, 0, 10)).toBe("open");
  });
});

describe("state machines", () => {
  it("guards group, membership and proposal transitions", () => {
    expect(groupMachine.can("draft", "published")).toBe(true);
    expect(groupMachine.can("cancelled", "published")).toBe(false);
    expect(memberMachine.can("banned", "active")).toBe(false);
    expect(memberMachine.can("left", "active")).toBe(true);
    expect(proposalMachine.can("rejected", "approved")).toBe(false);
    expect(() => proposalMachine.assert("cancelled", "approved")).toThrow();
  });
});
