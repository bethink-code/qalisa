import { useEffect, useState } from "react";
import { type Message, api } from "../api/client";

function statusPillClass(s: Message["status"]) {
  if (s === "delivered") return "pill ok";
  if (s === "sent") return "pill";
  if (s === "failed") return "pill error";
  return "pill muted";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const CHANNEL_LABELS: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

type Channel = "email" | "sms" | "whatsapp";

const COUNTRY_CODES = [
  { code: "+27", label: "🇿🇦 +27 South Africa" },
  { code: "+1",  label: "🇺🇸 +1 USA / Canada" },
  { code: "+44", label: "🇬🇧 +44 United Kingdom" },
  { code: "+61", label: "🇦🇺 +61 Australia" },
  { code: "+64", label: "🇳🇿 +64 New Zealand" },
  { code: "+49", label: "🇩🇪 +49 Germany" },
  { code: "+33", label: "🇫🇷 +33 France" },
  { code: "+31", label: "🇳🇱 +31 Netherlands" },
  { code: "+254", label: "🇰🇪 +254 Kenya" },
  { code: "+234", label: "🇳🇬 +234 Nigeria" },
  { code: "+233", label: "🇬🇭 +233 Ghana" },
  { code: "+255", label: "🇹🇿 +255 Tanzania" },
  { code: "+256", label: "🇺🇬 +256 Uganda" },
  { code: "+260", label: "🇿🇲 +260 Zambia" },
  { code: "+263", label: "🇿🇼 +263 Zimbabwe" },
  { code: "+267", label: "🇧🇼 +267 Botswana" },
  { code: "+264", label: "🇳🇦 +264 Namibia" },
  { code: "+91", label: "🇮🇳 +91 India" },
  { code: "+65", label: "🇸🇬 +65 Singapore" },
  { code: "+971", label: "🇦🇪 +971 UAE" },
];

function SendForm({ onSent }: { onSent: () => void }) {
  const [channel, setChannel] = useState<Channel>("sms");
  const [countryCode, setCountryCode] = useState("+27");
  const [number, setNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  const to = channel === "email" ? number : `${countryCode}${number.replace(/^0/, "")}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSent("");
    setError("");
    try {
      const r = await api.messages.send({
        channel,
        to,
        ...(channel === "email" && subject ? { subject } : {}),
        body,
      });
      setSent(r.messageId);
      setNumber("");
      setSubject("");
      setBody("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Send message</span>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "0 20px" }}>
          <div className="field">
            <label htmlFor="send-channel">Channel</label>
            <select
              id="send-channel"
              className="select"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="send-number">
              {channel === "email" ? "Email address" : "Phone number"}
            </label>
            {channel !== "email" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="select"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  style={{ width: 220, flexShrink: 0 }}
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <input
                  id="send-number"
                  className="input"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="831234567"
                  required
                />
              </div>
            ) : (
              <input
                id="send-number"
                className="input"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="you@example.com"
                required
              />
            )}
          </div>
        </div>
        {channel === "email" && (
          <div className="field">
            <label htmlFor="send-subject">Subject</label>
            <input
              id="send-subject"
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="send-body">Message</label>
          <textarea
            id="send-body"
            className="textarea"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        {error && (
          <div style={{ color: "var(--status-red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        {sent && (
          <div style={{ color: "var(--status-green)", fontSize: 13, marginBottom: 12 }}>
            Queued — ID: <span style={{ fontFamily: "monospace" }}>{sent}</span>
          </div>
        )}
        <button className="btn primary" disabled={sending}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

export function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");

  function loadMessages() {
    setLoading(true);
    api.messages.list()
      .then(setMessages)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(loadMessages, []);

  const filtered = filter === "all" ? messages : messages.filter((m) => m.status === filter);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Messages</h1>
      </div>

      <SendForm onSent={loadMessages} />

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head">
          <span className="panel-title">
            {filter === "all" ? `All messages (${messages.length})` : `${filter} (${filtered.length})`}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "queued", "sent", "delivered", "failed"] as const).map((s) => (
              <button
                key={s}
                className={`btn sm${filter === s ? " primary" : ""}`}
                onClick={() => setFilter(s)}
              >
                {s}
              </button>
            ))}
            <button className="btn sm" onClick={loadMessages} style={{ marginLeft: 4 }}>
              Refresh
            </button>
          </div>
        </div>
        <div className="panel-body tight">
          {loading && <div className="empty-state">Loading…</div>}
          {!loading && error && (
            <div className="empty-state" style={{ color: "var(--status-red)" }}>{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="empty-state">No messages{filter !== "all" ? ` with status "${filter}"` : ""}.</div>
          )}
          {!loading && filtered.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Provider ID</th>
                  <th>Sent</th>
                  <th>Delivered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td><span className="pill muted">{CHANNEL_LABELS[m.channel] ?? m.channel}</span></td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{m.to}</td>
                    <td>
                      <span className={statusPillClass(m.status)}>{m.status}</span>
                      {m.error && (
                        <span
                          title={m.error}
                          style={{ marginLeft: 6, fontSize: 12, color: "var(--status-red)", cursor: "help" }}
                        >
                          ⚠
                        </span>
                      )}
                    </td>
                    <td
                      style={{ fontFamily: "monospace", fontSize: 12, color: "var(--graphite)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}
                      title={m.providerMessageId ?? ""}
                    >
                      {m.providerMessageId ?? "—"}
                    </td>
                    <td style={{ color: "var(--graphite)", fontSize: 13 }}>{fmtDate(m.sentAt)}</td>
                    <td style={{ color: "var(--graphite)", fontSize: 13 }}>{fmtDate(m.deliveredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
