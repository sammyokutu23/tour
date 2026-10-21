/** Brand identity is configuration, not code: override with environment variables. */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Beyond the Destination",
  shortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME ?? "Beyond",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Your journey. Your guide. Your Kenya.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  description:
    "Plan your Kenya trip day by day, choose your own local guide, and book verified experiences with transparent prices.",
};

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
