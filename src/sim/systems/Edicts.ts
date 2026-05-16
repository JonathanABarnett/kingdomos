/**
 * Royal Edicts — short-term player-driven decrees with real mechanical bite.
 *
 * Each edict is a 7-day buff the player issues from Settings. Only one edict
 * is active at a time (cost: an edict is a commitment, not a side dish), and
 * it auto-expires after its duration. The world keeps a tiny `edictEffects`
 * struct mirroring which flags are currently on; consumers (Economy,
 * NarrativeDirector, Decisions, Threats) read those flags the same way they
 * read `courtEffects`.
 *
 * Why a separate system from court roles:
 *   - Court seats are PASSIVE — a monarch picks an advisor once and forgets
 *     about them; the bonus is structural.
 *   - Edicts are ACTIVE — the player makes a deliberate, time-limited choice
 *     and the kingdom reacts visibly (a journal entry on proclamation +
 *     another when the decree expires).
 *   - Both can stack. Seating a Scholar AND proclaiming the Studious Edict
 *     gives 2.25× tome production, which is the right "high points of a
 *     long reign" feel.
 *
 * Mechanic intentionally cozy: no penalties, no NPC anger, no failure state.
 * The player can always revoke early via Settings.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";

export type EdictId = "hospitality" | "studious" | "frugal" | "open_court";

export interface EdictDef {
  id: EdictId;
  label: string;
  /** Short blurb shown in the picker. */
  blurb: string;
  /** Default duration in in-world days. */
  durationDays: number;
  /** Journal text written when this edict is proclaimed. {monarch} is filled. */
  proclamation: string;
  /** Journal text written when this edict's duration runs out (natural expiry). */
  expiry: string;
}

export const EDICT_DEFS: ReadonlyArray<EdictDef> = [
  {
    id: "hospitality",
    label: "Edict of Hospitality",
    blurb: "Travelers arrive more often. The roads stay warm.",
    durationDays: 7,
    proclamation:
      "By royal proclamation, the kingdom opened its gates a little wider this week. Hospitality is decreed.",
    expiry:
      "The Edict of Hospitality lapsed at dawn. The gates close at their accustomed hour again.",
  },
  {
    id: "studious",
    label: "Edict of Letters",
    blurb: "+50% tome production for seven days.",
    durationDays: 7,
    proclamation:
      "By royal proclamation, candles in the scriptorium are to burn through the night. The Edict of Letters is in force.",
    expiry:
      "The Edict of Letters ended. The scriptorium's lamps were dimmed to their usual count.",
  },
  {
    id: "frugal",
    label: "Edict of Thrift",
    blurb: "Gold accumulates +25% for seven days.",
    durationDays: 7,
    proclamation:
      "By royal proclamation, every transaction in the realm is to be taxed lightly and ledgered well. The Edict of Thrift is in force.",
    expiry:
      "The Edict of Thrift expired. The treasurer set down the ledger and rubbed her eyes.",
  },
  {
    id: "open_court",
    label: "Edict of an Open Court",
    blurb: "Royal decisions linger longer before defaulting.",
    durationDays: 7,
    proclamation:
      "By royal proclamation, the doors of the keep will stand open to petitioners until the great bell at dusk. An Open Court is decreed.",
    expiry:
      "The Edict of an Open Court ended. The keep's doors closed at their accustomed hour.",
  },
];

/**
 * Live effect mirror, read by consumer systems. Always reflects the currently
 * active edict (or all-false when none).
 */
export interface EdictEffects {
  hospitality: boolean;
  studious: boolean;
  frugal: boolean;
  openCourt: boolean;
}

export interface EdictSnapshot {
  activeId: EdictId | null;
  endsOnDay: number;
}

export class Edicts {
  private active: EdictId | null = null;
  private endsOnDay = 0;
  /** Last day we ran the auto-expiry check; avoids double-firing on a single day. */
  private lastCheckedDay = -1;

  constructor(private world: World, private journal: Journal) {}

  /**
   * Public read for UI consumers. Returns the current active edict + the
   * remaining day count (0 if nothing's active).
   */
  status(): { active: EdictId | null; daysLeft: number } {
    if (!this.active) return { active: null, daysLeft: 0 };
    const daysLeft = Math.max(0, this.endsOnDay - this.world.state.day);
    return { active: this.active, daysLeft };
  }

  /**
   * Issue an edict. Replaces any currently-active one (the kingdom can only
   * focus on one royal priority at a time). Returns true on success, false
   * if the id is unknown.
   */
  proclaim(id: EdictId): boolean {
    const def = EDICT_DEFS.find((d) => d.id === id);
    if (!def) return false;
    // If we already had something active, write a tiny note for the swap so
    // the journal reads honestly ("the previous decree was rescinded").
    if (this.active && this.active !== id) {
      this.journal.write(
        `The previous edict was rescinded; the throne turned to other matters.`,
        "event",
      );
    }
    this.active = id;
    this.endsOnDay = this.world.state.day + def.durationDays;
    this.applyEffects();
    this.journal.write(def.proclamation, "milestone");
    return true;
  }

  /** Revoke the active edict early. Writes a short journal note. */
  revoke(): void {
    if (!this.active) return;
    this.journal.write(
      `The active edict was rescinded by royal decision.`,
      "event",
    );
    this.active = null;
    this.endsOnDay = 0;
    this.applyEffects();
  }

  /**
   * Called from World.tick once per in-world day. Expires the active edict
   * if its window has elapsed, writing the corresponding journal line.
   */
  tick(): void {
    const day = this.world.state.day;
    if (day === this.lastCheckedDay) return;
    this.lastCheckedDay = day;
    if (!this.active) return;
    if (day >= this.endsOnDay) {
      const def = EDICT_DEFS.find((d) => d.id === this.active);
      this.active = null;
      this.endsOnDay = 0;
      this.applyEffects();
      if (def) this.journal.write(def.expiry, "event");
    }
  }

  /** Mirror the live `active` id into `world.edictEffects` flags. */
  private applyEffects(): void {
    const eff = this.world.edictEffects;
    eff.hospitality = this.active === "hospitality";
    eff.studious = this.active === "studious";
    eff.frugal = this.active === "frugal";
    eff.openCourt = this.active === "open_court";
    // Plumb directly into Economy + NarrativeDirector for fields they own.
    // (Quests + Threats read world.edictEffects.openCourt themselves at the
    // moment they propose a decision, so no setter needed there.)
    this.world.economy.edictStudious = eff.studious;
    this.world.economy.edictFrugal = eff.frugal;
    this.world.director.hospitalityBonus = eff.hospitality;
  }

  snapshot(): EdictSnapshot {
    return { activeId: this.active, endsOnDay: this.endsOnDay };
  }

  hydrate(snap: EdictSnapshot | undefined): void {
    if (!snap) return;
    // Validate the active id against the known set; silently clear if a
    // future save references an edict we've since removed.
    const known = EDICT_DEFS.some((d) => d.id === snap.activeId);
    if (snap.activeId && known) {
      this.active = snap.activeId;
      this.endsOnDay = Math.max(0, Math.floor(snap.endsOnDay));
    } else {
      this.active = null;
      this.endsOnDay = 0;
    }
    this.applyEffects();
  }
}
