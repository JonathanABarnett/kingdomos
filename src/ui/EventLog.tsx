import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { ExternalEvent } from "../sim/events/EventSchema";

const sourceIcon: Record<string, string> = {
  github: "⌗",
  fs: "📂",
  system: "⚙",
  http: "↯",
  ws: "↯",
  inbox: "✉",
  internal: "·",
  narrative: "✦",
};

const kindLabel: Record<string, string> = {
  courier: "courier",
  forge: "forge",
  research: "research",
  mining: "mining",
  storm: "storm",
  celebration: "celebration",
  airship: "airship",
  monster: "monster",
  festival: "festival",
  custom: "custom",
};

export function EventLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const events = useGameStore((s) => s.events);
  const clearEvents = useGameStore((s) => s.clearEvents);
  // Track which event ids are expanded so the player can see the full payload.
  // Local state — resets when the panel closes and reopens; events are
  // ephemeral enough that persistence here would be over-engineering.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!open) return null;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="event-log" role="complementary" aria-label="Event log">
      <div className="event-log-header">
        <span>Event Log</span>
        <div>
          <button onClick={clearEvents} title="Clear" aria-label="Clear event log">⌫</button>
          <button onClick={onClose} title="Close" aria-label="Close event log">×</button>
        </div>
      </div>
      <ol className="event-log-list">
        {events.length === 0 && (
          <li className="event-log-empty">no events yet — the world is just waking up</li>
        )}
        {[...events].reverse().map((e) => {
          const isExpanded = expanded.has(e.id);
          const label = e.payload.label ?? e.payload.from ?? "";
          return (
            <li
              key={e.id}
              className={`event-log-item event-${e.kind} src-${e.source}${isExpanded ? " expanded" : ""}`}
              title={isExpanded ? "Click to collapse" : label}
            >
              <button
                type="button"
                className="event-log-row-toggle"
                onClick={() => toggle(e.id)}
                aria-expanded={isExpanded}
                aria-label={`${e.kind} event: ${label || "no label"}. ${isExpanded ? "Collapse" : "Expand"} details.`}
              >
                <span className="event-source">{sourceIcon[e.source] ?? "·"}</span>
                <span className="event-kind">{kindLabel[e.kind] ?? e.kind}</span>
                <span className="event-label">{label}</span>
                <span className="event-ts">{formatTs(e.ts)}</span>
              </button>
              {isExpanded && <EventDetails event={e} />}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function EventDetails({ event }: { event: ExternalEvent }) {
  const rows: Array<[string, string]> = [];
  if (event.payload.from) rows.push(["from", event.payload.from]);
  if (event.payload.to) rows.push(["to", event.payload.to]);
  if (event.payload.structure) rows.push(["structure", event.payload.structure]);
  if (event.payload.label) rows.push(["label", event.payload.label]);
  if (typeof event.intensity === "number") {
    rows.push(["intensity", event.intensity.toFixed(2)]);
  }
  if (event.duration_ms !== undefined) {
    rows.push(["duration", `${event.duration_ms}ms`]);
  }
  // Custom meta keys (string-coerced for display)
  if (event.payload.meta) {
    for (const [k, v] of Object.entries(event.payload.meta)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        rows.push([`meta.${k}`, String(v)]);
      }
    }
  }
  return (
    <div className="event-log-details">
      {rows.length === 0 ? (
        <div className="event-log-details-empty">no additional payload</div>
      ) : (
        <dl>
          {rows.map(([k, v]) => (
            <div key={k} className="event-log-detail-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="event-log-id">id: {event.id}</div>
    </div>
  );
}

function formatTs(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
