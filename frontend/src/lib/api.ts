// src/lib/api.ts
// Typed fetch wrappers for the FastAPI backend.

import type {
  ExecuteAction,
  ExecuteResponse,
  HealthResponse,
  ParseResponse,
} from "@/types/schema";

// In dev, Vite proxies /api → http://127.0.0.1:8000.
// In production, override with VITE_API_BASE in your .env.production.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

const DEFAULT_TIMEOUT = 30_000;

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT, ...rest } = init;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
    });
  } catch (err) {
    window.clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(408, "Request timed out");
    }
    throw new ApiError(0, "Network error — is the FastAPI server running?");
  }
  window.clearTimeout(timer);

  let body: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    body = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const detail =
      (typeof body === "object" && body !== null && "detail" in body && (body as { detail: unknown }).detail) ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, String(detail), body);
  }

  return body as T;
}

// ---------- public API ----------

export function parseCommand(text: string, maxTargetLen = 256): Promise<ParseResponse> {
  return request<ParseResponse>("/parse", {
    method: "POST",
    body: JSON.stringify({ text, max_target_len: maxTargetLen }),
  });
}

export function executeActions(actions: ExecuteAction[]): Promise<ExecuteResponse> {
  return request<ExecuteResponse>("/execute", {
    method: "POST",
    body: JSON.stringify({ actions }),
  });
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health", {
    method: "GET",
    timeoutMs: 5_000,
  });
}
