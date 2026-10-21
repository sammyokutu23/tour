/**
 * Pure rules for Travel Together: explainable matching, voting outcomes and state machines.
 * No I/O — unit-tested.
 */
import { InvalidTransitionError } from "./states";

// ───────────────────────────── Matching ─────────────────────────────

export interface MatchGroup {
  destinationSlug: string;
  startDate: string;
  endDate: string;
  minBudgetMinor: number | null;
  maxBudgetMinor: number | null;
  interests: string[];
  pace: "relaxed" | "balanced" | "adventurous";
  language: string;
  placesLeft: number;
}

/** What the traveller is looking for. Every field is optional; missing fields neither help nor hurt. */
export interface MatchSeeker {
  destinationSlugs?: string[];
  startDate?: string;
  endDate?: string;
  budgetMaxMinor?: number;
  interests?: string[];
  pace?: "relaxed" | "balanced" | "adventurous";
  languages?: string[];
}

/**
 * Documented weights (sum 100). The score is a transparent ranking aid, not a prediction of how
 * well people will get on; we always show the reasons behind it.
 */
export const MATCH_WEIGHTS = { dates: 30, destination: 25, interests: 20, budget: 15, pace: 5, language: 5 } as const;

export interface MatchResult {
  score: number;
  label: "Great match" | "Good match" | "Possible match" | null;
  reasons: string[];
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return end < start ? 0 : daysBetween(start, end) + 1;
}

export function matchGroup(group: MatchGroup, seeker: MatchSeeker): MatchResult {
  let score = 0;
  let possible = 0;
  const reasons: string[] = [];

  if (seeker.startDate && seeker.endDate) {
    possible += MATCH_WEIGHTS.dates;
    const overlap = overlapDays(group.startDate, group.endDate, seeker.startDate, seeker.endDate);
    const groupDays = daysBetween(group.startDate, group.endDate) + 1;
    if (overlap > 0) {
      score += MATCH_WEIGHTS.dates * Math.min(1, overlap / groupDays);
      reasons.push(overlap >= groupDays ? "Dates fit your trip" : `${overlap} overlapping day${overlap === 1 ? "" : "s"}`);
    }
  }
  if (seeker.destinationSlugs?.length) {
    possible += MATCH_WEIGHTS.destination;
    if (seeker.destinationSlugs.includes(group.destinationSlug)) {
      score += MATCH_WEIGHTS.destination;
      reasons.push("Same destination");
    }
  }
  if (seeker.interests?.length) {
    possible += MATCH_WEIGHTS.interests;
    const shared = group.interests.filter((i) => seeker.interests!.includes(i));
    if (shared.length) {
      score += MATCH_WEIGHTS.interests * Math.min(1, shared.length / Math.min(3, seeker.interests.length));
      reasons.push(`Shared interest${shared.length === 1 ? "" : "s"}: ${shared.slice(0, 3).join(", ")}`);
    }
  }
  if (seeker.budgetMaxMinor !== undefined) {
    possible += MATCH_WEIGHTS.budget;
    if (group.minBudgetMinor === null || group.minBudgetMinor <= seeker.budgetMaxMinor) {
      score += MATCH_WEIGHTS.budget;
      if (group.minBudgetMinor !== null) reasons.push("Similar budget");
    }
  }
  if (seeker.pace) {
    possible += MATCH_WEIGHTS.pace;
    if (seeker.pace === group.pace) {
      score += MATCH_WEIGHTS.pace;
      reasons.push(`${group.pace[0].toUpperCase()}${group.pace.slice(1)} pace`);
    }
  }
  if (seeker.languages?.length) {
    possible += MATCH_WEIGHTS.language;
    if (seeker.languages.some((l) => l.toLowerCase() === group.language.toLowerCase())) {
      score += MATCH_WEIGHTS.language;
      reasons.push(`Speaks ${group.language}`);
    }
  }
  if (group.placesLeft > 0) reasons.push(`${group.placesLeft} place${group.placesLeft === 1 ? "" : "s"} available`);

  const normalised = possible ? Math.round((score / possible) * 100) : 0;
  const label = !possible ? null : normalised >= 75 ? "Great match" : normalised >= 50 ? "Good match" : normalised >= 25 ? "Possible match" : null;
  return { score: normalised, label, reasons };
}

// ───────────────────────────── Voting ─────────────────────────────

export type ApprovalPolicy = "organizer" | "majority";

/**
 * Majority rule: a proposal is approved once strictly more than half of active members vote yes,
 * and rejected once half or more vote no (approval is then impossible). Under the "organizer"
 * policy votes are advisory and only an organizer decision changes the status.
 */
export function votingOutcome(policy: ApprovalPolicy, yes: number, no: number, activeMembers: number): "approved" | "rejected" | "open" {
  if (policy !== "majority" || activeMembers < 1) return "open";
  if (yes * 2 > activeMembers) return "approved";
  if (no * 2 >= activeMembers) return "rejected";
  return "open";
}

// ───────────────────────────── State machines ─────────────────────────────

function machine<S extends string>(name: string, transitions: Record<S, readonly S[]>) {
  return {
    can: (from: S, to: S) => transitions[from]?.includes(to) ?? false,
    assert(from: S, to: S) {
      if (!transitions[from]?.includes(to)) throw new InvalidTransitionError(name, from, to);
    },
  };
}

export type GroupStatus = "draft" | "published" | "cancelled" | "completed" | "suspended";
export const groupMachine = machine<GroupStatus>("travel group", {
  draft: ["published", "cancelled"],
  published: ["cancelled", "completed", "suspended"],
  suspended: ["published", "cancelled"],
  cancelled: [],
  completed: [],
});

export type MemberStatus = "active" | "left" | "removed" | "banned";
export const memberMachine = machine<MemberStatus>("membership", {
  active: ["left", "removed", "banned"],
  left: ["active"],
  removed: ["active", "banned"],
  banned: [],
});

export type ProposalStatus = "proposed" | "voting" | "approved" | "rejected" | "cancelled";
export const proposalMachine = machine<ProposalStatus>("proposal", {
  proposed: ["voting", "approved", "rejected", "cancelled"],
  voting: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: [],
  cancelled: [],
});

export const INTEREST_LABEL: Record<string, string> = {
  wildlife: "Wildlife & safari",
  adventure: "Hiking & adventure",
  beach: "Beach & relaxation",
  food: "Food & local cuisine",
  culture: "Culture & history",
  photography: "Photography",
  nightlife: "Nightlife",
  nature: "Nature & conservation",
  "road-trips": "Road trips",
  luxury: "Luxury travel",
  budget: "Budget travel",
  family: "Family-friendly",
};
