import { NextResponse, type NextRequest } from "next/server";
import { searchStore } from "@/lib/scraper/searchStore";
import { checkClientLimit } from "@/lib/scraper/rateLimit";
import type { SearchEvent, SearchRequest, SearchStoreInput } from "@/lib/scraper/types";

export const maxDuration = 20;

const MAX_STORES = 30;

function validate(body: unknown): SearchRequest | string {
  if (!body || typeof body !== "object") return "Ugyldig forespørsel.";
  const b = body as Record<string, unknown>;
  const query = typeof b.query === "string" ? b.query.trim().slice(0, 200) : "";
  if (!query) return "Mangler søkeord.";
  if (!Array.isArray(b.stores) || b.stores.length === 0) return "Ingen butikker valgt.";
  if (b.stores.length > MAX_STORES) return `Maks ${MAX_STORES} butikker per søk.`;
  const stores: SearchStoreInput[] = [];
  for (const s of b.stores) {
    const r = (s ?? {}) as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.searchTemplate !== "string") return "Ugyldig butikk i forespørselen.";
    const sel = (r.selectors && typeof r.selectors === "object" ? r.selectors : {}) as Record<string, unknown>;
    const clean = Object.fromEntries(
      Object.entries(sel).filter(([k, v]) => ["item", "title", "price", "image", "link"].includes(k) && typeof v === "string" && v.length < 300),
    );
    stores.push({ id: r.id, name: String(r.name ?? ""), searchTemplate: r.searchTemplate, selectors: clean });
  }
  return { query, stores };
}

/**
 * POST /api/search  { query, stores: [{ id, name, searchTemplate, selectors? }] }
 * Svarer med NDJSON: én linje per butikk så snart den er ferdig, og til slutt {"type":"done"}.
 */
export async function POST(req: NextRequest) {
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "lokal";
  const limit = checkClientLimit(client);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `For mange søk. Prøv igjen om ${limit.retryAfter} sekunder.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let parsed: SearchRequest | string;
  try {
    parsed = validate(await req.json());
  } catch {
    parsed = "Ugyldig JSON.";
  }
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
  const { query, stores } = parsed;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: SearchEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // Klienten har koblet fra
        }
      };
      // Alle butikker kjøres parallelt; hver sendes så snart den er ferdig
      await Promise.all(stores.map((s) => searchStore(s, query, req.signal).then(send)));
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
