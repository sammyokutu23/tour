import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ───────────────────────────── Buttons ─────────────────────────────

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap";

export const buttonVariants = {
  primary: "bg-forest text-sand hover:bg-forest-700 active:bg-forest-900",
  gold: "bg-gold text-forest-950 hover:bg-gold-600",
  secondary: "border border-forest/20 bg-white text-forest hover:border-forest/40 hover:bg-forest-50",
  ghost: "text-forest hover:bg-forest-50",
  danger: "bg-terracotta-700 text-white hover:bg-[#953f20]",
  light: "bg-sand text-forest hover:bg-white",
  outlineLight: "border border-sand/40 text-sand hover:bg-sand/10",
} as const;

export const buttonSizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
  icon: "h-10 w-10",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ───────────────────────────── Layout ─────────────────────────────

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-3xl">
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-terracotta-700">{eyebrow}</p>}
        <h1 className="text-balance text-3xl font-bold text-forest sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 text-base leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-terracotta-700">{eyebrow}</p>}
        <h2 className="text-balance text-3xl font-bold text-forest sm:text-[2.5rem] sm:leading-[1.1]">{title}</h2>
        {description && <p className="mt-3 text-base leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-card)] border border-sand-300/70 bg-white shadow-[var(--shadow-card)]", className)} {...props} />;
}

// ───────────────────────────── Feedback ─────────────────────────────

const badgeTones = {
  neutral: "bg-sand-200 text-charcoal",
  forest: "bg-forest-100 text-forest",
  gold: "bg-gold-100 text-[#7a5a0e]",
  terracotta: "bg-terracotta-100 text-terracotta-700",
  danger: "bg-[#fbe3de] text-[#9b2c1a]",
  success: "bg-[#dcefe3] text-[#1d5b39]",
  info: "bg-[#e1ecf5] text-[#1f4a6e]",
  dark: "bg-forest text-sand",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5", badgeTones[tone], className)}
      {...props}
    />
  );
}

/** Marks fictional development data wherever it appears. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="gold" className={className} title="Fictional demo data for development and demonstration">
      Demo listing
    </Badge>
  );
}

const alertStyles = {
  info: { cls: "border-[#bcd3e6] bg-[#eef4fa] text-[#1f4a6e]", Icon: Info },
  success: { cls: "border-[#b7dcc4] bg-[#eef8f1] text-[#1d5b39]", Icon: CheckCircle2 },
  warning: { cls: "border-gold/60 bg-gold-100 text-[#6b4e0b]", Icon: AlertTriangle },
  error: { cls: "border-[#efb8ab] bg-[#fdf0ed] text-[#8f2a17]", Icon: XCircle },
} as const;

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof alertStyles; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { cls, Icon } = alertStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border p-4 text-sm", cls, className)}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-sand-300 bg-white/60 px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 rounded-full bg-forest-50 p-3 text-forest">{icon}</div>}
      <p className="font-display text-xl font-bold text-forest">{title}</p>
      {description && <div className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{description}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-xl", className)} />;
}

export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-sand-300/60 bg-white">
          <Skeleton className="h-44 rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-5 w-1/2" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// ───────────────────────────── Forms ─────────────────────────────

const fieldBase =
  "w-full rounded-xl border border-sand-300 bg-white px-3.5 text-sm text-charcoal placeholder:text-ink-subtle/70 transition-colors focus:border-forest focus:outline-none focus:ring-2 focus:ring-gold/60 disabled:bg-sand-200 aria-[invalid=true]:border-terracotta-700";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-11 appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23163D32' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  required,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | string[];
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-charcoal">
        {label}
        {required && <span className="ml-0.5 text-terracotta-700" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !message && <p className="text-xs text-ink-subtle">{hint}</p>}
      {message && (
        <p className="text-xs font-medium text-[#9b2c1a]" id={`${htmlFor}-error`}>
          {message}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-sand-300 accent-forest" {...props} />
      <span>{label}</span>
    </label>
  );
}

// ───────────────────────────── Data display ─────────────────────────────

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-forest">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </Card>
  );
}

export function DefinitionList({ items, className }: { items: { term: ReactNode; detail: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-sand-200", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
          <dt className="w-44 shrink-0 text-sm font-semibold text-ink-muted">{it.term}</dt>
          <dd className="min-w-0 text-sm text-charcoal">{it.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-sand-300/70 bg-white", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("border-b border-sand-200 bg-sand/60 px-4 py-3 text-xs font-bold uppercase tracking-wider text-ink-muted", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-sand-200/70 px-4 py-3 align-top", className)} {...props} />;
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
      {page > 1 ? (
        <LinkButton href={hrefFor(page - 1)} variant="secondary" size="sm" rel="prev">
          Previous
        </LinkButton>
      ) : (
        <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-40")} aria-disabled>
          Previous
        </span>
      )}
      <span className="px-3 text-sm text-ink-muted" aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <LinkButton href={hrefFor(page + 1)} variant="secondary" size="sm" rel="next">
          Next
        </LinkButton>
      ) : (
        <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-40")} aria-disabled>
          Next
        </span>
      )}
    </nav>
  );
}

export function TabNav({ tabs, current }: { tabs: { href: string; label: string; key: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto rounded-full border border-sand-300/70 bg-white p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            t.key === current ? "bg-forest text-sand" : "text-ink-muted hover:bg-forest-50 hover:text-forest",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-xs text-forest-950">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
