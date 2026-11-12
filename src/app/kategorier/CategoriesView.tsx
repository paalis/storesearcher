"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import type { Category, CategoryColor } from "@/lib/types";
import { actions, sortedCategories, useAppData } from "@/lib/useAppData";
import { CATEGORY_COLORS, COLOR_KEYS } from "@/lib/colors";
import { CategoryChip, EmptyState, Loading, PageHeader } from "@/components/ui";

export function CategoriesView() {
  const data = useAppData();
  const [name, setName] = useState("");
  const [color, setColor] = useState<CategoryColor>("blue");
  const [icon, setIcon] = useState("");

  if (!data) return <Loading />;
  const categories = sortedCategories(data);
  const counts = new Map<string, number>();
  data.stores.forEach((s) => s.categoryIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    actions.addCategory({ name: name.trim(), color, icon: icon.trim() || undefined });
    setName("");
    setIcon("");
  }

  return (
    <>
      <PageHeader title="Kategorier" subtitle="Grupper butikkene og søk i en hel kategori på én gang." />

      <form onSubmit={onAdd} className="card mb-5 space-y-3 p-4">
        <div className="flex gap-2">
          <input
            className="input w-16 text-center"
            placeholder="🏷️"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            aria-label="Ikon (emoji, valgfritt)"
            maxLength={4}
          />
          <input
            className="input flex-1"
            placeholder="Ny kategori, f.eks. Elektronikk"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Navn på ny kategori"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!name.trim()}>
            <Plus className="size-4" /> <span className="hidden sm:inline">Legg til</span>
          </button>
        </div>
        <ColorPicker value={color} onChange={setColor} />
      </form>

      {categories.length === 0 ? (
        <EmptyState icon={<Tags className="size-7" />} title="Ingen kategorier">
          Lag din første kategori over, for eksempel «Klær» eller «Elektronikk». Deretter kan du tildele butikker til
          den.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-border">
          {categories.map((c, i) => (
            <CategoryRow
              key={c.id}
              category={c}
              count={counts.get(c.id) ?? 0}
              first={i === 0}
              last={i === categories.length - 1}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function CategoryRow({ category, count, first, last }: { category: Category; count: number; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon ?? "");
  const [color, setColor] = useState(category.color);

  function save(e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    actions.updateCategory(category.id, { name: name.trim(), icon: icon.trim() || undefined, color });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="space-y-3 p-4">
        <form onSubmit={save} className="flex gap-2">
          <input className="input w-16 text-center" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Ikon" maxLength={4} />
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Navn" autoFocus />
          <button type="submit" className="btn-primary px-3" aria-label="Lagre">
            <Check className="size-4" />
          </button>
          <button type="button" className="btn-secondary px-3" onClick={() => setEditing(false)} aria-label="Avbryt">
            <X className="size-4" />
          </button>
        </form>
        <ColorPicker value={color} onChange={setColor} />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 px-4 py-3">
      <div className="flex flex-col">
        <button className="btn-ghost size-6 p-0" disabled={first} onClick={() => actions.moveCategory(category.id, -1)} aria-label="Flytt opp">
          <ArrowUp className="size-3.5" />
        </button>
        <button className="btn-ghost size-6 p-0" disabled={last} onClick={() => actions.moveCategory(category.id, 1)} aria-label="Flytt ned">
          <ArrowDown className="size-3.5" />
        </button>
      </div>
      <CategoryChip category={category} />
      <span className="text-xs text-muted">{count} butikk{count === 1 ? "" : "er"}</span>
      <div className="ml-auto flex gap-1">
        {confirm ? (
          <>
            <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => actions.deleteCategory(category.id)}>
              Slett
            </button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirm(false)}>
              Avbryt
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost size-9 p-0" onClick={() => setEditing(true)} aria-label={`Endre ${category.name}`}>
              <Pencil className="size-4" />
            </button>
            <button className="btn-ghost size-9 p-0 hover:text-danger" onClick={() => setConfirm(true)} aria-label={`Slett ${category.name}`}>
              <Trash2 className="size-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function ColorPicker({ value, onChange }: { value: CategoryColor; onChange: (c: CategoryColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Farge">
      {COLOR_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          aria-label={CATEGORY_COLORS[k].label}
          title={CATEGORY_COLORS[k].label}
          onClick={() => onChange(k)}
          className={`size-7 rounded-full ${CATEGORY_COLORS[k].dot} ring-offset-2 ring-offset-surface transition ${
            value === k ? "ring-2 ring-fg" : "opacity-70 hover:opacity-100"
          }`}
        />
      ))}
    </div>
  );
}
