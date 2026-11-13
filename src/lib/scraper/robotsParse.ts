/**
 * Ren tolking av robots.txt etter RFC 9309 og Googles dokumentasjon.
 * Ingen nettverkskall her, slik at logikken kan testes for seg.
 */

export interface RobotsRule {
  allow: boolean;
  /** Normalisert mønster (se normalizeRobotsPath) */
  pattern: string;
}

/** Appens produkt-token. Grupper med nøyaktig dette navnet (uavhengig av store/små bokstaver) gjelder oss. */
export const PRODUCT_TOKEN = "butikkbrowser";

/** Googles grense for robots.txt: innhold etter 500 KiB ignoreres. */
export const ROBOTS_MAX_BYTES = 500 * 1024;

const UNRESERVED = /[A-Za-z0-9\-._~]/;

/**
 * Normaliserer en sti eller et mønster før sammenligning (RFC 9309, 2.2.2):
 * - tegn utenfor ASCII (f.eks. æ/ø/å) og mellomrom/kontrolltegn prosentkodes som UTF-8
 * - prosentkodede «unreserved»-tegn (bokstaver, tall, - . _ ~) dekodes
 * - øvrig prosentkoding får store heksadesimale bokstaver
 * Spesialtegnene * og $ i mønstre røres ikke.
 */
export function normalizeRobotsPath(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "%" && /^[0-9a-fA-F]{2}$/.test(input.slice(i + 1, i + 3))) {
      const hex = input.slice(i + 1, i + 3).toUpperCase();
      const decoded = String.fromCharCode(parseInt(hex, 16));
      out += UNRESERVED.test(decoded) ? decoded : `%${hex}`;
      i += 2;
      continue;
    }
    const code = input.codePointAt(i)!;
    if (code > 0x7e || code <= 0x20) {
      const char = String.fromCodePoint(code);
      if (code > 0xffff) i++; // surrogatpar
      for (const byte of new TextEncoder().encode(char)) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/** Produkt-tokenet i en user-agent-linje: «Butikkbrowser/1.0 (…)» → «butikkbrowser». */
function agentToken(value: string): string {
  if (value.trim() === "*") return "*";
  return (value.trim().match(/^[A-Za-z_-]+/)?.[0] ?? "").toLowerCase();
}

/** Parser robots.txt og returnerer reglene som gjelder for oss (egen gruppe, ellers «*»). */
export function parseRobots(text: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(agentToken(value));
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (key === "allow" || key === "disallow") {
        if (value === "") continue; // tom regel = ingen effekt
        current.rules.push({ allow: key === "allow", pattern: normalizeRobotsPath(value) });
      }
    }
  }

  // Alle grupper med nøyaktig vårt navn slås sammen; finnes ingen, brukes alle «*»-grupper.
  const specific = groups.filter((g) => g.agents.includes(PRODUCT_TOKEN));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

/** Lengste treff vinner; ved likt vinner Allow (Googles regel). Stien normaliseres som mønstrene. */
export function isAllowed(rules: RobotsRule[], pathAndQuery: string): boolean {
  const path = normalizeRobotsPath(pathAndQuery || "/");
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (!toRegex(r.pattern).test(path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) {
      best = r;
    }
  }
  return best ? best.allow : true;
}
