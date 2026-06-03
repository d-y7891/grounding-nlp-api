// src/components/SettingsPanel.tsx
import { useEffect, type ReactNode } from "react";
import type { AccentKey, Density, IconName, JsonView, Settings, Theme } from "@/types/schema";
import { ACCENT_HUES } from "@/hooks/useSettings";
import { Icon } from "./Icon";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onReset: () => void;
}

export function SettingsPanel({ open, onClose, settings, onUpdate, onReset }: SettingsPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sp-backdrop" onClick={onClose} aria-hidden />
      <aside className="settings-panel" role="dialog" aria-label="Settings">
        <header className="sp-head">
          <div className="sp-title">
            <Icon name="settings" size={14} />
            <span>Settings</span>
          </div>
          <button className="sp-close" onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="sp-body">
          <Section label="Theme">
            <Radio<Theme>
              label="Mode"
              value={settings.theme}
              options={[
                { value: "light", label: "Light", icon: "sun" },
                { value: "dark", label: "Dark", icon: "moon" },
              ]}
              onChange={(v) => onUpdate("theme", v)}
            />
            <ColorRow
              label="Accent"
              value={settings.accent}
              onChange={(v) => onUpdate("accent", v)}
            />
          </Section>

          <Section label="Layout">
            <Radio<Density>
              label="Density"
              value={settings.density}
              options={[
                { value: "cozy", label: "Cozy" },
                { value: "comfortable", label: "Comfy" },
                { value: "spacious", label: "Spacious" },
              ]}
              onChange={(v) => onUpdate("density", v)}
            />
            <Toggle
              label="JSON panel"
              value={settings.showJsonPanel}
              onChange={(v) => onUpdate("showJsonPanel", v)}
            />
          </Section>

          <Section label="Parsing">
            <Toggle
              label="Entity highlighting"
              value={settings.showHighlights}
              onChange={(v) => onUpdate("showHighlights", v)}
            />
            <Radio<JsonView>
              label="JSON view"
              value={settings.jsonView}
              options={[
                { value: "tree", label: "Tree" },
                { value: "raw", label: "Raw" },
              ]}
              onChange={(v) => onUpdate("jsonView", v)}
            />
          </Section>

          <button className="sp-reset" onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      </aside>
    </>
  );
}

// ---------- helpers ----------

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sp-section">
      <div className="sp-section-label">{label}</div>
      <div className="sp-section-body">{children}</div>
    </div>
  );
}

function Radio<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="sp-row">
      <div className="sp-row-label">{label}</div>
      <div className="sp-radio">
        {options.map((opt) => (
          <button
            key={opt.value}
            className={value === opt.value ? "on" : ""}
            onClick={() => onChange(opt.value)}
            type="button"
          >
            {opt.icon && <Icon name={opt.icon} size={12} />}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="sp-row">
      <div className="sp-row-label">{label}</div>
      <button
        className={`sp-toggle ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        type="button"
      >
        <span className="sp-toggle-knob" />
      </button>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AccentKey;
  onChange: (v: AccentKey) => void;
}) {
  return (
    <div className="sp-row">
      <div className="sp-row-label">{label}</div>
      <div className="sp-colors">
        {(Object.entries(ACCENT_HUES) as [AccentKey, (typeof ACCENT_HUES)[AccentKey]][]).map(
          ([key, meta]) => (
            <button
              key={key}
              className={`sp-color ${value === key ? "on" : ""}`}
              onClick={() => onChange(key)}
              style={{ background: meta.swatch }}
              title={meta.name}
              aria-label={meta.name}
              type="button"
            />
          ),
        )}
      </div>
    </div>
  );
}
