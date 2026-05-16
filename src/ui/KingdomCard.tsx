import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { World } from "../sim/World";
import {
  composeCardInput,
  cardFilename,
  CARD_WIDTH,
  CARD_HEIGHT,
} from "./kingdom-card-data";
import { drawKingdomCard } from "./kingdom-card-renderer";

/**
 * The Kingdom Card modal.
 *
 * The card is a programmatically-composed 1200×630 PNG that summarizes the
 * player's kingdom — kingdom name, monarch, generation, last several
 * milestone journal entries — into a single shareable artifact. Unlike
 * photo mode (which screenshots the live scene), this is a generative
 * composition: every share is a clean, on-brand image regardless of what
 * happened to be on-screen.
 *
 * Pass 1 ships a single "parchment" template. Pass 2 adds the monarch and
 * pet sprites; pass 3 adds stats; pass 4 adds multiple templates.
 */
export function KingdomCard({
  world,
  open,
  onClose,
}: {
  world: World | null;
  open: boolean;
  onClose: () => void;
}) {
  const identity = useGameStore((s) => s.identity);
  const journal = useGameStore((s) => s.journal);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !world || !identity) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      const input = composeCardInput({
        kingdomName: identity.kingdomName ?? "Aurelia",
        monarchName: identity.monarchName ?? "the Monarch",
        petName: world.pets[0]?.name,
        bannerColor: identity.bannerColor ?? "#b45309",
        day: world.state.day,
        year: world.state.year,
        generation: world.succession.state.generation,
        journal,
      });
      drawKingdomCard(ctx, input);
      setDataUrl(canvas.toDataURL("image/png"));
    } catch (err) {
      console.warn("[KingdomCard] render failed", err);
    }
  }, [open, world, identity, journal]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function download() {
    if (!dataUrl || !identity || !world) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = cardFilename(
      identity.kingdomName ?? "kingdom",
      world.state.day,
      world.state.year,
    );
    a.click();
  }

  function copyToClipboard() {
    if (!dataUrl) return;
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) =>
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]),
      )
      .catch((err) => console.warn("[KingdomCard] clipboard write failed", err));
  }

  if (!open) return null;
  return (
    <div
      className="kingdom-card-modal"
      onClick={onClose}
      role="dialog"
      aria-label="Share your kingdom"
    >
      <div className="kingdom-card-frame" onClick={(e) => e.stopPropagation()}>
        <div className="kingdom-card-canvas-wrap">
          <canvas ref={canvasRef} className="kingdom-card-canvas" />
        </div>
        <div className="kingdom-card-actions">
          <div className="kingdom-card-hint">
            A keepsake card you can share or save. Built from the chronicle.
          </div>
          <div className="kingdom-card-buttons">
            <button onClick={copyToClipboard} disabled={!dataUrl}>
              Copy
            </button>
            <button onClick={download} disabled={!dataUrl}>
              Save PNG
            </button>
            <button onClick={onClose}>Close (Esc)</button>
          </div>
        </div>
      </div>
    </div>
  );
}
