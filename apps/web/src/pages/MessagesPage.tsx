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

export function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    api.messages.list()
      .then(setMessages)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? messages : messages.filter((m) => m.status === filter);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Messages</h1>
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
        </div>
      </div>

      <div className="panel">
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
