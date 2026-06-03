// src/hooks/useHistory.ts
import { useCallback, useEffect, useState } from "react";
import type { HistoryItem, ParseResponse } from "@/types/schema";

const STORAGE_KEY = "grounding:history:v1";
const MAX_HISTORY = 30;

function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryItem[];
  } catch {
    return [];
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>(readHistory);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore quota errors
    }
  }, [history]);

  const add = useCallback(
    (parsed: ParseResponse, slotValues: Record<string, string>, status: HistoryItem["status"] = "completed") => {
      if (!parsed.intent) return null;
      const ts = Date.now();
      const item: HistoryItem = {
        id: makeId(),
        parsed,
        slotValues,
        status,
        timestamp: ts,
        timeLabel: formatTime(ts),
      };
      setHistory((h) => [item, ...h].slice(0, MAX_HISTORY));
      return item.id;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setHistory((h) => h.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setHistory([]), []);

  return { history, add, remove, clear };
}
