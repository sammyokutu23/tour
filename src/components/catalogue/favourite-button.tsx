import { Suspense } from "react";
import { getActor, requestDb } from "@/server/auth/session";
import { favouriteIds } from "@/server/services/community";
import { FavouriteToggle } from "./favourite-toggle";

/** Server wrapper that resolves the saved state for the current user. */
export function FavouriteButton(props: { targetType: "experience" | "guide" | "destination"; targetId: string; tone?: "light" | "dark" }) {
  return (
    <Suspense fallback={<FavouriteToggle {...props} initialSaved={false} signedIn={false} />}>
      <Resolved {...props} />
    </Suspense>
  );
}

async function Resolved(props: { targetType: "experience" | "guide" | "destination"; targetId: string; tone?: "light" | "dark" }) {
  const actor = await getActor();
  const saved = actor ? (await favouriteIds(await requestDb(), actor)).has(props.targetId) : false;
  return <FavouriteToggle {...props} initialSaved={saved} signedIn={!!actor} />;
}
