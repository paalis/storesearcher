import "server-only";
import { safeFetch } from "@/lib/server/safeFetch";
import { TtlCache } from "./cache";

interface Rule {
  allow: boolean;
  pattern: string;
}

const robotsCache = new TtlCache<Rule[]>(60 * 60 * 1000, 300);
const AGENT_TOKEN = "butikkbrowser";

/** Parser robots.txt og returnerer reglene som gjelder for oss (vår agent eller *). */
export function parseRobots(text: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
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
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (key === "allow" || key === "disallow") {
        if (key === "disallow" && value === "") continue; // tom Disallow = alt tillatt
        current.rules.push({ allow: key === "allow", pattern: value });
      }
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && AGENT_TOKEN.includes(a)));
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

/** Lengste treff vinner; ved likt vinner Allow (Google-semantikk). */
export function isAllowed(rules: Rule[], pathAndQuery: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!toRegex(r.pattern).test(pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) {
      best = r;
    }
  }
  return best ? best.allow : true;
}

export async function robotsAllows(url: string, signal?: AbortSignal): Promise<boolean> {
  const u = new URL(url);
  let rules = robotsCache.get(u.origin);
  if (!rules) {
    try {
      const res = await safeFetch(`${u.origin}/robots.txt`, { timeoutMs: 3000, maxBytes: 500_000, accept: "text/plain", signal });
      // 4xx = ingen restriksjoner; 5xx = vær forsiktig og anta tillatt bare søkesiden ikke er eksplisitt nektet
      rules = res.status >= 200 && res.status < 300 ? parseRobots(res.body) : [];
    } catch {
      rules = [];
    }
    robotsCache.set(u.origin, rules);
  }
  return isAllowed(rules, u.pathname + u.search);
}
