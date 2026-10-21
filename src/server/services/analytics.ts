import type { Queryable } from "../db/client";

export type AnalyticsEvent =
  | "destination_viewed"
  | "experience_viewed"
  | "guide_viewed"
  | "search_submitted"
  | "trip_created"
  | "itinerary_item_added"
  | "itinerary_item_removed"
  | "guide_selected"
  | "booking_requested"
  | "provider_accepted"
  | "checkout_started"
  | "payment_succeeded"
  | "booking_cancelled"
  | "booking_completed"
  | "review_submitted"
  | "travel_together_viewed"
  | "group_search"
  | "group_viewed"
  | "group_created"
  | "group_join_requested"
  | "group_join_approved"
  | "group_joined"
  | "group_proposal_created"
  | "group_vote_cast"
  | "group_booking_started"
  | "group_cancelled"
  | "group_report_submitted";

/**
 * First-party product analytics. Events from signed-in users are only linked to the user when they
 * have consented; otherwise the event is stored without a user id. Properties must not contain PII.
 */
export async function track(
  db: Queryable,
  name: AnalyticsEvent,
  props: Record<string, string | number | boolean | null> = {},
  userId: string | null = null,
): Promise<void> {
  try {
    let linkedUser: string | null = null;
    if (userId) {
      const { rows } = await db.query<{ analytics_consent: boolean }>(
        "select analytics_consent from traveller_profiles where user_id = $1",
        [userId],
      );
      if (rows[0]?.analytics_consent) linkedUser = userId;
    }
    await db.query("insert into analytics_events (name, user_id, properties) values ($1, $2, $3)", [
      name,
      linkedUser,
      JSON.stringify(props),
    ]);
  } catch (err) {
    // Analytics must never break a user flow, but failures should be visible in logs.
    console.error("[analytics] failed to record event", name, (err as Error).message);
  }
}
