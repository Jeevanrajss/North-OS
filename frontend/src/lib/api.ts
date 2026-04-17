// Minimal fetch client. All API calls route through /api (Vite proxy in dev).

const BASE = '/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  aiPing: (prompt: string) =>
    request<AiPingResponse>('/ai/ping', {
      method: 'POST',
      body: JSON.stringify({ prompt, purpose: 'chat' }),
    }),
};

export type HealthResponse = {
  app: { name: string; version: string; env: string; timezone: string; currency: string };
  db: { ok: boolean; path: string; error: string | null };
  llm: {
    ok: boolean;
    provider?: string;
    host: string;
    chat_model?: string;
    fast_model?: string;
    embed_model?: string;
    models_available?: string[];
    chat_loaded?: boolean;
    embed_loaded?: boolean;
    error?: string;
  };
};

export type AiPingResponse = {
  model: string;
  response: string;
};
