/**
 * Transparent, configurable guide ranking. Hard constraints (availability, region, capacity) filter
 * candidates out before scoring and can never be overridden by score or promotion.
 */

export interface GuideCandidate {
  id: string;
  /** null when the traveller hasn't asked about a specific date */
  availableOnDate: boolean | null;
  servesDestination: boolean | null;
  canHostGroup: boolean;
  languagesRequested: string[];
  languages: string[];
  specialtiesRequested: string[];
  specialties: string[];
  ratingAvg: number | null;
  reviewCount: number;
  completedBookings: number;
  providerCancellations: number;
  fromPriceMinor: number | null;
}

export interface RankingWeights {
  languages: number;
  expertise: number;
  reviews: number;
  reliability: number;
  price: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  languages: 0.25,
  expertise: 0.25,
  reviews: 0.25,
  reliability: 0.15,
  price: 0.1,
};

/** Bayesian prior so a single 5★ review doesn't outrank an established guide. */
const PRIOR_RATING = 3.5;
const PRIOR_WEIGHT = 5;

export interface RankedGuide {
  id: string;
  score: number;
  reasons: string[];
}

export function isEligible(c: GuideCandidate): boolean {
  return c.availableOnDate !== false && c.servesDestination !== false && c.canHostGroup;
}

export function rankGuides(candidates: GuideCandidate[], weights: RankingWeights = DEFAULT_WEIGHTS): RankedGuide[] {
  const eligible = candidates.filter(isEligible);
  const prices = eligible.map((c) => c.fromPriceMinor).filter((p): p is number => p !== null);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return eligible
    .map((c) => {
      const reasons: string[] = [];
      const langLower = c.languages.map((l) => l.toLowerCase());
      const langMatch = c.languagesRequested.length
        ? c.languagesRequested.filter((l) => langLower.includes(l.toLowerCase())).length / c.languagesRequested.length
        : 0.5;
      if (c.languagesRequested.length && langMatch === 1) reasons.push("Speaks your language");

      const specLower = c.specialties.map((s) => s.toLowerCase());
      const specMatch = c.specialtiesRequested.length
        ? c.specialtiesRequested.filter((s) => specLower.includes(s.toLowerCase())).length / c.specialtiesRequested.length
        : 0.5;
      if (c.specialtiesRequested.length && specMatch > 0) reasons.push("Matches your interests");

      const bayes =
        (PRIOR_RATING * PRIOR_WEIGHT + (c.ratingAvg ?? 0) * c.reviewCount) / (PRIOR_WEIGHT + c.reviewCount);
      const reviewScore = (bayes - 1) / 4;
      if (c.reviewCount >= 3 && (c.ratingAvg ?? 0) >= 4.5) reasons.push("Highly rated");

      const totalJobs = c.completedBookings + c.providerCancellations;
      const reliability = totalJobs ? c.completedBookings / totalJobs : 0.5;

      const priceScore =
        c.fromPriceMinor === null || maxPrice === minPrice ? 0.5 : 1 - (c.fromPriceMinor - minPrice) / (maxPrice - minPrice);

      if (c.availableOnDate === true) reasons.unshift("Available on your date");

      const score =
        weights.languages * langMatch +
        weights.expertise * specMatch +
        weights.reviews * reviewScore +
        weights.reliability * reliability +
        weights.price * priceScore;
      return { id: c.id, score: Math.round(score * 1000) / 1000, reasons };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
