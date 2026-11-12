"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, ExternalLink, FlaskConical, Loader2, Sparkles, Trash2, XCircle } from "lucide-react";
import type { Category, Store } from "@/lib/types";
import { actions, type StoreInput } from "@/lib/useAppData";
import { buildSearchUrl, getHostname, isValidTemplate, normalizeUrl, QUERY_TOKEN } from "@/lib/searchTemplate";
import { Modal } from "./Modal";
import { CategoryChip, StoreLogo } from "./ui";

type Suggest = { state: "idle" } | { state: "loading" } | { state: "done"; source: string; warning?: string };
type Test = { state: "idle" } | { state: "loading" } | { state: "done"; ok: boolean; message: string };

const SOURCE_LABEL: Record<string, string> = {
  opensearch: "funnet via OpenSearch",
  skjema: "funnet i søkeskjemaet på forsiden",
  "testet-mønster": "vanlig mønster som svarte OK",
  gjetning: "vanlig mønster (ikke bekreftet)",
};

function emptyInput(): StoreInput {
  return {
    name: "",
    url: "",
    searchTemplate: "",
    logoUrl: "",
    categoryIds: [],
    note: "",
    favorite: false,
    active: true,
    selectors: {},
  };
}

export function StoreForm({
  store,
  categories,
  onClose,
}: {
  store?: Store;
  categories: Category[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<StoreInput>(() => (store ? { ...emptyInput(), ...store } : emptyInput()));
  const [suggest, setSuggest] = useState<Suggest>({ state: "idle" });
  const [test, setTest] = useState<Test>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(store?.selectors && Object.values(store.selectors).some(Boolean)));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof StoreInput>(key: K, value: StoreInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function runSuggest(urlArg?: string) {
    const url = normalizeUrl(urlArg ?? form.url);
    if (!url) return;
    setSuggest({ state: "loading" });
    try {
      const res = await fetch(`/api/template?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      setForm((f) => ({
        ...f,
        url,
        searchTemplate: data.template ?? f.searchTemplate,
        name: f.name || prettifyName(data.pageTitle, url),
      }));
      setSuggest({ state: "done", source: data.source, warning: data.warning });
      setTest({ state: "idle" });
    } catch {
      setSuggest({ state: "done", source: "gjetning", warning: "Fikk ikke kontakt med serveren." });
    }
  }

  async function runTest() {
    setTest({ state: "loading" });
    try {
      const res = await fetch(`/api/template?test=${encodeURIComponent(form.searchTemplate)}`);
      const data = await res.json();
      setTest({ state: "done", ok: data.ok, message: data.message });
    } catch {
      setTest({ state: "done", ok: false, message: "Fikk ikke kontakt med serveren." });
    }
  }

  function onUrlBlur() {
    const url = normalizeUrl(form.url);
    if (url !== form.url) set("url", url);
    if (url && !form.searchTemplate && suggest.state === "idle") void runSuggest(url);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const url = normalizeUrl(form.url);
    if (!form.name.trim()) return setError("Gi butikken et navn.");
    if (!url) return setError("Legg inn nettadressen til butikken.");
    if (form.searchTemplate && !isValidTemplate(form.searchTemplate)) {
      return setError(`Søke-URL-malen må være en gyldig adresse og inneholde ${QUERY_TOKEN}.`);
    }
    const sel = form.selectors ?? {};
    const clean: StoreInput = {
      ...form,
      name: form.name.trim(),
      url,
      logoUrl: form.logoUrl?.trim() || undefined,
      note: form.note?.trim() || undefined,
      selectors: Object.values(sel).some((v) => v?.trim()) ? sel : undefined,
    };
    if (store) actions.updateStore(store.id, clean);
    else actions.addStore(clean);
    onClose();
  }

  const templateOk = form.searchTemplate === "" || isValidTemplate(form.searchTemplate);

  return (
    <Modal
      open
      onClose={onClose}
      title={store ? "Rediger butikk" : "Legg til butikk"}
      footer={
        <div className="flex items-center gap-2">
          {store &&
            (confirmDelete ? (
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  actions.deleteStore(store.id);
                  onClose();
                }}
              >
                <Trash2 className="size-4" /> Bekreft sletting
              </button>
            ) : (
              <button type="button" className="btn-ghost text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Slett
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Avbryt
            </button>
            <button type="submit" form="store-form" className="btn-primary">
              Lagre
            </button>
          </div>
        </div>
      }
    >
      <form id="store-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="sf-url">
            Nettadresse
          </label>
          <div className="flex items-center gap-2">
            <StoreLogo store={{ name: form.name || getHostname(form.url), url: form.url, logoUrl: form.logoUrl }} size={42} />
            <input
              id="sf-url"
              className="input"
              inputMode="url"
              autoComplete="off"
              placeholder="butikk.no"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              onBlur={onUrlBlur}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="sf-name">
            Navn
          </label>
          <input id="sf-name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Butikkens navn" />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0" htmlFor="sf-template">
              Søke-URL-mal
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent disabled:opacity-50"
              onClick={() => runSuggest()}
              disabled={!form.url || suggest.state === "loading"}
            >
              {suggest.state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Foreslå automatisk
            </button>
          </div>
          <input
            id="sf-template"
            className={`input font-mono text-xs sm:text-xs ${templateOk ? "" : "border-danger"}`}
            placeholder={`https://butikk.no/search?q=${QUERY_TOKEN}`}
            value={form.searchTemplate}
            onChange={(e) => {
              set("searchTemplate", e.target.value);
              setTest({ state: "idle" });
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1.5 text-xs text-muted">
            Bruk <code className="kbd">{QUERY_TOKEN}</code> der søkeordet skal stå.
            {suggest.state === "loading" && " Leter etter søkeside …"}
            {suggest.state === "done" && ` Forslag: ${SOURCE_LABEL[suggest.source] ?? suggest.source}.`}
            {suggest.state === "done" && suggest.warning && <span className="block text-amber-600 dark:text-amber-400">{suggest.warning}</span>}
          </p>
          {form.searchTemplate && templateOk && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={runTest} disabled={test.state === "loading"}>
                {test.state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                Test mal
              </button>
              <a
                className="btn-ghost px-3 py-1.5 text-xs"
                href={buildSearchUrl(form.searchTemplate, "jakke")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-3.5" /> Åpne testsøk «jakke»
              </a>
            </div>
          )}
          {test.state === "done" && (
            <p className={`mt-2 flex items-start gap-1.5 text-xs ${test.ok ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
              {test.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <XCircle className="mt-px size-3.5 shrink-0" />}
              {test.message}
            </p>
          )}
        </div>

        {categories.length > 0 && (
          <div>
            <span className="label">Kategorier</span>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = form.categoryIds.includes(c.id);
                return (
                  <CategoryChip
                    key={c.id}
                    category={c}
                    active={on}
                    onClick={() => set("categoryIds", on ? form.categoryIds.filter((id) => id !== c.id) : [...form.categoryIds, c.id])}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="sf-note">
            Notat
          </label>
          <textarea id="sf-note" rows={2} className="input resize-y" value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Toggle label="Favoritt" checked={form.favorite} onChange={(v) => set("favorite", v)} />
          <Toggle label="Aktiv (med i søk)" checked={form.active} onChange={(v) => set("active", v)} />
        </div>

        <div className="rounded-2xl border border-border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            Avansert: logo og produktuthenting
            <ChevronDown className={`size-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
          {showAdvanced && (
            <div className="space-y-3 border-t border-border px-4 py-3">
              <div>
                <label className="label" htmlFor="sf-logo">
                  Egen logo-URL
                </label>
                <input
                  id="sf-logo"
                  className="input"
                  placeholder="Tom = hentes automatisk fra domenet"
                  value={form.logoUrl ?? ""}
                  onChange={(e) => set("logoUrl", e.target.value)}
                />
              </div>
              <p className="text-xs text-muted">
                CSS-selektorer brukes av «Hent produkter» når butikken ikke har strukturerte data (JSON-LD). Feltene
                tittel, pris, bilde og lenke er relative til produktkortet.
              </p>
              {(["item", "title", "price", "image", "link"] as const).map((k) => (
                <div key={k}>
                  <label className="label text-xs" htmlFor={`sf-sel-${k}`}>
                    {{ item: "Produktkort", title: "Tittel", price: "Pris", image: "Bilde", link: "Lenke" }[k]}
                  </label>
                  <input
                    id={`sf-sel-${k}`}
                    className="input font-mono text-xs sm:text-xs"
                    placeholder={{ item: ".product-card", title: ".product-name", price: ".price", image: "img", link: "a" }[k]}
                    value={form.selectors?.[k] ?? ""}
                    onChange={(e) => set("selectors", { ...form.selectors, [k]: e.target.value })}
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-500/10">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-10 rounded-full bg-surface-2 ring-1 ring-border transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
      {label}
    </label>
  );
}

function prettifyName(title: string | undefined, url: string): string {
  const fromTitle = title?.split(/\s[|\-–—:]\s/)[0]?.trim();
  if (fromTitle && fromTitle.length <= 40) return fromTitle;
  const host = getHostname(url).split(".")[0] ?? "";
  return host.charAt(0).toUpperCase() + host.slice(1);
}
