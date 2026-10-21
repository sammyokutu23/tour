import { CalendarDays, MapPin, Search, Sparkles, Users } from "lucide-react";
import { buttonClass, cn } from "@/components/ui";

const fieldCls = "h-12 w-full rounded-xl border border-sand-300 bg-white pl-10 pr-3 text-sm text-charcoal focus:border-forest focus:outline-none focus:ring-2 focus:ring-gold/60";

/**
 * Works without JavaScript: a GET form to /experiences, with a second submit button that sends the
 * same fields to Journey Studio.
 */
export function SearchBar({
  destinations,
  categories,
  className,
}: {
  destinations: { slug: string; name: string }[];
  categories: { slug: string; name: string }[];
  className?: string;
}) {
  return (
    <form action="/experiences" method="get" role="search" aria-label="Search experiences" className={cn("grid gap-3 rounded-[1.5rem] bg-sand p-3 shadow-[var(--shadow-lift)] sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_0.7fr_1fr_auto]", className)}>
      <label className="relative">
        <span className="sr-only">Destination</span>
        <MapPin aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest" />
        <select name="destination" className={cn(fieldCls, "appearance-none")} defaultValue="">
          <option value="">Anywhere in Kenya</option>
          {destinations.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="relative">
        <span className="sr-only">Arrival date</span>
        <CalendarDays aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest" />
        <input type="date" name="date" className={fieldCls} aria-label="Arrival date" />
      </label>
      <label className="relative">
        <span className="sr-only">Departure date</span>
        <CalendarDays aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest" />
        <input type="date" name="end" className={fieldCls} aria-label="Departure date" />
      </label>
      <label className="relative">
        <span className="sr-only">Travellers</span>
        <Users aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest" />
        <input type="number" name="party" min={1} max={60} defaultValue={2} className={fieldCls} aria-label="Number of travellers" />
      </label>
      <label className="relative">
        <span className="sr-only">Experience type</span>
        <Sparkles aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest" />
        <select name="category" className={cn(fieldCls, "appearance-none")} defaultValue="">
          <option value="">Any experience</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <button type="submit" className={buttonClass("primary", "lg", "h-12 flex-1 lg:flex-none")}>
          <Search aria-hidden className="h-4 w-4" />
          Search
        </button>
        <button type="submit" formAction="/studio/new" className={buttonClass("gold", "lg", "h-12 flex-1 lg:hidden")}>
          Plan trip
        </button>
      </div>
    </form>
  );
}
