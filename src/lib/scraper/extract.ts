import * as cheerio from "cheerio";
import type { ScrapeSelectors } from "@/lib/types";
import type { ExtractSource, Product } from "./types";
import { parsePrice } from "./price";

const MAX_PRODUCTS = 40;

type Json = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function typeOf(node: Json): string[] {
  return asArray(node["@type"] as string | string[]).map(String);
}

function absolute(url: unknown, base: string): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  try {
    const u = new URL(url.trim(), base);
    return ["http:", "https:"].includes(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function imageOf(v: unknown, base: string): string | undefined {
  const first = asArray(v as unknown)[0];
  if (typeof first === "string") return absolute(first, base);
  if (first && typeof first === "object") return absolute((first as Json).url ?? (first as Json).contentUrl, base);
  return undefined;
}

function offerPrice(offers: unknown): { price: number | null; currency?: string } {
  for (const o of asArray(offers as Json | Json[])) {
    if (!o || typeof o !== "object") continue;
    const spec = asArray(o.priceSpecification as Json | Json[])[0];
    const raw = o.price ?? o.lowPrice ?? spec?.price;
    const price = parsePrice(raw);
    if (price !== null) {
      return { price, currency: String(o.priceCurrency ?? spec?.priceCurrency ?? "") || undefined };
    }
  }
  return { price: null };
}

function productFromNode(node: Json, base: string): Product | null {
  const title = String(node.name ?? "").trim();
  if (!title) return null;
  let { price, currency } = offerPrice(node.offers);
  // ProductGroup: hent pris fra første variant
  if (price === null && node.hasVariant) {
    const v = asArray(node.hasVariant as Json | Json[])[0];
    if (v) ({ price, currency } = offerPrice(v.offers));
  }
  const url = absolute(node.url ?? (node.offers as Json | undefined)?.url ?? node["@id"], base);
  if (!url) return null;
  return { title, price, currency, image: imageOf(node.image, base), url };
}

/** 1) JSON-LD: Product, ProductGroup, ItemList og @graph. */
export function extractJsonLd(html: string, base: string): Product[] {
  const $ = cheerio.load(html);
  const out: Product[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6 || out.length >= MAX_PRODUCTS) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const n = node as Json;
    const types = typeOf(n);
    if (types.some((t) => t === "Product" || t === "ProductGroup" || t === "IndividualProduct")) {
      const p = productFromNode(n, base);
      if (p && !seen.has(p.url)) {
        seen.add(p.url);
        out.push(p);
      }
      return;
    }
    if (n["@graph"]) visit(n["@graph"], depth + 1);
    if (types.includes("ItemList") || n.itemListElement) {
      asArray(n.itemListElement as unknown[]).forEach((el) => {
        const e = el as Json;
        visit(e?.item && typeof e.item === "object" ? e.item : e, depth + 1);
      });
    }
    if (n.mainEntity) visit(n.mainEntity, depth + 1);
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text().trim();
    if (!text) return;
    try {
      visit(JSON.parse(text));
    } catch {
      // Noen butikker har ugyldig JSON-LD; ignorer
    }
  });
  return out;
}

/** 2) OpenGraph: typisk når søket sender rett til én produktside. */
export function extractOpenGraph(html: string, base: string): Product[] {
  const $ = cheerio.load(html);
  const meta = (p: string) => $(`meta[property="${p}"], meta[name="${p}"]`).attr("content")?.trim();
  const type = meta("og:type") ?? "";
  const amount = meta("product:price:amount") ?? meta("og:price:amount");
  if (!/product/i.test(type) && !amount) return [];
  const title = meta("og:title");
  const url = absolute(meta("og:url") ?? base, base);
  if (!title || !url) return [];
  return [
    {
      title,
      price: parsePrice(amount),
      currency: meta("product:price:currency") ?? meta("og:price:currency"),
      image: absolute(meta("og:image"), base),
      url,
    },
  ];
}

/** 3) Brukerdefinerte CSS-selektorer per butikk. */
export function extractWithSelectors(html: string, base: string, sel: ScrapeSelectors): Product[] {
  if (!sel.item) return [];
  const $ = cheerio.load(html);
  const out: Product[] = [];
  $(sel.item)
    .slice(0, MAX_PRODUCTS)
    .each((_, el) => {
      const card = $(el);
      const pick = (s?: string) => (s ? card.find(s).first() : card);
      const titleEl = sel.title ? card.find(sel.title).first() : card.find("h1,h2,h3,h4,[class*=name],[class*=title]").first();
      const title = (titleEl.attr("title") || titleEl.text()).replace(/\s+/g, " ").trim();
      const priceEl = sel.price ? card.find(sel.price).first() : card.find("[class*=price]").first();
      const price = parsePrice(priceEl.attr("content") ?? priceEl.text());
      const imgEl = pick(sel.image ?? "img");
      const image = absolute(
        imgEl.attr("src") ?? imgEl.attr("data-src") ?? imgEl.attr("srcset")?.split(/[\s,]+/)[0],
        base,
      );
      const linkEl = sel.link ? card.find(sel.link).first() : card.is("a") ? card : card.find("a[href]").first();
      const url = absolute(linkEl.attr("href"), base);
      if (title && url) out.push({ title, price, image, url });
    });
  return out;
}

/**
 * Prøver JSON-LD → OpenGraph → selektorer, i den rekkefølgen.
 * OpenGraph slår bare til på produktsider (og:type=product / pris-meta), så søkesider går videre til selektorer.
 */
export function extractProducts(
  html: string,
  base: string,
  selectors?: ScrapeSelectors,
): { products: Product[]; source: ExtractSource | null } {
  const ld = extractJsonLd(html, base);
  if (ld.length) return { products: ld, source: "json-ld" };
  const og = extractOpenGraph(html, base);
  if (og.length) return { products: og, source: "opengraph" };
  if (selectors?.item) {
    const css = extractWithSelectors(html, base, selectors);
    if (css.length) return { products: css, source: "selektorer" };
  }
  return { products: [], source: null };
}
