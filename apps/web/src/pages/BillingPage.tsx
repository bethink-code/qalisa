import { useEffect, useState } from "react";
import { type Credential, type Message, api } from "../api/client";

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtCredName(cred: Credential): string {
  const name = cred.config.fromAddress ?? cred.config.domain ?? cred.config.clientId ?? cred.config.phoneNumberId;
  return typeof name === "string" ? name : "—";
}

const PROVIDER_LABELS: Record<string, string> = {
  smsportal: "SMSPortal",
  mailjet: "Mailjet",
  mailgun: "Mailgun",
  meta_cloud_api: "Meta Cloud API",
};

const CHANNEL_LABELS: Record<string, string> = {
  sms: "SMS",
  email: "Email",
  whatsapp: "WhatsApp",
};

export function BillingPage() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.credentials.list(), api.messages.list()])
      .then(([c, m]) => { setCreds(c); setMessages(m); })
      .finally(() => setLoading(false));
  }, []);

  const balanceCreds = creds.filter(c => c.remainingBalance !== null && c.remainingBalance !== undefined);

  const totalMessages = messages.filter(m => m.status === "sent" || m.status === "delivered").length;
  const totalCost = messages.reduce((sum, m) => sum + (m.cost ?? 0), 0);

  const byChannel = ["sms", "email", "whatsapp"].map(ch => ({
    channel: ch,
    count: messages.filter(m => m.channel === ch && (m.status === "sent" || m.status === "delivered")).length,
    cost: messages.filter(m => m.channel === ch).reduce((sum, m) => sum + (m.cost ?? 0), 0),
  })).filter(r => r.count > 0 || r.cost > 0);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Billing</h1>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <>
          {balanceCreds.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">Credit balance</span>
              </div>
              <div className="panel-body tight">
                {balanceCreds.map(cred => (
                  <div key={cred.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--hairline)" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {PROVIDER_LABELS[cred.provider] ?? cred.provider}
                        <span style={{ fontWeight: 400, color: "var(--graphite)", marginLeft: 8, fontSize: 13 }}>
                          {CHANNEL_LABELS[cred.channel] ?? cred.channel}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--graphite)", marginTop: 2 }}>{fmtCredName(cred)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: cred.remainingBalance! <= 10 ? "var(--status-red)" : "var(--ink)",
                      }}>
                        {cred.remainingBalance!.toLocaleString()}
                        <span style={{ fontSize: 13, fontWeight: 400, color: "var(--graphite)", marginLeft: 6 }}>credits</span>
                      </div>
                      {cred.balanceUpdatedAt && (
                        <div style={{ fontSize: 11, color: "var(--graphite)", marginTop: 2 }}>
                          Updated {fmtDate(cred.balanceUpdatedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {balanceCreds.length === 0 && (
            <div className="panel">
              <div className="panel-head"><span className="panel-title">Credit balance</span></div>
              <div className="empty-state">No balance data yet — send your first message to populate this.</div>
            </div>
          )}

          <div className="panel" style={{ marginTop: 20 }}>
            <div className="panel-head">
              <span className="panel-title">Usage</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--hairline)" }}>
              {[
                { label: "Messages sent", value: totalMessages.toLocaleString() },
                { label: "Credits spent", value: totalCost > 0 ? totalCost.toLocaleString() : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "var(--surface)", padding: "20px 24px" }}>
                  <div style={{ fontSize: 12, color: "var(--graphite)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>

            {byChannel.length > 0 && (
              <div style={{ borderTop: "1px solid var(--hairline)" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Messages sent</th>
                      <th>Credits spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byChannel.map(r => (
                      <tr key={r.channel}>
                        <td style={{ fontWeight: 500 }}>{CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                        <td>{r.count.toLocaleString()}</td>
                        <td>{r.cost > 0 ? r.cost.toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
