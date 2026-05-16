/**
 * NPC personality traits — small flavor data attached to every NPC at spawn.
 * Deterministic given the NPC's seed, so a kingdom regenerated from the same
 * seed always produces the same personalities.
 *
 * Traits are used by:
 *   - Journal (when narrating an NPC's life event, vary the verb)
 *   - NpcInspect tooltip ("Berta · the Smith · joyful")
 *   - Future: speech bubble content, decision dialog flavor
 */

import type { NPCTrait } from "../types";

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

export function traitFor(seed: number): NPCTrait {
  // Mulberry-style hash → bucket
  let s = seed >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  const idx = ((s ^ (s >>> 14)) >>> 0) % ALL_TRAITS.length;
  return ALL_TRAITS[idx];
}

/**
 * Three epithets per trait. The journal picks one deterministically for each
 * NPC via `epithetFor(trait, seed)` — same (trait, seed) always produces the
 * same descriptor, so a saved kingdom's journal phrasings round-trip cleanly.
 *
 * Why three: with one epithet per trait, a kingdom of 30 NPCs across 8 traits
 * had every "joyful" villager described as "ever-cheerful" and every "grim"
 * one as "always-serious". Three variants gives a typical roster 3-4
 * distinct flavors per trait — enough to feel populated rather than templated.
 */
export const EPITHET_VARIANTS: Record<NPCTrait, readonly string[]> = {
  joyful: ["ever-cheerful", "easily-amused", "open-faced"],
  grim: ["always-serious", "tight-lipped", "hard-eyed"],
  curious: ["ever-questioning", "wide-eyed", "always-asking"],
  stoic: ["quiet", "stone-still", "unflinching"],
  kind: ["soft-spoken", "open-handed", "warm-hearted"],
  ambitious: ["restless", "high-eyed", "never-satisfied"],
  anxious: ["watchful", "fretful", "easily-startled"],
  wise: ["old-souled", "long-thinking", "deep-spoken"],
};

/**
 * Deterministic epithet pick for an NPC given their trait + seed. Uses the
 * same mulberry-style hash flow as `traitFor` (with a different mix
 * constant) so it's reproducible across save/load and the same NPC never
 * silently changes descriptor between sessions.
 */
export function epithetFor(trait: NPCTrait, seed: number): string {
  const pool = EPITHET_VARIANTS[trait];
  let s = (seed ^ 0xcafebabe) >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  const idx = ((s ^ (s >>> 14)) >>> 0) % pool.length;
  return pool[idx];
}

/**
 * Backward-compat: the first variant of each pool. Existing call sites that
 * read by trait alone (no seed handy) still get a sensible default. New
 * callers should prefer `epithetFor(trait, seed)` for variety.
 */
export const TRAIT_EPITHET: Record<NPCTrait, string> = Object.fromEntries(
  Object.entries(EPITHET_VARIANTS).map(([k, v]) => [k, v[0]]),
) as Record<NPCTrait, string>;
