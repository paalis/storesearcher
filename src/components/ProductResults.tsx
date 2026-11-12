"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDownUp, CheckCircle2, ExternalLink, ImageOff, Loader2, PackageSearch, RefreshCw } from "lucide-react";
import type { Store } from "@/lib/types";
import type { Product, SearchEvent } from "@/lib/scraper/types";
import { formatPrice } from "@/lib/scraper/price";
import { buildSearchUrl } from "@/lib/searchTemplate";
import { StoreLogo } from "./ui";

type StoreResult =
  | { status: "loading" }
  | Extract<SearchEvent, { type: "result"; status: "ok" }>
  | Extract<SearchEvent, { type: "result"; status: "error" }>;

type Sort = "relevans" | "pris-stigende" | "pris-synkende";

interface Row extends Product {
  storeId: string;
  rank: number;
}

/** Henter ekte produktresultater fra /api/search og viser dem etter hvert som de kommer inn. */
export function ProductResults({ query, stores }: { query: string; stores: Store[] }) {
  const [results, setResults] = useState<Record<string, StoreResult>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>("relevans");
  const [nonce, setNonce] = useState(0);

  const storeKey = stores
    .map((s) => `${s.id}:${s.url}:${s.searchTemplate}:${JSON.stringify(s.selectors ?? {})}:${JSON.stringify(s.api ?? {})}:${s.ignoreRobots ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nullstiller ved nytt søk
    setResults(Object.fromEntries(stores.map((s) => [s.id, { status: "loading" } as StoreResult])));
    setFatal(null);
    setStoreFilter(new Set());

    (async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            query,
            stores: stores.map((s) => ({
              id: s.id,
              name: s.name,
              url: s.url,
              searchTemplate: s.searchTemplate,
              selectors: s.selectors,
              api: s.api,
              ignoreRobots: s.ignoreRobots,
            })),
          }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Serveren svarte ${res.status}.`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as SearchEvent;
            if (event.type === "result") setResults((r) => ({ ...r, [event.storeId]: event }));
          }
        }
        // Butikker som aldri svarte (f.eks. avbrutt strøm)
        setResults((r) =>
          Object.fromEntries(
            Object.entries(r).map(([id, v]) => [
              id,
              v.status === "loading"
                ? ({ type: "result", storeId: id, searchUrl: "", status: "error", error: "Fikk ikke svar.", ms: 0 } as StoreResult)
                : v,
            ]),
          ),
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setFatal(err instanceof Error ? err.message : "Noe gikk galt.");
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storeKey dekker endringer i butikkene
  }, [query, storeKey, nonce]);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const rows: Row[] = useMemo(() => {
    const all: Row[] = [];
    // Flett resultatene (1. fra hver butikk, så 2. …) for en rettferdig «relevans»-rekkefølge
    stores.forEach((s) => {
      const r = results[s.id];
      if (r?.status === "ok") r.products.forEach((p, i) => all.push({ ...p, storeId: s.id, rank: i }));
    });
    const filtered = storeFilter.size ? all.filter((r) => storeFilter.has(r.storeId)) : all;
    const byRank = filtered.sort((a, b) => a.rank - b.rank);
    if (sort === "relevans") return byRank;
    const dir = sort === "pris-stigende" ? 1 : -1;
    // Beløp i ulike valutaer kan ikke sammenlignes direkte: NOK først (ukjent valuta regnes som NOK),
    // deretter hver annen valuta for seg, sortert på pris innenfor valutaen.
    const cur = (r: Row) => (r.currency || "NOK").toUpperCase();
    return [...byRank].sort((a, b) => {
      if (a.price === null) return b.price === null ? 0 : 1;
      if (b.price === null) return -1;
      const ca = cur(a);
      const cb = cur(b);
      if (ca !== cb) return ca === "NOK" ? -1 : cb === "NOK" ? 1 : ca.localeCompare(cb);
      return (a.price - b.price) * dir;
    });
  }, [results, stores, storeFilter, sort]);

  const loading = stores.filter((s) => results[s.id]?.status === "loading").length;
  const currencies = new Set(rows.filter((r) => r.price !== null).map((r) => (r.currency || "NOK").toUpperCase()));
  const finished = stores.length - loading;

  if (fatal) {
    return (
      <div role="alert" className="card flex flex-col items-center gap-3 px-6 py-10 text-center text-sm">
        <AlertCircle className="size-7 text-danger" />
        <p>{fatal}</p>
        <button className="btn-secondary" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="size-4" /> Prøv igjen
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Status per butikk – fungerer også som filter */}
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <p className="text-muted">
          {loading > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> Henter … {finished} av {stores.length} butikker ferdig
            </span>
          ) : (
            <>
              <strong className="text-fg">{rows.length}</strong> produkter fra {stores.length} butikker
            </>
          )}
        </p>
        <label className="inline-flex items-center gap-1.5 text-muted">
          <ArrowDownUp className="size-3.5" />
          <span className="sr-only">Sorter</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-fg"
          >
            <option value="relevans">Relevans</option>
            <option value="pris-stigende">Pris: lav til høy</option>
            <option value="pris-synkende">Pris: høy til lav</option>
          </select>
        </label>
      </div>

      {sort !== "relevans" && currencies.size > 1 && (
        <p className="mb-3 text-xs text-muted">
          Resultatene har flere valutaer ({[...currencies].join(", ")}). De sorteres på pris innenfor hver valuta, med NOK
          først – beløp i ulike valutaer sammenlignes ikke.
        </p>
      )}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {stores.map((s) => {
          const r = results[s.id];
          const on = storeFilter.has(s.id);
          const count = r?.status === "ok" ? r.products.length : null;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              disabled={!count}
              onClick={() => {
                const next = new Set(storeFilter);
                if (on) next.delete(s.id);
                else next.add(s.id);
                setStoreFilter(next);
              }}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors disabled:cursor-default ${
                on ? "border-accent bg-accent-soft text-fg" : "border-border bg-surface text-muted"
              }`}
            >
              <StoreLogo store={s} size={24} />
              {s.name}
              {r?.status === "loading" && <Loader2 className="size-3.5 animate-spin" />}
              {r?.status === "ok" && <span className="font-medium text-fg">{count}</span>}
              {r?.status === "error" && <AlertCircle className="size-3.5 text-danger" />}
            </button>
          );
        })}
      </div>

      {/* Butikker som feilet eller ikke ga produktdata */}
      {stores.map((s) => {
        const r = results[s.id];
        const url = r && "searchUrl" in r && r.searchUrl ? r.searchUrl : buildSearchUrl(s.searchTemplate, query);
        if (r?.status === "error" || (r?.status === "ok" && r.products.length === 0)) {
          return (
            <div key={s.id} className="mb-2 flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2 text-sm">
              <StoreLogo store={s} size={28} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name}: {r.status === "error" ? "kunne ikke hente" : "fant ingen produktdata"}</p>
                <p className="truncate text-xs text-muted">
                  {r.status === "error"
                    ? r.error
                    : r.source === "api"
                      ? "Produkt-API-et ga ingen treff på dette søket."
                      : "Siden har ikke JSON-LD/OpenGraph. Legg inn et produkt-API eller CSS-selektorer i butikkinnstillingene."}
                </p>
              </div>
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                Åpne søk <ExternalLink className="size-3.5" />
              </a>
            </div>
          );
        }
        return null;
      })}

      {rows.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((p) => (
            <ProductCard key={`${p.storeId}:${p.url}`} product={p} store={storeById.get(p.storeId)!} />
          ))}
        </ul>
      ) : (
        loading === 0 && (
          <div className="card mt-4 flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted">
            <PackageSearch className="size-8 text-accent" />
            Ingen produkter kunne hentes automatisk for «{query}». Bruk «Åpne søk» for å se resultatene hos butikkene.
          </div>
        )
      )}

      {loading === 0 && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
          <CheckCircle2 className="size-3.5" /> Resultater caches i noen minutter.
          <button className="font-medium text-accent" onClick={() => setNonce((n) => n + 1)}>
            Oppdater
          </button>
        </p>
      )}
    </div>
  );
}

function ProductCard({ product, store }: { product: Row; store: Store }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <li className="card group flex flex-col overflow-hidden">
      <a href={product.url} target="_blank" rel="noopener noreferrer" className="flex flex-1 flex-col">
        <div className="relative aspect-square bg-white">
          {product.image && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- bilder fra vilkårlige butikkdomener
            <img
              src={product.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="size-full object-contain p-2 transition-transform group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid size-full place-items-center bg-surface-2 text-muted">
              <ImageOff className="size-6" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <p className="line-clamp-2 text-sm leading-snug">{product.title}</p>
          <p className="mt-auto pt-1 font-semibold">{formatPrice(product.price, product.currency || "NOK")}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted">
            <StoreLogo store={store} size={16} /> {store.name}
          </p>
        </div>
      </a>
    </li>
  );
}
