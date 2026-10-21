import type { ArtVariant } from "@/server/services/catalogue";
import { cn } from "@/components/ui";

/**
 * Original, brand-coloured landscape illustrations used in place of photography until licensed
 * images are uploaded. Purely decorative (aria-hidden) unless a label is passed.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

const Acacia = ({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
    <path d="M-2 0 L-1 -38 L1 -38 L2 0 Z" />
    <path d="M0 -30 L-14 -46 M0 -32 L12 -48" stroke={fill} strokeWidth="2.2" fill="none" />
    <ellipse cx="-4" cy="-50" rx="34" ry="7" />
    <ellipse cx="10" cy="-55" rx="22" ry="5.5" />
  </g>
);

const Palm = ({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
    <path d="M0 0 C 3 -25, 6 -50, 14 -78 L 17 -77 C 10 -50, 7 -25, 5 0 Z" />
    <path d="M15 -78 C 0 -86, -20 -84, -32 -72 C -16 -78, 0 -78, 15 -76 Z" />
    <path d="M15 -78 C 30 -90, 48 -86, 58 -74 C 42 -80, 30 -79, 16 -75 Z" />
    <path d="M15 -78 C 6 -98, -10 -102, -22 -98 C -8 -94, 4 -90, 14 -77 Z" />
    <path d="M15 -78 C 28 -100, 44 -104, 54 -96 C 40 -94, 28 -88, 16 -76 Z" />
    <path d="M15 -78 C 20 -66, 18 -52, 10 -40 C 16 -54, 16 -66, 13 -76 Z" />
  </g>
);

const Conifer = ({ x, y, h, fill }: { x: number; y: number; h: number; fill: string }) => (
  <path transform={`translate(${x} ${y})`} fill={fill} d={`M0 ${-h} L${h * 0.28} 0 L${-h * 0.28} 0 Z`} />
);

export function DestinationArt({
  variant,
  seed = "",
  className,
  label,
}: {
  variant: ArtVariant;
  seed?: string;
  className?: string;
  label?: string;
}) {
  const h = hash(seed + variant);
  const sunX = 120 + (h % 360);
  const id = `art-${variant}-${h % 100000}`;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  return (
    <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" className={cn("h-full w-full", className)} {...a11y}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          {variant === "city" ? (
            <>
              <stop offset="0" stopColor="#163D32" />
              <stop offset="0.65" stopColor="#D96C43" />
              <stop offset="1" stopColor="#E9B949" />
            </>
          ) : variant === "coast" ? (
            <>
              <stop offset="0" stopColor="#F6F1E8" />
              <stop offset="1" stopColor="#F3D9A4" />
            </>
          ) : variant === "forest" ? (
            <>
              <stop offset="0" stopColor="#DFE9E4" />
              <stop offset="1" stopColor="#F6F1E8" />
            </>
          ) : variant === "mountain" ? (
            <>
              <stop offset="0" stopColor="#F3D9A4" />
              <stop offset="1" stopColor="#F8E1D7" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#F6E3B4" />
              <stop offset="0.7" stopColor="#F2B98F" />
              <stop offset="1" stopColor="#E9B949" />
            </>
          )}
        </linearGradient>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4F8C83" />
          <stop offset="1" stopColor="#1F5243" />
        </linearGradient>
      </defs>

      <rect width="600" height="400" fill={`url(#${id}-sky)`} />

      {variant !== "forest" && <circle cx={sunX} cy={variant === "city" ? 250 : 120} r={variant === "coast" ? 38 : 46} fill="#E9B949" opacity={variant === "city" ? 0.9 : 0.85} />}

      {variant === "savanna" && (
        <>
          <path d="M0 250 C 120 215, 230 240, 330 222 C 430 205, 520 230, 600 214 L600 400 L0 400 Z" fill="#C99A2C" opacity="0.55" />
          <path d="M0 285 C 140 262, 260 290, 380 270 C 470 256, 540 272, 600 262 L600 400 L0 400 Z" fill="#B0512C" opacity="0.45" />
          <path d="M0 315 C 150 300, 300 322, 450 305 C 520 298, 570 304, 600 300 L600 400 L0 400 Z" fill="#163D32" />
          <Acacia x={130 + (h % 60)} y={308} s={1.5} fill="#10302A" />
          <Acacia x={420 + (h % 80)} y={300} s={1.05} fill="#10302A" />
          <Acacia x={520} y={296} s={0.6} fill="#163D32" />
        </>
      )}

      {variant === "desert" && (
        <>
          <path d="M0 240 L80 200 L150 236 L240 180 L330 232 L420 196 L520 238 L600 210 L600 400 L0 400 Z" fill="#B0512C" opacity="0.5" />
          <path d="M0 300 C 120 270, 240 300, 360 280 C 460 264, 540 290, 600 278 L600 400 L0 400 Z" fill="#D96C43" opacity="0.75" />
          <path d="M0 330 C 150 318, 300 340, 450 322 C 520 316, 570 322, 600 318 L600 400 L0 400 Z" fill="#163D32" />
          <Palm x={140} y={330} s={1.1} fill="#10302A" />
          <Acacia x={430} y={322} s={0.9} fill="#10302A" />
        </>
      )}

      {variant === "coast" && (
        <>
          <rect y="232" width="600" height="90" fill={`url(#${id}-water)`} />
          <path d="M0 250 L600 250" stroke="#F6F1E8" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="30 22" />
          <path d="M0 282 L600 282" stroke="#F6F1E8" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="18 30" />
          <g transform={`translate(${380 - (h % 120)} 236)`}>
            <path d="M-34 0 L34 0 L24 12 L-24 12 Z" fill="#10302A" />
            <path d="M-2 0 L-2 -58 L30 -4 Z" fill="#F6F1E8" />
            <path d="M-4 -60 L-4 0" stroke="#10302A" strokeWidth="2" />
          </g>
          <path d="M0 330 C 160 312, 330 336, 600 318 L600 400 L0 400 Z" fill="#ECE4D4" />
          <path d="M0 360 C 180 348, 360 368, 600 352 L600 400 L0 400 Z" fill="#DDD2BD" />
          <Palm x={70} y={352} s={1.6} fill="#163D32" />
          <Palm x={540} y={345} s={1.2} fill="#163D32" />
        </>
      )}

      {variant === "mountain" && (
        <>
          <path d="M0 300 L170 140 L240 190 L330 70 L430 180 L500 150 L600 250 L600 400 L0 400 Z" fill="#2A6A57" />
          <path d="M300 104 L330 70 L362 112 L346 106 L334 118 L320 104 Z" fill="#F6F1E8" />
          <path d="M155 154 L170 140 L186 156 L176 152 Z" fill="#F6F1E8" />
          <path d="M0 330 C 140 300, 280 330, 420 300 C 500 286, 560 300, 600 296 L600 400 L0 400 Z" fill="#163D32" />
          {Array.from({ length: 14 }, (_, i) => (
            <Conifer key={i} x={20 + i * 44 + ((h >> i) % 14)} y={350 + ((h >> (i + 2)) % 18)} h={46 + ((h >> i) % 26)} fill="#10302A" />
          ))}
        </>
      )}

      {variant === "lake" && (
        <>
          <path d="M0 230 C 110 190, 220 220, 300 196 C 400 170, 500 200, 600 186 L600 400 L0 400 Z" fill="#2A6A57" opacity="0.7" />
          <rect y="250" width="600" height="150" fill={`url(#${id}-water)`} />
          <ellipse cx={sunX} cy="270" rx="70" ry="6" fill="#E9B949" opacity="0.5" />
          <ellipse cx={sunX} cy="290" rx="40" ry="4" fill="#E9B949" opacity="0.35" />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} transform={`translate(${60 + i * 26 + (h % 30)} ${312 + (i % 3) * 6})`} fill="#E8A3A0">
              <ellipse cx="0" cy="0" rx="7" ry="4" />
              <path d="M2 -2 C 4 -12, 2 -16, 6 -18" stroke="#E8A3A0" strokeWidth="1.6" fill="none" />
              <path d="M0 4 L0 16" stroke="#10302A" strokeWidth="1" />
            </g>
          ))}
          <path d="M0 360 C 160 350, 320 372, 600 354 L600 400 L0 400 Z" fill="#163D32" />
          <Acacia x={500} y={360} s={1.2} fill="#10302A" />
        </>
      )}

      {variant === "city" && (
        <>
          <path d="M0 330 C 150 310, 300 340, 600 316 L600 400 L0 400 Z" fill="#C99A2C" opacity="0.6" />
          <g fill="#10302A">
            {[
              [30, 70],
              [70, 120],
              [110, 90],
              [150, 170],
              [196, 110],
              [236, 200],
              [276, 140],
              [316, 230],
              [354, 120],
              [392, 160],
              [432, 96],
              [470, 180],
              [512, 110],
              [552, 140],
            ].map(([x, hgt], i) => (
              <rect key={i} x={x} y={340 - hgt} width={34} height={hgt} rx="2" />
            ))}
            <path d="M330 110 L333 80 L336 110 Z" />
          </g>
          <g fill="#E9B949" opacity="0.8">
            {Array.from({ length: 26 }, (_, i) => (
              <rect key={i} x={40 + ((h >> (i % 20)) % 520)} y={200 + ((i * 37) % 120)} width="4" height="5" />
            ))}
          </g>
          <path d="M0 345 L600 345 L600 400 L0 400 Z" fill="#163D32" />
          <Acacia x={90} y={372} s={0.9} fill="#0B211A" />
          <g transform="translate(470 372)" fill="#0B211A">
            <rect x="-2" y="-46" width="4" height="46" />
            <path d="M0 -44 L18 -62 L22 -60 L4 -42 Z" />
            <ellipse cx="22" cy="-63" rx="5" ry="4" />
          </g>
        </>
      )}

      {variant === "forest" && (
        <>
          {[0, 1, 2].map((layer) => (
            <g key={layer} opacity={0.45 + layer * 0.27}>
              {Array.from({ length: 12 }, (_, i) => {
                const x = i * 56 + ((h >> (i + layer)) % 30) - 20;
                const r = 46 + ((h >> (i * 2 + layer)) % 30) - layer * 4;
                const y = 150 + layer * 70;
                return <circle key={i} cx={x} cy={y} r={r} fill={["#2A6A57", "#1F5243", "#10302A"][layer]} />;
              })}
              <rect y={150 + layer * 70} width="600" height="400" fill={["#2A6A57", "#1F5243", "#10302A"][layer]} />
            </g>
          ))}
          <rect y="200" width="600" height="40" fill="#F6F1E8" opacity="0.18" />
          <g fill="#E9B949">
            <path d="M420 120 q 8 -8 16 0 q -8 -3 -16 0" />
            <path d="M460 104 q 6 -6 12 0 q -6 -2 -12 0" />
          </g>
        </>
      )}
    </svg>
  );
}
