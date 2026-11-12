import type { ProductApi } from "@/lib/types";
import type { Product } from "./types";
import { parsePrice } from "./price";

const MAX_PRODUCTS = 40;

/** Henter en verdi via punktsti, f.eks. "images.0.src". Tom sti = objektet selv. */
export function getPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function absolute(url: unknown, base: string): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  try {
    const u = new URL(url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim(), base);
    return ["http:", "https:"].includes(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

type Raw = Record<string, unknown>;

function shopify(json: unknown, base: string): Product[] {
  const list = getPath(json, "resources.results.products");
  if (!Array.isArray(list)) throw new Error("Uventet svar fra Shopify-API-et.");
  return (list as Raw[]).map((p) => {
    // Fjern Shopifys sporingsparametre fra lenken
    const url = absolute(p.url, base);
    const clean = url ? url.split("?")[0] : undefined;
    const featured = getPath(p, "featured_image.url");
    return {
      title: String(p.title ?? "").trim(),
      price: parsePrice(p.price_min ?? p.price),
      currency: undefined,
      image: absolute(p.image ?? featured, base),
      url: clean ?? "",
    };
  });
}

function woocommerce(json: unknown, base: string): Product[] {
  if (!Array.isArray(json)) throw new Error("Uventet svar fra WooCommerce-API-et.");
  return (json as Raw[]).map((p) => {
    const prices = (p.prices ?? {}) as Raw;
    const minor = Number(prices.currency_minor_unit ?? 2);
    const raw = Number(prices.price);
    return {
      title: decodeEntities(String(p.name ?? "").trim()),
      price: Number.isFinite(raw) ? raw / 10 ** minor : null,
      currency: typeof prices.currency_code === "string" ? prices.currency_code : undefined,
      image: absolute(getPath(p, "images.0.src"), base),
      url: absolute(p.permalink, base) ?? "",
    };
  });
}

function custom(json: unknown, base: string, api: Extract<ProductApi, { type: "json" }>): Product[] {
  const list = getPath(json, api.items);
  if (!Array.isArray(list)) throw new Error(`Fant ingen liste på stien «${api.items || "(roten)"}» i API-svaret.`);
  return list.map((p) => {
    const price = parsePrice(getPath(p, api.price));
    return {
      title: String(getPath(p, api.title) ?? "").trim(),
      price: price !== null && api.priceDivisor ? price / api.priceDivisor : price,
      image: absolute(getPath(p, api.image), base),
      url: absolute(getPath(p, api.link), base) ?? "",
    };
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Tolker et JSON-svar fra et produkt-API til produkter. */
export function productsFromApi(json: unknown, api: ProductApi, base: string): Product[] {
  const products =
    api.type === "shopify" ? shopify(json, base) : api.type === "woocommerce" ? woocommerce(json, base) : custom(json, base, api);
  return products.filter((p) => p.title && p.url).slice(0, MAX_PRODUCTS);
}
