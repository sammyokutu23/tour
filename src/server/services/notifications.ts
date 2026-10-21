import type { Queryable } from "../db/client";
import { getEmailAdapter, sendEmail, type EmailAdapter } from "./email";

export type NotificationType =
  | "booking.requested"
  | "booking.accepted"
  | "booking.declined"
  | "booking.awaiting_payment"
  | "payment.succeeded"
  | "payment.failed"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.expired"
  | "refund.updated"
  | "message.received"
  | "change_request.created"
  | "change_request.updated"
  | "provider.status"
  | "listing.status"
  | "review.received"
  | "group.join_request"
  | "group.request_approved"
  | "group.request_declined"
  | "group.invitation"
  | "group.member_joined"
  | "group.member_left"
  | "group.member_removed"
  | "group.full"
  | "group.proposal"
  | "group.proposal_decided"
  | "group.announcement"
  | "group.cancelled"
  | "group.moderation";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  /** Uniquely identifies the triggering event so retries never produce duplicates. */
  dedupeKey: string;
}

/**
 * Records an in-app notification and queues an email delivery (if the user allows email).
 * Idempotent on dedupeKey. Delivery happens out-of-band in `dispatchDeliveries`.
 */
export async function notify(db: Queryable, input: NotifyInput): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `insert into notifications (user_id, type, title, body, link, dedupe_key)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (dedupe_key) do nothing
     returning id`,
    [input.userId, input.type, input.title, input.body, input.link ?? null, input.dedupeKey],
  );
  const created = rows[0];
  if (!created) return;
  const { rows: prefs } = await db.query<{ notify_email: boolean | null }>(
    "select tp.notify_email from users u left join traveller_profiles tp on tp.user_id = u.id where u.id = $1",
    [input.userId],
  );
  const wantsEmail = prefs[0]?.notify_email ?? true;
  await db.query(
    `insert into notification_deliveries (notification_id, channel, status) values ($1, 'email', $2)
     on conflict (notification_id, channel) do nothing`,
    [created.id, wantsEmail ? "pending" : "skipped"],
  );
}

const MAX_ATTEMPTS = 5;

/** Sends pending deliveries with exponential backoff. Safe to run concurrently with itself. */
export async function dispatchDeliveries(db: Queryable, opts: { limit?: number; adapter?: EmailAdapter; baseUrl?: string } = {}) {
  const adapter = opts.adapter ?? getEmailAdapter();
  const baseUrl = opts.baseUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const { rows } = await db.query<{
    id: string;
    attempts: number;
    title: string;
    body: string;
    link: string | null;
    email: string;
  }>(
    `select d.id, d.attempts, n.title, n.body, n.link, u.email
       from notification_deliveries d
       join notifications n on n.id = d.notification_id
       join users u on u.id = n.user_id
      where d.status = 'pending' and d.channel = 'email' and d.next_attempt_at <= now()
      order by d.next_attempt_at
      limit $1`,
    [opts.limit ?? 50],
  );

  let sent = 0;
  let failed = 0;
  for (const d of rows) {
    // Claim the row so a concurrent dispatcher skips it.
    const claim = await db.query(
      "update notification_deliveries set attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes' where id = $1 and status = 'pending' and attempts = $2",
      [d.id, d.attempts],
    );
    if (claim.rowCount === 0) continue;
    try {
      const text = `${d.body}${d.link ? `\n\nView details: ${baseUrl}${d.link}` : ""}`;
      const { providerMessageId } = await sendEmail(db, { to: d.email, subject: d.title, text }, adapter);
      await db.query(
        "update notification_deliveries set status = 'sent', sent_at = now(), provider_message_id = $2, last_error = null where id = $1",
        [d.id, providerMessageId],
      );
      sent++;
    } catch (err) {
      const attempts = d.attempts + 1;
      const backoffMinutes = Math.min(2 ** attempts, 120);
      await db.query(
        `update notification_deliveries
            set status = case when $2 >= $3 then 'failed' else 'pending' end,
                last_error = $4,
                next_attempt_at = now() + make_interval(mins => $5)
          where id = $1`,
        [d.id, attempts, MAX_ATTEMPTS, String((err as Error).message).slice(0, 500), backoffMinutes],
      );
      failed++;
    }
  }
  return { sent, failed };
}
