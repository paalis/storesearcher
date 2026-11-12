import "server-only";
import { safeFetch } from "@/lib/server/safeFetch";
import { TtlCache } from "./cache";

interface Rule {
  allow: boolean;
  pattern: string;
}

const robotsCache = new TtlCache<Rule[]>(60 * 60 * 1000, 300);
const AGENT_TOKEN = "butikkbrowser";
const DISALLOW_ALL: Rule[] = [{ allow: false, pattern: "/" }];

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

export type RobotsVerdict = "tillatt" | "sperret" | "utilgjengelig";

export async function robotsAllows(url: string, signal?: AbortSignal): Promise<boolean> {
  return (await robotsVerdict(url, signal)) === "tillatt";
}

/** Skiller mellom «robots.txt sier nei» og «robots.txt kunne ikke leses». */
export async function robotsVerdict(url: string, signal?: AbortSignal): Promise<RobotsVerdict> {
  const u = new URL(url);
  let rules = robotsCache.get(u.origin);
  if (!rules) {
    // Som Google: 2xx = følg reglene, 4xx = ingen regler,
    // 5xx/429/nettverksfeil = alt sperret (caches kort, så vi prøver igjen snart)
    try {
      const res = await safeFetch(`${u.origin}/robots.txt`, { timeoutMs: 3000, maxBytes: 500_000, accept: "text/plain", signal });
      if (res.status >= 200 && res.status < 300) rules = parseRobots(res.body);
      else if (res.status >= 400 && res.status < 500 && res.status !== 429) rules = [];
      else rules = DISALLOW_ALL;
    } catch (err) {
      // Avbrutt av oss selv (klienten koblet fra / tidsfrist): ikke husk det som en feil hos butikken
      if (signal?.aborted) throw err;
      rules = DISALLOW_ALL;
    }
    robotsCache.set(u.origin, rules, rules === DISALLOW_ALL ? 60_000 : undefined);
  }
  if (rules === DISALLOW_ALL) return "utilgjengelig";
  return isAllowed(rules, u.pathname + u.search) ? "tillatt" : "sperret";
}
