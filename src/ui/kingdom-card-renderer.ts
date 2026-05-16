/**
 * Canvas2D renderer for the Kingdom Card.
 *
 * Takes a composed `KingdomCardInput` and draws a 1200×630 composition. The
 * template system is intentionally extensible — pass 1 ships a single
 * "parchment" template; later passes add "heraldic" and "modern".
 *
 * The renderer is parameterized by a `CanvasRenderingContext2D` so callers
 * can hand in either a real canvas (browser) or a spy (tests). Layout
 * mirrors the chronicle's voice: warm sepia, serif headings, modest
 * footer wordmark — the kind of image a player would actually post.
 */

import type { KingdomCardInput } from "./kingdom-card-data";
import { CARD_WIDTH, CARD_HEIGHT, trimMilestoneLine } from "./kingdom-card-data";

export type CardTemplate = "parchment";

export interface RenderOpts {
  template?: CardTemplate;
  /**
   * 32×32 source canvas/image of the monarch sprite (drawn via the engine's
   * CharacterRenderer). Renderer will up-scale and place on the card. Pass
   * `undefined` (e.g. in tests) to skip the portrait inset.
   */
  monarchSprite?: CanvasImageSource;
  /** 32×32 pet sprite, same contract as `monarchSprite`. */
  petSprite?: CanvasImageSource;
}

/**
 * Draw a full Kingdom Card onto the given 2D context. The context's surface
 * must be at least CARD_WIDTH × CARD_HEIGHT — callers should size their
 * canvas before invoking.
 */
export function drawKingdomCard(
  ctx: CanvasRenderingContext2D,
  input: KingdomCardInput,
  opts: RenderOpts = {},
): void {
  const template = opts.template ?? "parchment";
  ctx.imageSmoothingEnabled = false;

  switch (template) {
    case "parchment":
      drawParchmentTemplate(ctx, input);
      break;
  }
  // Sprites layer on top — same for every template, anchored bottom-right.
  if (opts.monarchSprite || opts.petSprite) {
    drawPortraitInset(ctx, input, opts);
  }
}

/**
 * Bottom-right portrait inset. Shows the monarch (3× scale) with the pet
 * (2× scale) standing alongside, on a small parchment-tinted mat trimmed
 * with the kingdom's banner color. The inset's job is to make the card
 * feel like *your* kingdom rather than a generic export.
 */
function drawPortraitInset(
  ctx: CanvasRenderingContext2D,
  input: KingdomCardInput,
  opts: RenderOpts,
): void {
  // Inset geometry. 200×130 plate anchored to the bottom-right, leaving room
  // for the wordmark below it. Within the plate: monarch on the left at 3×
  // scale (96×96), pet on the right at 2× scale (64×64).
  const plateW = 200;
  const plateH = 130;
  const plateX = CARD_WIDTH - plateW - 80;
  const plateY = CARD_HEIGHT - plateH - 80;

  // Plate background — slightly darker parchment with the banner-color trim.
  ctx.fillStyle = "rgba(245, 200, 130, 0.9)";
  ctx.fillRect(plateX, plateY, plateW, plateH);
  // Inner highlight rim
  ctx.fillStyle = "rgba(255, 240, 190, 0.6)";
  ctx.fillRect(plateX, plateY, plateW, 2);
  ctx.fillRect(plateX, plateY, 2, plateH);
  // Banner-color trim (bottom + right) — gives it a coin/medallion feel
  ctx.fillStyle = safeHex(input.bannerColor, "#b45309");
  ctx.fillRect(plateX, plateY + plateH - 4, plateW, 4);
  ctx.fillRect(plateX + plateW - 4, plateY, 4, plateH);

  // Monarch — 3× scale (96×96) on the left of the plate.
  ctx.imageSmoothingEnabled = false;
  if (opts.monarchSprite) {
    ctx.drawImage(opts.monarchSprite, plateX + 12, plateY + 12, 96, 96);
  }
  // Pet — 2× scale (64×64) on the right, baseline-aligned with the monarch.
  if (opts.petSprite) {
    ctx.drawImage(opts.petSprite, plateX + plateW - 76, plateY + 48, 64, 64);
  }

  // Small caption below the plate: "long may they reign" — tasteful, optional.
  ctx.fillStyle = "rgba(80, 40, 15, 0.7)";
  ctx.font = "italic 16px 'Georgia', 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const captionY = plateY + plateH + 22;
  const reignCaption = input.petName
    ? `${input.monarchName} & ${input.petName}`
    : `${input.monarchName}, sovereign`;
  ctx.fillText(reignCaption, plateX + plateW / 2, captionY, plateW);
}

// ── Templates ──────────────────────────────────────────────────────────

