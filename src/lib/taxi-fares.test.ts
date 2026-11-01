import { describe, it, expect } from "vitest";
import { taxiFare, roundUp250 } from "./taxi-fares";

describe("taxi fares", () => {
  it("always ends in a multiple of 250 dinars", () => {
    for (const km of [0.3, 2.7, 5.1, 9.99, 17.4]) {
      for (const c of ["economy", "premium", "luxury"] as const) {
        expect(taxiFare(c, km) % 250).toBe(0);
      }
    }
    expect(roundUp250(5001)).toBe(5250);
  });
  it("keeps tiers close: luxury is at most 30% above economy for a 10km trip", () => {
    const e = taxiFare("economy", 10);
    const l = taxiFare("luxury", 10);
    expect(l).toBeGreaterThan(e);
    expect(l / e).toBeLessThanOrEqual(1.3);
  });
  it("grows with distance", () => {
    expect(taxiFare("economy", 15)).toBeGreaterThan(taxiFare("economy", 5));
  });
});
