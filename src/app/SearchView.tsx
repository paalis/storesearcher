"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ExternalLink, Layers, Plus, Search, SlidersHorizontal, Store as StoreIcon, X } from "lucide-react";
import { sortedCategories, sortStores, useAppData } from "@/lib/useAppData";
import { useExcluded } from "@/lib/useSelection";
import { buildSearchUrl, getHostname } from "@/lib/searchTemplate";
import type { Store } from "@/lib/types";
import { SEARCH_INPUT_ID } from "@/components/AppShell";
import { CategoryChip, EmptyState, FavoriteStar, Loading, StoreLogo } from "@/components/ui";

export function SearchView() {
  const data = useAppData();
  const router = useRouter();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const query = (params.get("q") ?? "").trim();
  const [excluded, setExcluded] = useExcluded();
  const [showPicker, setShowPicker] = useState(false);
  const [blocked, setBlocked] = useState<Store[] | null>(null);

  // Butikker som kan søkes i: aktive og med søkemal
  const searchable = useMemo(
    () => (data ? sortStores(data.stores.filter((s) => s.active && s.searchTemplate)) : []),
    [data],
  );
  const categories = useMemo(() => (data ? sortedCategories(data) : []), [data]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const selected = useMemo(
    () => new Set(searchable.filter((s) => !excluded.has(s.id)).map((s) => s.id)),
    [excluded, searchable],
  );
  const setSelection = (next: Set<string>) =>
    setExcluded(new Set(searchable.filter((s) => !next.has(s.id)).map((s) => s.id)));
  const selectedStores = searchable.filter((s) => selected.has(s.id));

  useEffect(() => {
    if (params.get("fokus") === "1") inputRef.current?.focus();
  }, [params]);

  // Hold feltet i synk når q endres via navigasjon
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- speiler URL-parameter
    setDraft(params.get("q") ?? "");
    setBlocked(null);
  }, [params]);

  if (!data) return <Loading />;

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    router.replace(q ? `/?q=${encodeURIComponent(q)}` : "/", { scroll: false });
    inputRef.current?.blur();
  }

  function toggleStore(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }

  function toggleCategory(catId: string) {
    const ids = searchable.filter((s) => s.categoryIds.includes(catId)).map((s) => s.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
    setSelection(next);
  }

  function selectOnlyCategory(catId: string) {
    setSelection(new Set(searchable.filter((s) => s.categoryIds.includes(catId)).map((s) => s.id)));
  }

  function openAll() {
    const failed: Store[] = [];
    for (const s of selectedStores) {
      const w = window.open(buildSearchUrl(s.searchTemplate, query), "_blank");
      if (!w) failed.push(s);
      else
        try {
          w.opener = null;
        } catch {}
    }
    setBlocked(failed.length ? failed : null);
  }

  const allSelected = searchable.length > 0 && searchable.every((s) => selected.has(s.id));

  if (data.stores.length === 0) {
    return (
      <EmptyState
        icon={<StoreIcon className="size-7" />}
        title="Velkommen til Butikkbrowser"
        action={
          <>
            <Link href="/butikker" className="btn-primary">
              <Plus className="size-4" /> Legg til første butikk
            </Link>
            <Link href="/innstillinger" className="btn-secondary">
              Importer eller last inn eksempler
            </Link>
          </>
        }
      >
        Samle nettbutikkene du bruker, og søk i alle samtidig. Start med å legge inn en butikk.
      </EmptyState>
    );
  }

  return (
    <>
      {/* Søkefelt */}
      <form onSubmit={submit} role="search" className="sticky top-14 z-20 -mx-4 bg-bg/90 px-4 pt-1 pb-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            id={SEARCH_INPUT_ID}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            className="input h-13 rounded-2xl pr-24 pl-12 text-base shadow-sm sm:text-base"
            placeholder="Søk etter en vare i alle valgte butikker …"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Søk etter vare"
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {draft && (
              <button
                type="button"
                className="btn-ghost size-8 p-0"
                aria-label="Tøm søk"
                onClick={() => {
                  setDraft("");
                  inputRef.current?.focus();
                }}
              >
                <X className="size-4" />
              </button>
            )}
            <span className="kbd hidden sm:inline">/</span>
          </div>
        </div>
      </form>

      {/* Utvalg av butikker */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm text-muted">
            Søker i <strong className="text-fg">{selectedStores.length}</strong> av {searchable.length} butikker
          </p>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setShowPicker((v) => !v)} aria-expanded={showPicker}>
            <SlidersHorizontal className="size-3.5" /> {showPicker ? "Skjul utvalg" : "Velg butikker"}
          </button>
        </div>

        {categories.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <button
              type="button"
              aria-pressed={allSelected}
              onClick={() => setSelection(allSelected ? new Set() : new Set(searchable.map((s) => s.id)))}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                allSelected ? "border-transparent bg-fg text-bg" : "border-border bg-surface text-muted"
              }`}
            >
              <Layers className="size-3.5" /> {allSelected ? "Alle valgt" : "Velg alle"}
            </button>
            {categories.map((c) => {
              const ids = searchable.filter((s) => s.categoryIds.includes(c.id)).map((s) => s.id);
              if (ids.length === 0) return null;
              const on = ids.every((id) => selected.has(id));
              return (
                <span key={c.id} className="shrink-0" onDoubleClick={() => selectOnlyCategory(c.id)}>
                  <CategoryChip
                    category={c}
                    active={on}
                    onClick={() => toggleCategory(c.id)}
                    trailing={<span className="opacity-60">{ids.length}</span>}
                  />
                </span>
              );
            })}
          </div>
        )}

        {showPicker && (
          <div className="card mt-3 p-2">
            <div className="flex items-center justify-between px-2 py-1.5 text-xs">
              <span className="text-muted">Dobbeltklikk på en kategori for å velge bare den.</span>
              <span className="flex gap-3">
                <button className="font-medium text-accent" onClick={() => setSelection(new Set(searchable.map((s) => s.id)))}>
                  Velg alle
                </button>
                <button className="font-medium text-muted hover:text-fg" onClick={() => setSelection(new Set())}>
                  Fjern alle
                </button>
              </span>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {searchable.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={selected.has(s.id)}
                      onChange={() => toggleStore(s.id)}
                    />
                    <StoreLogo store={s} size={28} />
                    <span className="truncate text-sm">{s.name}</span>
                    {s.favorite && <FavoriteStar on className="ml-auto shrink-0" />}
                  </label>
                </li>
              ))}
            </ul>
            {searchable.length < data.stores.length && (
              <p className="px-2 pt-2 pb-1 text-xs text-muted">
                {data.stores.length - searchable.length} butikk(er) er skjult fordi de er inaktive eller mangler søkemal.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Resultater */}
      {!query ? (
        <div className="card px-6 py-10 text-center text-sm text-muted">
          <Search className="mx-auto mb-3 size-8 text-accent" />
          Skriv inn hva du leter etter, så får du snarveier til søket i hver butikk.
          <span className="mt-1 hidden sm:block">
            Tips: trykk <span className="kbd">/</span> hvor som helst for å søke.
          </span>
        </div>
      ) : selectedStores.length === 0 ? (
        <div className="card px-6 py-10 text-center text-sm text-muted">
          Ingen butikker er valgt. Velg minst én butikk eller kategori over.
        </div>
      ) : (
        <section aria-label="Søkeresultater">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              «{query}» i {selectedStores.length} butikk{selectedStores.length === 1 ? "" : "er"}
            </h2>
            <button className="btn-primary" onClick={openAll}>
              <ExternalLink className="size-4" /> Åpne alle ({selectedStores.length})
            </button>
          </div>

          {blocked && (
            <div role="alert" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">
                    Nettleseren blokkerte {blocked.length} av {selectedStores.length} faner.
                  </p>
                  <p className="mt-1">
                    Tillat popup-vinduer for denne siden (ikonet i adressefeltet) og trykk «Åpne alle» igjen – eller
                    åpne de blokkerte én for én:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {blocked.map((s) => (
                      <a
                        key={s.id}
                        href={buildSearchUrl(s.searchTemplate, query)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-medium underline-offset-2 hover:underline dark:bg-black/20"
                      >
                        {s.name} <ExternalLink className="size-3" />
                      </a>
                    ))}
                  </div>
                </div>
                <button onClick={() => setBlocked(null)} aria-label="Lukk melding" className="rounded p-0.5 hover:bg-black/5">
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedStores.map((s) => {
              const url = buildSearchUrl(s.searchTemplate, query);
              return (
                <li key={s.id} className="card flex flex-col p-4">
                  <div className="flex items-center gap-3">
                    <StoreLogo store={s} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        {s.name}
                        {s.favorite && <FavoriteStar on />}
                      </p>
                      <p className="truncate text-xs text-muted">{getHostname(s.url)}</p>
                    </div>
                  </div>
                  {s.categoryIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.categoryIds.map((id) => {
                        const c = catById.get(id);
                        return c ? <CategoryChip key={id} category={c} size="xs" /> : null;
                      })}
                    </div>
                  )}
                  <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4 w-full">
                    Åpne søk <ExternalLink className="size-4" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
