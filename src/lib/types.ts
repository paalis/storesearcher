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
}

export interface AppData {
  version: 1;
  stores: Store[];
  categories: Category[];
}
