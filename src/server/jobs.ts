import type { Db } from "./db/client";
import { expireDueBookings, progressBookings, reconcilePendingPayments } from "./services/bookings";
import { dispatchDeliveries } from "./services/notifications";
import { travelGroupHousekeeping } from "./services/travel-groups";

/**
 * Background jobs. Each is idempotent and safe to run concurrently, so they can be triggered by a
 * scheduler (e.g. Vercel Cron calling /api/cron/jobs) every few minutes.
 */
export async function runJobs(db: Db, now = new Date()) {
  const reconciled = await reconcilePendingPayments(db);
  const expired = await db.transaction((tx) => expireDueBookings(tx, now));
  const progressed = await progressBookings(db, now);
  const travelGroups = await travelGroupHousekeeping(db);
  const deliveries = await dispatchDeliveries(db);
  return { reconciled, expired, progressed, travelGroups, deliveries };
}
