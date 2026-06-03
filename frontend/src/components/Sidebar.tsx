// src/components/Sidebar.tsx
import type { HistoryItem, IntentKey } from "@/types/schema";
import { INTENT_KEYS, INTENTS } from "@/lib/intents";
import { Icon } from "./Icon";
import { IntentBadge } from "./IntentBadge";

interface SidebarProps {
  history: HistoryItem[];
  activeId: string | null;
  intentFilter: IntentKey | null;
  onSelectHistory: (id: string) => void;
  onFilterIntent: (intent: IntentKey | null) => void;
  onNew: () => void;
  onClearHistory: () => void;
}

export function Sidebar({
  history,
  activeId,
  intentFilter,
  onSelectHistory,
  onFilterIntent,
  onNew,
  onClearHistory,
}: SidebarProps) {
  const visible = intentFilter ? history.filter((h) => h.parsed.intent === intentFilter) : history;

  return (
    <aside className="sidebar">
      <button className="new-btn" onClick={onNew}>
        <Icon name="sparkle" size={14} />
        <span>New translation</span>
        <span className="kbd">⌥N</span>
      </button>

      <div className="sb-section">
        <div className="sb-label">Intents</div>
        <div className="intent-list">
          {INTENT_KEYS.map((k) => {
            const spec = INTENTS[k];
            const active = intentFilter === k;
            return (
              <button
                key={k}
                className={`intent-row ${active ? "active" : ""}`}
                onClick={() => onFilterIntent(active ? null : k)}
                style={{ ["--hue" as string]: String(spec.hue) }}
              >
                <span className="intent-dot" />
                <Icon name={spec.icon} size={14} />
                <span className="intent-name">{spec.label}</span>
                <span className="intent-key">{k}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sb-section flex-1">
        <div className="sb-label">
          <Icon name="history" size={12} />
          <span>History</span>
          {history.length > 0 && (
            <button className="sb-clear" onClick={onClearHistory} title="Clear history">
              <Icon name="trash" size={11} />
            </button>
          )}
        </div>
        <div className="history-list">
          {visible.length === 0 && <div className="empty-history">No translations yet</div>}
          {visible.map((item) => (
            <button
              key={item.id}
              className={`history-row ${item.id === activeId ? "active" : ""}`}
              onClick={() => onSelectHistory(item.id)}
            >
              <div className="hist-top">
                {item.parsed.intent && <IntentBadge intent={item.parsed.intent} size="sm" />}
                <span className={`hist-status status-${item.status}`}>{item.status}</span>
              </div>
              <div className="hist-cmd">{item.parsed.command}</div>
              <div className="hist-time">{item.timeLabel}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="sb-footer">
        <div className="footer-meta">
          <div>Grounding</div>
          <div className="muted">v1.0.0 · FLAN-T5-base</div>
        </div>
        <a
          className="footer-link"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="code" size={12} />
          <span>GitHub</span>
        </a>
      </div>
    </aside>
  );
}
