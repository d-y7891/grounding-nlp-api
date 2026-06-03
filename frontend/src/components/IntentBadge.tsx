// src/components/IntentBadge.tsx
import type { CSSProperties } from "react";
import type { IntentKey } from "@/types/schema";
import { INTENTS } from "@/lib/intents";
import { Icon } from "./Icon";

interface IntentBadgeProps {
  intent: IntentKey;
  size?: "sm" | "md";
}

export function IntentBadge({ intent, size = "md" }: IntentBadgeProps) {
  const spec = INTENTS[intent];
  const style: CSSProperties = {
    background: `oklch(0.97 0.025 ${spec.hue})`,
    color: `oklch(0.38 0.12 ${spec.hue})`,
    borderColor: `oklch(0.88 0.04 ${spec.hue})`,
  };

  return (
    <span className={`intent-badge size-${size}`} style={style}>
      <Icon name={spec.icon} size={size === "sm" ? 12 : 14} />
      <span>{spec.label}</span>
    </span>
  );
}
