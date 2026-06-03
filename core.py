"""
core.py — Model logic extracted from the original Streamlit app.py.

This module is framework-agnostic: it owns the FLAN-T5 model, the
linearized-format parser, entity correction, slot-filling, and execution.
The FastAPI layer (`api.py`) and any other transport can call into it freely.

Public surface
--------------
- load_model()                     → (tokenizer, model) singleton
- generate(text, ...)              → (raw_str, payload_or_None)
- linear_to_json(linear_str)       → dict | None
- apply_entity_correction(p, cmd)  → corrected payload
- get_missing_slots(payload)       → list[(idx, intent, key)]
- fill_slots(payload, text, miss)  → payload (slot-filling)
- execute_payload(payload)         → list[str]
- compute_spans(command, params)   → list[{start, end, key}]
- KNOWN_PARAMS, REQUIRED_PARAMS, OPTIONAL_PARAMS, EXECUTORS, INTENT_META
"""

from __future__ import annotations

import os
import re
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from typing import Optional

import torch
from transformers import AutoTokenizer, T5ForConditionalGeneration

# ============================================================
# CONFIG
# ============================================================
# The model directory can be overridden via env var so this works on any machine.
# Defaults to the path the user originally trained against.
MODEL_DIR = os.environ.get(
    "GROUNDING_MODEL_DIR",
    str(Path.home() / "Downloads" / "my_ai_project" / "flan_t5_api_model_v3"),
)

# MPS (Apple Silicon) > CUDA > CPU
if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

PREFIX = "translate command to API: "
MAX_INPUT_LEN = 128
DEFAULT_MAX_TARGET_LEN = 256

# ============================================================
# INTENT SCHEMA
# ============================================================
KNOWN_PARAMS: dict[str, list[str]] = {
    "send_email":       ["to", "subject", "body"],
    "schedule_meeting": ["person", "time", "date"],
    "set_reminder":     ["task", "time", "date"],
    "send_message":     ["to", "message"],
    "create_task":      ["title", "due_date", "priority"],
    "search_web":       ["query"],
    "play_music":       ["song", "artist"],
    "set_alarm":        ["time", "label"],
    "get_weather":      ["location"],
    "book_cab":         ["pickup", "destination", "time"],
}

# Required = all schema params except those marked optional.
OPTIONAL_PARAMS = {"body", "priority", "label", "artist"}

REQUIRED_PARAMS: dict[str, list[str]] = {
    intent: [p for p in params if p not in OPTIONAL_PARAMS]
    for intent, params in KNOWN_PARAMS.items()
}

# Metadata for client-side rendering (icons / accent hues / human labels).
# Mirrors the constants the frontend uses so a single source of truth is
# available if you ever want to ship `/intents`.
INTENT_META: dict[str, dict] = {
    "send_email":       {"label": "Send email",       "icon": "mail",     "hue": 230},
    "schedule_meeting": {"label": "Schedule meeting", "icon": "calendar", "hue": 160},
    "set_reminder":     {"label": "Set reminder",     "icon": "bell",     "hue": 35},
    "send_message":     {"label": "Send message",     "icon": "chat",     "hue": 285},
    "create_task":      {"label": "Create task",      "icon": "check",    "hue": 175},
    "search_web":       {"label": "Search web",       "icon": "search",   "hue": 210},
    "play_music":       {"label": "Play music",       "icon": "music",    "hue": 320},
    "set_alarm":        {"label": "Set alarm",        "icon": "alarm",    "hue": 15},
    "get_weather":      {"label": "Get weather",      "icon": "cloud",    "hue": 200},
    "book_cab":         {"label": "Book cab",         "icon": "car",      "hue": 50},
}

# Executors — return plain strings so the API can ship them straight through.
EXECUTORS = {
    "send_email":       lambda p: f"Email sent to {p.get('to','?')} — Subject: {p.get('subject','?')}",
    "schedule_meeting": lambda p: f"Meeting with {p.get('person','?')} on {p.get('date','?')} at {p.get('time','?')}",
    "set_reminder":     lambda p: f"Reminder: {p.get('task','?')} on {p.get('date','?')} at {p.get('time','?')}",
    "send_message":     lambda p: f"Message to {p.get('to','?')}: {p.get('message','?')}",
    "create_task":      lambda p: f"Task created: {p.get('title','?')} — due {p.get('due_date','?')}",
    "search_web":       lambda p: f"Searching: {p.get('query','?')}",
    "play_music":       lambda p: f"Playing {p.get('song','?')} by {p.get('artist','?')}",
    "set_alarm":        lambda p: f"Alarm set for {p.get('time','?')} — {p.get('label','?')}",
    "get_weather":      lambda p: f"Weather for {p.get('location','?')}",
    "book_cab":         lambda p: f"Cab booked: {p.get('pickup','?')} → {p.get('destination','?')}",
}

