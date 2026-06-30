import { useEffect, useState } from "react";
import { type Template, api } from "../api/client";

type Channel = "email" | "sms" | "whatsapp";
const CHANNEL_LABELS: Record<Channel, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };
const WA_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;

function waStatusPill(s: Template["whatsappStatus"]) {
  if (s === "approved") return <span className="pill ok">approved</span>;
  if (s === "rejected") return <span className="pill error">rejected</span>;
  if (s === "pending") return <span className="pill warn">pending approval</span>;
  return <span className="pill muted">not submitted</span>;
}

interface FormState { channel: Channel; name: string; body: string }
const BLANK: FormState = { channel: "email", name: "", body: "" };

interface SubmitState { category: string; language: string }

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null); // templateId being submitted
  const [submitForms, setSubmitForms] = useState<Record<string, SubmitState>>({});
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  function reload() {
    api.templates.list().then(setTemplates).finally(() => setLoading(false));
  }

  useEffect(reload, []);

  function openNew() {
    setEditing(null);
    setForm(BLANK);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({ channel: t.channel, name: t.name, body: t.body });
    setFormError("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        await api.templates.update(editing.id, { name: form.name, body: form.body });
      } else {
        await api.templates.create(form);
      }
      cancelForm();
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    await api.templates.delete(id);
    reload();
  }

  function openSubmit(t: Template) {
    setSubmitForms((prev) => ({
      ...prev,
      [t.id]: { category: t.whatsappCategory ?? "MARKETING", language: t.whatsappLanguage ?? "en" },
    }));
    setSubmitting(t.id);
  }

  async function handleSubmitWhatsapp(id: string) {
    const sf = submitForms[id];
    if (!sf) return;
    setSubmitErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const updated = await api.templates.submitWhatsapp(id, sf);
      setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setSubmitting(null);
    } catch (err) {
      setSubmitErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Submission failed" }));
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Templates</h1>
        {!showForm && (
          <button className="btn primary" onClick={openNew}>New template</button>
        )}
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <span className="panel-title">{editing ? "Edit template" : "New template"}</span>
          </div>
          <div className="panel-body">
            <form onSubmit={handleSave}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 20px" }}>
                {!editing && (
                  <div className="field">
                    <label htmlFor="t-channel">Channel</label>
                    <select
                      id="t-channel"
                      className="select"
                      value={form.channel}
                      onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as Channel }))}
                    >
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>
                )}
                <div className="field" style={{ gridColumn: editing ? "1 / -1" : undefined }}>
                  <label htmlFor="t-name">Name</label>
                  <input
                    id="t-name"
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="welcome_email"
                    required
                  />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="t-body">Body</label>
                  <textarea
                    id="t-body"
                    className="textarea"
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Hello {{name}}, welcome to…"
                    rows={4}
                    required
                  />
                  <div className="field-hint">Use {"{{variable}}"} for substitution.</div>
                </div>
              </div>
              {formError && (
                <div style={{ color: "var(--status-red)", fontSize: 13, marginBottom: 12 }}>{formError}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create template"}
                </button>
                <button type="button" className="btn ghost" onClick={cancelForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-body tight">
          {loading && <div className="empty-state">Loading…</div>}
          {!loading && templates.length === 0 && (
            <div className="empty-state">No templates yet.</div>
          )}
          {!loading && templates.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Channel</th>
                  <th>Preview</th>
                  <th>WA status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <>
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600, color: "var(--ink)" }}>{t.name}</td>
                      <td><span className="pill muted">{CHANNEL_LABELS[t.channel]}</span></td>
                      <td
                        style={{
                          maxWidth: 340,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--graphite)",
                          fontSize: 13,
                        }}
                        title={t.body}
                      >
                        {t.body}
                      </td>
                      <td>{t.channel === "whatsapp" ? waStatusPill(t.whatsappStatus) : null}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {t.channel === "whatsapp" && t.whatsappStatus !== "approved" && (
                            <button
                              className="btn sm"
                              onClick={() => submitting === t.id ? setSubmitting(null) : openSubmit(t)}
                            >
                              {submitting === t.id ? "Cancel" : "Submit to Meta"}
                            </button>
                          )}
                          <button className="btn sm" onClick={() => openEdit(t)}>Edit</button>
                          <button className="btn sm danger" onClick={() => handleDelete(t.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                    {submitting === t.id && (
                      <tr key={`${t.id}-submit`}>
                        <td colSpan={5} style={{ background: "var(--surface-raised, #f9f9f9)", padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                            <div className="field" style={{ margin: 0 }}>
                              <label style={{ fontSize: 12 }}>Category</label>
                              <select
                                className="select"
                                style={{ fontSize: 13 }}
                                value={submitForms[t.id]?.category ?? "MARKETING"}
                                onChange={(e) =>
                                  setSubmitForms((prev) => ({ ...prev, [t.id]: { ...prev[t.id]!, category: e.target.value } }))
                                }
                              >
                                {WA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="field" style={{ margin: 0 }}>
                              <label style={{ fontSize: 12 }}>Language</label>
                              <input
                                className="input"
                                style={{ fontSize: 13, width: 80 }}
                                value={submitForms[t.id]?.language ?? "en"}
                                onChange={(e) =>
                                  setSubmitForms((prev) => ({ ...prev, [t.id]: { ...prev[t.id]!, language: e.target.value } }))
                                }
                                placeholder="en"
                              />
                            </div>
                            <button className="btn primary sm" onClick={() => handleSubmitWhatsapp(t.id)}>
                              Submit
                            </button>
                            {submitErrors[t.id] && (
                              <span style={{ color: "var(--status-red)", fontSize: 13 }}>{submitErrors[t.id]}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
