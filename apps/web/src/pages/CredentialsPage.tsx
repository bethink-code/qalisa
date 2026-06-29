import { useEffect, useState } from "react";
import { type Credential, api, engineBaseUrl } from "../api/client";

type Channel = "email" | "sms" | "whatsapp";

const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const CHANNELS: Channel[] = ["email", "sms", "whatsapp"];

interface FieldMeta {
  key: string;
  label: string;
  hint?: string;
  optional?: boolean;
}

interface SetupStep {
  text: string;
  warning?: string;
  url?: { label: string; href: string };
}

interface WebhookStep {
  text: string;
}

const PROVIDERS: {
  channel: Channel;
  providerLabel: string;
  provider: string;
  webhookPath: string;
  webhookSteps: WebhookStep[];
  setupSteps: SetupStep[];
  configFields: FieldMeta[];
  secretLabel: string;
}[] = [
  {
    channel: "email",
    providerLabel: "Mailjet",
    provider: "mailjet",
    webhookPath: "mailjet",
    webhookSteps: [
      { text: "Log in to your Mailjet account and go to Account → Event Tracking." },
      { text: "Click \"Add a webhook URL\" and paste the URL above." },
      { text: "Tick the \"Sent\", \"Bounce\", and \"Blocked\" event types." },
      { text: "Click Save. Mailjet will start sending delivery updates to this URL." },
    ],
    setupSteps: [
      { text: "Log in to your Mailjet account.", url: { label: "Open Mailjet", href: "https://app.mailjet.com" } },
      { text: "Go to Account → Sender domains & addresses. Add your sender email address and verify it via the confirmation email.", warning: "The sender email must be verified before Mailjet will allow you to send from it." },
      { text: "Go to Account → API Keys. Your API Key is shown on the page. Click the eye icon to reveal the Secret Key." },
      { text: "Fill in the form below with your API Key, Secret Key, and verified sender address, then click \"Save credential\"." },
      { text: "Click \"Test\" to confirm everything is working, then follow the webhook setup steps that appear." },
    ],
    configFields: [
      { key: "apiKey", label: "API Key", hint: "Mailjet → Account → API Keys (the public key)" },
      { key: "fromAddress", label: "From Address", hint: "e.g. garth@bethink.co.za — must be a verified sender in Mailjet" },
      { key: "fromName", label: "From Name", hint: "e.g. Garth — displayed as the sender name", optional: true },
    ],
    secretLabel: "Secret Key",
  },
  {
    channel: "email",
    providerLabel: "Mailgun",
    provider: "mailgun",
    webhookPath: "mailgun",
    webhookSteps: [
      { text: "Log in to Mailgun and go to Sending → Webhooks." },
      { text: "Select your sending domain from the dropdown at the top." },
      { text: "Click \"Add webhook\", select the \"Delivered Messages\" event, and paste the URL above." },
      { text: "Repeat for \"Permanent Failure\" and \"Temporary Failure\" events if you want failed delivery status updates." },
    ],
    setupSteps: [
      { text: "Log in to your Mailgun account.", url: { label: "Open Mailgun", href: "https://app.mailgun.com" } },
      { text: "Go to Sending → Domains. Copy your sending domain — it looks like mg.yourdomain.com." },
      { text: "Go to Settings → API Keys. Click \"Add new key\", give it a name like \"Qalisa\", and copy the key." },
      { text: "Go to Sending → Webhooks. Select your domain, then copy the \"HTTP webhook signing key\" shown at the top of the page." },
      { text: "Fill in the form below with your domain, API key, and webhook signing key, then click \"Save credential\"." },
      { text: "Click \"Test\" to confirm everything is working, then follow the webhook setup steps that appear." },
    ],
    configFields: [
      { key: "domain", label: "Sending Domain", hint: "e.g. mg.yourdomain.com" },
      { key: "fromAddress", label: "From Address", hint: "e.g. Acme <hello@mg.yourdomain.com>", optional: true },
      { key: "region", label: "Region", hint: "us (default) or eu — check your Mailgun dashboard to confirm", optional: true },
      { key: "webhookSigningKey", label: "Webhook Signing Key", hint: "Mailgun → Sending → Webhooks → HTTP webhook signing key at the top of the page" },
    ],
    secretLabel: "API Key",
  },
  {
    channel: "sms",
    providerLabel: "SMSPortal",
    provider: "smsportal",
    webhookPath: "smsportal",
    webhookSteps: [
      { text: "Important: SMSPortal will test your URL before saving — the engine must be publicly reachable (use your deployed/production URL above, not a local address)." },
      { text: "Go back to your SMSPortal API Keys list and click on the key you just created." },
      { text: "Click the Webhooks tab at the top of the key's settings page." },
      { text: "Next to \"SMS Delivery Receipt\", click \"+ Create\"." },
      { text: "Enter a Name (e.g. \"Qalisa\") and a Description (e.g. \"Delivery receipts\"), then paste the URL above as the Request URL. Click Test — it must pass before you can save." },
      { text: "Once the test passes, click Save." },
      { text: "Back on the Webhooks tab, select the webhook you just created from the \"SMS Delivery Receipt\" dropdown." },
      { text: "Click \"Update Settings\" to save." },
    ],
    setupSteps: [
      { text: "Log in to your SMSPortal account.", url: { label: "Open SMSPortal", href: "https://portal.smsportal.com" } },
      { text: "Go to Settings → API Keys." },
      { text: "Click \"+ Create API Key\" and choose REST from the dropdown." },
      { text: "Give it a name like \"Qalisa\" and save." },
      { text: "Copy the Client ID and Client Secret shown in the list.", warning: "The Client Secret is only shown once. Copy it before navigating away." },
      { text: "Fill in the form below with your Client ID and Client Secret, then click \"Save credential\"." },
      { text: "Click \"Test\" to confirm it connects. Once it shows healthy, follow the webhook setup steps that appear to enable delivery receipts." },
    ],
    configFields: [
      { key: "clientId", label: "Client ID" },
    ],
    secretLabel: "Client Secret",
  },
  {
    channel: "whatsapp",
    providerLabel: "Meta Cloud API",
    provider: "meta_cloud_api",
    webhookPath: "meta",
    webhookSteps: [
      { text: "In your Meta app, go to WhatsApp → Configuration." },
      { text: "Under Webhooks, click \"Edit\" and paste the URL above as the Callback URL." },
      { text: "Enter your Webhook Verify Token (the same value you set in the form above) in the Verify Token field." },
      { text: "Click \"Verify and Save\". Meta will call your webhook URL to confirm it's reachable." },
      { text: "Once verified, click \"Manage\" next to the webhook and subscribe to the \"messages\" field to receive delivery status updates." },
    ],
    setupSteps: [
      { text: "You'll need a Meta Business account and a WhatsApp Business Platform app.", url: { label: "Open Meta for Developers", href: "https://developers.facebook.com" } },
      { text: "In your app, go to WhatsApp → API Setup. Note your Phone Number ID and WhatsApp Business Account ID." },
      { text: "Generate a System User access token with whatsapp_business_messaging and whatsapp_business_management permissions." },
      { text: "Go to App Settings → Basic and copy the App Secret." },
      { text: "Choose a Webhook Verify Token — any secret string you make up, e.g. \"qalisa-verify-2024\". You'll enter it here and again in Meta's dashboard." },
      { text: "Fill in the form below and click \"Save credential\", then click \"Test\" to confirm the connection." },
      { text: "Once saved, follow the webhook setup steps that appear to complete the Meta webhook subscription." },
    ],
    configFields: [
      { key: "wabaId", label: "WhatsApp Business Account ID" },
      { key: "phoneNumberId", label: "Phone Number ID" },
      { key: "appSecret", label: "App Secret", hint: "Meta app → App Settings → Basic" },
      { key: "webhookVerifyToken", label: "Webhook Verify Token", hint: "Any secret string — you'll enter this same value in Meta's webhook settings" },
    ],
    secretLabel: "System User Access Token",
  },
];

