import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Butikkbrowser",
    short_name: "Butikker",
    description: "Dine nettbutikker samlet – søk i mange butikker samtidig.",
    lang: "nb",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f8",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Søk", url: "/" },
      { name: "Butikker", url: "/butikker" },
    ],
  };
}
