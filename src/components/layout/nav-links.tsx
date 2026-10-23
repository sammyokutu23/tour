"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

/** Main nav pills; the section you are in gets the yellow pill. */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((n) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2.5 text-[0.8rem] font-bold tracking-[-0.01em] transition-colors",
              active ? "bg-gold text-forest" : "text-ink-muted hover:bg-forest-50 hover:text-forest",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
