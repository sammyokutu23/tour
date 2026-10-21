import { connection } from "next/server";
import { getDb } from "@/server/db";

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    await db.query("select 1");
    return Response.json({ status: "ok", database: db.driver });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
