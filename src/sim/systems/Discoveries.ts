import type { World } from "../World";
import type { Journal } from "./Journal";
import type { Structure, StructureKind } from "../types";

/**
 * Spontaneous map landmarks — discovered, not built.
 *
 * Different from Construction:
 *   - Construction = player decides + costs gold + takes days
 *   - Discoveries  = narrative-driven + free + appear instantly
 *
 * Cadence: at most one landmark per ~10 in-world days, gated by a small
 * per-day random chance. The first one can fire from day 8 onward —
 * gives a brand-new kingdom a couple of days before the world starts
 * "growing" around it.
 *
 * Each discovery picks an open plain/forest tile a few tiles outside any
 * existing structure, places a `Structure` there with a `kind` that maps
 * to one of the new landmark sprites in SpriteFactory, and writes a
 * journal entry pinned to it.
 *
 * The BorderLayer picks up the new structure automatically because it
 * iterates `world.map.structures` each frame and rebuilds its hull — so
 * the kingdom's outline naturally expands.
 *
 * Save: world.map.structures is rebuilt from seed on load, so we
 * snapshot the discovered ones separately (see Persistence.landmarks)
 * and re-place them in applySave.
 */

interface LandmarkDef {
  kind: StructureKind;
  /** Pretty name fragment used in journal entries — e.g. "shrine" */
  noun: string;
  /** Tile footprint */
  size: { x: number; y: number };
  /**
   * Flavor sentence pools. Pick one when the landmark is discovered.
   * `{noun}` and `{biome}` are substituted at write time.
   */
  openings: readonly string[];
}

const LANDMARK_DEFS: LandmarkDef[] = [
  {
    kind: "standing_stones",
    noun: "ring of standing stones",
    size: { x: 2, y: 2 },
    openings: [
      "Hunters returned with news of a {noun} on the {biome}'s edge — older than any kingdom anyone could name.",
      "A child pointed at the {biome} this morning. A {noun} stood where there had been only grass. No one quite remembered seeing it before.",
      "A scholar walked back from the {biome} pale and quiet, with a hand-drawn map of a {noun} no chronicle had ever recorded.",
    ],
  },
  {
    kind: "ruin",
    noun: "abandoned ruin",
    size: { x: 2, y: 2 },
    openings: [
      "Foragers stumbled on a {noun} half-buried in the {biome}. The stonework is old — the kind that predates the calendar.",
      "Wolves had made a den in a {noun} out past the {biome}. The hunters cleared them and made a quiet note of the find.",
      "A {noun} was rediscovered in the {biome} after a storm felled the trees that hid it. Moss has had centuries.",
    ],
  },
  {
    kind: "camp",
    noun: "travelers' camp",
    size: { x: 2, y: 2 },
    openings: [
      "A {noun} appeared in the {biome} overnight. The newcomers waved peaceably; the watch waved back.",
      "Two tents and a campfire — a {noun} settled at the edge of the {biome}, claiming nothing.",
      "A small {noun} took shape near the {biome}. The smoke from their fire rose in a thin, polite line.",
    ],
  },
  {
    kind: "wellspring",
    noun: "wellspring",
    size: { x: 2, y: 2 },
    openings: [
      "A {noun} was found in the {biome} — cold, clear, and inexplicably untouched. The diviners are quietly pleased.",
      "Cattle started gathering at a spot in the {biome}. The shepherds dug and found a {noun}. The water was good.",
      "A child swore she heard water under the {biome}. The {noun} she pointed to has been giving sweet water ever since.",
    ],
  },
  {
    kind: "obelisk",
    noun: "single tall obelisk",
    size: { x: 2, y: 3 },
    openings: [
      "A {noun} appeared in the {biome}. No mark on the stone matches any known glyph. The court is split between intrigue and unease.",
      "An old hunter has known the {noun} in the {biome} since they were small. The court has finally been told.",
      "A {noun} was uncovered when a flood receded in the {biome}. Whatever it commemorates, it is older than the river.",
    ],
  },
];

