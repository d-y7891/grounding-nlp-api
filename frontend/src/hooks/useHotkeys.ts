// src/hooks/useHotkeys.ts
import { useEffect } from "react";

export interface HotkeyHandlers {
  /** Cmd/Ctrl + K — focus the command input */
  onFocusInput?: () => void;
  /** Cmd/Ctrl + N — start a new translation */
  onNew?: () => void;
  /** Escape — dismiss the current session */
  onEscape?: () => void;
}

/**
 * Global keyboard shortcuts. Handlers are looked up on every keydown so
 * stale closures aren't a problem.
 */
export function useHotkeys(handlers: HotkeyHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (meta && k === "k") {
        e.preventDefault();
        handlers.onFocusInput?.();
        return;
      }
      if (meta && k === "n") {
        // Browsers reserve Cmd-N for new window. We allow Cmd-Shift-N or Alt-N.
        if (e.shiftKey || e.altKey) {
          e.preventDefault();
          handlers.onNew?.();
        }
        return;
      }
      if (k === "escape") {
        handlers.onEscape?.();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
