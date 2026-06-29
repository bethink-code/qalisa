import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { type Message, api } from "../api/client";

type Channel = "sms" | "email" | "whatsapp";

const CHANNEL_TITLES: Record<Channel, string> = { sms: "SMS", email: "Email", whatsapp: "WhatsApp" };

function statusPillClass(s: Message["status"]) {
  if (s === "delivered") return "pill ok";
  if (s === "sent") return "pill";
  if (s === "failed") return "pill error";
  return "pill muted";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--graphite)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  );
}

function MessageDrawer({ message, onClose }: { message: Message; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onOutside); };
  }, [onClose]);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 100 }} />
      <div ref={ref} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "var(--surface)", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", zIndex: 101, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Message detail</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: "var(--graphite)" }}>×</button>
        </div>
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
          <Field label="Status">
            <span className={statusPillClass(message.status)}>{message.status}</span>
            {message.error && <span style={{ marginLeft: 8, fontSize: 13, color: "var(--status-red)" }}>{message.error}</span>}
          </Field>
          <Field label="To"><code style={{ fontSize: 13 }}>{message.to}</code></Field>
          <Field label="Message">
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.body || "—"}</p>
          </Field>
          <Field label="Sent">{fmtDate(message.sentAt)}</Field>
          <Field label="Delivered">{fmtDate(message.deliveredAt)}</Field>
          <Field label="Message ID"><code style={{ fontSize: 11, wordBreak: "break-all", color: "var(--graphite)" }}>{message.id}</code></Field>
        </div>
      </div>
    </>
  );
}

function SendForm({ channel, onSent }: { channel: Channel; onSent: () => void }) {
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
    setSending(true); setSent(""); setError("");
    try {
      const r = await api.messages.send({ channel, to, ...(channel === "email" && subject ? { subject } : {}), body });
      setSent(r.messageId);
      setNumber(""); setSubject(""); setBody("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><span className="panel-title">Send message</span></div>
      <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
        <div className="field">
          <label>{channel === "email" ? "Email address" : "Phone number"}</label>
          {channel !== "email" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <select className="select" value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{ width: 220, flexShrink: 0 }}>
                {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input className="input" value={number} onChange={e => setNumber(e.target.value)} placeholder="831234567" required />
            </div>
          ) : (
            <input className="input" value={number} onChange={e => setNumber(e.target.value)} placeholder="you@example.com" required />
          )}
        </div>
        {channel === "email" && (
          <div className="field">
            <label>Subject</label>
            <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Message</label>
          <textarea className="textarea" rows={3} value={body} onChange={e => setBody(e.target.value)} required />
        </div>
        {error && <div style={{ color: "var(--status-red)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {sent && <div style={{ color: "var(--status-green)", fontSize: 13, marginBottom: 12 }}>Queued — ID: <span style={{ fontFamily: "monospace" }}>{sent}</span></div>}
        <button className="btn primary" disabled={sending}>{sending ? "Sending…" : "Send"}</button>
      </form>
    </div>
  );
}

export function ChannelMessagesPage() {
  const { channel } = useParams<{ channel: string }>();
  const ch = (channel as Channel) || "sms";

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Message | null>(null);

  function loadMessages() {
    setLoading(true);
    api.messages.list()
      .then(all => setMessages(all.filter(m => m.channel === ch)))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  function pollStatuses() {
    api.messages.list()
      .then(fresh => {
        const freshCh = fresh.filter(m => m.channel === ch);
        setMessages(prev => prev.map(m => {
          const u = freshCh.find(f => f.id === m.id);
          return u ? { ...m, status: u.status, providerMessageId: u.providerMessageId, sentAt: u.sentAt, deliveredAt: u.deliveredAt } : m;
        }));
      })
      .catch(() => {});
  }

  useEffect(() => {
    setMessages([]);
    setStatusFilter("all");
    loadMessages();
    const id = setInterval(pollStatuses, 5000);
    return () => clearInterval(id);
  }, [ch]);

  const filtered = statusFilter === "all" ? messages : messages.filter(m => m.status === statusFilter);

  return (
    <>
      <main className="page">
        <div className="page-head">
          <h1 className="page-title">{CHANNEL_TITLES[ch]}</h1>
        </div>
        <SendForm channel={ch} onSent={loadMessages} />
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head">
            <span className="panel-title">
              {statusFilter === "all" ? `All messages (${messages.length})` : `${statusFilter} (${filtered.length})`}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["all", "queued", "sent", "delivered", "failed"] as const).map(s => (
                <button key={s} className={`btn sm${statusFilter === s ? " primary" : ""}`} onClick={() => setStatusFilter(s)}>{s}</button>
              ))}
              <button className="btn sm" onClick={loadMessages} style={{ marginLeft: 4 }}>Refresh</button>
            </div>
          </div>
          <div className="panel-body tight">
            {loading && <div className="empty-state">Loading…</div>}
            {!loading && error && <div className="empty-state" style={{ color: "var(--status-red)" }}>{error}</div>}
            {!loading && !error && filtered.length === 0 && (
              <div className="empty-state">No {statusFilter !== "all" ? `${statusFilter} ` : ""}messages yet.</div>
            )}
            {!loading && filtered.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>To</th>
                    <th>Message</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th>Delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id} onClick={() => setSelected(m)} style={{ cursor: "pointer" }}>
                      <td style={{ fontFamily: "monospace", fontSize: 13 }}>{m.to}</td>
                      <td style={{ fontSize: 13, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.body}</td>
                      <td>
                        <span className={statusPillClass(m.status)}>{m.status}</span>
                        {m.error && <span title={m.error} style={{ marginLeft: 6, fontSize: 12, color: "var(--status-red)", cursor: "help" }}>⚠</span>}
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
      {selected && <MessageDrawer message={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