# Temporal params that should only be injected as null if the model explicitly
# output them as NULL, not if the model simply omitted them.
TEMPORAL_SCHEMA_PARAMS = {"time", "date", "due_date"}

# Params that should not be fuzzy-aligned against the command string.
SKIP_COPY_PARAMS = {
    "time", "date", "duration", "priority", "repeat",
    "day", "hour", "minute", "count", "amount", "due_date",
}

MATCH_THRESHOLD = 0.55

# ============================================================
# NAME EXTRACTION PATTERNS
# ============================================================
NAME_PATTERNS = [
    r'(?:send|drop|shoot|fire|forward)\s+(?:a\s+|an\s+)?(?:email|mail|message|text|note)\s+to\s+(.+?)\s+(?:about|regarding|saying|that|with)',
    r'(?:send|drop|shoot|fire|forward)\s+(?:a\s+|an\s+)?(?:email|mail|message|text|note)\s+to\s+(.+?)\s*$',
    r'(?:email|mail|write)\s+to\s+(.+?)\s+(?:about|regarding|with|saying)',
    r'(?:email|mail|write)\s+to\s+(.+?)\s*$',
    r'(?:call|text|ping|contact|ring)\s+(.+?)\s+(?:and|to|about|saying|that|regarding)',
    r'(?:message)\s+(?!to\b)(.+?)\s+(?:and|to|about|saying|that|regarding)',
    r'^(?:email|mail)\s+(.+?)\s+(?:about|regarding|with)',
    r'(?:let|tell|remind|notify|inform|alert)\s+(.+?)\s+(?:know|that|about|regarding|of)',
    r'(?:meeting|call|appointment|session)\s+with\s+(.+?)\s+(?:on|at|tomorrow|today|next|this|for)',
    r'(?:meeting|call|appointment|session)\s+with\s+(.+?)\s*$',
    r'(?:cab|ride|taxi|uber)\s+for\s+(.+?)\s+(?:to|from|at)',
    r'(?:cab|ride|taxi|uber|book)\s+.*\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$',
    r'(?:ping)\s+(.+?)\s+(?:with)',
    r'with\s+(.+?)(?:\s*$|\s*,|\s+and\b)',
]

_LOCATION_WORDS = {
    "home", "office", "work", "airport", "station", "hospital", "college",
    "university", "school", "mall", "market", "park", "hotel", "cafe",
    "restaurant", "gym", "library", "temple", "church", "mosque",
    "bus stop", "metro", "railway", "downtown", "city center",
    "clinic", "pharmacy", "warehouse", "factory", "lab", "studio",
    "dormitory", "hostel", "canteen", "auditorium", "playground",
    "mumbai", "delhi", "bangalore", "bengaluru", "chennai", "kolkata",
    "hyderabad", "pune", "ahmedabad", "jaipur", "lucknow", "kanpur",
    "nagpur", "indore", "bhopal", "patna", "guwahati", "chandigarh",
    "thiruvananthapuram", "kochi", "coimbatore", "vizag", "surat",
    "vadodara", "noida", "gurgaon", "gurugram", "faridabad", "agra",
    "varanasi", "amritsar", "ranchi", "dehradun", "shimla", "manali",
    "mysore", "mysuru", "udaipur", "jodhpur", "bhubaneswar", "raipur",
    "london", "paris", "tokyo", "new york", "berlin", "sydney",
    "singapore", "dubai", "toronto", "san francisco", "seattle",
    "boston", "chicago", "los angeles", "houston", "bangkok",
    "iit", "iit guwahati", "iitg", "iit bombay", "iit delhi",
    "iit madras", "iit kanpur", "iit kharagpur", "campus",
}

