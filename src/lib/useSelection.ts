"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "butikkbrowser:excluded";

/**
 * Hvilke butikker som er valgt BORT fra søk. Lagres lokalt som en bekvemmelighet.
 * Ved å lagre bortvalgte (ikke valgte) blir nye butikker automatisk med i søket.
 */
export function useExcluded() {
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leser lagret valg etter hydrering
      if (raw) setExcluded(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

  const update = useCallback((next: Set<string>) => {
    setExcluded(next);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {}
  }, []);

  return [excluded, update] as const;
}
