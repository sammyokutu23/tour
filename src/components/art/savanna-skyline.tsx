import { cn } from "@/components/ui";

/**
 * Ink silhouette of the Kenyan savanna — mountain, acacias, giraffes and elephants — that runs along
 * the bottom of the homepage hero and fades into the black section below. Decorative only.
 */

const Acacia = ({ x, s = 1 }: { x: number; s?: number }) => (
  <g transform={`translate(${x} 300) scale(${s})`}>
    <path d="M-5 0 L-3 -92 L3 -92 L5 0 Z" />
    <path d="M-2 -70 L-40 -118 M1 -78 L36 -124 M0 -88 L-6 -126" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
    <ellipse cx="-22" cy="-128" rx="78" ry="13" />
    <ellipse cx="28" cy="-136" rx="56" ry="11" />
    <ellipse cx="-4" cy="-142" rx="44" ry="9" />
  </g>
);

const Giraffe = ({ x, s = 1, flip = false }: { x: number; s?: number; flip?: boolean }) => (
  <g transform={`translate(${x} 300) scale(${flip ? -s : s} ${s})`}>
    <rect x="-30" y="-78" width="5" height="78" rx="2" />
    <rect x="-18" y="-78" width="5" height="76" rx="2" />
    <rect x="18" y="-74" width="5" height="74" rx="2" />
    <rect x="29" y="-74" width="5" height="76" rx="2" />
    <path d="M-34 -78 C -36 -100, -10 -108, 20 -104 C 34 -102, 38 -88, 36 -72 C 20 -68, -20 -68, -34 -78 Z" />
    <path d="M18 -100 L48 -196 L58 -192 L34 -96 Z" />
    <path d="M44 -196 C 50 -206, 64 -206, 76 -198 L 78 -190 C 68 -188, 58 -188, 50 -186 Z" />
    <rect x="49" y="-212" width="3" height="12" />
    <rect x="55" y="-212" width="3" height="12" />
    <path d="M-34 -84 C -46 -80, -50 -66, -48 -52" stroke="currentColor" strokeWidth="2.5" fill="none" />
  </g>
);

const Elephant = ({ x, s = 1 }: { x: number; s?: number }) => (
  <g transform={`translate(${x} 300) scale(${s})`}>
    <path d="M-72 -44 C -76 -92, -24 -108, 22 -104 C 52 -102, 70 -88, 70 -60 L 66 -38 C 30 -32, -30 -32, -72 -44 Z" />
    <rect x="-66" y="-50" width="17" height="50" rx="4" />
    <rect x="-42" y="-46" width="17" height="46" rx="4" />
    <rect x="22" y="-46" width="17" height="46" rx="4" />
    <rect x="46" y="-50" width="17" height="50" rx="4" />
    <circle cx="74" cy="-80" r="27" />
    <path d="M86 -86 C 108 -74, 104 -40, 106 -6 L 95 -4 C 92 -34, 94 -58, 78 -66 Z" />
    <path d="M50 -96 C 70 -104, 78 -78, 70 -58 C 60 -52, 50 -64, 50 -80 Z" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.5" />
    <path d="M88 -60 C 96 -50, 106 -50, 112 -58" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    <path d="M-72 -72 C -82 -64, -84 -50, -80 -38" stroke="currentColor" strokeWidth="3" fill="none" />
  </g>
);

const Palm = ({ x, s = 1 }: { x: number; s?: number }) => (
  <g transform={`translate(${x} 300) scale(${s})`}>
    <path d="M-3 0 C 0 -40, 4 -90, 12 -140 L 18 -139 C 11 -90, 8 -40, 5 0 Z" />
    <path d="M15 -140 C -5 -152, -34 -148, -50 -128 C -26 -138, -4 -138, 15 -136 Z" />
    <path d="M15 -140 C 36 -158, 62 -152, 76 -134 C 54 -142, 36 -142, 16 -136 Z" />
    <path d="M15 -140 C 4 -168, -18 -174, -34 -168 C -14 -162, 2 -156, 14 -138 Z" />
    <path d="M15 -140 C 32 -172, 54 -176, 68 -166 C 48 -162, 32 -154, 16 -138 Z" />
  </g>
);

export function SavannaSkyline({ className }: { className?: string }) {
  // Bush line: overlapping circles of varying size along the horizon.
  const bushes = Array.from({ length: 58 }, (_, i) => {
    const x = i * 28 + ((i * 37) % 13);
    const r = 14 + ((i * 53) % 17);
    return <circle key={i} cx={x} cy={300 - r * 0.35} r={r} />;
  });
  return (
    <svg viewBox="0 0 1600 340" preserveAspectRatio="xMidYMax slice" className={cn("block h-full w-full text-forest", className)} fill="currentColor" aria-hidden>
      {/* Distant mountain with a snow cap (Kilimanjaro from Amboseli). */}
      <path d="M980 300 C 1060 250, 1110 170, 1170 150 C 1196 142, 1226 142, 1252 150 C 1310 172, 1360 246, 1460 300 Z" opacity="0.92" />
      <path d="M1164 156 C 1186 144, 1232 142, 1256 152 L 1244 166 L 1230 158 L 1214 170 L 1196 158 L 1180 170 Z" fill="#fff" />
      <Acacia x={150} s={1.05} />
      <Palm x={40} s={0.9} />
      <Giraffe x={330} s={0.95} />
      <Giraffe x={420} s={0.72} flip />
      <Acacia x={610} s={0.7} />
      <Elephant x={790} s={0.85} />
      <Elephant x={900} s={0.62} />
      <Acacia x={1080} s={0.85} />
      <Giraffe x={1300} s={1.1} flip />
      <Acacia x={1470} s={1.2} />
      <Palm x={1570} s={1.05} />
      {bushes}
      <rect x="0" y="296" width="1600" height="44" />
    </svg>
  );
}
