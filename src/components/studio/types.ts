/** Serializable view model passed from the planner page (server) to client components. */
export interface PlannerItem {
  id: string;
  kind: "experience" | "guide" | "note";
  title: string;
  notes: string | null;
  timeLabel: string | null;
  startTime: string | null;
  durationLabel: string | null;
  providerName: string | null;
  providerSlug: string | null;
  experienceSlug: string | null;
  meetingPoint: string | null;
  inclusions: string[];
  exclusions: string[];
  preparationNotes: string | null;
  cancellationLabel: string | null;
  priceLabel: string | null;
  lineTotal: string | null;
  capacityLabel: string | null;
  alternatives: { id: string; label: string }[];
  currentSlotId: string | null;
  issues: { severity: "error" | "warning" | "info"; message: string }[];
  travelFromPrevious: string | null;
  bookingStatus: string | null;
  compareHref: string | null;
}

export interface PlannerDay {
  id: string;
  dayNumber: number;
  date: string;
  dateLabel: string;
  destinationId: string | null;
  destinationName: string | null;
  notes: string | null;
  items: PlannerItem[];
}
