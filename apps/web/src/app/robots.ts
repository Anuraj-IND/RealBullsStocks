import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/terminal", "/admin", "/positions", "/orderbook", "/analytics", "/settings", "/login/callback"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
