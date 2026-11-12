"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Filter, Pencil, Plus, Search, Store as StoreIcon } from "lucide-react";
import type { Store } from "@/lib/types";
import { actions, sortedCategories, sortStores, useAppData } from "@/lib/useAppData";
import { getHostname } from "@/lib/searchTemplate";
import { StoreForm } from "@/components/StoreForm";
import { CategoryChip, EmptyState, FavoriteStar, Loading, PageHeader, StoreLogo } from "@/components/ui";

export function StoresView() {
  const data = useAppData();
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Store | "new" | null>(null);

  const categories = useMemo(() => (data ? sortedCategories(data) : []), [data]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const stores = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return sortStores(
      data.stores.filter((s) => {
        if (categoryFilter && !s.categoryIds.includes(categoryFilter)) return false;
        if (!q) return true;
        const cats = s.categoryIds.map((id) => catById.get(id)?.name ?? "").join(" ");
        return `${s.name} ${s.url} ${s.note ?? ""} ${cats}`.toLowerCase().includes(q);
      }),
    );
  }, [data, filter, categoryFilter, catById]);

  if (!data) return <Loading />;

  const addButton = (
    <button className="btn-primary" onClick={() => setEditing("new")}>
      <Plus className="size-4" /> Legg til butikk
    </button>
  );

  return (
    <>
      <PageHeader
        title="Butikker"
        subtitle={`${data.stores.length} butikker · ${data.stores.filter((s) => s.active).length} aktive`}
        actions={data.stores.length > 0 ? addButton : undefined}
      />

      {data.stores.length === 0 ? (
        <EmptyState icon={<StoreIcon className="size-7" />} title="Ingen butikker ennå" action={addButton}>
          Legg inn nettadressen til en nettbutikk, så foreslår vi søkemalen automatisk. Du kan også importere en
          JSON-fil under Innstillinger.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input
                className="input pl-10"
                placeholder="Filtrer butikker …"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filtrer butikker"
              />
            </div>
            {categories.length > 0 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  aria-pressed={categoryFilter === null}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                    categoryFilter === null ? "border-transparent bg-fg text-bg" : "border-border bg-surface text-muted"
                  }`}
                >
                  <Filter className="size-3.5" /> Alle
                </button>
                {categories.map((c) => (
                  <span key={c.id} className="shrink-0">
                    <CategoryChip
                      category={c}
                      active={categoryFilter === c.id}
                      onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>

          {stores.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Ingen butikker passer filteret.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((s) => (
                <li key={s.id} className={`card group relative flex flex-col p-4 ${s.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <StoreLogo store={s} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h2 className="truncate font-semibold">{s.name}</h2>
                        <button
                          type="button"
                          onClick={() => actions.updateStore(s.id, { favorite: !s.favorite })}
                          aria-label={s.favorite ? "Fjern fra favoritter" : "Legg til i favoritter"}
                          className="rounded p-0.5 hover:bg-surface-2"
                        >
                          <FavoriteStar on={s.favorite} />
                        </button>
                      </div>
                      <p className="truncate text-xs text-muted">
                        {getHostname(s.url)}
                        {!s.active && " · inaktiv"}
                        {!s.searchTemplate && " · mangler søkemal"}
                      </p>
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
                  {s.note && <p className="mt-2 line-clamp-2 text-xs text-muted">{s.note}</p>}
                  <div className="mt-auto flex gap-2 pt-3">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 px-3 py-2 text-xs">
                      <ExternalLink className="size-3.5" /> Besøk
                    </a>
                    <button className="btn-secondary flex-1 px-3 py-2 text-xs" onClick={() => setEditing(s)}>
                      <Pencil className="size-3.5" /> Rediger
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && (
        <StoreForm
          store={editing === "new" ? undefined : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