PARAM_TYPE_PERSON = {"to", "person", "name", "recipient", "contact", "attendee", "artist"}
PARAM_TYPE_LOCATION = {"pickup", "destination", "location", "place", "city", "address"}

_TEMPORAL_RE = re.compile(
    r'^\d|am$|pm$|morning|afternoon|evening|night|noon|midnight|'
    r'today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|'
    r'friday|saturday|sunday|january|february|march|april|may|june|'
    r'july|august|september|october|november|december|'
    r'next\s|this\s|last\s|\d{1,2}[:/]\d{2}',
    re.IGNORECASE,
)


def _looks_temporal(value: str) -> bool:
    return bool(_TEMPORAL_RE.search(value.strip()))


def _looks_like_person_name(value: str) -> bool:
    val = value.strip()
    if not val:
        return False
    if val.lower() in _LOCATION_WORDS:
        return False
    for word in val.lower().split():
        if word in _LOCATION_WORDS:
            return False
    if len(val) <= 1:
        return False
    words = val.split()
    return bool(words) and all(w[0].isupper() for w in words if w)


# ============================================================
# LINEARIZED FORMAT PARSER
# ============================================================
def linear_to_json(linear_str: str) -> Optional[dict]:
    """Parse `[INTENT]name[PARAMS]k=v|k=v[END]` into a JSON payload."""
    actions = []
    try:
        for block in linear_str.split("[INTENT]"):
            block = block.strip()
            if not block:
                continue
            intent_part = block.split("[PARAMS]")
            intent = intent_part[0].strip()
            if not intent:
                continue
            params: dict = {}
            if len(intent_part) > 1:
                params_str = intent_part[1].replace("[END]", "").strip()
                if params_str:
                    for pair in params_str.split("|"):
                        pair = pair.strip()
                        if "=" in pair:
                            key, val = pair.split("=", 1)
                            key, val = key.strip(), val.strip()
                            params[key] = None if val == "NULL" else val
            actions.append({"intent": intent, "parameters": params})
    except Exception:
        pass
    return {"actions": actions} if actions else None


