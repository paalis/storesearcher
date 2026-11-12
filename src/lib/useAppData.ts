"use client";

import { useSyncExternalStore } from "react";
import type { AppData, Category, Store } from "./types";
import { localStorageRepository, newId, type Repository } from "./storage";
import { seedData } from "./seed";

/* Enkel global store over repository-et, med abonnement for React. */

const repo: Repository = localStorageRepository;
let state: AppData | null = null;
const listeners = new Set<() => void>();

function ensureLoaded(): AppData {
  if (!state) state = repo.load();
  return state;
}

function commit(next: AppData) {
  state = next;
  repo.save(next);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Synk mellom faner
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("butikkbrowser:data")) {
      state = repo.load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Returnerer null under server-rendering / før lasting. */
export function useAppData(): AppData | null {
  return useSyncExternalStore(subscribe, ensureLoaded, () => null);
}

/* ---------------- Mutasjoner ---------------- */

export type StoreInput = Omit<Store, "id" | "createdAt">;

export const actions = {
  addStore(input: StoreInput): Store {
    const d = ensureLoaded();
    const store: Store = { ...input, id: newId(), createdAt: new Date().toISOString() };
    commit({ ...d, stores: [...d.stores, store] });
    return store;
  },
  updateStore(id: string, patch: Partial<Store>) {
    const d = ensureLoaded();
    commit({ ...d, stores: d.stores.map((s) => (s.id === id ? { ...s, ...patch, id } : s)) });
  },
  deleteStore(id: string) {
    const d = ensureLoaded();
    commit({ ...d, stores: d.stores.filter((s) => s.id !== id) });
  },
  addCategory(input: Omit<Category, "id" | "order">): Category {
    const d = ensureLoaded();
    const order = d.categories.reduce((m, c) => Math.max(m, c.order + 1), 0);
    const cat: Category = { ...input, id: newId(), order };
    commit({ ...d, categories: [...d.categories, cat] });
    return cat;
  },
  updateCategory(id: string, patch: Partial<Category>) {
    const d = ensureLoaded();
    commit({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch, id } : c)) });
  },
  deleteCategory(id: string) {
    const d = ensureLoaded();
    commit({
      ...d,
      categories: d.categories.filter((c) => c.id !== id),
      stores: d.stores.map((s) => ({ ...s, categoryIds: s.categoryIds.filter((c) => c !== id) })),
    });
  },
  moveCategory(id: string, direction: -1 | 1) {
    const d = ensureLoaded();
    const sorted = [...d.categories].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((c) => c.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    commit({ ...d, categories: sorted.map((c, order) => ({ ...c, order })) });
  },
  replaceAll(data: AppData) {
    commit(data);
  },
  /** Slår sammen importerte data: samme id overskrives, nye legges til. */
  merge(data: AppData) {
    const d = ensureLoaded();
    const cats = new Map(d.categories.map((c) => [c.id, c]));
    data.categories.forEach((c) => cats.set(c.id, c));
    const stores = new Map(d.stores.map((s) => [s.id, s]));
    data.stores.forEach((s) => stores.set(s.id, s));
    commit({ version: 1, categories: [...cats.values()], stores: [...stores.values()] });
  },
  resetToSeed() {
    commit(structuredClone(seedData));
  },
  clearAll() {
    commit({ version: 1, stores: [], categories: [] });
  },
};

/* ---------------- Hjelpere ---------------- */

export function sortedCategories(data: AppData): Category[] {
  return [...data.categories].sort((a, b) => a.order - b.order);
}

export function sortStores(stores: Store[]): Store[] {
  return [...stores].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "nb"),
  );
}
