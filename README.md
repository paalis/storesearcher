# Butikkbrowser

En «nettleser for nettbutikker». Du legger selv inn butikkene, grupperer dem i kategorier og søker etter varer i mange butikker samtidig.

- **Søk på tvers:** du velger butikker eller kategorier, skriver et søkeord og åpner søket i hver butikk, eller i alle på én gang.
- **Hent produkter (fase 2):** serveren henter søkesidene og viser produktene samlet, med filter på butikk og sortering på pris.
- **Butikker og kategorier:** legg til, rediger, slett og sorter. Søkemalen foreslås automatisk og kan testes.
- **Import/eksport:** alle data kan lastes ned og opp som JSON.
- Norsk UI, mobil først, lys og mørk modus, installerbar som PWA. Snarveien `/` fokuserer søkefeltet.

## Teknologi

Next.js 16 (App Router), TypeScript, Tailwind CSS v4 og cheerio (HTML-parsing på serveren).

**Lagring:** alt lagres i nettleserens `localStorage`. Dataene ligger altså bare på enheten du bruker. Bruk eksport/import for backup eller for å flytte data mellom enheter. Lagringen ligger bak grensesnittet `Repository` i `src/lib/storage.ts`, så en Supabase-backend kan kobles på senere uten endringer i UI-et.

## Kom i gang lokalt

Krever Node.js 20.9 eller nyere.

```bash
npm install
```

```bash
npm run dev
```

Åpne http://localhost:3000. Første gang lastes fem eksempelbutikker inn (Brando, Volt, Retro, NLY Man og Decades). Søkemalene deres er beste gjetning og er **ikke verifisert**. Bruk «Test mal» i redigeringsvinduet og juster ved behov.

Andre kommandoer:

```bash
npm run build
```

```bash
npm run lint
```

## Miljøvariabler

Ingen er påkrevd. Alle er valgfrie og gjelder bare server-API-ene.

| Variabel | Standard | Beskrivelse |
| --- | --- | --- |
| `SCRAPER_USER_AGENT` | `Butikkbrowser/1.0 (...)` | User-Agent ved henting av butikksider. Legg gjerne inn en kontaktadresse. |
| `SEARCH_CACHE_TTL_SEC` | `300` | Hvor lenge produktresultater caches (sekunder). |
| `SEARCH_RATE_LIMIT_PER_MIN` | `20` | Maks antall «Hent produkter»-søk per klient-IP per minutt. |
| `SCRAPER_HOST_INTERVAL_MS` | `1500` | Minste tid mellom forespørsler mot samme butikk. |
| `SCRAPER_ALLOW_PRIVATE` | – | Bare for lokal testing (`1`) mot butikker på `localhost`. Har ingen effekt i produksjon. |

## Deploy til Vercel

