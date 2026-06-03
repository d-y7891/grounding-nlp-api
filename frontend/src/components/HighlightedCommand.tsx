// src/components/HighlightedCommand.tsx
import type { CSSProperties } from "react";
import type { Span } from "@/types/schema";
import { hueForParam } from "@/lib/intents";

interface HighlightedCommandProps {
  command: string;
  spans: Span[];
  showHighlight?: boolean;
}

interface Part {
  text: string;
  key?: string;
}

export function HighlightedCommand({ command, spans, showHighlight = true }: HighlightedCommandProps) {
  if (!showHighlight || spans.length === 0) {
    return <span className="hl-plain">{command}</span>;
  }

  // Sort by start ascending, then by length descending, so longer spans win on ties.
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const parts: Part[] = [];
  let cursor = 0;

  for (const sp of sorted) {
    if (sp.start < cursor) continue; // overlap — skip
    if (sp.start > cursor) parts.push({ text: command.slice(cursor, sp.start) });
    parts.push({ text: command.slice(sp.start, sp.end), key: sp.key });
    cursor = sp.end;
  }
  if (cursor < command.length) parts.push({ text: command.slice(cursor) });

  return (
    <span className="hl-wrap">
      {parts.map((p, i) => {
        if (!p.key) {
          return (
            <span key={i} className="hl-gap">
              {p.text}
            </span>
          );
        }
        const hue = hueForParam(p.key);
        const style: CSSProperties = {
          background: `oklch(0.96 0.035 ${hue})`,
          color: `oklch(0.32 0.15 ${hue})`,
          borderColor: `oklch(0.86 0.06 ${hue})`,
        };
        return (
          <span key={i} className="hl-token" data-key={p.key} style={style}>
            <span className="hl-text">{p.text}</span>
            <span className="hl-label">{p.key}</span>
          </span>
        );
      })}
    </span>
  );
}
