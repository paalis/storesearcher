/**
 * To nivåer med rate limiting (i minnet, per serverinstans):
 * 1) Per klient (IP): maks antall søk per minutt mot /api/search.
 * 2) Per butikk (origin): minst X ms mellom forespørsler, så vi ikke belaster butikkene.
 */

const CLIENT_LIMIT = Number(process.env.SEARCH_RATE_LIMIT_PER_MIN ?? 20);
const HOST_INTERVAL_MS = Number(process.env.SCRAPER_HOST_INTERVAL_MS ?? 1500);

const clientHits = new Map<string, number[]>();

export function checkClientLimit(clientId: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (clientHits.get(clientId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= CLIENT_LIMIT) {
    clientHits.set(clientId, hits);
    return { ok: false, retryAfter: Math.ceil((hits[0] + 60_000 - now) / 1000) };
  }
  hits.push(now);
  clientHits.set(clientId, hits);
  if (clientHits.size > 5000) clientHits.clear();
  return { ok: true, retryAfter: 0 };
}

const nextSlot = new Map<string, number>();

/**
 * Reserverer neste ledige tidsluke for en butikk og venter til den.
 * Kaster hvis ventetiden ville sprengt budsjettet.
 */
export async function waitForHostSlot(origin: string, maxWaitMs: number): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(origin) ?? 0);
  const wait = slot - now;
  if (wait > maxWaitMs) throw new Error("For mange søk mot denne butikken akkurat nå – prøv igjen om litt.");
  nextSlot.set(origin, slot + HOST_INTERVAL_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
