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

function SendForm({ onSent }: { onSent: () => void }) {
  const [channel, setChannel] = useState<Channel>("sms");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

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
      setTo("");
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
            <label htmlFor="send-to">
              {channel === "sms" ? "Phone number" : channel === "whatsapp" ? "WhatsApp number" : "Email address"}
            </label>
            <input
              id="send-to"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={channel === "email" ? "you@example.com" : "+27821234567"}
              required
            />
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
