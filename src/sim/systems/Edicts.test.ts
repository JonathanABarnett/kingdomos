import { describe, expect, it } from "vitest";
import { World } from "../World";
import { EDICT_DEFS } from "./Edicts";

describe("Edicts — proclaim / revoke / auto-expire", () => {
  it("starts with no active edict", () => {
    const w = new World({ seed: 1 });
    expect(w.edicts.status().active).toBeNull();
    expect(w.edictEffects.hospitality).toBe(false);
    expect(w.edictEffects.studious).toBe(false);
    expect(w.edictEffects.frugal).toBe(false);
    expect(w.edictEffects.openCourt).toBe(false);
  });

  it("proclaim() sets the active id and flips the matching effect flag", () => {
    const w = new World({ seed: 1 });
    expect(w.edicts.proclaim("studious")).toBe(true);
    expect(w.edicts.status().active).toBe("studious");
    expect(w.edictEffects.studious).toBe(true);
    expect(w.economy.edictStudious).toBe(true);
    // Other flags stay off.
    expect(w.edictEffects.frugal).toBe(false);
    expect(w.edictEffects.hospitality).toBe(false);
  });

  it("proclaim() returns false for an unknown id", () => {
    const w = new World({ seed: 1 });
    expect(w.edicts.proclaim("madeUp" as unknown as "studious")).toBe(false);
    expect(w.edicts.status().active).toBeNull();
  });

  it("proclaim() while one is active replaces the old one and writes a journal note", () => {
    const w = new World({ seed: 1 });
    const lines: string[] = [];
    w.onJournal = (e) => lines.push(e.text);
    w.edicts.proclaim("studious");
    w.edicts.proclaim("frugal");
    expect(w.edicts.status().active).toBe("frugal");
    expect(w.edictEffects.studious).toBe(false);
    expect(w.edictEffects.frugal).toBe(true);
    expect(lines.some((t) => /rescinded/.test(t))).toBe(true);
  });

  it("revoke() clears the active edict and writes a note", () => {
    const w = new World({ seed: 1 });
    const lines: string[] = [];
    w.onJournal = (e) => lines.push(e.text);
    w.edicts.proclaim("hospitality");
    w.edicts.revoke();
    expect(w.edicts.status().active).toBeNull();
    expect(w.edictEffects.hospitality).toBe(false);
    expect(w.director.hospitalityBonus).toBe(false);
    expect(lines.some((t) => /rescinded by royal decision/.test(t))).toBe(true);
  });

  it("revoke() on an empty state is a no-op", () => {
    const w = new World({ seed: 1 });
    const before: string[] = [];
    w.onJournal = (e) => before.push(e.text);
    expect(() => w.edicts.revoke()).not.toThrow();
    expect(before.length).toBe(0);
  });

  it("tick() auto-expires the active edict after its duration", () => {
    const w = new World({ seed: 1 });
    const lines: string[] = [];
    w.onJournal = (e) => lines.push(e.text);
    w.state.day = 10;
    w.edicts.proclaim("frugal");
    expect(w.edicts.status().daysLeft).toBe(7);
    // Advance time and re-tick.
    w.state.day = 17;
    w.edicts.tick();
    expect(w.edicts.status().active).toBeNull();
    expect(w.edictEffects.frugal).toBe(false);
    expect(w.economy.edictFrugal).toBe(false);
    expect(lines.some((t) => /Edict of Thrift expired/.test(t))).toBe(true);
  });

  it("tick() within the same day fires the expiry exactly once", () => {
    const w = new World({ seed: 1 });
    w.state.day = 10;
    w.edicts.proclaim("studious");
    w.state.day = 18;
    let expiryWrites = 0;
    w.onJournal = (e) => {
      if (/Edict of Letters ended/.test(e.text)) expiryWrites++;
    };
    w.edicts.tick();
    w.edicts.tick();
    w.edicts.tick();
    expect(expiryWrites).toBe(1);
  });

  it("snapshot + hydrate round-trips an active edict", () => {
    const a = new World({ seed: 1 });
    a.state.day = 5;
    a.edicts.proclaim("open_court");
    const snap = a.edicts.snapshot();

    const b = new World({ seed: 1 });
    b.edicts.hydrate(snap);
    expect(b.edicts.status().active).toBe("open_court");
    expect(b.edictEffects.openCourt).toBe(true);
  });

  it("hydrate silently clears an unknown id (forward-compat for removed edicts)", () => {
    const w = new World({ seed: 1 });
    // Cast through unknown — deliberately simulating a save with a future id.
    w.edicts.hydrate({
      activeId: "future_removed_edict" as unknown as "hospitality",
      endsOnDay: 100,
    });
    expect(w.edicts.status().active).toBeNull();
    expect(w.edictEffects.hospitality).toBe(false);
  });

  it("Studious Edict + scholar seat stack to 2.25× tome production", () => {
    const w = new World({ seed: 1 });
    // Direct math probe of the multiplier — Economy.tick uses
    //   scholarMul = (scholarBonus ? 1.5 : 1) * (edictStudious ? 1.5 : 1).
    w.economy.scholarBonus = true;
    w.economy.edictStudious = true;
    const before = w.economy.state.tomes;
    w.economy.tick(1, 0, 0, 1); // 1 scholar, 1 sec
    const delta = w.economy.state.tomes - before;
    // Base rate = 0.02 * 1 = 0.02; with stacked bonus = 0.02 * 2.25 = 0.045.
    expect(delta).toBeCloseTo(0.045, 4);
  });

  it("Frugal Edict adds +25% to gold-per-ironwork output", () => {
    const w = new World({ seed: 1 });
    // Drive a known ore + smith combo, then compare with/without the edict.
    w.economy.state.ore = 100;
    const goldBefore = w.economy.state.gold;
    w.economy.tick(1, 0, 1, 0);
    const baseGain = w.economy.state.gold - goldBefore;

    // Reset and run with edict on
    const w2 = new World({ seed: 1 });
    w2.economy.state.ore = 100;
    w2.economy.state.gold = goldBefore;
    w2.economy.edictFrugal = true;
    w2.economy.tick(1, 0, 1, 0);
    const buffedGain = w2.economy.state.gold - goldBefore;
    expect(buffedGain).toBeCloseTo(baseGain * 1.25, 5);
  });

  it("EDICT_DEFS exposes exactly 4 entries with stable ids", () => {
    const ids = EDICT_DEFS.map((d) => d.id).sort();
    expect(ids).toEqual(["frugal", "hospitality", "open_court", "studious"]);
    for (const d of EDICT_DEFS) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.blurb.length).toBeGreaterThan(0);
      expect(d.proclamation.length).toBeGreaterThan(0);
      expect(d.expiry.length).toBeGreaterThan(0);
      expect(d.durationDays).toBeGreaterThan(0);
    }
  });
});
