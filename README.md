# Grounding — NLP → API Translator

A FLAN-T5-base service that translates natural-language commands into structured API payloads, with a production React frontend.

```
"Email Priya about the Q4 roadmap review"
        ↓
{
  "actions": [{
    "intent": "send_email",
    "parameters": {
      "to": "Priya",
      "subject": "Q4 roadmap review",
      "body": null
    }
  }]
}
```

The model and parsing logic live in `core.py` (framework-agnostic). `api.py` exposes them over FastAPI, and a Vite + React + TypeScript frontend consumes the API.

## Architecture

```
┌───────────────────────┐                ┌────────────────────────┐
│  React + Vite (5173)  │ ── /api/* ───► │  FastAPI (8000)        │
│  TypeScript           │                │  ├─ /parse             │
│  Geist Sans + Mono    │                │  ├─ /execute           │
│  localStorage history │                │  ├─ /intents           │
│  ⌘K · Esc · settings  │                │  └─ /health            │
└───────────────────────┘                └────────────┬───────────┘
                                                      │
                                          ┌───────────▼────────────┐
                                          │  core.py               │
                                          │  ├─ FLAN-T5-base       │
                                          │  ├─ linear_to_json     │
                                          │  ├─ entity correction  │
                                          │  ├─ slot filling       │
                                          │  └─ span computation   │
                                          └────────────────────────┘
```

Supports 10 intents: `send_email`, `schedule_meeting`, `set_reminder`, `send_message`, `create_task`, `search_web`, `play_music`, `set_alarm`, `get_weather`, `book_cab`.

## Project layout

```
.
├── core.py              ← model + parsing logic (framework-agnostic)
├── api.py               ← FastAPI server
├── requirements.txt
├── README.md
└── frontend/
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts   ← proxies /api → :8000 in dev
    ├── .env.example
    └── src/
        ├── main.tsx
        ├── App.tsx                  ← orchestrates parse → fill → execute
        ├── styles/globals.css       ← design tokens, oklch palette
        ├── types/schema.ts          ← shared types (mirror Pydantic)
        ├── lib/
        │   ├── api.ts               ← typed fetch wrappers
        │   ├── intents.ts           ← per-intent icons, hues, params
        │   └── examples.ts          ← 10 empty-state examples
        ├── hooks/
        │   ├── useSettings.ts       ← theme · accent · density · etc.
        │   ├── useHistory.ts        ← localStorage history
        │   └── useHotkeys.ts        ← ⌘K · Esc · ⌥N
        └── components/
            ├── Icon.tsx · Header.tsx · Sidebar.tsx
            ├── IntentBadge.tsx · CommandInput.tsx · HighlightedCommand.tsx
            ├── Pipeline.tsx · ParamTable.tsx
            ├── JsonInspector.tsx · ExecutionCard.tsx
            ├── EmptyState.tsx · SchemaCard.tsx
            └── SettingsPanel.tsx
```

## Setup

You'll run two processes: the FastAPI backend on `:8000` and the Vite dev server on `:5173`.

### 1. Backend

Make sure your fine-tuned FLAN-T5 model is on disk. By default `core.py` looks at:

```
~/Downloads/my_ai_project/flan_t5_api_model_v3
```

To point at a different directory, set the env var:

```bash
export GROUNDING_MODEL_DIR=/path/to/flan_t5_api_model_v3
```

Then install and run:

```bash
# from the project root
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn api:app --reload --port 8000
```

You should see:

```
INFO  Loading model from … on mps …
INFO  Model loaded in 2148 ms on mps
INFO  Uvicorn running on http://127.0.0.1:8000
```

Open <http://127.0.0.1:8000/docs> for the auto-generated Swagger UI.

#### Health check

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok","model_loaded":true,"device":"mps",...}
```

#### Try parse / execute

```bash
curl -X POST http://127.0.0.1:8000/parse \
  -H 'content-type: application/json' \
  -d '{"text":"Email Priya about the Q4 roadmap review"}'

curl -X POST http://127.0.0.1:8000/execute \
  -H 'content-type: application/json' \
  -d '{"actions":[{"intent":"send_email","parameters":{"to":"Priya","subject":"Q4 roadmap review","body":null}}]}'
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env          # optional — defaults work out of the box
npm install
npm run dev
```

Open <http://localhost:5173>.

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000`, so the frontend uses relative URLs and there's no CORS preflight overhead in dev.

### 3. Production build

```bash
cd frontend
npm run build                 # outputs to frontend/dist/
npm run preview               # serves dist/ on :4173
```

For a production deploy, either:

- Serve the `dist/` directory behind the same origin as the FastAPI server (recommended — keep `VITE_API_BASE` unset and put a reverse proxy in front of both), or
- Set `VITE_API_BASE=https://api.yourdomain.com` in `frontend/.env.production` before building, and configure CORS via the `GROUNDING_CORS_ORIGINS` env var on the backend.

## Backend API

### `POST /parse`

**Request**

```json
{ "text": "Schedule a meeting with Daniel tomorrow at 3 pm", "max_target_len": 256 }
```

**Response**

