import { useEffect, useState } from "react";
import { type Credential, api, engineBaseUrl } from "../api/client";

type Channel = "email" | "sms" | "whatsapp";

interface FieldMeta {
  key: string;
  label: string;
  hint?: string;
  optional?: boolean;
}

const CHANNELS: {
  channel: Channel;
  label: string;
  provider: string;
  webhookPath: string;
  webhookHint: string;
  configFields: FieldMeta[];
  secretLabel: string;
}[] = [
  {
    channel: "email",
    label: "Email — Mailgun",
    provider: "mailgun",
    webhookPath: "mailgun",
    webhookHint: "Paste into Mailgun dashboard → Webhooks for your domain.",
    configFields: [
      { key: "domain", label: "Domain", hint: "e.g. mg.example.com" },
      { key: "fromAddress", label: "From Address", hint: "e.g. Acme <hello@mg.example.com>", optional: true },
      { key: "region", label: "Region", hint: "us (default) or eu", optional: true },
      { key: "webhookSigningKey", label: "Webhook Signing Key", hint: "Mailgun dashboard → Webhooks → HTTP webhook signing key" },
    ],
    secretLabel: "API Key",
  },
  {
    channel: "sms",
    label: "SMS — SMSPortal",
    provider: "smsportal",
    webhookPath: "smsportal",
    webhookHint: "Paste into SMSPortal dashboard → Delivery Receipts callback URL.",
    configFields: [
      { key: "clientId", label: "Client ID" },
    ],
    secretLabel: "Client Secret",
  },
  {
    channel: "whatsapp",
    label: "WhatsApp — Meta Cloud API",
    provider: "meta_cloud_api",
    webhookPath: "meta",
    webhookHint: "Paste into Meta App → Webhooks. The Verify Token must match the value you set below.",
    configFields: [
      { key: "wabaId", label: "WhatsApp Business Account ID" },
      { key: "phoneNumberId", label: "Phone Number ID" },
      { key: "appSecret", label: "App Secret", hint: "Meta app settings → Basic" },
      { key: "webhookVerifyToken", label: "Webhook Verify Token", hint: "Any secret string — enter the same value in Meta dashboard" },
    ],
    secretLabel: "System User Access Token",
  },
];

function statusPill(s: Credential["status"]) {
  if (s === "healthy") return <span className="pill ok">healthy</span>;
  if (s === "failing") return <span className="pill error">failing</span>;
  return <span className="pill muted">unverified</span>;
}

function WebhookUrlBox({ url, hint }: { url: string; hint: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ borderTop: "1px solid var(--hairline)", padding: "16px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--graphite)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Webhook URL
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="input"
          readOnly
          value={url}
          style={{ fontFamily: "monospace", fontSize: 12, flex: 1 }}
          onFocus={(e) => e.target.select()}
        />
        <button className="btn sm" onClick={copy} style={{ whiteSpace: "nowrap" }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--graphite)" }}>{hint}</p>
    </div>
  );
}

interface AddFormProps {
  channel: Channel;
  provider: string;
  configFields: FieldMeta[];
  secretLabel: string;
  onSaved: () => void;
  onCancel: () => void;
}

function AddForm({ channel, provider, configFields, secretLabel, onSaved, onCancel }: AddFormProps) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(key: string, val: string) {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.credentials.create({ channel, provider, config, secret });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "20px", borderTop: "1px solid var(--hairline)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        {configFields.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={f.key}>
              {f.label}
              {f.optional && <span style={{ color: "var(--graphite)", fontWeight: 400, marginLeft: 4 }}>(optional)</span>}
            </label>
            <input
              id={f.key}
              className="input"
              value={config[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              required={!f.optional}
            />
            {f.hint && <span className="field-hint">{f.hint}</span>}
          </div>
        ))}
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="secret">{secretLabel}</label>
          <input
            id="secret"
            className="input"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
        </div>
      </div>
      {error && (
        <div style={{ color: "var(--status-red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" disabled={saving}>{saving ? "Saving…" : "Save credential"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export function CredentialsPage() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { status: string; detail: string }>>({});
  const [adding, setAdding] = useState<Channel | null>(null);

  function reload() {
    api.credentials.list().then(setCreds).finally(() => setLoading(false));
  }

  useEffect(() => {
    void api.me.get().then((m) => setTenantId(m.id));
    reload();
  }, []);

  async function testCred(id: string) {
    setTesting(id);
    try {
      const r = await api.credentials.test(id);
      setTestResult((prev) => ({ ...prev, [id]: r }));
      reload();
    } finally {
      setTesting(null);
    }
  }

  async function deleteCred(id: string) {
    if (!confirm("Delete this credential?")) return;
    await api.credentials.delete(id);
    reload();
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Credentials</h1>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        CHANNELS.map(({ channel, label, provider, webhookPath, webhookHint, configFields, secretLabel }) => {
          const existing = creds.find((c) => c.channel === channel);
          const isAdding = adding === channel;
          const webhookUrl = tenantId
            ? `${engineBaseUrl()}/v1/webhooks/${webhookPath}/${tenantId}`
            : "";

          return (
            <div key={channel} className="panel">
              <div className="panel-head">
                <span className="panel-title">{label}</span>
                {!existing && !isAdding && (
                  <button className="btn sm" onClick={() => setAdding(channel)}>Add</button>
                )}
              </div>

              {existing ? (
                <>
                  <div className="panel-body tight">
                    <div className="cred-card">
                      <div className="cred-info">
                        <div className="cred-name">
                          {String(existing.config.domain ?? existing.config.clientId ?? existing.config.phoneNumberId ?? "—")}
                        </div>
                        <div className="cred-meta">
                          {statusPill(existing.status)}
                          {testResult[existing.id] && (
                            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--graphite)" }}>
                              {testResult[existing.id]!.detail}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="cred-actions">
                        <button
                          className="btn sm"
                          onClick={() => testCred(existing.id)}
                          disabled={testing === existing.id}
                        >
                          {testing === existing.id ? "Testing…" : "Test"}
                        </button>
                        <button className="btn sm danger" onClick={() => deleteCred(existing.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  {webhookUrl && <WebhookUrlBox url={webhookUrl} hint={webhookHint} />}
                </>
              ) : isAdding ? (
                <AddForm
                  channel={channel}
                  provider={provider}
                  configFields={configFields}
                  secretLabel={secretLabel}
                  onSaved={() => { setAdding(null); reload(); }}
                  onCancel={() => setAdding(null)}
                />
              ) : (
                <div className="empty-state" style={{ padding: "20px 24px", textAlign: "left" }}>
                  No credential configured.
                </div>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}
