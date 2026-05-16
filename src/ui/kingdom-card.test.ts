import { describe, expect, it } from "vitest";
import type { SavedJournalEntry } from "../sim/Persistence";
import {
  pickCardMilestones,
  trimMilestoneLine,
  composeCardInput,
  cardFilename,
} from "./kingdom-card-data";
import { drawKingdomCard } from "./kingdom-card-renderer";

function entry(
  text: string,
  kind: SavedJournalEntry["kind"],
  i: number,
): SavedJournalEntry {
  return {
    id: `j_${i}`,
    day: i,
    year: 1,
    season: "spring",
    text,
    kind,
  };
}

describe("pickCardMilestones", () => {
  it("returns empty array on empty journal", () => {
    expect(pickCardMilestones([])).toEqual([]);
  });

  it("filters out system + weather entries", () => {
    const j: SavedJournalEntry[] = [
      entry("dawn", "system", 0),
      entry("rain came", "weather", 1),
      entry("a wedding", "life", 2),
    ];
    expect(pickCardMilestones(j, 5)).toEqual(["a wedding"]);
  });

  it("prefers milestones over life over events", () => {
    const j: SavedJournalEntry[] = [
      entry("event-line", "event", 0),
      entry("life-line", "life", 1),
      entry("milestone-line", "milestone", 2),
    ];
    // Within the cap, all three appear; chronological order (oldest first).
    expect(pickCardMilestones(j, 3)).toEqual(["event-line", "life-line", "milestone-line"]);
  });

  it("caps to `max`, picking the highest-rank-and-most-recent entries", () => {
    const j: SavedJournalEntry[] = [
      entry("old-event", "event", 0),
      entry("old-life", "life", 1),
      entry("new-event", "event", 2),
      entry("milestone-A", "milestone", 3),
      entry("milestone-B", "milestone", 4),
      entry("milestone-C", "milestone", 5),
    ];
    // With max=3 we should keep the three milestones; chronological output.
    expect(pickCardMilestones(j, 3)).toEqual([
      "milestone-A",
      "milestone-B",
      "milestone-C",
    ]);
  });

  it("when milestones don't fill the cap, fills from life then event", () => {
    const j: SavedJournalEntry[] = [
      entry("event-1", "event", 0),
      entry("life-1", "life", 1),
      entry("milestone-1", "milestone", 2),
    ];
    // All three should appear, ordered chronologically.
    expect(pickCardMilestones(j, 5)).toEqual(["event-1", "life-1", "milestone-1"]);
  });

  it("does not blow up if `max` exceeds journal length", () => {
    const j: SavedJournalEntry[] = [entry("only-milestone", "milestone", 0)];
    expect(pickCardMilestones(j, 100)).toEqual(["only-milestone"]);
  });
});

