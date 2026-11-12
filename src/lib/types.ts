export type CategoryColor =
  | "slate"
  | "red"
  | "orange"
  | "amber"
  | "green"
  | "teal"
  | "sky"
  | "blue"
  | "violet"
  | "pink";

export interface Category {
  id: string;
  name: string;
  color: CategoryColor;
  /** Valgfri emoji som ikon */
  icon?: string;
  order: number;
}

/** CSS-selektorer for uthenting av produkter (fase 2). Alle valgfrie. */
export interface ScrapeSelectors {
  /** Selektor for hvert produktkort i resultatlisten */
  item?: string;
  /** Selektorer relative til produktkortet */
  title?: string;
  price?: string;
  image?: string;
  link?: string;
}

/**
 * Produkt-API for «Hent produkter». Raskere og mer pålitelig enn å lese HTML
 * når butikken laster søkeresultatene med JavaScript.
 */
export type ProductApi =
  | { type: "shopify" }
  | { type: "woocommerce" }
  | {
      type: "json";
      /** URL-mal med {query}, f.eks. https://butikk.no/api/search?q={query} */
      url: string;
      /** Sti til produktlisten i svaret, f.eks. "data.products" (tom = roten) */
      items?: string;
      /** Stier relative til hvert produkt, f.eks. "name", "price.value", "images.0.url" */
      title: string;
      price?: string;
      image?: string;
      link: string;
      /** Del prisen på dette tallet, f.eks. 100 når prisen er i øre */
      priceDivisor?: number;
    };

export const PRODUCT_API_LABELS: Record<ProductApi["type"], string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  json: "Egendefinert JSON-API",
};

export interface Store {
  id: string;
  name: string;
  url: string;
  /** F.eks. https://butikk.no/search?q={query} */
  searchTemplate: string;
  /** Overstyrt logo-URL. Tom = hentes automatisk fra domenet. */
  logoUrl?: string;
  categoryIds: string[];
  note?: string;
  favorite: boolean;
  active: boolean;
  createdAt: string;
  selectors?: ScrapeSelectors;
  /** Valgfritt produkt-API. Brukes før HTML-uthenting. */
  api?: ProductApi;
}

export interface AppData {
  version: 1;
  stores: Store[];
  categories: Category[];
}
