/** Explicit state machines. Every status change in the database goes through `assertTransition`. */

export class InvalidTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${machine} transition: ${from} → ${to}`);
  }
}

function machine<S extends string>(name: string, transitions: Record<S, readonly S[]>) {
  return {
    name,
    transitions,
    can(from: S, to: S) {
      return transitions[from]?.includes(to) ?? false;
    },
    assert(from: S, to: S) {
      if (!transitions[from]?.includes(to)) throw new InvalidTransitionError(name, from, to);
    },
    isTerminal(s: S) {
      return (transitions[s]?.length ?? 0) === 0;
    },
  };
}

export const BOOKING_STATUSES = [
  "pending_provider",
  "provider_declined",
  "awaiting_payment",
  "payment_pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancellation_requested",
  "cancelled",
  "expired",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookingMachine = machine<BookingStatus>("booking", {
  pending_provider: ["awaiting_payment", "provider_declined", "cancelled", "expired"],
  awaiting_payment: ["payment_pending", "confirmed", "cancelled", "expired"],
  payment_pending: ["confirmed", "awaiting_payment", "cancelled", "expired"],
  confirmed: ["in_progress", "completed", "cancellation_requested", "cancelled"],
  in_progress: ["completed", "cancelled"],
  cancellation_requested: ["confirmed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
  provider_declined: [],
});

export const PAYMENT_STATUSES = [
  "unpaid",
  "pending",
  "paid",
  "failed",
  "refund_pending",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const paymentStatusMachine = machine<PaymentStatus>("payment", {
  unpaid: ["pending", "paid"],
  pending: ["paid", "failed", "pending"],
  failed: ["pending", "paid"],
  paid: ["refund_pending", "partially_refunded", "refunded"],
  refund_pending: ["partially_refunded", "refunded", "paid"],
  partially_refunded: ["refund_pending", "refunded"],
  refunded: [],
});

export const TRIP_STATUSES = [
  "draft",
  "quoted",
  "pending_booking",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const tripMachine = machine<TripStatus>("trip", {
  draft: ["quoted", "archived"],
  quoted: ["draft", "pending_booking", "archived"],
  pending_booking: ["draft", "confirmed", "cancelled"],
  confirmed: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["archived"],
  cancelled: ["draft", "archived"],
  archived: [],
});

/** Trips can only be edited while no booking is in flight. */
export function isTripEditable(status: TripStatus): boolean {
  return status === "draft" || status === "quoted";
}

export const PROVIDER_STATUSES = ["draft", "submitted", "info_requested", "approved", "rejected", "suspended"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const providerMachine = machine<ProviderStatus>("provider", {
  draft: ["submitted"],
  submitted: ["approved", "rejected", "info_requested"],
  info_requested: ["submitted"],
  approved: ["suspended"],
  rejected: ["submitted"],
  suspended: ["approved"],
});

export const LISTING_STATUSES = ["draft", "pending_review", "published", "rejected", "suspended", "archived"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const listingMachine = machine<ListingStatus>("listing", {
  draft: ["pending_review", "archived"],
  pending_review: ["published", "rejected", "draft"],
  published: ["suspended", "archived", "pending_review"],
  rejected: ["pending_review", "archived"],
  suspended: ["published", "archived"],
  archived: [],
});

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending_provider: "Awaiting provider",
  provider_declined: "Declined by provider",
  awaiting_payment: "Awaiting payment",
  payment_pending: "Payment processing",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancellation_requested: "Cancellation requested",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  refund_pending: "Refund pending",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  pending_booking: "Booking in progress",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};
