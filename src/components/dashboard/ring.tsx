/** Donut ring for small dashboard metrics. `fraction` is 0..1; value/label are shown in the centre. */
export function Ring({ fraction, value, label, color = "#F2B11B" }: { fraction: number; value: string | number; label: string; color?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <figure className="flex flex-col items-center">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(246 241 232 / 0.18)" strokeWidth="10" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold text-sand">{value}</span>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs font-medium text-sand/75">{label}</figcaption>
    </figure>
  );
}
