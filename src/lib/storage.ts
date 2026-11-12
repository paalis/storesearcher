import type { AppData, Category, CategoryColor, Store } from "./types";
import { seedData } from "./seed";
import { parseProductApi } from "./productApi";

/**
 * Lagringsgrensesnitt. Dagens implementasjon bruker localStorage,
 * men en Supabase-implementasjon kan settes inn bak samme grensesnitt.
 */
export interface Repository {
  load(): AppData;
  save(data: AppData): void;
}

const STORAGE_KEY = "butikkbrowser:data:v1";

export const localStorageRepository: Repository = {
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(seedData);
      return parseAppData(JSON.parse(raw));
    } catch {
      return structuredClone(seedData);
    }
  },
  save(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Kunne ikke lagre til localStorage", err);
    }
  },
};

/* ---------------- Validering (brukes også ved import) ---------------- */

const COLORS: CategoryColor[] = [
  "slate", "red", "orange", "amber", "green", "teal", "sky", "blue", "violet", "pink",
];

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export class ImportError extends Error {}

export function parseAppData(input: unknown): AppData {
  if (!input || typeof input !== "object") throw new ImportError("Filen inneholder ikke et gyldig JSON-objekt.");
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.stores) || !Array.isArray(obj.categories)) {
    throw new ImportError("Filen mangler «stores» og/eller «categories».");
  }

  const categories: Category[] = obj.categories.map((c, i) => {
    const r = (c ?? {}) as Record<string, unknown>;
    const name = str(r.name).trim();
    if (!name) throw new ImportError(`Kategori nr. ${i + 1} mangler navn.`);
    return {
      id: str(r.id) || newId(),
      name,
      color: COLORS.includes(r.color as CategoryColor) ? (r.color as CategoryColor) : "slate",
      icon: str(r.icon) || undefined,
      order: typeof r.order === "number" ? r.order : i,
    };
  });
  const catIds = new Set(categories.map((c) => c.id));

  const stores: Store[] = obj.stores.map((s, i) => {
    const r = (s ?? {}) as Record<string, unknown>;
    const name = str(r.name).trim();
    const url = str(r.url).trim();
    if (!name || !url) throw new ImportError(`Butikk nr. ${i + 1} mangler navn eller nettadresse.`);
    const sel = (r.selectors ?? {}) as Record<string, unknown>;
    const selectors = {
      item: str(sel.item) || undefined,
      title: str(sel.title) || undefined,
      price: str(sel.price) || undefined,
      image: str(sel.image) || undefined,
      link: str(sel.link) || undefined,
    };
    return {
      id: str(r.id) || newId(),
      name,
      url,
      searchTemplate: str(r.searchTemplate),
      logoUrl: str(r.logoUrl) || undefined,
      categoryIds: Array.isArray(r.categoryIds)
        ? r.categoryIds.filter((id): id is string => typeof id === "string" && catIds.has(id))
        : [],
      note: str(r.note) || undefined,
      favorite: r.favorite === true,
      active: r.active !== false,
      createdAt: str(r.createdAt) || new Date().toISOString(),
      selectors: Object.values(selectors).some(Boolean) ? selectors : undefined,
      api: parseProductApi(r.api),
    };
  });

  return { version: 1, stores, categories };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
