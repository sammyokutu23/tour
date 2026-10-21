import { getDb } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { documentDownloadUrl } from "@/server/services/providers";

/** Checks the viewer may see the document, then redirects to a two-minute signed link. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return Response.redirect(new URL(`/login?next=/documents/${id}`, request.url), 303);
  try {
    const url = await documentDownloadUrl(await getDb(), session.actor, id);
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
