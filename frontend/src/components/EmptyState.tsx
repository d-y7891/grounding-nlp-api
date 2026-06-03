// src/components/EmptyState.tsx
import { EXAMPLES } from "@/lib/examples";
import { INTENTS } from "@/lib/intents";
import { Icon } from "./Icon";

interface EmptyStateProps {
  onPick: (text: string) => void;
}

export function EmptyState({ onPick }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="es-eyebrow">Try a command</div>
      <h2 className="es-title">
        Type what you'd say out loud.
        <br />
        <span className="muted">We'll turn it into a structured API call.</span>
      </h2>
      <div className="es-grid">
        {EXAMPLES.map((ex, i) => {
          const spec = INTENTS[ex.intent];
          return (
            <button
              key={i}
              className="es-card"
              onClick={() => onPick(ex.text)}
              style={{ ["--hue" as string]: String(spec.hue) }}
              type="button"
            >
              <div className="es-card-head">
                <span className="es-icon">
                  <Icon name={spec.icon} size={14} />
                </span>
                <span className="es-intent">{spec.label}</span>
              </div>
              <div className="es-text">{ex.text}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