function statusPill(s: Credential["status"]) {
  if (s === "healthy") return <span className="pill ok">healthy</span>;
  if (s === "failing") return <span className="pill error">failing</span>;
  return <span className="pill muted">unverified</span>;
}

function SetupGuide({ steps }: { steps: SetupStep[] }) {
  return (
    <div style={{
      margin: "0 20px 20px",
      padding: "16px 20px",
      background: "var(--surface)",
      border: "1px solid var(--hairline)",
      borderRadius: 6,
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Setup guide</div>
      <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink)" }}>
            {step.text}
            {step.url && (
              <> — <a href={step.url.href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{step.url.label} ↗</a></>
            )}
            {step.warning && (
              <div style={{
                marginTop: 6,
                padding: "6px 10px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 4,
                fontSize: 12,
                color: "#92400e",
              }}>
                ⚠ {step.warning}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function WebhookUrlBox({ url, steps }: { url: string; steps: WebhookStep[] }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ borderTop: "1px solid var(--hairline)", padding: "16px 20px" }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
        Next: set up delivery receipts
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <input
          className="input"
          readOnly
          value={url}
          style={{ fontFamily: "monospace", fontSize: 12, flex: 1 }}
          onFocus={(e) => e.target.select()}
        />
        <button className="btn sm" onClick={copy} style={{ whiteSpace: "nowrap" }}>
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
      <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((step, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink)" }}>
            {step.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

interface AddFormProps {
  channel: Channel;
  provider: string;
  setupSteps: SetupStep[];
  configFields: FieldMeta[];
  secretLabel: string;
  onSaved: () => void;
  onCancel: () => void;
}

function AddForm({ channel, provider, setupSteps, configFields, secretLabel, onSaved, onCancel }: AddFormProps) {
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
    <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 20 }}>
      <SetupGuide steps={setupSteps} />
      <form onSubmit={handleSubmit} style={{ padding: "0 20px 20px" }}>
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
    </div>
  );
}

export function CredentialsPage() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { status: string; detail: string }>>({});
  const [adding, setAdding] = useState<string | null>(null);

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
        CHANNELS.map((channel) => {
          const channelProviders = PROVIDERS.filter((p) => p.channel === channel);

          return (
            <div key={channel} className="panel">
              <div className="panel-head">
                <span className="panel-title">{CHANNEL_LABELS[channel]}</span>
              </div>

              {channelProviders.map(({ providerLabel, provider, webhookPath, webhookSteps, setupSteps, configFields, secretLabel }, idx) => {
                const existing = creds.find((c) => c.channel === channel && c.provider === provider);
                const isAdding = adding === provider;
                const webhookUrl = tenantId
                  ? `${engineBaseUrl()}/v1/webhooks/${webhookPath}/${tenantId}`
                  : "";

                return (
                  <div key={provider} style={idx > 0 ? { borderTop: "1px solid var(--hairline)" } : {}}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{providerLabel}</span>
                      {!existing && !isAdding && (
                        <button className="btn sm" onClick={() => setAdding(provider)}>Add</button>
                      )}
                    </div>

                    {existing ? (
                      <>
                        <div className="panel-body tight" style={{ paddingTop: 0 }}>
                          <div className="cred-card">
                            <div className="cred-info">
                              <div className="cred-name">
                                {String(existing.config.fromAddress ?? existing.config.domain ?? existing.config.clientId ?? existing.config.phoneNumberId ?? "—")}
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
                        {webhookUrl && <WebhookUrlBox url={webhookUrl} steps={webhookSteps} />}
                      </>
                    ) : isAdding ? (
                      <AddForm
                        channel={channel}
                        provider={provider}
                        setupSteps={setupSteps}
                        configFields={configFields}
                        secretLabel={secretLabel}
                        onSaved={() => { setAdding(null); reload(); }}
                        onCancel={() => setAdding(null)}
                      />
                    ) : (
                      <div style={{ padding: "0 20px 16px", fontSize: 13, color: "var(--graphite)" }}>
                        No credential configured.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </main>
  );
}