```json
{
  "command": "Schedule a meeting with Daniel tomorrow at 3 pm",
  "intent": "schedule_meeting",
  "params": { "person": "Daniel", "time": "3 pm", "date": "tomorrow" },
  "missing": [],
  "confidence": 0.99,
  "spans": [
    { "start": 27, "end": 33, "key": "person" },
    { "start": 34, "end": 42, "key": "date" },
    { "start": 46, "end": 50, "key": "time" }
  ],
  "raw": "[INTENT]schedule_meeting[PARAMS]person=Daniel|time=3 pm|date=tomorrow[END]",
  "latency_ms": 412
}
```

If the model can't classify the input, `intent` is `null` and the UI surfaces a "couldn't classify" error.

> **Note on `confidence`.** This is a lightweight heuristic derived from how many of the intent's schema slots were filled (`0.65` base + slot-fill ratio), not a calibrated model probability. Treat it as a completeness signal for the UI, not a true uncertainty estimate.

### `POST /execute`

**Request**

```json
{ "actions": [{ "intent": "set_alarm", "parameters": { "time": "6:30 am", "label": "morning run" } }] }
```

**Response**

```json
{ "results": ["Alarm set for 6:30 am — morning run"] }
```

### `GET /intents`

Returns the full schema (params, required, optional) plus UI metadata (label, icon, hue) for all 10 intents. Useful if you want the frontend to ask the server instead of hardcoding `src/lib/intents.ts`.

### `GET /health`

Reports model load status, device (`cpu` / `cuda` / `mps`), and the resolved model directory.

## Frontend behavior

### Pipeline animation

Every translation walks through four named stages:

1. **Command** — natural-language text arrives at the input
2. **Intent** — model classifies one of 10 intents
3. **Parameters** — slots extracted; missing required slots prompted inline
4. **Execution** — payload dispatched to `/execute`

The UI animates between stages with a sliding pulse along the connector lines and color-shifts the step circles (gray → violet → green).

### Slot-filling

When required slots are missing, the parameter table swaps them for autofocused inputs. Each filled value is tagged as either `model` (extracted) or `filled` (user). Once all required slots are populated, an "Execute API call" button appears.

### Entity highlighting

The original sentence is re-rendered with extracted entities wrapped in colored pill tokens — `to`, `subject`, `time`, etc. — using each intent's signature hue. Position information comes from the backend's `spans` array; the alignment uses fuzzy n-gram matching when the extracted value doesn't appear verbatim in the command.

### Keyboard shortcuts

| Shortcut    | Action                              |
| ----------- | ----------------------------------- |
| ⌘K / Ctrl+K | Focus the command input             |
| ↵           | Submit the command                  |
| Esc         | Dismiss the current session         |
| ⌥N / Alt+N  | New translation (clears the screen) |

### Persistence

- Translation history (last 30) is stored in `localStorage` under `grounding:history:v1`. Click any entry to replay it.
- Settings (theme, accent, density, JSON view, highlight toggle, JSON panel toggle) are stored under `grounding:settings:v1`.

### Theme & customization

The settings panel (gear icon in the header, or ⌘,) toggles:

- **Theme** — light / dark
- **Accent** — violet, indigo, amber, emerald, rose
- **Density** — cozy / comfy / spacious
- **JSON view** — tree / raw
- **Entity highlighting** — on / off
- **JSON panel** — show / hide right rail

Everything wires through CSS custom properties (`--accent-hue`, `--pad`, `--gap`) defined in `src/styles/globals.css`, so adding more accents is a one-line change in `useSettings.ts`.

## Environment variables

| Variable                  | Used by  | Default                                            | Purpose                                  |
| ------------------------- | -------- | -------------------------------------------------- | ---------------------------------------- |
| `GROUNDING_MODEL_DIR`     | backend  | `~/Downloads/my_ai_project/flan_t5_api_model_v3`   | Path to the fine-tuned FLAN-T5 model     |
| `GROUNDING_CORS_ORIGINS`  | backend  | `http://localhost:5173, …:3000` (+127.0.0.1)       | Comma-separated CORS allowlist           |
| `HOST` / `PORT`           | backend  | `127.0.0.1` / `8000`                               | Used when running `python api.py`        |
| `VITE_DEV_BACKEND`        | frontend | `http://127.0.0.1:8000`                            | Where Vite proxies `/api/*` in dev       |
| `VITE_API_BASE`           | frontend | unset (uses `/api`)                                | Absolute API base URL for prod builds    |

## Troubleshooting

**Model fails to load**
The backend stays up so `/health` works, and `/parse` returns 503 with the error. Check that `GROUNDING_MODEL_DIR` points to a directory containing `config.json`, `pytorch_model.bin` (or `model.safetensors`), and a tokenizer.

**`Network error — is the FastAPI server running?` in the UI**
Vite is trying to proxy `/api` but nothing's listening. Start the backend with `uvicorn api:app --reload --port 8000`.

**Slow first inference**
First inference takes longer because the model warms up and PyTorch JIT-compiles kernels. Subsequent calls are 200–500 ms on Apple Silicon (MPS) and 50–150 ms on CUDA.

**`Cannot read property 'createRoot' of undefined`**
You're probably on an old Node version. Vite 5 needs Node ≥ 18.
