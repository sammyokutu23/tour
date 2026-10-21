import { getStorage, verifyFileToken } from "@/server/storage";

/** Serves private documents from local storage via short-lived signed links (development adapter). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.join("/");
  const url = new URL(request.url);
  if (!verifyFileToken(key, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "")) {
    return new Response("Link expired or invalid", { status: 403 });
  }
  try {
    const bytes = await getStorage().get(key);
    const ext = key.split(".").pop();
    const type = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext ?? ""] ?? "application/octet-stream";
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