describe("trimMilestoneLine", () => {
  it("returns the input unchanged when shorter than the budget", () => {
    expect(trimMilestoneLine("short line", 90)).toBe("short line");
  });

  it("truncates long lines at a word boundary and appends an ellipsis", () => {
    const long = "the brave courier rode all night through the mountains and arrived at dawn with both saddlebags full";
    const out = trimMilestoneLine(long, 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(50);
    // The body before "…" must be a prefix of the original (no cleaved words).
    const body = out.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    // The character at the cut point in the original must be a word-boundary
    // (i.e. a space) — confirms we trimmed mid-gap, not mid-token.
    expect(long.charAt(body.length)).toBe(" ");
  });

  it("strips trailing punctuation before the ellipsis", () => {
    const long = "the third anniversary of the kingdom was marked with bells and—a quiet feast under banners.";
    const out = trimMilestoneLine(long, 60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/[.,;:—–-]…$/);
  });

  it("handles a line one character over budget cleanly", () => {
    const text = "a".repeat(91);
    const out = trimMilestoneLine(text, 90);
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("composeCardInput", () => {
  it("threads identity + state into the input record", () => {
    const j: SavedJournalEntry[] = [
      entry("the kingdom was founded", "milestone", 0),
    ];
    const input = composeCardInput({
      kingdomName: "Aurelia",
      monarchName: "Elara",
      petName: "Biscuit",
      bannerColor: "#b45309",
      day: 47,
      year: 2,
      generation: 1,
      journal: j,
    });
    expect(input.kingdomName).toBe("Aurelia");
    expect(input.monarchName).toBe("Elara");
    expect(input.petName).toBe("Biscuit");
    expect(input.day).toBe(47);
    expect(input.year).toBe(2);
    expect(input.generation).toBe(1);
    expect(input.milestones).toEqual(["the kingdom was founded"]);
  });

  it("applies maxLineChars to every milestone", () => {
    const longLine = "x".repeat(200);
    const j: SavedJournalEntry[] = [entry(longLine, "milestone", 0)];
    const input = composeCardInput({
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#000000",
      day: 1,
      year: 1,
      generation: 1,
      journal: j,
      maxLineChars: 60,
    });
    expect(input.milestones[0].length).toBeLessThanOrEqual(60);
    expect(input.milestones[0].endsWith("…")).toBe(true);
  });
});

describe("cardFilename", () => {
  it("produces a URL-safe filename", () => {
    expect(cardFilename("Aurelia", 47, 2)).toBe("aurelia-y2d47-card.png");
  });

  it("strips non-alphanumeric characters and collapses runs", () => {
    expect(cardFilename("New Kingdom!! @home", 1, 1)).toBe("new-kingdom-home-y1d1-card.png");
  });

  it("falls back to 'kingdom' when the name is purely punctuation", () => {
    expect(cardFilename("!!!", 1, 1)).toBe("kingdom-y1d1-card.png");
  });
});

// ── Renderer smoke test ────────────────────────────────────────────────
//
// The renderer is mostly mechanical Canvas2D drawing — we don't pixel-test
// it. We DO want to confirm it doesn't throw on any of the shapes the data
// layer produces, including degenerate ones (no milestones, weird hex, etc).

interface MockCtx {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  calls: Array<{ method: string; args: unknown[] }>;
}

function makeMockCtx(): MockCtx & CanvasRenderingContext2D {
  const mock: MockCtx = {
    imageSmoothingEnabled: true,
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    calls: [],
  };
  const record = (method: string) => (...args: unknown[]) => {
    mock.calls.push({ method, args });
    if (method === "createLinearGradient" || method === "createRadialGradient") {
      // Return a fake gradient with addColorStop
      return { addColorStop: () => {} };
    }
    if (method === "measureText") return { width: 100 };
  };
  const handler: ProxyHandler<MockCtx> = {
    get(t, p: string) {
      if (p in t) return (t as unknown as Record<string, unknown>)[p];
      return record(p);
    },
    set(t, p: string, v) {
      (t as unknown as Record<string, unknown>)[p] = v;
      return true;
    },
  };
  return new Proxy(mock, handler) as unknown as MockCtx & CanvasRenderingContext2D;
}

describe("drawKingdomCard (smoke)", () => {
  it("draws without throwing on a complete input", () => {
    const ctx = makeMockCtx();
    expect(() => {
      drawKingdomCard(ctx, {
        kingdomName: "Aurelia",
        monarchName: "Elara",
        petName: "Biscuit",
        bannerColor: "#b45309",
        day: 47,
        year: 2,
        generation: 1,
        milestones: ["the kingdom was founded", "a wedding at Highkeep"],
      });
    }).not.toThrow();
    expect(ctx.calls.length).toBeGreaterThan(10);
    // Confirm some headline text actually went through fillText.
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t.includes("Aurelia"))).toBe(true);
    expect(filled.some((t) => t.includes("Elara"))).toBe(true);
    expect(filled.some((t) => t.includes("Day 47"))).toBe(true);
  });

  it("renders a fallback line when milestones are empty", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "New",
      monarchName: "X",
      bannerColor: "#b45309",
      day: 1,
      year: 1,
      generation: 1,
      milestones: [],
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t.toLowerCase().includes("chronicle is young"))).toBe(true);
  });

  it("falls back gracefully on an invalid banner color", () => {
    const ctx = makeMockCtx();
    expect(() => {
      drawKingdomCard(ctx, {
        kingdomName: "K",
        monarchName: "M",
        bannerColor: "not-a-hex",
        day: 1,
        year: 1,
        generation: 1,
        milestones: ["one"],
      });
    }).not.toThrow();
  });
});
