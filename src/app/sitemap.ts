import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { appUrl } from "@/config/brand";
import { journeys } from "@/content/journeys";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = appUrl();
  const db = await getDb();
  const [d, e, g] = await Promise.all([
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from destinations where is_published"),
    db.query<{ slug: string; updated_at: Date }>("select e.slug, e.updated_at from experiences e join provider_profiles p on p.id = e.provider_id where e.status = 'published' and p.status = 'approved'"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from provider_profiles where status = 'approved' and kind = 'guide'"),
  ]);
  const statics = ["", "/destinations", "/experiences", "/guides", "/journeys", "/studio", "/how-it-works", "/about", "/safety", "/faq", "/contact", "/legal/terms", "/legal/privacy", "/legal/cancellation"];
  return [
    ...statics.map((p) => ({ url: `${base}${p}` })),
    ...journeys.map((j) => ({ url: `${base}/journeys/${j.slug}` })),
    ...d.rows.map((r) => ({ url: `${base}/destinations/${r.slug}`, lastModified: r.updated_at })),
    ...e.rows.map((r) => ({ url: `${base}/experiences/${r.slug}`, lastModified: r.updated_at })),
    ...g.rows.map((r) => ({ url: `${base}/guides/${r.slug}`, lastModified: r.updated_at })),
  ];
}
