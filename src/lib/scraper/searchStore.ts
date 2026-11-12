import "server-only";
import { buildSearchUrl, isValidTemplate } from "@/lib/searchTemplate";
import { FetchBlockedError, safeFetch } from "@/lib/server/safeFetch";
import { TtlCache } from "./cache";
import { extractProducts } from "./extract";
import { robotsAllows } from "./robots";
import { waitForHostSlot } from "./rateLimit";
import type { ExtractSource, Product, SearchEvent, SearchStoreInput } from "./types";

export const STORE_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = Number(process.env.SEARCH_CACHE_TTL_SEC ?? 300) * 1000;

const resultCache = new TtlCache<{ products: Product[]; source: ExtractSource | null }>(CACHE_TTL_MS);

/** Søker i én butikk. Kaster aldri – feil returneres som status "error". */
export async function searchStore(store: SearchStoreInput, query: string, signal?: AbortSignal): Promise<SearchEvent> {
  const started = Date.now();
  const searchUrl = isValidTemplate(store.searchTemplate) ? buildSearchUrl(store.searchTemplate, query) : "";
  const fail = (error: string): SearchEvent => ({
    type: "result",
    storeId: store.id,
    searchUrl,
    status: "error",
    error,
    ms: Date.now() - started,
  });
  if (!searchUrl) return fail("Butikken mangler gyldig søkemal.");

  const cacheKey = `${searchUrl}|${JSON.stringify(store.selectors ?? {})}`;
  const cached = resultCache.get(cacheKey);
  if (cached) {
    return { type: "result", storeId: store.id, searchUrl, status: "ok", ...cached, cached: true, ms: Date.now() - started };
  }

  const deadline = AbortSignal.any([AbortSignal.timeout(STORE_TIMEOUT_MS), ...(signal ? [signal] : [])]);
  try {
    if (!(await robotsAllows(searchUrl, deadline))) {
      return fail("Butikkens robots.txt tillater ikke automatisk henting av søkesiden.");
    }
    await waitForHostSlot(new URL(searchUrl).origin, STORE_TIMEOUT_MS - (Date.now() - started) - 1000);
    const remaining = STORE_TIMEOUT_MS - (Date.now() - started);
    if (remaining <= 0) return fail("Tidsavbrudd.");
    const res = await safeFetch(searchUrl, { timeoutMs: remaining, signal: deadline });
    if (res.status === 403 || res.status === 429) return fail(`Butikken avviste forespørselen (${res.status}).`);
    if (res.status >= 400) return fail(`Butikken svarte ${res.status}.`);
    if (!/html|xml|json/i.test(res.contentType) && res.contentType) return fail("Uventet innholdstype fra butikken.");

    const extracted = extractProducts(res.body, res.finalUrl, store.selectors);
    resultCache.set(cacheKey, extracted);
    if (!extracted.source) {
      return {
        type: "result",
        storeId: store.id,
        searchUrl,
        status: "ok",
        products: [],
        source: null,
        cached: false,
        ms: Date.now() - started,
      };
    }
    return { type: "result", storeId: store.id, searchUrl, status: "ok", ...extracted, cached: false, ms: Date.now() - started };
  } catch (err) {
    if (err instanceof FetchBlockedError) return fail(err.message);
    if (deadline.aborted) return fail("Tidsavbrudd – butikken svarte ikke innen 8 sekunder.");
    return fail(err instanceof Error && err.message.startsWith("For mange") ? err.message : "Kunne ikke hente søkesiden.");
  }
}