function drawParchmentTemplate(ctx: CanvasRenderingContext2D, input: KingdomCardInput): void {
  // Background — warm sepia gradient with a soft burned-edge vignette.
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bgGrad.addColorStop(0, "#fde68a");
  bgGrad.addColorStop(1, "#fbcf6e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Mottling — deterministic so the same kingdom always renders identically.
  // Uses a tiny LCG seeded off the kingdom name + day so a fresh card never
  // looks the same as the previous one, but a re-render of the same card
  // does.
  const seed = hashSeed(`${input.kingdomName}|${input.day}|${input.year}`);
  const rng = mulberry32(seed);
  for (let i = 0; i < 80; i++) {
    const x = rng() * CARD_WIDTH;
    const y = rng() * CARD_HEIGHT;
    const w = 2 + rng() * 12;
    ctx.fillStyle = `rgba(120, 53, 15, ${0.03 + rng() * 0.06})`;
    ctx.fillRect(x, y, w, 1);
  }

  // Vignette
  const vGrad = ctx.createRadialGradient(
    CARD_WIDTH / 2, CARD_HEIGHT / 2, 100,
    CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH * 0.65,
  );
  vGrad.addColorStop(0, "rgba(0,0,0,0)");
  vGrad.addColorStop(1, "rgba(80, 40, 15, 0.45)");
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Banner stripe along the top — uses the player's chosen banner color.
  const stripeY = 60;
  const stripeH = 8;
  ctx.fillStyle = safeHex(input.bannerColor, "#b45309");
  ctx.fillRect(60, stripeY, CARD_WIDTH - 120, stripeH);
  // A subtle shadow under the stripe
  ctx.fillStyle = "rgba(40, 20, 10, 0.18)";
  ctx.fillRect(60, stripeY + stripeH, CARD_WIDTH - 120, 2);

  // Kingdom name — big serif, centered, sepia-on-cream.
  ctx.fillStyle = "#5b2a08";
  ctx.font = "bold 88px 'Georgia', 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Kingdom of ${input.kingdomName}`, CARD_WIDTH / 2, 150, CARD_WIDTH - 160);

  // Subtitle — monarch line.
  ctx.fillStyle = "#7c2d12";
  ctx.font = "italic 32px 'Georgia', 'Times New Roman', serif";
  const subtitle = `under ${input.monarchName} · Generation ${input.generation}`;
  ctx.fillText(subtitle, CARD_WIDTH / 2, 215, CARD_WIDTH - 160);

  // Divider rule
  ctx.fillStyle = "rgba(120, 53, 15, 0.5)";
  ctx.fillRect(CARD_WIDTH / 2 - 80, 255, 160, 2);

  // Milestones block — chronicle-style, left-aligned, with bullet dots.
  ctx.textAlign = "left";
  ctx.font = "26px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#3f2616";
  const milestonesX = 100;
  const milestonesY = 305;
  const lineHeight = 42;
  const lines = input.milestones.length
    ? input.milestones
    : ["The chronicle is young. Come back in a few days."];
  for (let i = 0; i < lines.length; i++) {
    const text = trimMilestoneLine(lines[i], 90);
    const y = milestonesY + i * lineHeight;
    // Bullet
    ctx.fillStyle = "rgba(120, 53, 15, 0.75)";
    ctx.beginPath();
    ctx.arc(milestonesX, y, 5, 0, Math.PI * 2);
    ctx.fill();
    // Text
    ctx.fillStyle = "#3f2616";
    ctx.fillText(text, milestonesX + 18, y + 1, CARD_WIDTH - milestonesX - 80);
  }

  // Footer line — date stamp on the left, wordmark beneath the milestones.
  // The bottom-right is reserved for the portrait inset when sprites are
  // provided, so we keep both text elements on the left side of the card.
  ctx.font = "20px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#92400e";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(`Day ${input.day} · Year ${input.year}`, 100, CARD_HEIGHT - 60);

  ctx.font = "bold 16px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "rgba(146, 64, 14, 0.85)";
  ctx.fillText("KingdomOS · jonathanabarnett.github.io/kingdomos", 100, CARD_HEIGHT - 32);

  // Top-right tiny ornament — three dots in the banner color.
  ctx.fillStyle = safeHex(input.bannerColor, "#b45309");
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(CARD_WIDTH - 86 + i * 16, 35, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Coerce a hex color string into a #RRGGBB; fall back if it's invalid. */
function safeHex(hex: string, fallback: string): string {
  if (typeof hex !== "string") return fallback;
  const t = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    // Expand #abc → #aabbcc
    return "#" + t.slice(1).split("").map((c) => c + c).join("");
  }
  return fallback;
}

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
