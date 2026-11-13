import "server-only";
import { safeFetch } from "@/lib/server/safeFetch";
import { TtlCache } from "./cache";
import { isAllowed, parseRobots, ROBOTS_MAX_BYTES, type RobotsRule } from "./robotsParse";

export { isAllowed, parseRobots } from "./robotsParse";

/** Som Google: robots.txt huskes i opptil 24 timer. */
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
/** Når robots.txt ikke kunne leses: sperr, men prøv igjen etter ett minutt. */
const UNAVAILABLE_TTL_MS = 60 * 1000;

const robotsCache = new TtlCache<RobotsRule[]>(ROBOTS_TTL_MS, 300);
const DISALLOW_ALL: RobotsRule[] = [{ allow: false, pattern: "/" }];

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
      const res = await safeFetch(`${u.origin}/robots.txt`, {
        timeoutMs: 3000,
        maxBytes: ROBOTS_MAX_BYTES,
        accept: "text/plain",
        signal,
      });
      if (res.status >= 200 && res.status < 300) rules = parseRobots(res.body);
      else if (res.status >= 400 && res.status < 500 && res.status !== 429) rules = [];
      else rules = DISALLOW_ALL;
    } catch (err) {
      // Avbrutt av oss selv (klienten koblet fra / tidsfrist): ikke husk det som en feil hos butikken
      if (signal?.aborted) throw err;
      rules = DISALLOW_ALL;
    }
    robotsCache.set(u.origin, rules, rules === DISALLOW_ALL ? UNAVAILABLE_TTL_MS : ROBOTS_TTL_MS);
  }
  if (rules === DISALLOW_ALL) return "utilgjengelig";
  return isAllowed(rules, u.pathname + u.search) ? "tillatt" : "sperret";
}
