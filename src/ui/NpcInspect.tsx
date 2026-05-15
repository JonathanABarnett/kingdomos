import { useEffect, useState } from "react";
import type { World } from "../sim/World";
import type { NPC } from "../sim/types";
import { setHoveredNpc } from "../engine/HoverState";

interface HoverState {
  npc: NPC;
  partner?: NPC | null;
  parents?: NPC[];
  screen: { x: number; y: number };
}

/**
 * Hover-over-NPC tooltip. Reads mouse position vs pixi canvas, looks up the
 * nearest NPC in world-space, and renders a tiny info card next to the cursor.
 *
 * Cheap: only computes on mousemove, and only re-renders when the nearest NPC
 * changes identity. Doesn't touch the pixi stage at all — works purely from
 * canvas coordinates and the camera transform.
 */
export function NpcInspect({
  getCanvas,
  getCamera,
  getWorld,
}: {
  getCanvas: () => HTMLCanvasElement | null;
  getCamera: () => { x: number; y: number; zoom: number } | null;
  getWorld: () => World | null;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    let raf = 0;
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const canvas = getCanvas();
        const cam = getCamera();
        const world = getWorld();
        if (!canvas || !cam || !world) {
          setHover(null);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        if (px < 0 || py < 0 || px > rect.width || py > rect.height) {
          setHover(null);
          return;
        }
        // map screen → tile-space
        const T = 32;
        const tileX = (px - rect.width / 2) / (T * cam.zoom) + cam.x;
        const tileY = (py - rect.height / 2) / (T * cam.zoom) + cam.y;
        // find nearest NPC within ~1 tile. NPCs are visually offset by a
        // deterministic per-seed amount (see EntityLayer.update) so the
        // sprite the cursor is over isn't at npc.pos but at npc.pos + offset.
        // Apply the same offset here so the hover lands on the right NPC
        // when several share a tile.
        let best: NPC | null = null;
        let bestDist = 1.2;
        for (const n of world.npcs) {
          const ox = (hashOffset01(n.seed) - 0.5) * 0.6;
          const oy = (hashOffset01(n.seed * 7919) - 0.5) * 0.35;
          const dx = n.pos.x + ox - tileX;
          const dy = n.pos.y + oy - tileY;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) {
            best = n;
            bestDist = d;
          }
        }
        if (!best) {
          setHover(null);
          setHoveredNpc(null);
          return;
        }
        const partner = best.partnerId
          ? world.npcs.find((n) => n.id === best!.partnerId) ?? null
          : null;
        const parents: NPC[] = [];
        if (best.parentIds) {
          for (const pid of best.parentIds) {
            const p = world.npcs.find((n) => n.id === pid);
            if (p) parents.push(p);
          }
        }
        setHover({
          npc: best,
          partner,
          parents: parents.length ? parents : undefined,
          screen: { x: ev.clientX + 14, y: ev.clientY + 14 },
        });
        setHoveredNpc(best.id);
      });
    };
    const onLeave = () => {
      setHover(null);
      setHoveredNpc(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [getCanvas, getCamera, getWorld]);

  if (!hover) return null;
  const { npc, partner, parents, screen } = hover;
  return (
    <div
      className="npc-tooltip"
      style={{ left: screen.x, top: screen.y }}
      role="tooltip"
    >
      <div className="npc-name">{npc.name ?? `(unnamed ${npc.role})`}</div>
      <div className="npc-role">
        {npc.role} · age {Math.floor(npc.age ?? 0)}
        {npc.trait && <> · <span className="npc-trait">{npc.trait}</span></>}
      </div>
      <div className="npc-home">lives in {pretty(npc.homeId)}</div>
      {partner && <div className="npc-partner">wed to {partner.name}</div>}
      {parents && parents.length > 0 && (
        <div className="npc-parents">
          child of {parents.map((p) => p.name).filter(Boolean).join(" and ")}
        </div>
      )}
      {npc.speech && <div className="npc-speech">"{npc.speech}"</div>}
    </div>
  );
}

function pretty(id: string) {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "the kingdom";
}

/**
 * Match EntityLayer's hash01 — keeps hover detection in lockstep with the
 * deterministic per-seed sub-tile offsets the renderer applies to NPCs.
 */
function hashOffset01(n: number): number {
  let x = (n | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}