export class Discoveries {
  /** Day of the last discovery; gates the next one. */
  private lastDiscoveryDay = -1;
  private readonly minDaysBetween: number;
  private readonly baseChance: number;
  /** Counter for stable per-discovery ids ("landmark_1", "landmark_2", …). */
  private nextSeq = 1;

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
    opts: { minDaysBetween?: number; baseChance?: number; firstDay?: number } = {},
  ) {
    this.minDaysBetween = opts.minDaysBetween ?? 10;
    this.baseChance = opts.baseChance ?? 0.05;
    // Seed lastDiscoveryDay so the first fire isn't immediately on day 1.
    this.lastDiscoveryDay = (opts.firstDay ?? 8) - this.minDaysBetween;
  }

  /** Called on day rollover by World.tick. */
  tick(): void {
    const day = this.world.state.day;
    if (day - this.lastDiscoveryDay < this.minDaysBetween) return;
    if (this.rand() >= this.baseChance) return;

    const def = LANDMARK_DEFS[Math.floor(this.rand() * LANDMARK_DEFS.length)];
    const spot = this.pickSpot(def.size);
    if (!spot) return;

    this.lastDiscoveryDay = day;
    const id = `landmark_${this.nextSeq++}`;
    const name = capitalize(def.noun);

    // Add to the live map — this is enough for the renderer + BorderLayer
    // to pick it up on the next frame.
    const structure: Structure = {
      id,
      kind: def.kind,
      name,
      pos: { ...spot },
      size: { ...def.size },
    };
    this.world.map.structures.push(structure);
    this.world.map.landmarks.set(id, {
      x: spot.x + Math.floor(def.size.x / 2),
      y: spot.y + Math.floor(def.size.y / 2),
    });
    // Make the footprint walkable so NPCs can path past it
    for (let dy = 0; dy < def.size.y; dy++) {
      for (let dx = 0; dx < def.size.x; dx++) {
        const t = this.world.map.tiles[(spot.y + dy) * this.world.map.width + (spot.x + dx)];
        if (t) t.walkable = true;
      }
    }

    // Pick an opening + biome word and write the journal entry pinned to it
    const biome = this.biomeAt(spot.x, spot.y);
    const opening = def.openings[Math.floor(this.rand() * def.openings.length)]
      .replace("{noun}", def.noun)
      .replace("{biome}", biome);
    this.journal.write(opening, "milestone", id);
  }

  /**
   * Pick an open tile at least 5 tiles away from any existing structure,
   * within the map bounds, on a walkable plain/forest. Bails after 40
   * attempts so we never spin if the map is too crowded.
   */
  private pickSpot(size: { x: number; y: number }): { x: number; y: number } | null {
    const map = this.world.map;
    const minDist = 5;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = 2 + Math.floor(this.rand() * (map.width - size.x - 4));
      const y = 2 + Math.floor(this.rand() * (map.height - size.y - 4));
      // Check footprint is walkable + biome is plain or forest
      let ok = true;
      for (let dy = 0; dy < size.y && ok; dy++) {
        for (let dx = 0; dx < size.x && ok; dx++) {
          const t = map.tiles[(y + dy) * map.width + (x + dx)];
          if (!t) { ok = false; break; }
          if (t.kind !== "plain" && t.kind !== "forest" && t.kind !== "hill") { ok = false; break; }
        }
      }
      if (!ok) continue;
      // Check distance from other structures
      let tooClose = false;
      const cx = x + size.x / 2;
      const cy = y + size.y / 2;
      for (const s of map.structures) {
        const sx = s.pos.x + s.size.x / 2;
        const sy = s.pos.y + s.size.y / 2;
        if (Math.hypot(sx - cx, sy - cy) < minDist) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      return { x, y };
    }
    return null;
  }

  /** Best-guess biome word for a tile, for prose substitution. */
  private biomeAt(x: number, y: number): string {
    const t = this.world.map.tiles[y * this.world.map.width + x];
    if (!t) return "borderlands";
    switch (t.kind) {
      case "forest": return "wood";
      case "plain": return "meadow";
      case "hill": return "hill country";
      case "coast": return "coast";
      case "river": return "riverbank";
      case "mountain": return "mountainside";
      case "snow": return "snowfield";
      case "ocean": return "shore";
    }
  }

  /** UI/serialize: dump current landmarks. */
  snapshot(): Array<{ id: string; kind: StructureKind; name: string; pos: { x: number; y: number }; size: { x: number; y: number } }> {
    return this.world.map.structures
      .filter((s) => isLandmarkKind(s.kind))
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        name: s.name,
        pos: { ...s.pos },
        size: { ...s.size },
      }));
  }
}

const LANDMARK_KINDS = new Set<string>([
  "standing_stones",
  "ruin",
  "camp",
  "wellspring",
  "obelisk",
]);

export function isLandmarkKind(kind: string): boolean {
  return LANDMARK_KINDS.has(kind);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
