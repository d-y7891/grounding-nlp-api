// src/components/Pipeline.tsx
import { Fragment } from "react";
import type { Stage } from "@/types/schema";
import { Icon } from "./Icon";

interface PipelineProps {
  stage: Stage;
  executed: boolean;
  isAnimating: boolean;
}

interface Step {
  key: Stage;
  label: string;
  desc: string;
}

const STAGES: Step[] = [
  { key: "parsing", label: "Command",    desc: "Natural language input" },
  { key: "intent",  label: "Intent",     desc: "Classified intent"      },
  { key: "params",  label: "Parameters", desc: "Extracted slots"        },
  { key: "execute", label: "Execution",  desc: "API call dispatched"    },
];

const STAGE_ORDER: Stage[] = ["parsing", "intent", "params", "execute"];

export function Pipeline({ stage, executed, isAnimating }: PipelineProps) {
  const currentIdx = STAGE_ORDER.indexOf(stage);

  return (
    <div className="pipeline">
      {STAGES.map((s, i) => {
        const done =
          i < currentIdx || (i === currentIdx && stage === "execute" && executed);
        const active = i === currentIdx && !done;
        return (
          <Fragment key={s.key}>
            <div className={`pl-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
              <div className="pl-num">
                {done ? <Icon name="check" size={12} stroke={2.2} /> : i + 1}
              </div>
              <div className="pl-text">
                <div className="pl-label">{s.label}</div>
                <div className="pl-desc">{s.desc}</div>
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`pl-connector ${done ? "done" : ""}`}>
                <div className="pl-line" />
                {isAnimating && i === currentIdx - 1 && <div className="pl-pulse" />}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