# ============================================================
# ENTITY CORRECTION
# ============================================================
def _extract_name(command: str) -> Optional[str]:
    for pattern in NAME_PATTERNS:
        match = re.search(pattern, command, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            name = re.sub(r'\s+(?:him|her|them|his|their)\s*$', '', name, flags=re.IGNORECASE)
            return name
    return None


def _ngrams(text: str, max_n: int = 8) -> list[str]:
    words = text.split()
    out = []
    for n in range(1, min(max_n, len(words)) + 1):
        for i in range(len(words) - n + 1):
            out.append(" ".join(words[i:i + n]))
    return out


def _align(value: str, source: str) -> str:
    """Snap a fuzzy value to the nearest n-gram in the source command."""
    if not value or not source:
        return value
    candidates = _ngrams(source)
    best, best_r = value, 0.0
    for c in candidates:
        r = SequenceMatcher(None, value.lower(), c.lower()).ratio()
        if r > best_r:
            best_r, best = r, c
    return best if best_r >= MATCH_THRESHOLD else value


def _enforce_schema(result: dict) -> dict:
    if not result or "actions" not in result:
        return result
    for action in result["actions"]:
        intent = action.get("intent", "")
        params = action.get("parameters", {})
        required = KNOWN_PARAMS.get(intent, [])
        for key in required:
            if key not in params and key not in TEMPORAL_SCHEMA_PARAMS:
                params[key] = None
    return result


def _is_grounded(value: str, command: str) -> bool:
    if not value or not command:
        return False
    val_lower = value.strip().lower()
    cmd_lower = command.lower()
    if val_lower in cmd_lower:
        return True
    for ngram in _ngrams(command, max_n=8):
        if SequenceMatcher(None, val_lower, ngram.lower()).ratio() >= 0.6:
            return True
    return False


def apply_entity_correction(result: dict, command: str) -> dict:
    """Cross-check every extracted value against the original command.

    - Person slots: fuzzy-align to extracted-name regex; drop temporals.
    - Location slots: grounding + person-name guard; drop hallucinations.
    - All other slots: grounding check + fuzzy align.
    """
    if not result or "actions" not in result:
        return result
    result = _enforce_schema(result)
    name = _extract_name(command)

    for action in result["actions"]:
        params = action.get("parameters", {})

        for key, value in list(params.items()):
            if value is None or key.lower() in SKIP_COPY_PARAMS:
                continue

            k = key.lower()

            if k in PARAM_TYPE_PERSON:
                if _looks_temporal(value):
                    params[key] = None
                    continue
                if name:
                    ratio = SequenceMatcher(None, value.lower(), name.lower()).ratio()
                    if ratio < 0.5:
                        params[key] = name
                    else:
                        params[key] = _align(value, command)
                    continue
                if not _is_grounded(value, command):
                    params[key] = None
                    continue
                params[key] = _align(value, command)
                continue

            if k in PARAM_TYPE_LOCATION:
                if not _is_grounded(value, command):
                    params[key] = None
                    continue
                if name and SequenceMatcher(None, value.lower(), name.lower()).ratio() > 0.5:
                    params[key] = None
                    continue
                if _looks_like_person_name(value) and value.lower() not in _LOCATION_WORDS:
                    params[key] = None
                    continue
                params[key] = _align(value, command)
                continue

            # Freetext (subject, message, query, etc.)
            if not _is_grounded(value, command):
                params[key] = None
                continue
            if isinstance(value, str) and len(value) > 1:
                params[key] = _align(value, command)

    return result


# ============================================================
# MODEL LOADING — cached singleton
# ============================================================
@lru_cache(maxsize=1)
def load_model():
    """Load tokenizer + model once. Cached so it survives across requests."""
    if not Path(MODEL_DIR).exists():
        raise FileNotFoundError(
            f"Model directory not found at {MODEL_DIR!r}. "
            f"Set GROUNDING_MODEL_DIR env var or place the model files there."
        )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = T5ForConditionalGeneration.from_pretrained(
        MODEL_DIR,
        torch_dtype=torch.float32,
    ).to(DEVICE)
    model.eval()
    return tokenizer, model


# ============================================================
# GENERATION
# ============================================================
def generate(
    command: str,
    tokenizer=None,
    model=None,
    max_target_len: int = DEFAULT_MAX_TARGET_LEN,
) -> tuple[str, Optional[dict]]:
    """Run the model on `command`. Returns (raw_decoded_string, parsed_json_or_None).

    The model is loaded on first call if not supplied.
    Three decoding strategies are tried in order; the first that parses wins.
    """
    if tokenizer is None or model is None:
        tokenizer, model = load_model()

    input_text = PREFIX + command
    inputs = tokenizer(
        input_text,
        return_tensors="pt",
        truncation=True,
        max_length=MAX_INPUT_LEN,
    ).to(DEVICE)

    configs = [
        dict(num_beams=5, early_stopping=True, repetition_penalty=1.3, length_penalty=1.0),
        dict(num_beams=8, early_stopping=True, repetition_penalty=1.0, length_penalty=1.0),
        dict(num_beams=1, do_sample=False),
    ]

    decoded = ""
    for cfg in configs:
        with torch.no_grad():
            ids = model.generate(
                inputs.input_ids,
                attention_mask=inputs.attention_mask,
                max_length=max_target_len,
                **cfg,
            )
        decoded = tokenizer.decode(ids[0], skip_special_tokens=True)
        result = linear_to_json(decoded)
        if result is not None:
            result = apply_entity_correction(result, command)
            return decoded, result

    return decoded, None


# ============================================================
# SLOT FILLING
# ============================================================
def get_missing_slots(payload: dict) -> list[tuple[int, str, str]]:
    """List of (action_idx, intent, key) for null required slots."""
    missing: list[tuple[int, str, str]] = []
    for i, action in enumerate(payload.get("actions", [])):
        intent = action.get("intent", "")
        required = REQUIRED_PARAMS.get(intent, [])
        for key, value in action.get("parameters", {}).items():
            if value is None and key in required:
                missing.append((i, intent, key))
    return missing


def fill_slots(
    payload: dict,
    user_input: str,
    missing: list[tuple[int, str, str]],
) -> dict:
    """Fill missing slots from `user_input`.

    Accepts: 'key=value', 'key: value' (only when key is a known missing param),
    or plain comma-separated values applied in `missing` order.
    """
    parts = [s.strip() for s in re.split(r'[,;]', user_input) if s.strip()]
    missing_keys = {k.lower() for _, _, k in missing}

    kv_parsed: dict[str, str] = {}
    plain_values: list[str] = []
    for part in parts:
        matched_kv = False
        if "=" in part:
            k, v = part.split("=", 1)
            kv_parsed[k.strip().lower()] = v.strip()
            matched_kv = True
        elif ":" in part:
            k, v = part.split(":", 1)
            k_clean = k.strip().lower()
            # ':' is only a KV separator when LHS is a known missing key
            # (otherwise it's a time like "3:30pm").
            if k_clean in missing_keys and k_clean.isalpha():
                kv_parsed[k_clean] = v.strip()
                matched_kv = True
        if not matched_kv:
            plain_values.append(part)

    for idx, _intent, key in missing:
        if key.lower() in kv_parsed:
            payload["actions"][idx]["parameters"][key] = kv_parsed[key.lower()]
        elif plain_values:
            payload["actions"][idx]["parameters"][key] = plain_values.pop(0)

    return payload


def execute_payload(payload: dict) -> list[str]:
    """Run each action's executor; return human-readable result strings."""
    results: list[str] = []
    for action in payload.get("actions", []):
        intent = action.get("intent", "UNKNOWN")
        params = action.get("parameters", {})
        executor = EXECUTORS.get(intent)
        results.append(executor(params) if executor else f"No executor for intent `{intent}`")
    return results


# ============================================================
# SPAN COMPUTATION (for frontend entity highlighting)
# ============================================================
def compute_spans(command: str, params: dict) -> list[dict]:
    """For each non-null param value, locate its [start, end) in the command.

    Tries exact substring match first; falls back to best n-gram fuzzy match
    above MATCH_THRESHOLD. Overlapping spans are deduplicated, keeping the
    earliest+longest.
    """
    if not command or not params:
        return []

    raw_spans: list[dict] = []
    cmd_lower = command.lower()

    for key, value in params.items():
        if value is None or not isinstance(value, str):
            continue
        val = value.strip()
        if not val:
            continue

        val_lower = val.lower()

        # Direct match
        idx = cmd_lower.find(val_lower)
        if idx >= 0:
            raw_spans.append({"start": idx, "end": idx + len(val_lower), "key": key})
            continue

        # Fuzzy n-gram match
        best_pos = -1
        best_end = -1
        best_r = 0.0
        for ngram in _ngrams(command, max_n=8):
            r = SequenceMatcher(None, val_lower, ngram.lower()).ratio()
            if r > best_r:
                # Find the ngram's actual position in the source (case-insensitive)
                # by walking through the original command preserving word boundaries.
                pos = _find_ngram_pos(command, ngram)
                if pos >= 0:
                    best_r = r
                    best_pos = pos
                    best_end = pos + len(ngram)

        if best_r >= MATCH_THRESHOLD and best_pos >= 0:
            raw_spans.append({"start": best_pos, "end": best_end, "key": key})

    # Deduplicate: sort by start asc, then by length desc; greedily keep
    # non-overlapping spans.
    raw_spans.sort(key=lambda s: (s["start"], -(s["end"] - s["start"])))
    deduped: list[dict] = []
    last_end = -1
    for s in raw_spans:
        if s["start"] >= last_end:
            deduped.append(s)
            last_end = s["end"]
    return deduped


def _find_ngram_pos(command: str, ngram: str) -> int:
    """Find the position of a word-level n-gram inside `command`. Returns -1 if absent.

    Uses word boundaries to avoid spurious mid-word matches.
    """
    # Build a regex that allows arbitrary whitespace between the words.
    words = [re.escape(w) for w in ngram.split()]
    if not words:
        return -1
    pattern = r"\b" + r"\s+".join(words) + r"\b"
    m = re.search(pattern, command, re.IGNORECASE)
    return m.start() if m else -1


# ============================================================
# CONFIDENCE
# ============================================================
def compute_confidence(intent: Optional[str], params: dict) -> float:
    """Heuristic confidence: 0.65 base + up to 0.34 from slot fill ratio."""
    if not intent:
        return 0.0
    schema = KNOWN_PARAMS.get(intent, [])
    if not schema:
        return 0.65
    filled = sum(1 for k in schema if params.get(k) not in (None, ""))
    return round(min(0.99, 0.65 + (filled / len(schema)) * 0.34), 3)
