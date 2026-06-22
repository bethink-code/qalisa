import { useEffect, useState } from "react";
import { type Credential, api } from "../api/client";

type Channel = "email" | "sms" | "whatsapp";

const CHANNELS: { channel: Channel; label: string; provider: string; configFields: string[]; secretLabel: string }[] = [
  {
    channel: "email",
    label: "Email — Mailgun",
    provider: "mailgun",
    configFields: ["domain", "fromAddress", "region", "webhookSigningKey"],
    secretLabel: "API Key",
  },
  {
    channel: "sms",
    label: "SMS — SMSPortal",
    provider: "smsportal",
    configFields: ["clientId"],
    secretLabel: "Client Secret",
  },
  {
    channel: "whatsapp",
    label: "WhatsApp — Meta Cloud API",
    provider: "meta_cloud_api",
    configFields: ["wabaId", "phoneNumberId", "appSecret", "webhookVerifyToken"],
    secretLabel: "System User Access Token",
  },
];

function statusPill(s: Credential["status"]) {
  if (s === "healthy") return <span className="pill ok">healthy</span>;
  if (s === "failing") return <span className="pill error">failing</span>;
  return <span className="pill muted">unverified</span>;
}

interface AddFormProps {
  channel: Channel;
  provider: string;
  configFields: string[];
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
          <div className="field" key={f}>
            <label htmlFor={f}>{f}</label>
            <input
              id={f}
              className="input"
              value={config[f] ?? ""}
              onChange={(e) => setField(f, e.target.value)}
              placeholder={f === "region" ? "us / eu" : ""}
            />
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
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { status: string; detail: string }>>({});
  const [adding, setAdding] = useState<Channel | null>(null);

  function reload() {
    api.credentials.list().then(setCreds).finally(() => setLoading(false));
  }

  useEffect(reload, []);

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
        CHANNELS.map(({ channel, label, provider, configFields, secretLabel }) => {
          const existing = creds.find((c) => c.channel === channel);
          const isAdding = adding === channel;

          return (
            <div key={channel} className="panel">
              <div className="panel-head">
                <span className="panel-title">{label}</span>
                {!existing && !isAdding && (
                  <button className="btn sm" onClick={() => setAdding(channel)}>Add</button>
                )}
              </div>

              {existing ? (
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
                      <button
                        className="btn sm danger"
                        onClick={() => deleteCred(existing.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
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
