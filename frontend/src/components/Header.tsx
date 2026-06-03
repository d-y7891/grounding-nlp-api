// src/components/Header.tsx
import type { HealthResponse } from "@/types/schema";
import { Icon } from "./Icon";

interface HeaderProps {
  health: HealthResponse | null;
  onOpenSettings: () => void;
}

export function Header({ health, onOpenSettings }: HeaderProps) {
  const ready = health?.model_loaded ?? false;
  const device = health?.device.replace(/^cuda:.*/, "CUDA").toUpperCase() ?? "—";

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-mark">
          <Icon name="zap" size={14} stroke={2} />
        </div>
        <div className="brand-text">
          <div className="brand-name">Grounding</div>
          <div className="brand-sub">NLP → API translator</div>
        </div>
      </div>

      <div className="header-meta">
        <div className={`status-pill ${ready ? "" : "warn"}`}>
          <span className="status-dot" data-state={ready ? "ok" : "warn"} />
          <span>{ready ? `FLAN-T5-base · ${device}` : "Model unavailable"}</span>
        </div>
        <button className="status-pill subtle icon-btn" onClick={onOpenSettings} title="Settings (⌘,)" aria-label="Open settings">
          <Icon name="settings" size={13} />
        </button>
      </div>
    </header>
  );
}
