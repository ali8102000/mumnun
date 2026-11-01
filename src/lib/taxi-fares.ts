// Taxi fares close to Baly-style Baghdad pricing: small gaps between tiers,
// distance-based, always rounded UP to the nearest 250 IQD.
export type VehicleCategory = "economy" | "premium" | "luxury";

export const FARE_TABLE: Record<VehicleCategory, { base: number; perKm: number; minimum: number }> = {
  economy: { base: 1500, perKm: 400, minimum: 3000 },
  premium: { base: 1750, perKm: 450, minimum: 3500 },
  luxury:  { base: 2000, perKm: 500, minimum: 4000 },
};

export function roundUp250(n: number) {
  return Math.ceil(n / 250) * 250;
}

export function taxiFare(category: VehicleCategory, distanceKm: number) {
  const t = FARE_TABLE[category];
  const km = Math.max(0, distanceKm);
  return roundUp250(Math.max(t.minimum, t.base + t.perKm * km));
}

/** Straight-line distance → approximate road distance in the city. */
export function approxRoadKm(straightKm: number) {
  return straightKm * 1.35;
}
