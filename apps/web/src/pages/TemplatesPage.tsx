import { useEffect, useState } from "react";
import { type Template, api } from "../api/client";
import { TemplateBuilder } from "../components/TemplateBuilder";

type Channel = "email" | "sms" | "whatsapp";
const CHANNEL_LABELS: Record<Channel, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

function waStatusPill(s: Template["whatsappStatus"]) {
  if (s === "approved") return <span className="pill ok">approved</span>;
  if (s === "rejected") return <span className="pill error">rejected</span>;
  if (s === "pending") return <span className="pill warn">pending approval</span>;
  return <span className="pill muted">not submitted</span>;
}

// ── Simple form for email / SMS ───────────────────────────────────────────────

interface SimpleFormState { channel: "email" | "sms"; name: string; body: string }

interface SimpleFormProps {
  initialChannel?: "email" | "sms";
  onSaved: () => void;
  onCancel: () => void;
}

function SimpleTemplateForm({ initialChannel = "email", onSaved, onCancel }: SimpleFormProps) {
  const [form, setForm] = useState<SimpleFormState>({ channel: initialChannel, name: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.templates.create(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head"><span className="panel-title">New template</span></div>
      <div className="panel-body">
        <form onSubmit={handleSave}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 20px" }}>
            <div className="field">
              <label>Channel</label>
              <select className="select" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as "email" | "sms" }))}>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div className="field">
              <label>Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="welcome_email" required />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Body</label>
              <textarea
                className="textarea"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder={"Hello {{name}}, welcome to…"}
                rows={4}
                required
              />
              <div className="field-hint">{"Use {{variable}} for substitution."}</div>
            </div>
          </div>
          {error && <div style={{ color: "var(--status-red)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={saving}>{saving ? "Saving…" : "Create template"}</button>
            <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Channel picker — first step for "New template" ────────────────────────────

interface PickerProps {
  onPick: (channel: Channel) => void;
  onCancel: () => void;
}

function ChannelPicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head"><span className="panel-title">New template — choose channel</span></div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="btn" onClick={() => onPick("whatsapp")}>WhatsApp</button>
          <button className="btn" onClick={() => onPick("email")}>Email</button>
          <button className="btn" onClick={() => onPick("sms")}>SMS</button>
        </div>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FormMode = "picker" | "whatsapp" | "simple-email" | "simple-sms" | "edit";

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<FormMode | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [editForm, setEditForm] = useState({ name: "", body: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null); // templateId currently being submitted
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  function reload() {
    api.templates.list().then(setTemplates).finally(() => setLoading(false));
  }

  useEffect(reload, []);

  function closeForm() {
    setMode(null);
    setEditing(null);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setEditForm({ name: t.name, body: t.body });
    setEditError("");
    setMode("edit");
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.name.trim()) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.templates.update(editing.id, { name: editForm.name, body: editForm.body });
      closeForm();
      reload();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    await api.templates.delete(id);
    reload();
  }

  async function handleSubmitWhatsapp(t: Template) {
    setSubmitting(t.id);
    setSubmitErrors((prev) => ({ ...prev, [t.id]: "" }));
    try {
      const updated = await api.templates.submitWhatsapp(t.id, {
        category: t.whatsappCategory ?? "MARKETING",
        language: t.whatsappLanguage ?? "en",
      });
      setTemplates((prev) => prev.map((r) => (r.id === t.id ? updated : r)));
    } catch (err) {
      setSubmitErrors((prev) => ({ ...prev, [t.id]: err instanceof Error ? err.message : "Submission failed" }));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Templates</h1>
        {!mode && (
          <button className="btn primary" onClick={() => setMode("picker")}>New template</button>
        )}
      </div>

      {/* Channel picker */}
      {mode === "picker" && (
        <ChannelPicker
          onPick={(ch) => setMode(ch === "whatsapp" ? "whatsapp" : ch === "sms" ? "simple-sms" : "simple-email")}
          onCancel={closeForm}
        />
      )}

      {/* WhatsApp builder */}
      {mode === "whatsapp" && (
        <TemplateBuilder onSaved={() => { closeForm(); reload(); }} onCancel={closeForm} />
      )}

      {/* Email / SMS simple form */}
      {(mode === "simple-email" || mode === "simple-sms") && (
        <SimpleTemplateForm
          initialChannel={mode === "simple-sms" ? "sms" : "email"}
          onSaved={() => { closeForm(); reload(); }}
          onCancel={closeForm}
        />
      )}

      {/* Edit form — shared for all channels (body editing only) */}
      {mode === "edit" && editing && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head"><span className="panel-title">Edit template</span></div>
          <div className="panel-body">
            <form onSubmit={handleEditSave}>
              <div className="field">
                <label>Name</label>
                <input className="input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              {editing.channel !== "whatsapp" && (
                <div className="field">
                  <label>Body</label>
                  <textarea className="textarea" value={editForm.body} onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))} rows={4} />
                  <div className="field-hint">{"Use {{variable}} for substitution."}</div>
                </div>
              )}
              {editing.channel === "whatsapp" && (
                <div style={{ fontSize: 13, color: "var(--graphite)", padding: "10px 12px", background: "var(--surface-alt, #f5f5f5)", borderRadius: 4, marginBottom: 16 }}>
                  WhatsApp template body is managed via components. Delete and recreate to change the content.
                </div>
              )}
              {editError && <div style={{ color: "var(--status-red)", fontSize: 13, marginBottom: 12 }}>{editError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</button>
                <button type="button" className="btn ghost" onClick={closeForm}>Cancel</button>
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
                      <td style={{ fontWeight: 600, color: "var(--ink)" }}>
                        {t.name}
                        {t.whatsappCategory && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--graphite)", fontWeight: 400 }}>
                            {t.whatsappCategory}
                          </span>
                        )}
                      </td>
                      <td><span className="pill muted">{CHANNEL_LABELS[t.channel]}</span></td>
                      <td
                        style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--graphite)", fontSize: 13 }}
                        title={t.body}
                      >
                        {t.body || (t.channel === "whatsapp" ? <em style={{ color: "var(--graphite)" }}>auth template</em> : "")}
                      </td>
                      <td>{t.channel === "whatsapp" ? waStatusPill(t.whatsappStatus) : null}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {t.channel === "whatsapp" && (t.whatsappStatus === null || t.whatsappStatus === "rejected") && (
                            <button
                              className="btn sm"
                              disabled={submitting === t.id}
                              onClick={() => handleSubmitWhatsapp(t)}
                            >
                              {submitting === t.id ? "Submitting…" : t.whatsappStatus === "rejected" ? "Resubmit to Meta" : "Submit to Meta"}
                            </button>
                          )}
                          <button className="btn sm" onClick={() => openEdit(t)}>Edit</button>
                          <button className="btn sm danger" onClick={() => handleDelete(t.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                    {submitErrors[t.id] && (
                      <tr key={`${t.id}-err`}>
                        <td colSpan={5} style={{ padding: "6px 16px" }}>
                          <span style={{ color: "var(--status-red)", fontSize: 13 }}>{submitErrors[t.id]}</span>
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
