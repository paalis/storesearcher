"use client";

import { useState, type ReactNode } from "react";
import { Star } from "lucide-react";
import type { Category, Store } from "@/lib/types";
import { CATEGORY_COLORS } from "@/lib/colors";
import { faviconUrl, getHostname } from "@/lib/searchTemplate";

export function StoreLogo({ store, size = 40 }: { store: Pick<Store, "name" | "url" | "logoUrl">; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = store.logoUrl || (store.url ? faviconUrl(store.url, 64) : "");
  const initials = store.name.trim().slice(0, 2).toUpperCase() || "?";
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-white text-xs font-semibold text-slate-700"
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- ekstern favicon med ukjent domene
        <img
          src={src}
          alt=""
          width={size * 0.6}
          height={size * 0.6}
          className="object-contain"
          style={{ width: size * 0.6, height: size * 0.6 }}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        initials
      )}
    </span>
  );
}

export function CategoryChip({
  category,
  active,
  onClick,
  size = "sm",
  trailing,
}: {
  category: Category;
  active?: boolean;
  onClick?: () => void;
  size?: "xs" | "sm";
  trailing?: ReactNode;
}) {
  const c = CATEGORY_COLORS[category.color] ?? CATEGORY_COLORS.slate;
  const base =
    size === "xs" ? "px-2 py-0.5 text-[11px] gap-1" : "px-3 py-1.5 text-sm gap-1.5";
  const content = (
    <>
      {category.icon ? <span aria-hidden>{category.icon}</span> : <span className={`size-2 rounded-full ${c.dot}`} />}
      {category.name}
      {trailing}
    </>
  );
  if (!onClick) {
    return <span className={`inline-flex items-center rounded-full font-medium ${base} ${c.chip}`}>{content}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center rounded-full border font-medium transition-colors ${base} ${
        active ? `${c.chip} border-transparent ring-2 ring-accent/60` : "border-border bg-surface text-muted hover:text-fg"
      }`}
    >
      {content}
    </button>
  );
}

export function FavoriteStar({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <Star
      className={`size-4 ${on ? "fill-amber-400 text-amber-400" : "text-muted"} ${className}`}
      aria-label={on ? "Favoritt" : undefined}
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Laster">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

export { getHostname };
