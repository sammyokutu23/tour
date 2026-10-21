import type { MetadataRoute } from "next";
import { appUrl } from "@/config/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/provider", "/admin", "/studio/", "/checkout", "/api", "/trips/shared", "/documents", "/dev"] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
