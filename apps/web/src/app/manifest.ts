import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YoTrade",
    short_name: "YoTrade",
    description: "Community trading tournaments, live on Monad.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0b1a",
    theme_color: "#0e0b1a",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
