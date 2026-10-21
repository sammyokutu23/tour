import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { appUrl, brand } from "@/config/brand";
import "./globals.css";

// Mona Sans (SIL Open Font License) for both headings and body, in the spirit of the reference design.
const monaSans = Mona_Sans({ subsets: ["latin"], variable: "--font-mona", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  openGraph: { siteName: brand.name, type: "website", locale: "en_KE" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#163D32",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={monaSans.variable}>
      <body className="min-h-dvh antialiased">
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
