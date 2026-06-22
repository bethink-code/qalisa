const BASE = "/v1";
const KEY = "qalisa_api_key";

export function getApiKey(): string {
  return localStorage.getItem(KEY) ?? "";
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY);
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });

  if (res.status === 401) {
    clearApiKey();
    window.location.href = "/login";
    throw new ApiError("Unauthenticated", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Typed API calls ──────────────────────────────────────────

export interface Credential {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  provider: "mailgun" | "smsportal" | "meta_cloud_api";
  config: Record<string, unknown>;
  status: "unverified" | "healthy" | "failing";
  lastHealthCheckAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  provider: "mailgun" | "smsportal" | "meta_cloud_api";
  to: string;
  status: "queued" | "sent" | "delivered" | "failed";
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

export interface Template {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  name: string;
  body: string;
  variables: Record<string, string>;
  whatsappStatus: "pending" | "approved" | "rejected" | null;
  createdAt: string;
}

export const api = {
  credentials: {
    list: () => apiFetch<Credential[]>("/credentials"),
    create: (body: unknown) =>
      apiFetch<Credential>("/credentials", { method: "POST", body: JSON.stringify(body) }),
    test: (id: string) =>
      apiFetch<{ status: string; detail: string }>(`/credentials/${id}/test`, { method: "POST" }),
    delete: (id: string) => apiFetch<void>(`/credentials/${id}`, { method: "DELETE" }),
  },

  messages: {
    list: () => apiFetch<Message[]>("/messages"),
    send: (body: unknown) =>
      apiFetch<{ messageId: string; status: string }>("/messages", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  templates: {
    list: () => apiFetch<Template[]>("/templates"),
    create: (body: unknown) =>
      apiFetch<Template>("/templates", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: unknown) =>
      apiFetch<Template>(`/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<void>(`/templates/${id}`, { method: "DELETE" }),
  },
};
