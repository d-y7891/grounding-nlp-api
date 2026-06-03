// src/components/ParamTable.tsx
import type { IntentKey, ParseResponse } from "@/types/schema";
import { INTENTS } from "@/lib/intents";
import { Icon } from "./Icon";

interface ParamTableProps {
  parsed: ParseResponse & { intent: IntentKey };
  slotValues: Record<string, string>;
  onSlotChange: (key: string, value: string) => void;
  missing: string[];
  focusKey: string | null;
}

export function ParamTable({ parsed, slotValues, onSlotChange, missing, focusKey }: ParamTableProps) {
  const spec = INTENTS[parsed.intent];

  return (
    <div className="param-table" role="table" aria-label="Extracted parameters">
      <div className="pt-header" role="row">
        <div className="pt-col-key" role="columnheader">parameter</div>
        <div className="pt-col-val" role="columnheader">value</div>
        <div className="pt-col-src" role="columnheader">source</div>
      </div>
      {spec.params.map((key) => {
        const isRequired = spec.required.includes(key);
        const isMissing = missing.includes(key);
        const v = slotValues[key] ?? "";
        const fromModel = parsed.params[key] != null && parsed.params[key] !== "";
        const filledByUser = !fromModel && v !== "";

        return (
          <div key={key} className={`pt-row ${isMissing ? "missing" : ""}`} role="row">
            <div className="pt-key" role="cell">
              <span className="pt-dot" style={{ background: `oklch(0.6 0.15 ${spec.hue})` }} />
              <span className="pt-key-name">{key}</span>
              {isRequired ? (
                <span className="pt-req">required</span>
              ) : (
                <span className="pt-opt">optional</span>
              )}
            </div>
            <div className="pt-val" role="cell">
              {isMissing ? (
                <input
                  className="pt-input"
                  autoFocus={focusKey === key}
                  placeholder={`Enter ${key}…`}
                  value={v}
                  onChange={(e) => onSlotChange(key, e.target.value)}
                  aria-label={`${key} value`}
                />
              ) : v === "" ? (
                <span className="pt-null">null</span>
              ) : (
                <span className="pt-string">"{v}"</span>
              )}
            </div>
            <div className="pt-src" role="cell">
              {fromModel && (
                <span className="src-tag from-model">
                  <Icon name="zap" size={10} stroke={2} />
                  model
                </span>
              )}
              {filledByUser && (
                <span className="src-tag from-user">
                  <Icon name="check" size={10} stroke={2} />
                  filled
                </span>
              )}
              {!fromModel && !filledByUser && <span className="src-tag from-none">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
