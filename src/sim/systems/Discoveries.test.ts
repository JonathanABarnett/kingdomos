import { describe, expect, it } from "vitest";
import { World } from "../World";
import { Discoveries, isLandmarkKind } from "./Discoveries";

function makeWorld(seed = 42) {
  const w = new World({ seed });
  return w;
}

describe("Discoveries", () => {
  it("isLandmarkKind correctly identifies the 5 landmark types", () => {
    expect(isLandmarkKind("standing_stones")).toBe(true);
    expect(isLandmarkKind("ruin")).toBe(true);
    expect(isLandmarkKind("camp")).toBe(true);
    expect(isLandmarkKind("wellspring")).toBe(true);
    expect(isLandmarkKind("obelisk")).toBe(true);
    // Non-landmarks
    expect(isLandmarkKind("castle")).toBe(false);
    expect(isLandmarkKind("town")).toBe(false);
    expect(isLandmarkKind("watchtower")).toBe(false);
    expect(isLandmarkKind("nonsense")).toBe(false);
  });

  it("respects minDaysBetween — won't fire twice in a row", () => {
    const w = makeWorld();
    const d = new Discoveries(w, w.journal, () => 0.001, {
      minDaysBetween: 10,
      baseChance: 1.0,
      firstDay: 1,
    });
    w.state.day = 11; // gap of 11 from firstDay-minDaysBetween satisfies the gate
    const before = w.map.structures.length;
    d.tick();
    expect(w.map.structures.length).toBe(before + 1);
    // Try the very next day — should NOT fire
    w.state.day = 12;
    d.tick();
    expect(w.map.structures.length).toBe(before + 1);
  });

  it("fires a discovery + journal entry + pin target", () => {
    const w = makeWorld();
    const d = new Discoveries(w, w.journal, () => 0.001, {
      minDaysBetween: 1,
      baseChance: 1.0,
      firstDay: 1,
    });
    const milestones: Array<{ text: string; targetStructureId?: string }> = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone") {
        milestones.push({ text: e.text, targetStructureId: e.targetStructureId });
      }
    };
    w.state.day = 15;
    d.tick();
    expect(milestones.length).toBe(1);
    expect(milestones[0].targetStructureId).toBeTruthy();
    expect(milestones[0].targetStructureId).toMatch(/^landmark_/);
    // The new structure exists in world.map.structures with that id
    const added = w.map.structures.find((s) => s.id === milestones[0].targetStructureId);
    expect(added).toBeDefined();
    expect(isLandmarkKind(added!.kind)).toBe(true);
  });

  it("placed landmarks are at least 5 tiles from any pre-existing structure", () => {
    const w = makeWorld();
    const d = new Discoveries(w, w.journal, () => 0.001, {
      minDaysBetween: 1,
      baseChance: 1.0,
      firstDay: 1,
    });
    const existing = w.map.structures.slice();
    w.state.day = 20;
    d.tick();
    const newOnes = w.map.structures.filter((s) => !existing.includes(s));
    expect(newOnes.length).toBe(1);
    const n = newOnes[0];
    const cx = n.pos.x + n.size.x / 2;
    const cy = n.pos.y + n.size.y / 2;
    for (const e of existing) {
      const ex = e.pos.x + e.size.x / 2;
      const ey = e.pos.y + e.size.y / 2;
      const dist = Math.hypot(ex - cx, ey - cy);
      expect(dist).toBeGreaterThanOrEqual(5);
    }
  });

  it("placed landmarks have walkable footprints", () => {
    const w = makeWorld();
    const d = new Discoveries(w, w.journal, () => 0.001, {
      minDaysBetween: 1,
      baseChance: 1.0,
      firstDay: 1,
    });
    w.state.day = 25;
    d.tick();
    const lm = w.map.structures.filter((s) => s.id.startsWith("landmark_"))[0];
    expect(lm).toBeDefined();
    for (let dy = 0; dy < lm.size.y; dy++) {
      for (let dx = 0; dx < lm.size.x; dx++) {
        const t = w.map.tiles[(lm.pos.y + dy) * w.map.width + (lm.pos.x + dx)];
        expect(t?.walkable).toBe(true);
      }
    }
  });

  it("snapshot returns only landmark-kind structures", () => {
    const w = makeWorld();
    const d = new Discoveries(w, w.journal, () => 0.001, {
      minDaysBetween: 1,
      baseChance: 1.0,
      firstDay: 1,
    });
    w.state.day = 15;
    d.tick();
    const snap = d.snapshot();
    // Should contain just the one we placed
    expect(snap.length).toBe(1);
    expect(isLandmarkKind(snap[0].kind)).toBe(true);
    // Should NOT include castle/town/etc
    for (const item of snap) {
      expect(["castle", "town", "library", "forge", "mine"]).not.toContain(item.kind);
    }
  });

  it("doesn't fire on its very first call before firstDay", () => {
    const w = makeWorld();
    const d = new Discoveries(w, w.journal, () => 0.001, {
      minDaysBetween: 10,
      baseChance: 1.0,
      firstDay: 8,
    });
    const before = w.map.structures.length;
    w.state.day = 5; // before firstDay
    d.tick();
    expect(w.map.structures.length).toBe(before);
  });
});
