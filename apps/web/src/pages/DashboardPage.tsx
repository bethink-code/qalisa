import { useEffect, useState } from "react";
import { type Message, api } from "../api/client";

function statusPillClass(s: Message["status"]) {
  if (s === "delivered") return "pill ok";
  if (s === "sent") return "pill";
  if (s === "failed") return "pill error";
  return "pill muted";
}

function channelLabel(c: string) {
  if (c === "email") return "Email";
  if (c === "sms") return "SMS";
  if (c === "whatsapp") return "WhatsApp";
  return c;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.messages.list()
      .then(setMessages)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    total: messages.length,
    sent: messages.filter((m) => m.status === "sent" || m.status === "delivered").length,
    delivered: messages.filter((m) => m.status === "delivered").length,
    failed: messages.filter((m) => m.status === "failed").length,
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total messages</div>
          <div className="stat-value">{counts.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sent</div>
          <div className="stat-value">{counts.sent}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Delivered</div>
          <div className="stat-value" style={{ color: "var(--status-green)" }}>
            {counts.delivered}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-value" style={{ color: counts.failed > 0 ? "var(--status-red)" : "inherit" }}>
            {counts.failed}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Recent messages</span>
        </div>
        <div className="panel-body tight">
          {loading && <div className="empty-state">Loading…</div>}
          {!loading && error && <div className="empty-state" style={{ color: "var(--status-red)" }}>{error}</div>}
          {!loading && !error && messages.length === 0 && (
            <div className="empty-state">No messages yet. Go to Messages to send one.</div>
          )}
          {!loading && messages.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {messages.slice(0, 50).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="pill muted">{channelLabel(m.channel)}</span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}>{m.to}</td>
                    <td>
                      <span className={statusPillClass(m.status)}>{m.status}</span>
                    </td>
                    <td style={{ color: "var(--graphite)", fontSize: 13 }}>{fmtDate(m.sentAt ?? m.createdAt)}</td>
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
