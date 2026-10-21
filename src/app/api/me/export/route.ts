import { getDb } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { exportPersonalData } from "@/server/services/community";

/** Lets a signed-in user download a copy of their personal data. */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in required" }, { status: 401 });
  const data = await exportPersonalData(await getDb(), session.actor);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store" },
  });
}
