import type { ScrapeSelectors } from "@/lib/types";

export interface Product {
  title: string;
  /** Pris som tall (f.eks. 1049). null hvis ukjent. */
  price: number | null;
  currency?: string;
  image?: string;
  url: string;
}

export type ExtractSource = "json-ld" | "opengraph" | "selektorer";

/** Det klienten sender for hver butikk (dataene ligger i nettleseren). */
export interface SearchStoreInput {
  id: string;
  name: string;
  searchTemplate: string;
  selectors?: ScrapeSelectors;
}

export interface SearchRequest {
  query: string;
  stores: SearchStoreInput[];
}

/** Én linje i NDJSON-strømmen fra /api/search. */
export type SearchEvent =
  | {
      type: "result";
      storeId: string;
      searchUrl: string;
      status: "ok";
      products: Product[];
      source: ExtractSource | null;
      cached: boolean;
      ms: number;
    }
  | {
      type: "result";
      storeId: string;
      searchUrl: string;
      status: "error";
      error: string;
      ms: number;
    }
  | { type: "done" };
