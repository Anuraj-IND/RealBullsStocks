import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<[string, number]> = [
    ["/", 1],
    ["/login", 0.8],
    ["/help", 0.6],
    ["/legal/privacy", 0.4],
    ["/legal/terms", 0.4],
    ["/legal/cookies", 0.4],
    ["/legal/risk", 0.4],
  ];
  return routes.map(([route, priority]) => ({
    url: `${base}${route}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority,
  }));
}
