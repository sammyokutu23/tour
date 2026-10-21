"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toggleFavouriteAction } from "@/app/actions/catalogue";
import { buttonClass, cn } from "@/components/ui";

export function FavouriteToggle({
  targetType,
  targetId,
  initialSaved,
  signedIn,
  tone = "dark",
}: {
  targetType: "experience" | "guide" | "destination";
  targetId: string;
  initialSaved: boolean;
  signedIn: boolean;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useOptimistic(initialSaved);
  return (
    <button
      type="button"
      aria-pressed={saved}
      disabled={pending}
      onClick={() => {
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        start(async () => {
          setSaved(!saved);
          await toggleFavouriteAction(targetType, targetId);
        });
      }}
      className={buttonClass(tone === "light" ? "outlineLight" : "secondary", "md")}
    >
      <Heart aria-hidden className={cn("h-4 w-4", saved && "fill-terracotta text-terracotta")} />
      {saved ? "Saved" : "Save"}
    </button>
  );
}
