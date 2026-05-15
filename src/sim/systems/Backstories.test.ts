import { describe, expect, it } from "vitest";
import { backstoryFor } from "./Backstories";

describe("backstoryFor", () => {
  it("returns a non-empty sentence that mentions the name", () => {
    const s = backstoryFor("Anwen", 42);
    expect(s.length).toBeGreaterThan(20);
    expect(s.startsWith("Anwen")).toBe(true);
  });

  it("is deterministic for the same (name, seed)", () => {
    const a = backstoryFor("Berta", 12345);
    const b = backstoryFor("Berta", 12345);
    expect(a).toBe(b);
  });

  it("differs when the seed differs", () => {
    const a = backstoryFor("Berta", 1);
    const b = backstoryFor("Berta", 2);
    // Same name+different seed should differ in at least one of the slots.
    expect(a).not.toBe(b);
  });

  it("differs when the name differs (even with same seed)", () => {
    const a = backstoryFor("Berta", 7);
    const b = backstoryFor("Olen", 7);
    // Name appears in the first word, so they're trivially different —
    // but the rest of the sentence should also vary at least some of the time
    // across many seeds.
    expect(a).not.toBe(b);
  });

  it("handles names with unusual characters without crashing", () => {
    const s = backstoryFor("X Æ A-12", 9);
    expect(s).toContain("X Æ A-12");
  });

  it("over many names, surfaces variety in the trade clause", () => {
    const trades = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const s = backstoryFor(`Test${i}`, i);
      // Trade is the last sentence — split and grab.
      const last = s.split(". ").pop() ?? "";
      trades.add(last);
    }
    // Pools were expanded to 10 entries each — variety bar moves accordingly.
    expect(trades.size).toBeGreaterThanOrEqual(8);
  });

  it("over many seeds, exercises a wide swath of the origin pool", () => {
    const origins = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = backstoryFor(`Test${i}`, i * 7919);
      // Origin clause sits between "arrived " and the first comma.
      const m = s.match(/^[^\s]+ arrived ([^,]+),/);
      if (m) origins.add(m[1]);
    }
    // With pools of 10 and 200 trials, we should hit at least 8 distinct origins.
    expect(origins.size).toBeGreaterThanOrEqual(8);
  });
});
