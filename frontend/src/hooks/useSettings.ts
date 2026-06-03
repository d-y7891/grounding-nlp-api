// src/hooks/useSettings.ts
import { useCallback, useEffect, useState } from "react";
import type { Settings, Theme, Density, AccentKey, JsonView } from "@/types/schema";

const STORAGE_KEY = "grounding:settings:v1";

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  density: "comfortable",
  accent: "violet",
  jsonView: "tree",
  showHighlights: true,
  showJsonPanel: true,
};

export const ACCENT_HUES: Record<AccentKey, { hue: number; name: string; swatch: string }> = {
  violet:  { hue: 285, name: "Violet",  swatch: "#8b5cf6" },
  indigo:  { hue: 265, name: "Indigo",  swatch: "#6366f1" },
  amber:   { hue: 60,  name: "Amber",   swatch: "#f59e0b" },
  emerald: { hue: 160, name: "Emerald", swatch: "#10b981" },
  rose:    { hue: 15,  name: "Rose",    swatch: "#f43f5e" },
};

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(readSettings);

  // Persist to localStorage on every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Quota or private mode — silently ignore.
    }
  }, [settings]);

  // Reflect into the document root so CSS variables pick them up.
  useEffect(() => {
    const root = document.documentElement;
    const accent = ACCENT_HUES[settings.accent];
    root.style.setProperty("--accent-hue", String(accent.hue));
    root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
  }, [settings.accent, settings.theme, settings.density]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return {
    settings,
    update,
    reset,
    setTheme: (v: Theme) => update("theme", v),
    setDensity: (v: Density) => update("density", v),
    setAccent: (v: AccentKey) => update("accent", v),
    setJsonView: (v: JsonView) => update("jsonView", v),
    setShowHighlights: (v: boolean) => update("showHighlights", v),
    setShowJsonPanel: (v: boolean) => update("showJsonPanel", v),
  };
}