1. Push repoet til GitHub.
2. Gå til [vercel.com/new](https://vercel.com/new) og importer repoet. Rammeverket (Next.js) oppdages automatisk, og standardinnstillingene fungerer.
3. (Valgfritt) Legg inn miljøvariablene over under *Settings → Environment Variables*.
4. Klikk **Deploy**. Hver ny push til hovedgrenen deployes automatisk.

Eller fra kommandolinjen:

```bash
npx vercel --prod
```

Etter deploy kan du installere appen fra nettleseren («Legg til på Hjem-skjerm» på iPhone, eller installer-ikonet i Chrome).

## Hvordan det fungerer

### Søke-URL-maler

En mal er en adresse der `{query}` byttes ut med søkeordet, f.eks. `https://butikk.no/search?q={query}`. Når du legger inn en ny butikk, gjør `GET /api/template?url=…` dette:

1. leter etter en OpenSearch-beskrivelse på forsiden,
2. leter etter et søkeskjema (`<form>` med søkefelt),
3. tester vanlige mønstre (`/search?q=`, `/sok?q=`, `/?s=`, `/catalogsearch/result/?q=` …) og godtar bare mønstre der testordet faktisk vises på resultatsiden.

«Test mal» (`GET /api/template?test=…`) sjekker en mal på samme måte. Noen butikker laster resultatene med JavaScript. Da kan testen ikke bekrefte malen, så åpne testsøket og sjekk selv.

### Hent produkter (`POST /api/search`)

Nettleseren sender søkeordet og de valgte butikkene (med maler og selektorer, siden dataene ligger i nettleseren). Serveren svarer med en NDJSON-strøm, én linje per butikk så snart den er ferdig:

- Butikkene hentes **parallelt** med **8 sekunders** timeout per butikk.
- **robots.txt** respekteres etter Googles regler og RFC 9309: lengste regel vinner, Allow vinner ved likhet, `*`/`$` støttes, egen `User-agent: butikkbrowser`-gruppe går foran `*`, stier normaliseres (æ/ø/å, prosentkoding), og innhold etter 500 KiB ignoreres. Filen huskes i 24 timer. Søkesider som er sperret, hentes ikke. Kan ikke robots.txt leses (nettverksfeil, 5xx eller 429), hentes ingenting, og appen prøver igjen etter ett minutt.
- **«Ignorer robots.txt (jeg søker selv)»** er en bryter per butikk under «Avansert» og er av som standard. robots.txt er beskjeden til roboter som går gjennom nettstedet automatisk. Med bryteren på hentes produktene likevel når du selv søker: én forespørsel per søk, som når du åpner søkesiden selv. Eksempel: Brando sperrer søk i robots.txt, men gir produkter via Shopify-API-et når bryteren er på.
- Har butikken et **produkt-API** (se under), brukes det først. Ellers trekkes produktene ut av søkesiden med **JSON-LD** (schema.org `Product`/`ItemList`), deretter **OpenGraph**, og til slutt **CSS-selektorer** du legger inn under «Avansert» i butikkinnstillingene.
- Resultatene **caches** kort, og det er **rate limiting** både per klient og per butikk.
- Butikker som feiler, vises som «kunne ikke hente» med en lenke til søkesiden.
- Henting fra interne/private IP-adresser er blokkert (SSRF-vern).

### Produkt-API-er

Mange butikker viser søkeresultatene med JavaScript, så HTML-en inneholder ingen produkter. Butikkens eget søke-API gir da raske og rene data. Du velger det under «Avansert → Produkt-API»:

| Type | Endepunkt | Eksempel |
| --- | --- | --- |
| Shopify | `/search/suggest.json?q=…` | Shopify-butikker |
| WooCommerce | `/wp-json/wc/store/v1/products?search=…` | Kleins |
| Egendefinert JSON | Din egen URL-mal med `{query}`, pluss stier som `data.products`, `name`, `price.amount` og `images.0.url` | Retro (`/api/navigation/product?query=…`), Decades (Voyado Elevate: `/publicapi/esales/search?q=…`) |

«Foreslå automatisk» kjenner igjen Shopify og WooCommerce og sjekker at API-et svarer. Ved feil faller appen tilbake til søkesiden. Robots.txt gjelder også API-adressene. Brando er for eksempel Shopify-butikk, men sperrer automatiske søk (`Disallow: /*?q=*`), så API-et brukes bare hvis du slår på «Ignorer robots.txt» for butikken. Volt og NLY Man blokkerer automatiske forespørsler med Cloudflare, og det hjelper ikke bryteren mot. De brukes derfor bare via «Åpne søk».

Finn API-et til en annen butikk slik: åpne utviklerverktøyene i nettleseren (Network-fanen), gjør et søk i butikken, og se etter et JSON-kall som inneholder søkeordet.

Cache og rate limiting ligger i minnet per serverinstans. Det er nok for personlig bruk. For flere brukere bør de flyttes til f.eks. Vercel KV/Upstash.

**Merk:** mange store nettbutikker rendrer søkeresultatene med JavaScript eller blokkerer automatiske forespørsler. Da gir «Hent produkter» ingen treff, og «Snarveier»-visningen er veien å gå.

## Struktur

```
src/
  app/
    page.tsx, SearchView.tsx     Søk på tvers (snarveier + hent produkter)
    butikker/                    Butikkoversikt og redigering
    kategorier/                  Kategoriadministrasjon
    innstillinger/               Import/eksport og tilbakestilling
    api/template/route.ts        Forslag og test av søkemal
    api/search/route.ts          Fase 2: samlede produktresultater (strømming)
    manifest.ts                  PWA-manifest
  components/                    AppShell, StoreForm, ProductResults, Modal, UI
  lib/
    types.ts, storage.ts, seed.ts, useAppData.ts   Datamodell og lagring
    searchTemplate.ts            Maler, URL-bygging og favicon
    scraper/                     Fase 2-modulen: uthenting, robots, cache, rate limit
    server/safeFetch.ts          Trygg henting (timeout, redirects, SSRF-vern)
public/sw.js                     Service worker (offline-støtte)
```
