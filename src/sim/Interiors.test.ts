import { describe, expect, it } from "vitest";
import { interiorFor, stationFor, stationLabel } from "./Interiors";
import type { NPC, Structure, StructureKind } from "./types";

function fakeNpc(over: Partial<NPC> = {}): NPC {
  return {
    id: over.id ?? "npc_test",
    role: over.role ?? "villager",
    name: over.name ?? "Test",
    age: over.age ?? 30,
    pos: { x: 0, y: 0 },
    prevPos: { x: 0, y: 0 },
    facing: "s",
    homeId: "highkeep",
    workId: "highkeep",
    activity: over.activity ?? "idle",
    path: [],
    activityTimer: 0,
    seed: over.seed ?? 1,
    ...over,
  };
}

function fakeStructure(kind: StructureKind, id: string = "test"): Structure {
  return {
    id,
    kind,
    name: kind,
    pos: { x: 0, y: 0 },
    size: { x: 2, y: 2 },
  };
}

describe("Interiors data model", () => {
  it("provides an interior for every StructureKind", () => {
    const kinds: StructureKind[] = [
      "castle", "town", "library", "forge", "mine",
      "watchtower", "mill", "shrine",
      "standing_stones", "ruin", "camp", "wellspring", "obelisk",
    ];
    for (const k of kinds) {
      const interior = interiorFor(k);
      expect(interior).toBeDefined();
      expect(interior.width).toBeGreaterThan(2);
      expect(interior.height).toBeGreaterThan(2);
      expect(interior.stations.length).toBeGreaterThan(0);
    }
  });

  it("station positions are within the interior bounds", () => {
    const kinds: StructureKind[] = [
      "castle", "town", "library", "forge", "mine", "watchtower",
      "mill", "shrine", "standing_stones", "ruin", "camp", "wellspring", "obelisk",
    ];
    for (const k of kinds) {
      const interior = interiorFor(k);
      for (const s of interior.stations) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThan(interior.width);
        expect(s.y).toBeLessThan(interior.height);
      }
    }
  });

  it("stationFor places a blacksmith at the anvil in the forge", () => {
    const npc = fakeNpc({ role: "blacksmith", activity: "working" });
    const forge = fakeStructure("forge");
    const { station } = stationFor(npc, forge, new Set());
    expect(station).not.toBeNull();
    expect(station!.tag).toBe("anvil");
  });

  it("stationFor places a scholar at a scholar_desk in the library", () => {
    const npc = fakeNpc({ role: "scholar", activity: "working" });
    const lib = fakeStructure("library");
    const { station } = stationFor(npc, lib, new Set());
    expect(station).not.toBeNull();
    expect(station!.tag).toBe("scholar_desk");
  });

  it("stationFor places a monarch on the throne in the castle", () => {
    const npc = fakeNpc({ role: "monarch", activity: "idle" });
    const castle = fakeStructure("castle");
    const { station } = stationFor(npc, castle, new Set());
    expect(station).not.toBeNull();
    expect(station!.tag).toBe("throne");
  });

  it("stationFor puts a sleeping villager in a bed", () => {
    const npc = fakeNpc({ role: "villager", activity: "sleeping" });
    const cottage = fakeStructure("town");
    const { station } = stationFor(npc, cottage, new Set());
    expect(station).not.toBeNull();
    expect(station!.tag).toBe("bed");
  });

  it("stationFor is deterministic per (npc.id, taken-set)", () => {
    const npc = fakeNpc({ id: "npc_42", role: "blacksmith", activity: "working" });
    const forge = fakeStructure("forge");
    const a = stationFor(npc, forge, new Set());
    const b = stationFor(npc, forge, new Set());
    expect(a.index).toBe(b.index);
    expect(a.station?.x).toBe(b.station?.x);
    expect(a.station?.y).toBe(b.station?.y);
  });

  it("stationFor skips taken stations and finds a fallback", () => {
    const a = fakeNpc({ id: "a", role: "scholar", activity: "working" });
    const b = fakeNpc({ id: "b", role: "scholar", activity: "working" });
    const c = fakeNpc({ id: "c", role: "scholar", activity: "working" });
    const lib = fakeStructure("library");
    const taken = new Set<number>();
    const r1 = stationFor(a, lib, taken);
    if (r1.station) taken.add(r1.index);
    const r2 = stationFor(b, lib, taken);
    if (r2.station) taken.add(r2.index);
    // First two should land on the 2 scholar desks
    expect(r1.station?.tag).toBe("scholar_desk");
    expect(r2.station?.tag).toBe("scholar_desk");
    expect(r1.index).not.toBe(r2.index);
    // Third scholar — desks are taken; should get a fallback npcSlot OR null
    const r3 = stationFor(c, lib, taken);
    if (r3.station) {
      expect(taken.has(r3.index)).toBe(false);
    }
  });

  it("stationLabel returns a human-readable phrase for every tag", () => {
    const tags = [
      "anvil", "bellows", "forge_fire", "tools_rack", "throne",
      "court_table", "guard_post", "scholar_desk", "bookshelf",
      "candle", "hearth", "table", "bed", "loom", "mill_wheel",
      "ore_cart", "pickaxe_rack", "lantern", "watch_floor",
      "telescope", "altar", "kneeler", "campfire", "tent",
      "stone", "obelisk_face", "well_mouth", "ruin_arch", "wander",
    ] as const;
    for (const t of tags) {
      const label = stationLabel(t);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain("undefined");
    }
  });
});
