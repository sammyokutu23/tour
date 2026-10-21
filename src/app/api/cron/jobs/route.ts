import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db";
import { runJobs } from "@/server/jobs";

/** Scheduled background jobs. Protected by CRON_SECRET (sent as a Bearer token, e.g. by Vercel Cron). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runJobs(await getDb());
  return Response.json(result);
}
