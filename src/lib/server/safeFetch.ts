import "server-only";
import dns from "node:dns";
import net from "node:net";
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch } from "undici";

export const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ||
  "Butikkbrowser/1.0 (+https://github.com/; personlig sammenligning av nettbutikksøk)";

export class FetchBlockedError extends Error {}

/**
 * Adresseområder som aldri skal nås fra serveren (privat, loopback, link-local, multicast m.m.).
 * To separate lister: Nodes BlockList sjekker ellers IPv4 mot IPv4-mappede IPv6-regler.
 */
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_V4.addSubnet(net4, prefix, "ipv4");
}
for (const [net6, prefix] of [
  ["::", 128], // uspesifisert
  ["::1", 128], // loopback
  ["::ffff:0:0", 96], // IPv4-mappet (f.eks. ::ffff:7f00:1 = 127.0.0.1)
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64], // discard
  ["2001:db8::", 32], // dokumentasjon
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local (hele /10)
  ["fec0::", 10], // site-local (utgått)
  ["ff00::", 8], // multicast
] as const) {
  BLOCKED_V6.addSubnet(net6, prefix, "ipv6");
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED_V4.check(ip, "ipv4");
  if (family === 6) return BLOCKED_V6.check(ip, "ipv6");
  return true; // ukjent format: blokker
}

const allowPrivateForTesting = () =>
  process.env.SCRAPER_ALLOW_PRIVATE === "1" && process.env.NODE_ENV !== "production";

/** Sjekker at URL-en er http(s) og ikke peker mot en intern IP-literal eller et internt navn. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Ugyldig URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new FetchBlockedError("Kun http og https er tillatt");
  // Kun for lokal testing mot falske butikker – aldri sett dette i produksjon
  if (allowPrivateForTesting()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchBlockedError("Interne adresser er ikke tillatt");
  }
  if (net.isIP(host) && isPrivateIp(host)) throw new FetchBlockedError("Interne adresser er ikke tillatt");
  // Vertsnavn sjekkes ved selve tilkoblingen (se safeLookup), så DNS-svaret ikke kan byttes underveis.
  return url;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/**
 * DNS-oppslag som brukes av selve tilkoblingen: avviser private adresser og kobler
 * bare til adresser som er sjekket. Hindrer DNS rebinding (sjekk ett svar, koble til et annet).
 */
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      const e: NodeJS.ErrnoException = new FetchBlockedError("Interne adresser er ikke tillatt");
      e.code = "EBLOCKED";
      return callback(e, "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const safeAgent = new Agent({ connect: { lookup: safeLookup as never } });

let testDispatcher: Agent | EnvHttpProxyAgent | undefined;
/** Kun med SCRAPER_ALLOW_PRIVATE=1 utenfor produksjon (lokal testing, ev. bak en proxy). */
function testAgent() {
  testDispatcher ??= process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : new Agent();
  return testDispatcher;
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
      const init = {
        redirect: "manual" as const,
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5" },
      };
      // Normalt: DNS-sjekk ved tilkobling. Lokalt med testflagg: uten sjekk, via HTTPS_PROXY hvis satt.
      const request = undiciFetch(current, { ...init, dispatcher: allowPrivateForTesting() ? testAgent() : safeAgent });
      const res = await request.catch((err: unknown) => {
        // undici pakker inn feil fra DNS-sjekken som «fetch failed» – løft den ut
        const cause = (err as { cause?: unknown })?.cause;
        throw cause instanceof FetchBlockedError ? cause : err;
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel().catch(() => {});
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
          const room = maxBytes - received;
          received += value.byteLength;
          if (value.byteLength > room) {
            // Behold innholdet opp til grensen (som Google gjør med robots.txt) og stopp
            if (room > 0) chunks.push(value.subarray(0, room));
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
