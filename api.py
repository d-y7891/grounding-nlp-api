"""
api.py — FastAPI server exposing the NLP→API translator.

Endpoints
---------
GET  /health         — model status + device info
GET  /intents        — schema + metadata for all 10 intents
POST /parse          — translate a natural-language command to a structured payload
POST /execute        — run an executor and return its result strings

Run
---
    uvicorn api:app --reload --port 8000

Optional env vars
-----------------
    GROUNDING_MODEL_DIR   path to the fine-tuned FLAN-T5 model directory
    GROUNDING_CORS_ORIGINS  comma-separated list (default: localhost:5173, localhost:3000)
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import core

# ============================================================
# LOGGING
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("grounding.api")


# ============================================================
# REQUEST / RESPONSE SCHEMAS
# ============================================================
class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="Natural language command")
    max_target_len: int = Field(core.DEFAULT_MAX_TARGET_LEN, ge=64, le=512)


class Span(BaseModel):
    start: int
    end: int
    key: str


class ParseResponse(BaseModel):
    command: str
    intent: Optional[str]
    params: dict[str, Optional[str]]
    missing: list[str]
    confidence: float
    spans: list[Span]
    raw: str
    latency_ms: int


class ExecuteAction(BaseModel):
    intent: str
    parameters: dict[str, Optional[str]]


class ExecuteRequest(BaseModel):
    actions: list[ExecuteAction] = Field(..., min_length=1)


class ExecuteResponse(BaseModel):
    results: list[str]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    model_dir: str
    intents: list[str]


class IntentSchema(BaseModel):
    label: str
    icon: str
    hue: int
    params: list[str]
    required: list[str]
    optional: list[str]


# ============================================================
# LIFESPAN — load the model once at startup
# ============================================================
APP_STATE: dict = {"model_loaded": False, "load_error": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Loading model from %s on %s …", core.MODEL_DIR, core.DEVICE)
    t0 = time.perf_counter()
    try:
        core.load_model()  # cached; subsequent calls are free
        APP_STATE["model_loaded"] = True
        elapsed = (time.perf_counter() - t0) * 1000
        log.info("Model loaded in %d ms on %s", elapsed, core.DEVICE)
    except Exception as exc:
        APP_STATE["model_loaded"] = False
        APP_STATE["load_error"] = str(exc)
        log.exception("Model failed to load: %s", exc)
        # We continue startup so /health stays reachable and the user gets
        # a clear 503 with the error on /parse.
    yield


app = FastAPI(
    title="Grounding — NLP→API Translator",
    description="FLAN-T5-base service that translates natural-language commands into structured API payloads.",
    version="1.0.0",
    lifespan=lifespan,
)

# ============================================================
# CORS
# ============================================================
_default_origins = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
origins = [o.strip() for o in os.environ.get("GROUNDING_CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# HELPERS
# ============================================================
def _require_model() -> None:
    if not APP_STATE["model_loaded"]:
        raise HTTPException(
            status_code=503,
            detail=f"Model not loaded. Error: {APP_STATE.get('load_error') or 'unknown'}",
        )


# ============================================================
# ROUTES
# ============================================================
@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok" if APP_STATE["model_loaded"] else "model_unavailable",
        model_loaded=APP_STATE["model_loaded"],
        device=str(core.DEVICE),
        model_dir=core.MODEL_DIR,
        intents=list(core.KNOWN_PARAMS.keys()),
    )


@app.get("/intents", response_model=dict[str, IntentSchema])
def list_intents() -> dict[str, IntentSchema]:
    """Return the full schema + metadata for all supported intents."""
    out: dict[str, IntentSchema] = {}
    for intent, meta in core.INTENT_META.items():
        all_params = core.KNOWN_PARAMS[intent]
        required = core.REQUIRED_PARAMS[intent]
        out[intent] = IntentSchema(
            label=meta["label"],
            icon=meta["icon"],
            hue=meta["hue"],
            params=all_params,
            required=required,
            optional=[p for p in all_params if p not in required],
        )
    return out


@app.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest) -> ParseResponse:
    _require_model()

    command = req.text.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Empty command")

    t0 = time.perf_counter()
    try:
        raw, result = core.generate(command, max_target_len=req.max_target_len)
    except Exception as exc:
        log.exception("Generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}")

    latency_ms = int((time.perf_counter() - t0) * 1000)

    if result is None or not result.get("actions"):
        # Unparseable — surface raw so the UI can show a debug state.
        return ParseResponse(
            command=command,
            intent=None,
            params={},
            missing=[],
            confidence=0.0,
            spans=[],
            raw=raw,
            latency_ms=latency_ms,
        )

    # We only surface the first action to the client. (Original Streamlit
    # app also operates one action at a time.)
    action = result["actions"][0]
    intent = action.get("intent")
    params = action.get("parameters", {})

    # Ensure every schema key exists in the dict, even if null.
    if intent in core.KNOWN_PARAMS:
        for k in core.KNOWN_PARAMS[intent]:
            if k not in params:
                params[k] = None

    missing_required = (
        [k for k in core.REQUIRED_PARAMS.get(intent, []) if params.get(k) in (None, "")]
        if intent
        else []
    )

    spans = core.compute_spans(command, params)
    confidence = core.compute_confidence(intent, params)

    return ParseResponse(
        command=command,
        intent=intent,
        params=params,
        missing=missing_required,
        confidence=confidence,
        spans=[Span(**s) for s in spans],
        raw=raw,
        latency_ms=latency_ms,
    )


@app.post("/execute", response_model=ExecuteResponse)
def execute(req: ExecuteRequest) -> ExecuteResponse:
    payload = {"actions": [a.model_dump() for a in req.actions]}
    try:
        results = core.execute_payload(payload)
    except Exception as exc:
        log.exception("Executor failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Executor failed: {exc}")
    return ExecuteResponse(results=results)


# ============================================================
# Convenience: `python api.py` also runs the server.
# ============================================================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        reload=True,
    )
