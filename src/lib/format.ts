/**
 * Small display formatting helpers shared by the client pages.
 * Prices are transmitted as decimal currency units (e.g. 500) and stored
 * in the database as integer cents (50000).
 */

const priceFormatter = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "ETB",
  maximumFractionDigits: 0,
});

/** 50000 cents / 500 units -> "ETB 500". */
export function formatPrice(price: number): string {
  return priceFormatter.format(price);
}

/** 45 -> "45 min", 90 -> "1 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Cents -> decimal currency units (50000 -> 500). */
export function centsToPrice(cents: number): number {
  return Math.round(cents) / 100;
}

/** Decimal currency units -> cents (500 -> 50000). */
export function priceToCents(price: number): number {
  return Math.round(price * 100);
}
