// src/App.tsx
// Main app — orchestrates parse → slot-fill → execute against the FastAPI backend.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  HealthResponse,
  HistoryItem,
  IntentKey,
  ParseResponse,
  Stage,
} from "@/types/schema";
import { INTENTS } from "@/lib/intents";
import { ApiError, executeActions, getHealth, parseCommand } from "@/lib/api";

import { useSettings } from "@/hooks/useSettings";
import { useHistory } from "@/hooks/useHistory";
import { useHotkeys } from "@/hooks/useHotkeys";

import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { CommandInput } from "@/components/CommandInput";
import { HighlightedCommand } from "@/components/HighlightedCommand";
import { Pipeline } from "@/components/Pipeline";
import { ParamTable } from "@/components/ParamTable";
import { JsonInspector } from "@/components/JsonInspector";
import { ExecutionCard } from "@/components/ExecutionCard";
import { EmptyState } from "@/components/EmptyState";
import { SchemaCard } from "@/components/SchemaCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { IntentBadge } from "@/components/IntentBadge";
import { Icon } from "@/components/Icon";

// ----------------------------------------------------------------
export default function App() {
  const { settings, update, reset } = useSettings();
  const { history, add, clear } = useHistory();

  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [intentFilter, setIntentFilter] = useState<IntentKey | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [execResult, setExecResult] = useState<string | null>(null);
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ---------- health check on mount ----------
  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        if (!cancelled) setHealth({ status: "down", model_loaded: false, device: "—", model_dir: "—", intents: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- derived state ----------
  const liveMissing = useMemo(() => {
    if (!parsed?.intent) return [] as string[];
    const spec = INTENTS[parsed.intent];
    return spec.required.filter((k) => {
      const fromModel = parsed.params[k];
      const filled = slotValues[k];
      return (fromModel == null || fromModel === "") && (!filled || filled === "");
    });
  }, [parsed, slotValues]);

  const mergedParams = useMemo<Record<string, string | null>>(() => {
    if (!parsed?.intent) return {};
    const m: Record<string, string | null> = { ...parsed.params };
    for (const k of Object.keys(slotValues)) {
      if (slotValues[k]) m[k] = slotValues[k];
    }
    return m;
  }, [parsed, slotValues]);

  const finalPayload = useMemo(() => {
    if (!parsed?.intent) return { actions: [] };
    return { actions: [{ intent: parsed.intent, parameters: mergedParams }] };
  }, [parsed, mergedParams]);

  const inSession = stage !== "idle" && parsed !== null && parsed.intent !== null;

  // ---------- actions ----------

  const reset_session = useCallback(() => {
    setDraft("");
    setStage("idle");
    setParsed(null);
    setSlotValues({});
    setActiveId(null);
    setParseError(null);
    setExecResult(null);
    setExecLoading(false);
    setExecError(null);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const runExecute = useCallback(
    async (p: ParseResponse, sv: Record<string, string>) => {
      if (!p.intent) return;
      const params: Record<string, string | null> = { ...p.params };
      for (const k of Object.keys(sv)) {
        if (sv[k]) params[k] = sv[k];
      }
      setExecLoading(true);
      setExecError(null);
      setExecResult(null);
      try {
        const r = await executeActions([{ intent: p.intent, parameters: params }]);
        setExecResult(r.results[0] ?? "—");
        const newId = add(p, sv, "completed");
        if (newId) setActiveId(newId);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setExecError(msg);
      } finally {
        setExecLoading(false);
      }
    },
    [add],
  );

  const submit = useCallback(
    async (text?: string) => {
      const t = (text ?? draft).trim();
      if (!t) return;
      setDraft(t);
      setStage("parsing");
      setParsed(null);
      setSlotValues({});
      setActiveId(null);
      setParseError(null);
      setExecResult(null);
      setExecError(null);

      try {
        const p = await parseCommand(t);
        setParsed(p);

        // Seed slot values from model output
        const sv: Record<string, string> = {};
        for (const k of Object.keys(p.params)) sv[k] = p.params[k] ?? "";
        setSlotValues(sv);

        if (!p.intent) {
          setStage("idle");
          setParseError("Could not classify the command — try rephrasing.");
          return;
        }

        // Animate Command → Intent
        setStage("intent");
        await delay(400);

        if (p.missing.length === 0) {
          setStage("execute");
          await runExecute(p, sv);
        } else {
          setStage("params");
        }
      } catch (err) {
        setStage("idle");
        const msg = err instanceof ApiError ? err.message : "Unknown error";
        setParseError(msg);
      }
    },
    [draft, runExecute],
  );

  const handleSlotChange = useCallback((key: string, value: string) => {
    setSlotValues((sv) => ({ ...sv, [key]: value }));
  }, []);

  const handleFillSubmit = useCallback(async () => {
    if (!parsed?.intent) return;
    if (liveMissing.length > 0) return;
    setStage("execute");
    await runExecute(parsed, slotValues);
  }, [parsed, liveMissing.length, runExecute, slotValues]);

  const handleSelectHistory = useCallback(
    (id: string) => {
      const item = history.find((h) => h.id === id);
      if (!item) return;
      setActiveId(id);
      setDraft(item.parsed.command);
      setParsed(item.parsed);
      setSlotValues(item.slotValues);
      setStage("execute");
      // Re-run executor against the chosen payload so the user sees the result.
      void runExecute(item.parsed, item.slotValues);
    },
    [history, runExecute],
  );

  // ---------- hotkeys ----------
  useHotkeys({
    onFocusInput: () => inputRef.current?.focus(),
    onNew: reset_session,
    onEscape: () => {
      if (settingsOpen) {
        setSettingsOpen(false);
      } else if (inSession) {
        reset_session();
      }
    },
  });

  // ---------- render ----------
  const showInputArea = stage !== "parsing";

  return (
    <div className={`app-root ${settings.showJsonPanel ? "" : "no-json"}`}>
      <Sidebar
        history={history as HistoryItem[]}
        activeId={activeId}
        intentFilter={intentFilter}
        onSelectHistory={handleSelectHistory}
        onFilterIntent={setIntentFilter}
        onNew={reset_session}
        onClearHistory={clear}
      />

      <main className="main-col">
        <Header health={health} onOpenSettings={() => setSettingsOpen(true)} />

        {showInputArea && (
          <div className="cmd-area">
            <CommandInput
              value={draft}
              onChange={setDraft}
              onSubmit={() => void submit()}
              disabled={false}
              inputRef={inputRef}
            />
            {parsed && parsed.intent && settings.showHighlights && stage !== "idle" && (
              <div className="parsed-line">
                <span className="parsed-prefix">parsed</span>
                <HighlightedCommand
                  command={parsed.command}
                  spans={parsed.spans}
                  showHighlight={settings.showHighlights}
                />
              </div>
            )}
            {parseError && stage === "idle" && (
              <div className="parse-error">
                <Icon name="close" size={12} stroke={2} />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        )}

        {!inSession && stage !== "parsing" && (
          <EmptyState onPick={(text) => void submit(text)} />
        )}

        {stage === "parsing" && !parsed && (
          <div className="parsing-state">
            <div className="ps-spinner">
              <div />
              <div />
              <div />
            </div>
            <div className="ps-text">Running inference…</div>
            <div className="ps-sub">FLAN-T5-base · 3 decoding strategies</div>
          </div>
        )}

        {inSession && parsed && parsed.intent && (
          <div className="session-card">
            <div className="sc-summary">
              <IntentBadge intent={parsed.intent} />
              <div className="sc-confidence">
                <span className="sc-conf-label">confidence</span>
                <div className="sc-conf-bar">
                  <div
                    className="sc-conf-fill"
                    style={{ width: `${Math.round(parsed.confidence * 100)}%` }}
                  />
                </div>
                <span className="sc-conf-val">{Math.round(parsed.confidence * 100)}%</span>
              </div>
              <div className="sc-actions">
                <span className="sc-latency">{parsed.latency_ms} ms</span>
                <button className="sc-action" onClick={reset_session}>
                  <Icon name="close" size={12} />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>

            <Pipeline
              stage={stage}
              executed={execResult !== null && !execLoading}
              isAnimating={stage === "parsing" || stage === "intent"}
            />

            <div className="sc-body">
              <div className="sc-section-head">
                <div className="sc-section-title">
                  <span className="sc-section-num">02</span>
                  <span>Parameters</span>
                </div>
                {liveMissing.length > 0 ? (
                  <div className="sc-missing-pill">
                    <span className="dot" />
                    <span>
                      {liveMissing.length} required slot{liveMissing.length === 1 ? "" : "s"} need filling
                    </span>
                  </div>
                ) : (
                  <div className="sc-complete-pill">
                    <Icon name="check" size={12} stroke={2.4} />
                    <span>All required slots filled</span>
                  </div>
                )}
              </div>

              <ParamTable
                parsed={parsed as ParseResponse & { intent: IntentKey }}
                slotValues={slotValues}
                onSlotChange={handleSlotChange}
                missing={liveMissing}
                focusKey={liveMissing[0] ?? null}
              />

              {stage === "params" && liveMissing.length === 0 && (
                <button className="sc-execute" onClick={() => void handleFillSubmit()}>
                  <Icon name="play" size={12} />
                  <span>Execute API call</span>
                </button>
              )}

              {(stage === "execute" || execResult !== null || execError) && (
                <>
                  <div className="sc-section-head" style={{ marginTop: 28 }}>
                    <div className="sc-section-title">
                      <span className="sc-section-num">03</span>
                      <span>Execution</span>
                    </div>
                    <div className={`sc-complete-pill ${execError ? "err" : ""}`}>
                      <span className={`dot ${execError ? "" : "ok"}`} />
                      <span>{execLoading ? "Dispatching…" : execError ? "Failed" : "Dispatched"}</span>
                    </div>
                  </div>
                  <ExecutionCard
                    intent={parsed.intent}
                    parameters={mergedParams}
                    result={execResult}
                    loading={execLoading}
                    error={execError}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {settings.showJsonPanel && (
        <aside className="json-col">
          <JsonInspector
            payload={finalPayload}
            viewMode={settings.jsonView}
            onToggleView={(v) => update("jsonView", v)}
          />
          <SchemaCard intent={parsed?.intent ?? null} />
        </aside>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={update}
        onReset={reset}
      />
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
