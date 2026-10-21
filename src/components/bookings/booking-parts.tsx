import Link from "next/link";
import { CheckCircle2, Circle, Clock, MapPin } from "lucide-react";
import { Badge, Card, cn, type BadgeTone } from "@/components/ui";
import type { BookingView } from "@/server/services/bookings";
import { BOOKING_STATUS_LABEL, PAYMENT_STATUS_LABEL, type BookingStatus, type PaymentStatus } from "@/domain/states";
import { POLICY_SUMMARY } from "@/domain/cancellation";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/time";

export function bookingTone(s: BookingStatus): BadgeTone {
  if (s === "confirmed" || s === "completed" || s === "in_progress") return "success";
  if (s === "cancelled" || s === "expired" || s === "provider_declined") return "danger";
  if (s === "awaiting_payment" || s === "payment_pending") return "gold";
  return "info";
}

export function paymentTone(s: PaymentStatus): BadgeTone {
  if (s === "paid") return "success";
  if (s === "failed") return "danger";
  if (s === "refunded" || s === "partially_refunded" || s === "refund_pending") return "info";
  return "neutral";
}

export function BookingStatusBadges({ status, paymentStatus }: { status: BookingStatus; paymentStatus: PaymentStatus }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Badge tone={bookingTone(status)}>{BOOKING_STATUS_LABEL[status]}</Badge>
      <Badge tone={paymentTone(paymentStatus)}>{PAYMENT_STATUS_LABEL[paymentStatus]}</Badge>
    </span>
  );
}

const PROVIDER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Awaiting response", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function BookingItems({ view }: { view: BookingView }) {
  return (
    <ul className="space-y-3">
      {view.items.map((i) => (
        <li key={i.id}>
          <Card className={cn("p-4 sm:p-5", i.status === "cancelled" && "opacity-70")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={i.kind === "guide" ? "gold" : "terracotta"}>{i.kind === "guide" ? "Guide" : "Experience"}</Badge>
                  <Badge tone={PROVIDER_STATUS[i.provider_status].tone}>{PROVIDER_STATUS[i.provider_status].label}</Badge>
                  {i.status !== "active" && <Badge tone={i.status === "completed" ? "success" : "danger"} className="capitalize">{i.status}</Badge>}
                </div>
                <p className="mt-2 font-semibold text-forest">{i.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
                  <Clock aria-hidden className="h-3.5 w-3.5" />
                  {formatDate(i.starts_at, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}, {formatTime(i.starts_at)}–{formatTime(i.ends_at)}
                </p>
                <p className="text-sm text-ink-muted">
                  with{" "}
                  {i.kind === "guide" && i.providerSlug ? <Link className="font-medium underline" href={`/guides/${i.providerSlug}`}>{i.providerName}</Link> : <span className="font-medium">{i.providerName}</span>}
                </p>
                {i.terms.meetingPoint && <p className="mt-1 flex items-center gap-1 text-xs text-ink-subtle"><MapPin aria-hidden className="h-3.5 w-3.5" />{i.terms.meetingPoint}</p>}
                {i.provider_note && <p className="mt-2 rounded-lg bg-sand px-3 py-2 text-xs">Provider note: {i.provider_note}</p>}
              </div>
              <div className="text-right text-sm">
                {i.lineTotalMinor !== null && <p className="font-semibold text-forest">{formatMoney(i.lineTotalMinor, view.currency)}</p>}
                {i.providerEarningsMinor !== null && <p className="text-xs text-ink-subtle">Provider earnings {formatMoney(i.providerEarningsMinor, view.currency)}</p>}
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-subtle"><span className="font-semibold capitalize">{i.cancellation_policy} policy:</span> {POLICY_SUMMARY[i.cancellation_policy]}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function PriceBreakdown({ view }: { view: BookingView }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between"><dt>Services</dt><dd>{formatMoney(view.subtotalMinor, view.currency)}</dd></div>
      {view.discountMinor > 0 && <div className="flex justify-between text-[#1d5b39]"><dt>Discounts</dt><dd>−{formatMoney(view.discountMinor, view.currency)}</dd></div>}
      <div className="flex justify-between"><dt>Service fee</dt><dd>{formatMoney(view.serviceFeeMinor, view.currency)}</dd></div>
      {view.taxMinor > 0 && <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(view.taxMinor, view.currency)}</dd></div>}
      <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold text-forest"><dt>Total</dt><dd>{formatMoney(view.totalMinor, view.currency)}</dd></div>
    </dl>
  );
}

export function StatusTimeline({ view }: { view: BookingView }) {
  return (
    <ol className="space-y-3">
      {view.events.map((e, idx) => (
        <li key={idx} className="flex gap-3 text-sm">
          {idx === view.events.length - 1 ? <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-forest" /> : <Circle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sand-300" />}
          <div>
            <p className="font-semibold">{BOOKING_STATUS_LABEL[e.toStatus as BookingStatus] ?? e.toStatus}{e.fromStatus === e.toStatus ? " (partial change)" : ""}</p>
            <p className="text-xs text-ink-subtle">
              {formatDate(e.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · by {e.actorRole}
              {e.reason ? ` — ${e.reason}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PaymentsList({ view }: { view: BookingView }) {
  if (!view.payments.length && !view.refunds.length) return <p className="text-sm text-ink-muted">No payments yet.</p>;
  return (
    <div className="space-y-3 text-sm">
      {view.payments.map((p) => (
        <div key={p.id} className="flex justify-between gap-3 rounded-xl bg-sand px-3 py-2">
          <div>
            <p className="font-semibold capitalize">{p.provider === "sandbox" ? "Sandbox (test)" : p.provider === "mpesa" ? "M-Pesa" : p.provider} · {p.status}</p>
            <p className="text-xs text-ink-subtle">{formatDate(p.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{p.receipt ? ` · Receipt ${p.receipt}` : ""}</p>
            {p.failureReason && <p className="text-xs text-[#9b2c1a]">{p.failureReason}</p>}
          </div>
          <p className="font-semibold">{formatMoney(p.amountMinor, view.currency)}</p>
        </div>
      ))}
      {view.refunds.map((r) => (
        <div key={r.id} className="flex justify-between gap-3 rounded-xl bg-[#eef4fa] px-3 py-2">
          <div>
            <p className="font-semibold">Refund · {r.status.replace("_", " ")}</p>
            <p className="text-xs text-ink-subtle">{formatDate(r.createdAt, { day: "numeric", month: "short" })} · {r.reason}</p>
          </div>
          <p className="font-semibold">−{formatMoney(r.amountMinor, view.currency)}</p>
        </div>
      ))}
    </div>
  );
}
