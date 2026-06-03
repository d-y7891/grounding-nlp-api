// src/types/schema.ts
// Shared types mirroring the Pydantic models in api.py.
// Keep these in sync if the backend contract changes.

export type IntentKey =
  | "send_email"
  | "schedule_meeting"
  | "set_reminder"
  | "send_message"
  | "create_task"
  | "search_web"
  | "play_music"
  | "set_alarm"
  | "get_weather"
  | "book_cab";

export interface Span {
  start: number;
  end: number;
  key: string;
}

export interface ParseResponse {
  command: string;
  intent: IntentKey | null;
  params: Record<string, string | null>;
  missing: string[];
  confidence: number;
  spans: Span[];
  raw: string;
  latency_ms: number;
}

export interface ExecuteAction {
  intent: IntentKey;
  parameters: Record<string, string | null>;
}

export interface ExecuteResponse {
  results: string[];
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  device: string;
  model_dir: string;
  intents: IntentKey[];
}

// ----- UI-only types -----

export interface IntentSpec {
  label: string;
  icon: IconName;
  hue: number;
  params: readonly string[];
  required: readonly string[];
}

export type IconName =
  | "mail" | "calendar" | "bell" | "chat" | "check" | "search"
  | "music" | "alarm" | "cloud" | "car" | "arrow" | "sparkle"
  | "chevron" | "chevronDown" | "close" | "play" | "code" | "tree"
  | "history" | "book" | "zap" | "dot" | "moon" | "sun" | "settings"
  | "trash" | "copy";

export type Theme = "light" | "dark";
export type Density = "cozy" | "comfortable" | "spacious";
export type AccentKey = "violet" | "indigo" | "amber" | "emerald" | "rose";
export type JsonView = "tree" | "raw";

export interface Settings {
  theme: Theme;
  density: Density;
  accent: AccentKey;
  jsonView: JsonView;
  showHighlights: boolean;
  showJsonPanel: boolean;
}

export type Stage = "idle" | "parsing" | "intent" | "params" | "execute";

export interface HistoryItem {
  id: string;
  parsed: ParseResponse;
  slotValues: Record<string, string>;
  status: "completed" | "abandoned";
  timestamp: number;
  timeLabel: string;
}

export interface ApiError {
  status: number;
  message: string;
}
