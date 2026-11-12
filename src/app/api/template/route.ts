import { NextResponse, type NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { safeFetch, FetchBlockedError } from "@/lib/server/safeFetch";
import { buildSearchUrl, candidateTemplates, isValidTemplate, normalizeUrl, QUERY_TOKEN } from "@/lib/searchTemplate";
import { apiUrlTemplate } from "@/lib/productApi";
import { robotsAllows } from "@/lib/scraper/robots";
import type { ProductApi } from "@/lib/types";

type Source = "opensearch" | "skjema" | "testet-mønster" | "gjetning";

/** Unikt testord: ekte søkesider gjentar som regel søkeordet i HTML-en. */
const PROBE = "bbprobe7731";

/**
 * GET /api/template?url=https://butikk.no         → foreslår søke-URL-mal
 * GET /api/template?test=https://butikk.no/s?q={query} → tester en mal
 */
export async function GET(req: NextRequest) {
  const testTemplate = req.nextUrl.searchParams.get("test");
  if (testTemplate) return testTemplateRoute(testTemplate);

  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Mangler url" }, { status: 400 });
  const storeUrl = normalizeUrl(raw);

  try {
    const home = await safeFetch(storeUrl, { timeoutMs: 7000 });
    const $ = cheerio.load(home.body);
    const pageTitle = $("meta[property='og:site_name']").attr("content") || $("title").first().text().trim();
    // Kjent plattform med åpent produkt-API? Sendes med i alle svar under.
    const detected = await detectProductApi(home.body, home.finalUrl);

    // 1) OpenSearch-beskrivelse
    const osHref = $("link[rel='search'][type='application/opensearchdescription+xml']").attr("href");
    if (osHref) {
      try {
        const os = await safeFetch(new URL(osHref, home.finalUrl).toString(), { timeoutMs: 4000, accept: "*/*" });
        const $x = cheerio.load(os.body, { xml: true });
        const tpl = $x("Url[type='text/html']").attr("template");
        if (tpl?.includes("{searchTerms}")) {
          const template = tpl.replace("{searchTerms}", QUERY_TOKEN).replace(/[&?][\w]+=\{[\w:]+\?\}/g, "");
          if (isValidTemplate(template)) return NextResponse.json({ template, source: "opensearch" as Source, pageTitle, ...detected });
        }
      } catch {}
    }

    // 2) Søkeskjema på forsiden
    const forms = $("form").toArray();
    for (const f of forms) {
      const form = $(f);
      const input = form
        .find("input[type='search'], input[name='q'], input[name='s'], input[name='query'], input[name='search'], input[name='searchTerm']")
        .first();
      const name = input.attr("name");
      if (!name) continue;
      const method = (form.attr("method") || "get").toLowerCase();
      if (method !== "get") continue;
      const action = new URL(form.attr("action") || home.finalUrl, home.finalUrl);
      action.search = "";
      action.hash = "";
      const template = `${action.toString()}?${encodeURIComponent(name)}=${QUERY_TOKEN}`;
      if (isValidTemplate(template)) return NextResponse.json({ template, source: "skjema" as Source, pageTitle, ...detected });
    }

    // 3) Test vanlige mønstre parallelt
    const candidates = candidateTemplates(home.finalUrl).slice(0, 10);
    const origin = new URL(home.finalUrl).origin;
    const results = await Promise.allSettled(
      candidates.map(async (tpl) => {
        const r = await safeFetch(buildSearchUrl(tpl, PROBE), { timeoutMs: 5000, maxBytes: 1_000_000 });
        const echoed = r.body.toLowerCase().includes(PROBE);
        if (r.status === 200 && echoed && new URL(r.finalUrl).origin === origin) return tpl;
        throw new Error(String(r.status));
      }),
    );
    const hit = results.find((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    if (hit) return NextResponse.json({ template: hit.value, source: "testet-mønster" as Source, pageTitle, ...detected });

    return NextResponse.json({ template: candidates[0], source: "gjetning" as Source, pageTitle, ...detected });
  } catch (err) {
    const fallback = candidateTemplates(storeUrl)[0];
    const message =
      err instanceof FetchBlockedError ? err.message : "Kunne ikke nå butikken – foreslår et vanlig mønster.";
    return NextResponse.json({ template: fallback, source: "gjetning" as Source, warning: message });
  }
}

async function testTemplateRoute(template: string) {
  if (!isValidTemplate(template)) {
    return NextResponse.json({ ok: false, message: `Malen må være en gyldig URL og inneholde ${QUERY_TOKEN}.` });
  }
  const url = buildSearchUrl(template, PROBE);
  try {
    const r = await safeFetch(url, { timeoutMs: 7000, maxBytes: 1_000_000 });
    const final = new URL(r.finalUrl);
    const redirectedHome = final.pathname.replace(/\/$/, "") === "" && !final.search;
    const echoed = r.body.toLowerCase().includes(PROBE);
    const ok = r.status === 200 && !redirectedHome && echoed;
    return NextResponse.json({
      ok,
      status: r.status,
      finalUrl: r.finalUrl,
      message: ok
        ? "Søkesiden svarte og viste søkeordet – malen fungerer."
        : redirectedHome
          ? "Butikken sendte deg til forsiden – malen er trolig feil."
          : r.status === 200
            ? "Siden svarte, men søkeordet ble ikke funnet i HTML-en. Butikken kan laste resultater med JavaScript – åpne testsøket for å sjekke."
            : `Butikken svarte ${r.status} – malen er trolig feil.`,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message:
        err instanceof FetchBlockedError
          ? err.message
          : "Kunne ikke nå butikken fra serveren. Åpne testsøket i nettleseren for å sjekke manuelt.",
    });
  }
}

/**
 * Gjenkjenner Shopify/WooCommerce og bekrefter at produkt-API-et svarer med JSON.
 * Merker API-et hvis butikkens robots.txt sperrer det (f.eks. Disallow: /*?q=*).
 */
async function detectProductApi(html: string, finalUrl: string): Promise<{ api?: ProductApi; apiRobotsBlocked?: boolean }> {
  const candidates: ProductApi[] = [];
  if (/cdn\.shopify\.com|Shopify\.shop\s*=|shopify-section/i.test(html)) candidates.push({ type: "shopify" });
  if (/woocommerce|wp-json\/wc\//i.test(html)) candidates.push({ type: "woocommerce" });
  for (const api of candidates) {
    try {
      const url = buildSearchUrl(apiUrlTemplate(api, finalUrl), "a");
      const allowed = await robotsAllows(url);
      const r = await safeFetch(url, { timeoutMs: 4000, maxBytes: 2_000_000, accept: "application/json" });
      if (r.status !== 200) continue;
      const json = JSON.parse(r.body);
      if (api.type === "shopify" ? json?.resources?.results : Array.isArray(json)) {
        return allowed ? { api } : { api, apiRobotsBlocked: true };
      }
    } catch {}
  }
  return {};
}
