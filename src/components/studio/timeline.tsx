"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, Car, ChevronDown, Clock, GripVertical, Info, MapPin, NotebookPen, Trash2, UserRound, XCircle } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, cn, Input, Select, Textarea } from "@/components/ui";
import {
  addNoteAction,
  moveItemAction,
  removeItemAction,
  rescheduleItemAction,
  shiftNoteAction,
  updateDayAction,
} from "@/app/actions/studio";
import type { PlannerDay, PlannerItem } from "./types";

const issueStyle = {
  error: { cls: "bg-[#fdf0ed] text-[#8f2a17]", Icon: XCircle },
  warning: { cls: "bg-gold-100 text-[#6b4e0b]", Icon: AlertTriangle },
  info: { cls: "bg-[#eef4fa] text-[#1f4a6e]", Icon: Info },
} as const;

export function Timeline({
  tripId,
  days,
  editable,
  destinations,
}: {
  tripId: string;
  days: PlannerDay[];
  editable: boolean;
  destinations: { id: string; name: string }[];
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [dropError, setDropError] = useState<string | null>(null);

  const onDrop = (dayId: string) => {
    const itemId = dragging;
    setOver(null);
    setDragging(null);
    if (!itemId) return;
    const from = days.find((d) => d.items.some((i) => i.id === itemId));
    if (from?.id === dayId) return;
    start(async () => {
      const res = await moveItemAction(tripId, itemId, dayId);
      setDropError(res?.error ?? null);
    });
  };

  return (
    <div className="space-y-5" aria-busy={pending}>
      {dropError && (
        <p role="alert" className="rounded-xl bg-[#fdf0ed] px-4 py-3 text-sm text-[#8f2a17]">
          {dropError}
        </p>
      )}
      {days.map((day) => (
        <section
          key={day.id}
          aria-labelledby={`day-${day.id}`}
          onDragOver={(e) => {
            if (!editable || !dragging) return;
            e.preventDefault();
            setOver(day.id);
          }}
          onDragLeave={() => setOver((o) => (o === day.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(day.id);
          }}
          className={cn(
            "rounded-[var(--radius-card)] border bg-white p-4 shadow-[var(--shadow-card)] transition-colors sm:p-5",
            over === day.id ? "border-forest bg-forest-50" : "border-sand-300/70",
          )}
        >
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`day-${day.id}`} className="text-lg font-bold text-forest">
              Day {day.dayNumber} <span className="font-sans text-sm font-medium text-ink-subtle">· {day.dateLabel}</span>
            </h3>
            {day.destinationName && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta-700">
                <MapPin aria-hidden className="h-3.5 w-3.5" />
                {day.destinationName}
              </span>
            )}
          </header>

          {day.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-sand-300 px-4 py-6 text-center text-sm text-ink-subtle">
              {editable ? "Nothing planned yet — add an experience or guide from the catalogue, or drag one here." : "A free day."}
            </p>
          ) : (
            <ol className="space-y-2">
              {day.items.map((item) => (
                <li key={item.id}>
                  {item.travelFromPrevious && (
                    <p className="ml-6 flex items-center gap-1.5 border-l-2 border-dashed border-sand-300 py-1.5 pl-4 text-xs text-ink-subtle">
                      <Car aria-hidden className="h-3.5 w-3.5" />
                      {item.travelFromPrevious}
                    </p>
                  )}
                  <ItemCard
                    tripId={tripId}
                    item={item}
                    days={days}
                    currentDayId={day.id}
                    editable={editable}
                    onDragStart={() => setDragging(item.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                </li>
              ))}
            </ol>
          )}

          {day.notes && <p className="mt-3 rounded-xl bg-sand px-3 py-2 text-sm text-ink-muted">{day.notes}</p>}

          {editable && (
            <details className="mt-3 group/day">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-forest [&::-webkit-details-marker]:hidden">
                <NotebookPen aria-hidden className="h-3.5 w-3.5" /> Add a note or set this day&apos;s base
                <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open/day:rotate-180" />
              </summary>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <ActionForm action={addNoteAction.bind(null, tripId, day.id)} resetOnSuccess className="space-y-2">
                  <label htmlFor={`note-${day.id}`} className="block text-xs font-semibold">Add a note (e.g. lunch, hotel check-in)</label>
                  <Input id={`note-${day.id}`} name="title" placeholder="Check in at the lodge" maxLength={140} required />
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">Add note</SubmitButton>
                </ActionForm>
                <ActionForm action={updateDayAction.bind(null, tripId, day.id)} className="space-y-2">
                  <label htmlFor={`dest-${day.id}`} className="block text-xs font-semibold">Where you&apos;re based</label>
                  <Select id={`dest-${day.id}`} name="destinationId" defaultValue={day.destinationId ?? ""} className="h-10">
                    <option value="">Not set</option>
                    {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                  <label htmlFor={`daynotes-${day.id}`} className="sr-only">Day notes</label>
                  <Textarea id={`daynotes-${day.id}`} name="notes" defaultValue={day.notes ?? ""} placeholder="Notes for this day" className="min-h-14" />
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">Save day</SubmitButton>
                </ActionForm>
              </div>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

function ItemCard({
  tripId,
  item,
  days,
  currentDayId,
  editable,
  onDragStart,
  onDragEnd,
}: {
  tripId: string;
  item: PlannerItem;
  days: PlannerDay[];
  currentDayId: string;
  editable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [moveTo, setMoveTo] = useState(currentDayId);
  const tone = item.kind === "experience" ? "border-l-terracotta" : item.kind === "guide" ? "border-l-gold" : "border-l-sand-300";
  const hasError = item.issues.some((i) => i.severity === "error");

  return (
    <article
      draggable={editable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      aria-label={`${item.title}${item.timeLabel ? `, ${item.timeLabel}` : ""}`}
      className={cn("group/item rounded-2xl border border-l-4 bg-sand/40 p-3 sm:p-4", tone, hasError ? "border-[#efb8ab]" : "border-sand-300/70")}
    >
      <div className="flex items-start gap-3">
        {editable && <GripVertical aria-hidden className="mt-1 hidden h-4 w-4 shrink-0 cursor-grab text-ink-subtle sm:block" />}
        <div className="w-24 shrink-0 text-sm font-semibold text-forest">
          {item.timeLabel ?? <span className="text-ink-subtle">Anytime</span>}
          {item.durationLabel && <span className="block text-xs font-normal text-ink-subtle">{item.durationLabel}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={item.kind === "experience" ? "terracotta" : item.kind === "guide" ? "gold" : "neutral"}>
              {item.kind === "experience" ? "Experience" : item.kind === "guide" ? "Guide" : "Note"}
            </Badge>
            {item.bookingStatus && <Badge tone={item.bookingStatus === "accepted" ? "success" : item.bookingStatus === "declined" || item.bookingStatus === "cancelled" ? "danger" : "info"} className="capitalize">{item.bookingStatus === "pending" ? "Awaiting provider" : item.bookingStatus}</Badge>}
          </div>
          <p className="mt-1 font-semibold leading-snug text-charcoal">
            {item.experienceSlug ? <Link href={`/experiences/${item.experienceSlug}`} className="hover:underline">{item.title}</Link> : item.title}
          </p>
          {item.providerName && (
            <p className="flex items-center gap-1 text-xs text-ink-muted">
              <UserRound aria-hidden className="h-3.5 w-3.5" />
              {item.providerSlug && item.kind === "guide" ? <Link href={`/guides/${item.providerSlug}`} className="hover:underline">{item.providerName}</Link> : item.providerName}
            </p>
          )}
          {item.notes && <p className="mt-1 text-sm text-ink-muted">{item.notes}</p>}
        </div>
        {item.lineTotal && (
          <p className="shrink-0 text-right text-sm font-semibold text-forest">
            {item.lineTotal}
            {item.priceLabel && <span className="block text-[11px] font-normal text-ink-subtle">{item.priceLabel}</span>}
          </p>
        )}
      </div>

      {item.issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {item.issues.map((issue, i) => {
            const { cls, Icon } = issueStyle[issue.severity];
            return (
              <li key={i} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs", cls)}>
                <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {issue.message}
              </li>
            );
          })}
        </ul>
      )}

      {(item.kind !== "note" || editable) && (
        <details className="mt-2 group/details">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-forest [&::-webkit-details-marker]:hidden">
            {editable ? "Details & changes" : "Details"}
            <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open/details:rotate-180" />
          </summary>
          <div className="mt-3 space-y-3 border-t border-sand-300/60 pt-3 text-sm">
            {item.kind === "experience" && (
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                {item.meetingPoint && <div><dt className="font-semibold text-ink-muted">Meeting point</dt><dd>{item.meetingPoint}</dd></div>}
                {item.capacityLabel && <div><dt className="font-semibold text-ink-muted">Availability</dt><dd>{item.capacityLabel}</dd></div>}
                {item.cancellationLabel && <div><dt className="font-semibold text-ink-muted">Cancellation</dt><dd>{item.cancellationLabel}</dd></div>}
                {item.preparationNotes && <div><dt className="font-semibold text-ink-muted">Prepare</dt><dd>{item.preparationNotes}</dd></div>}
                {item.inclusions.length > 0 && <div><dt className="font-semibold text-ink-muted">Included</dt><dd>{item.inclusions.join(" · ")}</dd></div>}
                {item.exclusions.length > 0 && <div><dt className="font-semibold text-ink-muted">Not included</dt><dd>{item.exclusions.join(" · ")}</dd></div>}
              </dl>
            )}
            {item.kind === "guide" && item.cancellationLabel && <p className="text-xs"><strong>Cancellation:</strong> {item.cancellationLabel}</p>}

            {editable && (
              <div className="flex flex-wrap items-end gap-3">
                {item.kind === "experience" && item.alternatives.length > 1 && (
                  <ActionForm action={rescheduleItemAction.bind(null, tripId, item.id)} className="flex items-end gap-2 space-y-0">
                    <div>
                      <label htmlFor={`slot-${item.id}`} className="mb-1 block text-xs font-semibold">Change time</label>
                      <Select id={`slot-${item.id}`} name="slotId" defaultValue={item.currentSlotId ?? ""} className="h-9 w-40">
                        {item.alternatives.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </Select>
                    </div>
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">Update</SubmitButton>
                  </ActionForm>
                )}
                {item.kind === "guide" && (
                  <ActionForm action={rescheduleItemAction.bind(null, tripId, item.id)} className="flex items-end gap-2 space-y-0">
                    <div>
                      <label htmlFor={`time-${item.id}`} className="mb-1 block text-xs font-semibold">Start time</label>
                      <Input id={`time-${item.id}`} name="startTime" type="time" step={900} defaultValue={item.startTime ?? "08:00"} className="h-9 w-32" />
                    </div>
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">Update</SubmitButton>
                  </ActionForm>
                )}
                <div className="flex items-end gap-2">
                  <div>
                    <label htmlFor={`move-${item.id}`} className="mb-1 block text-xs font-semibold">Move to</label>
                    <Select id={`move-${item.id}`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-9 w-36">
                      {days.map((d) => <option key={d.id} value={d.id}>Day {d.dayNumber}</option>)}
                    </Select>
                  </div>
                  <ActionButton action={() => moveItemAction(tripId, item.id, moveTo)} disabled={moveTo === currentDayId} className="h-9">
                    Move
                  </ActionButton>
                </div>
                {item.kind === "note" && (
                  <span className="flex gap-1">
                    <ActionButton action={() => shiftNoteAction(tripId, item.id, "up")} ariaLabel="Move note up" variant="ghost" size="icon" className="h-9 w-9"><ArrowUp aria-hidden className="h-4 w-4" /></ActionButton>
                    <ActionButton action={() => shiftNoteAction(tripId, item.id, "down")} ariaLabel="Move note down" variant="ghost" size="icon" className="h-9 w-9"><ArrowDown aria-hidden className="h-4 w-4" /></ActionButton>
                  </span>
                )}
                {item.compareHref && (
                  <Link href={item.compareHref} scroll={false} className="text-xs font-semibold text-forest underline">Compare alternatives</Link>
                )}
                <ActionButton action={() => removeItemAction(tripId, item.id)} variant="ghost" className="h-9 text-terracotta-700" confirm="Remove from itinerary?">
                  <Trash2 aria-hidden className="h-4 w-4" /> Remove
                </ActionButton>
              </div>
            )}
            {!editable && item.kind !== "note" && (
              <p className="flex items-center gap-1 text-xs text-ink-subtle"><Clock aria-hidden className="h-3.5 w-3.5" />This itinerary is locked while a booking is in progress. Use a change request from your booking.</p>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
