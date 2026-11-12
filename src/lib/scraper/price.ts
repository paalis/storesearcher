/**
 * Tolker priser i norske og internasjonale formater:
 * "kr 1 049,-", "1.049,00 kr", "1 299,00", "999.00", "NOK 1,299.50", 1049
 */
export function parsePrice(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  let s = input
    .replace(/ | /g, " ")
    .replace(/,-|,–|\.-/g, "")
    .replace(/[^\d.,\s]/g, " ")
    .trim();
  // Ta første tallgruppe (f.eks. ved «før 1 999 nå 1 499» velges første – kalles på enkeltpris-elementer)
  const m = s.match(/\d[\d\s.,]*/);
  if (!m) return null;
  s = m[0].trim().replace(/\s+/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Det siste skilletegnet er desimaltegnet
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma > -1) {
    // "1049,50" (desimal) vs "1,299" (tusen)
    s = /,\d{1,2}$/.test(s) ? s.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    // "999.00" (desimal) vs "1.049" (tusen)
    if (!/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
    else s = s.replace(/\.(?=\d{3}(\.|$))/g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function formatPrice(price: number | null, currency = "NOK"): string {
  if (price === null) return "Pris ukjent";
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      maximumFractionDigits: price % 1 === 0 ? 0 : 2,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}
