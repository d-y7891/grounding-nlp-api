// src/components/ExecutionCard.tsx
import type { IntentKey } from "@/types/schema";
import { INTENTS } from "@/lib/intents";
import { Icon } from "./Icon";

interface ExecutionCardProps {
  intent: IntentKey;
  parameters: Record<string, string | null>;
  result: string | null;
  loading: boolean;
  error: string | null;
}

export function ExecutionCard({ intent, parameters, result, loading, error }: ExecutionCardProps) {
  const spec = INTENTS[intent];

  return (
    <div className="exec-card">
      <div className="exec-header">
        <div className="exec-icon" style={{ ["--hue" as string]: String(spec.hue) }}>
          <Icon name={spec.icon} size={18} />
        </div>
        <div className="exec-text">
          <div className="exec-title">Dispatched to {spec.label}</div>
          <div className="exec-sub">
            {loading ? "Executing…" : error ? error : (result ?? "—")}
          </div>
        </div>
        <span className={`exec-status ${error ? "err" : ""}`}>
          {loading ? "…" : error ? "500" : "200 OK"}
        </span>
      </div>
      <div className="exec-detail">
        {spec.params
          .filter((k) => parameters[k] != null && parameters[k] !== "")
          .map((k) => (
            <div key={k} className="exec-row">
              <span className="exec-row-key">{k}</span>
              <span className="exec-row-val">{parameters[k]}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
