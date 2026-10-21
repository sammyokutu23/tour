import { getDb } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { getGroup } from "@/server/services/travel-groups";
import { getStorage } from "@/server/storage";

/** Serves a group's cover photo only to people who are allowed to see the group. */
export async function GET(_: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const session = await getSession();
  const db = await getDb();
  try {
    await getGroup(db, session?.actor ?? null, groupId);
    const { rows } = await db.query<{ cover_storage_key: string | null; visibility: string }>("select cover_storage_key, visibility from travel_groups where id = $1", [groupId]);
    const key = rows[0]?.cover_storage_key;
    if (!key) return new Response("Not found", { status: 404 });
    const bytes = await getStorage().get(key);
    const ext = key.split(".").pop();
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext ?? ""] ?? "application/octet-stream",
        "Cache-Control": rows[0].visibility === "private" ? "private, max-age=300" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
