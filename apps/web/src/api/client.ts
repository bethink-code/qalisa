const ENGINE_URL = (import.meta.env.VITE_ENGINE_URL as string | undefined) ?? "";
const BASE = `${ENGINE_URL}/v1`;

/** Absolute engine base URL — used for webhook URL display. */
export function engineBaseUrl(): string {
  return ENGINE_URL || "http://localhost:4000";
}
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
  provider: "mailgun" | "mailjet" | "smsportal" | "meta_cloud_api";
  config: Record<string, unknown>;
  status: "unverified" | "healthy" | "failing";
  lastHealthCheckAt: string | null;
  remainingBalance: number | null;
  balanceUpdatedAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  provider: "mailgun" | "mailjet" | "smsportal" | "meta_cloud_api";
  to: string;
  body: string;
  status: "queued" | "sent" | "delivered" | "failed";
  providerMessageId: string | null;
  error: string | null;
  cost: number | null;
  parts: number | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

export interface WaButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "OTP";
  text: string;
  url?: string;
  urlExample?: string;
  phoneNumber?: string;
  otpType?: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
  packageName?: string;
  signatureHash?: string;
}

export interface WaComponents {
  header?: { format: string; text?: string; varName?: string; varExample?: string; handle?: string } | null;
  body: { text?: string; examples?: Record<string, string>; addSecurityRecommendation?: boolean };
  footer?: { text?: string; codeExpirationMinutes?: number } | null;
  buttons?: WaButton[] | null;
}

export interface Template {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  name: string;
  body: string;
  variables: Record<string, string>;
  whatsappStatus: "pending" | "approved" | "rejected" | null;
  metaTemplateName: string | null;
  metaTemplateId: string | null;
  whatsappCategory: string | null;
  whatsappLanguage: string | null;
  whatsappRejectionReason: string | null;
  components: WaComponents | null;
  parameterFormat: string | null;
  createdAt: string;
}

export const api = {
  me: {
    get: () => apiFetch<{ id: string; name: string }>("/me"),
  },

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
    submitWhatsapp: (id: string, body: { category: string; language?: string }) =>
      apiFetch<Template>(`/templates/${id}/submit-whatsapp`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getOne: (id: string) => apiFetch<Template>(`/templates/${id}`),
  },
};
