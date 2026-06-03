// src/components/JsonInspector.tsx
import { useState, type ReactNode } from "react";
import type { JsonView } from "@/types/schema";
import { Icon } from "./Icon";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface JsonInspectorProps {
  payload: JsonValue;
  viewMode: JsonView;
  onToggleView: (v: JsonView) => void;
}

function renderTree(value: JsonValue, depth = 0): ReactNode {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === "string") return <span className="json-string">"{value}"</span>;
  if (typeof value === "number") return <span className="json-number">{value}</span>;
  if (typeof value === "boolean") return <span className="json-bool">{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="json-bracket">[]</span>;
    return (
      <span>
        <span className="json-bracket">[</span>
        {value.map((item, i) => (
          <div key={i} style={{ paddingLeft: 16 }}>
            {renderTree(item, depth + 1)}
            {i < value.length - 1 && <span className="json-comma">,</span>}
          </div>
        ))}
        <span className="json-bracket">]</span>
      </span>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="json-bracket">{"{}"}</span>;
  return (
    <span>
      <span className="json-bracket">{"{"}</span>
      {entries.map(([k, v], i) => (
        <div key={k} style={{ paddingLeft: 16 }}>
          <span className="json-key">"{k}"</span>
          <span className="json-colon">: </span>
          {renderTree(v, depth + 1)}
          {i < entries.length - 1 && <span className="json-comma">,</span>}
        </div>
      ))}
      <span className="json-bracket">{"}"}</span>
    </span>
  );
}

export function JsonInspector({ payload, viewMode, onToggleView }: JsonInspectorProps) {
  const [copied, setCopied] = useState(false);
  const raw = JSON.stringify(payload, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // permission denied — silent
    }
  };

  return (
    <div className="json-inspector">
      <div className="ji-header">
        <div className="ji-title">
          <Icon name="code" size={14} />
          <span>API payload</span>
        </div>
        <div className="ji-actions">
          <div className="ji-toggle" role="group" aria-label="JSON view mode">
            <button
              className={viewMode === "tree" ? "on" : ""}
              onClick={() => onToggleView("tree")}
              aria-pressed={viewMode === "tree"}
            >
              <Icon name="tree" size={12} />
              <span>Tree</span>
            </button>
            <button
              className={viewMode === "raw" ? "on" : ""}
              onClick={() => onToggleView("raw")}
              aria-pressed={viewMode === "raw"}
            >
              <Icon name="code" size={12} />
              <span>Raw</span>
            </button>
          </div>
          <button className="ji-copy" onClick={handleCopy} title="Copy JSON">
            <Icon name="copy" size={12} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
      <div className="ji-body">
        {viewMode === "tree" ? (
          <div className="json-tree">{renderTree(payload)}</div>
        ) : (
          <pre className="json-raw">{raw}</pre>
        )}
      </div>
    </div>
  );
}
