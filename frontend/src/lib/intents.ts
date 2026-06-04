// src/lib/intents.ts
// Client-side intent metadata. Mirrors INTENT_META + KNOWN_PARAMS in core.py.
// Centralized so every component references the same spec.

import type { IntentKey, IntentSpec } from "@/types/schema";

export const INTENTS: Record<IntentKey, IntentSpec> = {
  send_email: {
    label: "Send email",
    icon: "mail",
    hue: 230,
    params: ["to", "subject", "body"],
    required: ["to", "subject"],
  },
  schedule_meeting: {
    label: "Schedule meeting",
    icon: "calendar",
    hue: 160,
    params: ["person", "time", "date"],
    required: ["person", "time", "date"],
  },
  set_reminder: {
    label: "Set reminder",
    icon: "bell",
    hue: 35,
    params: ["task", "time", "date"],
    required: ["task"],
  },
  send_message: {
    label: "Send message",
    icon: "chat",
    hue: 285,
    params: ["to", "message"],
    required: ["to", "message"],
  },
  create_task: {
    label: "Create task",
    icon: "check",
    hue: 175,
    params: ["title", "due_date", "priority"],
    required: ["title"],
  },
  search_web: {
    label: "Search web",
    icon: "search",
    hue: 210,
    params: ["query"],
    required: ["query"],
  },
  play_music: {
    label: "Play music",
    icon: "music",
    hue: 320,
    params: ["song", "artist"],
    required: ["song"],
  },
  set_alarm: {
    label: "Set alarm",
    icon: "alarm",
    hue: 15,
    params: ["time", "label"],
    required: ["time"],
  },
  get_weather: {
    label: "Get weather",
    icon: "cloud",
    hue: 200,
    params: ["location"],
    required: ["location"],
  },
  book_cab: {
    label: "Book cab",
    icon: "car",
    hue: 50,
    params: ["pickup", "destination", "time"],
    required: ["pickup", "destination"],
  },
};

export const INTENT_KEYS = Object.keys(INTENTS) as IntentKey[];

/**
 * Look up the intent's hue for a given param key. Falls back to a neutral
 * violet if the key doesn't belong to any known intent (defensive only).
 */
export function hueForParam(paramKey: string): number {
  for (const spec of Object.values(INTENTS)) {
    if (spec.params.includes(paramKey)) return spec.hue;
  }
  return 270;
}
