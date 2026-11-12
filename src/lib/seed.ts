import type { AppData } from "./types";

const created = "2026-11-12T00:00:00.000Z";

/**
 * Eksempeldata. Søkemalene er beste gjetning basert på plattformene
 * butikkene bruker – bruk «Test mal» i redigeringsvinduet for å bekrefte.
 */
export const seedData: AppData = {
  version: 1,
  categories: [
    { id: "cat-herre", name: "Herreklær", color: "blue", icon: "👔", order: 0 },
    { id: "cat-dame", name: "Dameklær", color: "pink", icon: "👗", order: 1 },
    { id: "cat-jeans", name: "Jeans & casual", color: "teal", icon: "👖", order: 2 },
    { id: "cat-merker", name: "Merkevarer", color: "violet", icon: "⭐", order: 3 },
  ],
  stores: [
    {
      id: "store-brando",
      name: "Brando",
      url: "https://www.brando.no",
      searchTemplate: "https://www.brando.no/search?q={query}",
      categoryIds: ["cat-herre", "cat-merker"],
      note: "Søkemal ikke verifisert – test og juster ved behov.",
      favorite: true,
      active: true,
      createdAt: created,
    },
    {
      id: "store-volt",
      name: "Volt",
      url: "https://voltfashion.com/no",
      searchTemplate: "https://voltfashion.com/no/search?q={query}",
      categoryIds: ["cat-herre", "cat-merker"],
      note: "Varner-kjede. Søkemal ikke verifisert.",
      favorite: true,
      active: true,
      createdAt: created,
    },
    {
      id: "store-retro",
      name: "Retro",
      url: "https://www.retro.no",
      searchTemplate: "https://www.retro.no/search?q={query}",
      categoryIds: ["cat-herre", "cat-dame", "cat-merker"],
      note: "Retro Nordre, Trondheim. Søkemal ikke verifisert.",
      favorite: false,
      active: true,
      createdAt: created,
    },
    {
      id: "store-nlyman",
      name: "NLY Man",
      url: "https://nlyman.com/no",
      searchTemplate: "https://nlyman.com/no/search/?q={query}",
      categoryIds: ["cat-herre"],
      note: "Søsterbutikk av Nelly.com. Søkemal ikke verifisert.",
      favorite: false,
      active: true,
      createdAt: created,
    },
    {
      id: "store-decades",
      name: "Decades",
      url: "https://www.decades.no",
      searchTemplate: "https://www.decades.no/search?q={query}",
      categoryIds: ["cat-jeans", "cat-herre", "cat-dame"],
      note: "Tidligere Boys of Europe. Søkemal ikke verifisert.",
      favorite: false,
      active: true,
      createdAt: created,
    },
  ],
};
