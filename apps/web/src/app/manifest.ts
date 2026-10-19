import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Realbulls — Virtual Trading Terminal",
    short_name: "Realbulls",
    description:
      "Real-time multi-asset paper-trading terminal: forex, crypto, commodities, US and Indian stocks, futures and options.",
    start_url: "/",
    display: "standalone",
    background_color: "#060A12",
    theme_color: "#0052BE",
    icons: [{ src: "/brand/logo.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
