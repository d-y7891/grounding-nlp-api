// src/lib/examples.ts
// One curated example per intent — used by the empty-state grid.

import type { IntentKey } from "@/types/schema";

export interface Example {
  intent: IntentKey;
  text: string;
}

export const EXAMPLES: Example[] = [
  { intent: "send_email",       text: "Email Priya about the Q4 roadmap review" },
  { intent: "schedule_meeting", text: "Schedule a meeting with Daniel tomorrow at 3 pm" },
  { intent: "set_reminder",     text: "Remind me to submit the expense report on Friday" },
  { intent: "send_message",     text: "Text Maya saying I'll be late by 10 minutes" },
  { intent: "create_task",      text: "Create a task to review the design system by Monday" },
  { intent: "search_web",       text: "Search for the best Italian restaurants in Bangalore" },
  { intent: "play_music",       text: "Play Solar Power by Lorde" },
  { intent: "set_alarm",        text: "Set an alarm for 6:30 am" },
  { intent: "get_weather",      text: "What's the weather in Tokyo tomorrow" },
  { intent: "book_cab",         text: "Book a cab from home to airport at 5 am" },
];
