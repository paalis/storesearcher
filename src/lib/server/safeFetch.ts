import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

export const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ||
  "Butikkbrowser/1.0 (+https://github.com/; personlig sammenligning av nettbutikksøk)";

export class FetchBlockedError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Sjekker at URL-en er http(s) og ikke peker mot interne adresser (SSRF-vern). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Ugyldig URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new FetchBlockedError("Kun http og https er tillatt");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchBlockedError("Interne adresser er ikke tillatt");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new FetchBlockedError("Interne adresser er ikke tillatt");
  return url;
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
}

/**
 * Henter en offentlig URL med timeout, fornuftig User-Agent og
 * manuell redirect-håndtering slik at hver hopp sjekkes.
 */
export async function safeFetch(
  raw: string,
  { timeoutMs = 8000, maxBytes = 3_000_000, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", signal }:
    { timeoutMs?: number; maxBytes?: number; accept?: string; signal?: AbortSignal } = {},
): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Tidsavbrudd")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort);
  try {
    let current = raw;
    for (let hop = 0; hop < 5; hop++) {
      await assertPublicUrl(current);
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5" },
        cache: "no-store",
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current).toString();
        continue;
      }
      const reader = res.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > maxBytes) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      const body = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
      return { status: res.status, finalUrl: current, contentType: res.headers.get("content-type") ?? "", body };
    }
    throw new Error("For mange videresendinger");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
