export const QUERY_TOKEN = "{query}";

/** Vanlige søkemønstre som testes når en ny butikk legges inn. */
export const COMMON_SEARCH_PATHS = [
  "/search?q={query}",
  "/sok?q={query}",
  "/sok?query={query}",
  "/search?query={query}",
  "/?s={query}",
  "/catalogsearch/result/?q={query}",
  "/search/?q={query}",
  "/s?q={query}",
  "/sok/?q={query}",
  "/search?type=product&q={query}",
];

/** Normaliserer en adresse brukeren har skrevet (legger til https:// m.m.). */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    // Fjern avsluttende skråstrek på rene domener
    const s = u.toString();
    return u.pathname === "/" && !u.search ? s.replace(/\/$/, "") : s;
  } catch {
    return withProto;
  }
}

export function getHostname(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function isValidTemplate(template: string): boolean {
  if (!template.includes(QUERY_TOKEN)) return false;
  try {
    new URL(template.replace(QUERY_TOKEN, "test"));
    return true;
  } catch {
    return false;
  }
}

/** Bygger søke-URL. Bruker '+' for mellomrom i query-strenger, %20 i stier. */
export function buildSearchUrl(template: string, query: string): string {
  const q = query.trim();
  const idx = template.indexOf(QUERY_TOKEN);
  const inQueryString = idx > -1 && template.lastIndexOf("?", idx) > -1;
  const encoded = inQueryString
    ? encodeURIComponent(q).replace(/%20/g, "+")
    : encodeURIComponent(q);
  return template.split(QUERY_TOKEN).join(encoded);
}

/** Lager kandidatmaler for en butikk-URL (origin + vanlige mønstre). */
export function candidateTemplates(storeUrl: string): string[] {
  try {
    const u = new URL(normalizeUrl(storeUrl));
    // Behold en eventuell språk-/landssti, f.eks. /no
    const base = u.origin + u.pathname.replace(/\/$/, "");
    const bases = base === u.origin ? [u.origin] : [base, u.origin];
    return bases.flatMap((b) => COMMON_SEARCH_PATHS.map((p) => b + p));
  } catch {
    return [];
  }
}

/** Automatisk logo fra domenet (Googles favicon-tjeneste). */
export function faviconUrl(storeUrl: string, size = 64): string {
  const host = getHostname(storeUrl);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
