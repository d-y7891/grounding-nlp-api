// src/components/SchemaCard.tsx
import type { IntentKey } from "@/types/schema";
import { INTENTS } from "@/lib/intents";
import { Icon } from "./Icon";

interface SchemaCardProps {
  intent: IntentKey | null;
}

export function SchemaCard({ intent }: SchemaCardProps) {
  if (!intent) {
    return (
      <div className="schema-card placeholder">
        <div className="schema-head">
          <Icon name="book" size={12} />
          <span>Schema</span>
        </div>
        <div className="schema-empty">Run a command to inspect its schema</div>
      </div>
    );
  }

  const spec = INTENTS[intent];

  return (
    <div className="schema-card">
      <div className="schema-head">
        <Icon name="book" size={12} />
        <span>Schema</span>
      </div>
      <div className="schema-body">
        <div className="schema-row">
          <span className="schema-key">intent</span>
          <span className="schema-val">{intent}</span>
        </div>
        {spec.params.map((k) => {
          const isReq = spec.required.includes(k);
          return (
            <div key={k} className="schema-row">
              <span className="schema-key">{k}</span>
              <span className={`schema-val ${isReq ? "req" : "opt"}`}>
                {isReq ? "string · required" : "string · optional"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
