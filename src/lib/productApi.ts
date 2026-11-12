import type { ProductApi } from "./types";
import { QUERY_TOKEN } from "./searchTemplate";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined;
}

/** Validerer et produkt-API fra import eller klient. Returnerer undefined hvis ugyldig. */
export function parseProductApi(input: unknown): ProductApi | undefined {
  if (!input || typeof input !== "object") return undefined;
  const r = input as Record<string, unknown>;
  if (r.type === "shopify" || r.type === "woocommerce") return { type: r.type };
  if (r.type === "json") {
    const url = str(r.url);
    const title = str(r.title);
    const link = str(r.link);
    if (!url || !url.includes(QUERY_TOKEN) || !title || !link) return undefined;
    const divisor = typeof r.priceDivisor === "number" && r.priceDivisor > 0 ? r.priceDivisor : undefined;
    return {
      type: "json",
      url,
      items: str(r.items),
      title,
      price: str(r.price),
      image: str(r.image),
      link,
      priceDivisor: divisor,
    };
  }
  return undefined;
}

/** Bygger API-URL for en butikk. Shopify/WooCommerce bruker butikkens eget domene. */
export function apiUrlTemplate(api: ProductApi, storeUrl: string): string {
  if (api.type === "json") return api.url;
  const origin = new URL(storeUrl).origin;
  switch (api.type) {
    case "shopify":
      return `${origin}/search/suggest.json?q=${QUERY_TOKEN}&resources%5Btype%5D=product&resources%5Blimit%5D=10`;
    case "woocommerce":
      return `${origin}/wp-json/wc/store/v1/products?search=${QUERY_TOKEN}&per_page=24`;
  }
}
