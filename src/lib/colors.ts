import type { CategoryColor } from "./types";

/** Statiske klassenavn slik at Tailwind finner dem. */
export const CATEGORY_COLORS: Record<CategoryColor, { chip: string; dot: string; label: string }> = {
  slate: { chip: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300", dot: "bg-slate-500", label: "Grå" },
  red: { chip: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", dot: "bg-red-500", label: "Rød" },
  orange: { chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", dot: "bg-orange-500", label: "Oransje" },
  amber: { chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500", label: "Gul" },
  green: { chip: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300", dot: "bg-green-500", label: "Grønn" },
  teal: { chip: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", dot: "bg-teal-500", label: "Turkis" },
  sky: { chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", dot: "bg-sky-500", label: "Himmelblå" },
  blue: { chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", dot: "bg-blue-500", label: "Blå" },
  violet: { chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", dot: "bg-violet-500", label: "Fiolett" },
  pink: { chip: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300", dot: "bg-pink-500", label: "Rosa" },
};

export const COLOR_KEYS = Object.keys(CATEGORY_COLORS) as CategoryColor[];
