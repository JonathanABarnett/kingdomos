import { useEffect, useMemo, useRef } from "react";
import type { Structure } from "../sim/types";
import type { World } from "../sim/World";
import { interiorFor, stationFor, stationLabel } from "../sim/Interiors";
import {
  INTERIOR_TILE_PX,
  bodyColorFor,
  drawNpcAt,
  drawRoom,
  drawStation,
} from "./interior-renderer";

/**
 * Modal interior view: click "step inside" on a structure inspector, this
 * opens. Shows the room layout, furniture, and every NPC who'd plausibly
 * be inside (residents whose home is here + workers whose work is here +
 * anyone currently within radius). Each NPC is placed at a station that
 * matches their role and current activity, deterministically.
 *
 * Read-only — closing reverts to the inspector. The sim continues to tick
 * underneath since the player can already see the world dim through the
 * overlay.
 */
export function InteriorView({
  structure,
  world,
  onClose,
}: {
  structure: Structure;
  world: World;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interior = useMemo(() => interiorFor(structure.kind), [structure.kind]);

  // Collect NPCs who'd be inside: residents + workers, plus anyone whose
  // position is currently within the building footprint. De-dup by id.
  const insideNpcs = useMemo(() => {
    const ids = new Set<string>();
    const out = [];
    for (const npc of world.npcs) {
      if (ids.has(npc.id)) continue;
      const matchesHome = npc.homeId === structure.id;
      const matchesWork = npc.workId === structure.id;
      const cx = structure.pos.x + structure.size.x / 2;
      const cy = structure.pos.y + structure.size.y / 2;
      const nearby = Math.hypot(npc.pos.x - cx, npc.pos.y - cy) < Math.max(structure.size.x, structure.size.y);
      if (matchesHome || matchesWork || nearby) {
        ids.add(npc.id);
        out.push(npc);
      }
    }
    // Cap at ~12 so the room doesn't get visually crowded
    return out.slice(0, 12);
  }, [world, structure]);

  // Compute station placements ONCE per render — deterministic per NPC id.
  const placements = useMemo(() => {
    const taken = new Set<number>();
    const out: Array<{ npcId: string; x: number; y: number; tag: string | "wander" }> = [];
    for (const npc of insideNpcs) {
      const { station, index } = stationFor(npc, structure, taken);
      if (station) {
        taken.add(index);
        out.push({ npcId: npc.id, x: station.x, y: station.y, tag: station.tag });
      } else {
        // Wander placement: drop into a free spot a row from the wall
        const fx = 1 + (hashCode(npc.id) % Math.max(1, interior.width - 2));
        const fy = interior.height - 2;
        out.push({ npcId: npc.id, x: fx, y: fy, tag: "wander" });
      }
    }
    return out;
  }, [insideNpcs, structure, interior]);

  // Draw whenever inputs change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const T = INTERIOR_TILE_PX;
    canvas.width = interior.width * T;
    canvas.height = interior.height * T;
    ctx.imageSmoothingEnabled = false;

    drawRoom(
      { ctx, tilePx: T },
      interior.width,
      interior.height,
      interior.floor,
      interior.floorAccent,
      interior.wall,
    );

    const hour = world.state.hour;
    // Decor + ambient stations first (under NPCs)
    for (const s of interior.stations) {
      drawStation({ ctx, tilePx: T, hour }, s, hour);
    }

    // Then NPCs at their placements (over furniture so they read as "at it")
    for (const p of placements) {
      const npc = insideNpcs.find((n) => n.id === p.npcId);
      if (!npc) continue;
      const [body, trim] = bodyColorFor(npc.role);
      drawNpcAt({ ctx, tilePx: T }, p.x, p.y, body, trim);
    }
  }, [interior, placements, insideNpcs, world.state.hour]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="interior-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="interior-title"
    >
      <div className="interior-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2 id="interior-title">Inside {structure.name}</h2>
            <div className="interior-mood">it feels {interior.mood} in here</div>
          </div>
          <button onClick={onClose} title="Close (Esc)" aria-label="Close interior view">
            ×
          </button>
        </header>

        <div className="interior-canvas-wrap">
          <canvas ref={canvasRef} className="interior-canvas" />
        </div>

        <section className="interior-roster">
          <h3>Inside right now · {insideNpcs.length}</h3>
          {insideNpcs.length === 0 ? (
            <p className="muted">Empty.</p>
          ) : (
            <ul>
              {placements.map((p) => {
                const npc = insideNpcs.find((n) => n.id === p.npcId);
                if (!npc) return null;
                return (
                  <li key={npc.id}>
                    <span className="roster-name">{npc.name ?? npc.role}</span>
                    <span className="roster-role">· {npc.role}</span>
                    <span className="roster-where">· {stationLabel(p.tag as never)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function hashCode(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
