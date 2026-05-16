import { describe, expect, it } from "vitest";
import type { NPCTrait } from "../types";
import { traitFor, epithetFor, TRAIT_EPITHET, EPITHET_VARIANTS } from "./Traits";

const ALL_TRAITS: NPCTrait[] = [
  "joyful",
  "grim",
  "curious",
  "stoic",
  "kind",
  "ambitious",
  "anxious",
  "wise",
];

describe("traitFor", () => {
  it("returns the same trait for the same seed", () => {
    expect(traitFor(42)).toBe(traitFor(42));
  });

  it("returns a value from the canonical 8-trait list", () => {
    for (let s = 0; s < 200; s++) {
      expect(ALL_TRAITS).toContain(traitFor(s));
    }
  });

  it("distributes across all 8 traits over many seeds (no degenerate bucket)", () => {
    const counts: Record<string, number> = {};
    for (let s = 0; s < 2000; s++) {
      const t = traitFor(s);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    // With 8 buckets × 2000 seeds, each bucket should get >50 hits if the
    // distribution is reasonable.
    for (const trait of ALL_TRAITS) {
      expect(counts[trait]).toBeGreaterThan(50);
    }
  });
});

describe("EPITHET_VARIANTS", () => {
  it("provides exactly 3 entries per trait", () => {
    for (const trait of ALL_TRAITS) {
      expect(EPITHET_VARIANTS[trait]).toBeDefined();
      expect(EPITHET_VARIANTS[trait].length).toBe(3);
      for (const v of EPITHET_VARIANTS[trait]) {
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it("has all-unique strings (no accidental duplicates within or across traits)", () => {
    const all = ALL_TRAITS.flatMap((t) => EPITHET_VARIANTS[t]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("TRAIT_EPITHET (backward-compat)", () => {
  it("maps each trait to the first entry of its variant pool", () => {
    for (const trait of ALL_TRAITS) {
      expect(TRAIT_EPITHET[trait]).toBe(EPITHET_VARIANTS[trait][0]);
    }
  });

  it("covers every trait in the canonical list", () => {
    for (const trait of ALL_TRAITS) {
      expect(TRAIT_EPITHET[trait]).toBeDefined();
    }
  });
});

describe("epithetFor", () => {
  it("returns one of the trait's three variants", () => {
    for (const trait of ALL_TRAITS) {
      const pool = EPITHET_VARIANTS[trait];
      for (let s = 0; s < 30; s++) {
        const out = epithetFor(trait, s);
        expect(pool).toContain(out);
      }
    }
  });

  it("is deterministic per (trait, seed) — same args produce same output", () => {
    for (const trait of ALL_TRAITS) {
      for (let s = 0; s < 50; s++) {
        expect(epithetFor(trait, s)).toBe(epithetFor(trait, s));
      }
    }
  });

  it("varies output across many seeds (uses more than one variant)", () => {
    // For a representative trait, drive 60 seeds and confirm we hit ≥2
    // distinct variants. (The mulberry-style hash is well-distributed; we
    // expect to hit all 3 in practice.)
    const seen = new Set<string>();
    for (let s = 0; s < 60; s++) {
      seen.add(epithetFor("joyful", s));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("epithet for the same NPC stays stable across simulated reloads", () => {
    // Simulates save → load: the same npc.trait + npc.seed should always
    // resolve to the same epithet, no matter what other code ran in between.
    const epitheth = epithetFor("wise", 123456);
    for (let i = 0; i < 100; i++) {
      // Run other epithetFor calls in between to make sure there's no shared
      // mutable state.
      epithetFor("joyful", i);
    }
    expect(epithetFor("wise", 123456)).toBe(epitheth);
  });
});
