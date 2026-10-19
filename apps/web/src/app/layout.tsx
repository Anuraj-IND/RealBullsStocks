import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppProviders } from "@/providers/AppProviders";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.example.com"),
  title: {
    default: "Realbulls — Real-time Multi-Asset Trading Terminal",
    template: "%s · Realbulls",
  },
  description:
    "Trade forex, crypto, commodities, US and Indian stocks, futures and options. Live charts, market depth, a smart order ticket with margin calculator, analytics and a full double-entry ledger.",
  applicationName: "Realbulls",
  keywords: [
    "trading terminal",
    "trading platform",
    "forex",
    "crypto",
    "commodities",
    "us stocks",
    "NSE",
    "BSE",
    "futures",
    "options",
    "charts",
    "order book",
  ],
  icons: { icon: "/brand/logo.svg", apple: "/brand/logo.png" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Realbulls",
    title: "Realbulls — Real-time Multi-Asset Trading Terminal",
    description: "A professional multi-asset trading terminal: real-time charts, market depth, margin calculator and analytics.",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Realbulls" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Realbulls — Multi-Asset Trading Terminal",
    description: "Real-time charts, market depth and full analytics across global markets.",
    images: ["/brand/og.png"],
  },
  robots: { index: true, follow: true },
};

const SERVER_API =
  process.env.API_INTERNAL_URL ??
  (process.env.NEXT_PUBLIC_API_URL?.startsWith("http") ? process.env.NEXT_PUBLIC_API_URL : "http://localhost:4000");


function hexToRgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return "11 19 43";
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

async function getTenantTheme(host: string): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_API}/public/tenant?domain=${encodeURIComponent(host)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const t = (await res.json()) as { background: string; primaryColor: string; accentColor: string };
    return `:root{--rb-navy:${hexToRgbTriplet(t.background)};--rb-red:${hexToRgbTriplet(t.primaryColor)};--rb-yellow:${hexToRgbTriplet(t.accentColor)};}`;
  } catch {
    return null;
  }
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060A12",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const host = (h.get("host") ?? "localhost").split(":")[0]!;
  const themeCss = await getTenantTheme(host);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {themeCss && <style id="rb-tenant-theme" dangerouslySetInnerHTML={{ __html: themeCss }} />}
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
