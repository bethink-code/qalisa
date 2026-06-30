import { useEffect, useRef, useState } from "react";
import type { WaButton, WaComponents } from "../api/client";
import { api } from "../api/client";

// ── Constants ─────────────────────────────────────────────────────────────────

const WA_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
type WaCategory = (typeof WA_CATEGORIES)[number];

const CATEGORY_DESCRIPTIONS: Record<WaCategory, string> = {
  MARKETING: "Promotional content, offers, awareness campaigns, retargeting",
  UTILITY: "Transactional updates triggered by user action (orders, accounts, alerts)",
  AUTHENTICATION: "One-time passwords and verification codes only",
};

const OTP_TYPES = ["COPY_CODE", "ONE_TAP", "ZERO_TAP"] as const;

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en_ZA", label: "English (South Africa)" },
  { code: "af", label: "Afrikaans" },
  { code: "zu", label: "Zulu" },
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "sw", label: "Swahili" },
  { code: "ha", label: "Hausa" },
  { code: "zh_CN", label: "Chinese (China)" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "id", label: "Indonesian" },
  { code: "ms", label: "Malay" },
  { code: "bn", label: "Bengali" },
  { code: "ur", label: "Urdu" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "nl", label: "Dutch" },
  { code: "it", label: "Italian" },
  { code: "pl", label: "Polish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ro", label: "Romanian" },
  { code: "hu", label: "Hungarian" },
  { code: "cs", label: "Czech" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "fa", label: "Persian" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractVarNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const [, name] of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (name && !seen.has(name)) { seen.add(name); names.push(name); }
  }
  return names;
}

function charCount(text: string, max: number): React.ReactNode {
  const n = text.length;
  return (
    <span style={{ fontSize: 11, color: n > max ? "var(--status-red)" : "var(--graphite)", marginLeft: 6 }}>
      {n}/{max}
    </span>
  );
}

// Render body text with variables substituted — used in both preview and sample label
function resolveText(text: string, examples: Record<string, string>, fallbackStyle = true): React.ReactNode {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return parts.map((part, i) => {
    const match = part.match(/^\{\{(\w+)\}\}$/);
    if (!match) return part;
    const name = match[1]!;
    const val = examples[name];
    return val
      ? <span key={i} style={{ color: "#1a73e8", fontWeight: 500 }}>{val}</span>
      : fallbackStyle
        ? <span key={i} style={{ color: "var(--graphite)", fontStyle: "italic" }}>{`[${name}]`}</span>
        : `[${name}]`;
  });
}

// ── WhatsApp preview bubble ───────────────────────────────────────────────────

interface PreviewProps {
  category: WaCategory | "";
  headerFormat: HeaderFormat;
  headerText: string;
  headerHasVar: boolean;
  headerVarName: string;
  headerVarExample: string;
  bodyText: string;
  bodyExamples: Record<string, string>;
  footerText: string;
  buttons: ButtonEntry[];
  addSecurityRec: boolean;
  hasExpiry: boolean;
  expiryMinutes: number;
  otpType: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
}

function WaPreview(p: PreviewProps) {
  const isAuth = p.category === "AUTHENTICATION";
  const isMU = p.category === "MARKETING" || p.category === "UTILITY";

  const bubble: React.CSSProperties = {
    background: "#fff",
    borderRadius: "0 8px 8px 8px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
    maxWidth: 280,
    overflow: "hidden",
    fontSize: 14,
    lineHeight: 1.45,
  };

  const headerEl = (() => {
    if (!isMU || p.headerFormat === "NONE") return null;
    if (p.headerFormat === "LOCATION") {
      return (
        <div style={{ background: "#e8f5e9", padding: "10px 14px", fontSize: 13, color: "#2e7d32", display: "flex", alignItems: "center", gap: 6 }}>
          <span>📍</span> Location (sent at send time)
        </div>
      );
    }
    if (p.headerFormat === "TEXT") {
      const hText = p.headerHasVar && p.headerVarName
        ? p.headerText + (p.headerVarExample ? ` ${p.headerVarExample}` : ` [${p.headerVarName}]`)
        : p.headerText;
      return <div style={{ padding: "10px 14px 6px", fontWeight: 700, fontSize: 15, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{hText || <span style={{ color: "var(--graphite)", fontStyle: "italic" }}>Header text</span>}</div>;
    }
    const icons: Record<string, string> = { IMAGE: "🖼️", VIDEO: "🎬", DOCUMENT: "📄" };
    return (
      <div style={{ background: "#f0f0f0", padding: "20px 14px", textAlign: "center", fontSize: 13, color: "var(--graphite)" }}>
        {icons[p.headerFormat]} {p.headerFormat.charAt(0) + p.headerFormat.slice(1).toLowerCase()} header
      </div>
    );
  })();

  const bodyEl = (() => {
    if (isAuth) {
      const code = "[OTP code]";
      return (
        <div style={{ padding: "10px 14px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <span style={{ fontWeight: 600 }}>{code}</span> is your verification code.
          {p.addSecurityRec && <div style={{ marginTop: 6, color: "var(--graphite)", fontSize: 12 }}>For your security, do not share this code.</div>}
          {p.hasExpiry && <div style={{ marginTop: 4, color: "var(--graphite)", fontSize: 12 }}>This code expires in {p.expiryMinutes} minutes.</div>}
        </div>
      );
    }
    if (!p.bodyText) return <div style={{ padding: "10px 14px", color: "var(--graphite)", fontStyle: "italic" }}>Body text will appear here…</div>;
    return <div style={{ padding: `${headerEl ? 4 : 10}px 14px 6px`, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{resolveText(p.bodyText, p.bodyExamples)}</div>;
  })();

  const footerEl = p.footerText
    ? <div style={{ padding: "2px 14px 10px", fontSize: 12, color: "#8e8e8e" }}>{p.footerText}</div>
    : null;

  const timestampEl = <div style={{ padding: "2px 14px 8px", fontSize: 11, color: "#8e8e8e", textAlign: "right" }}>10:30 AM ✓✓</div>;

  const btnEls = p.buttons.length > 0 && (
    <div style={{ borderTop: "1px solid #e5e5e5" }}>
      {p.buttons.map((b) => (
        <div key={b.id} style={{ padding: "8px 14px", textAlign: "center", color: "#1a73e8", fontSize: 14, fontWeight: 500, borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {b.type === "URL" && <span style={{ fontSize: 12 }}>🔗</span>}
          {b.type === "PHONE_NUMBER" && <span style={{ fontSize: 12 }}>📞</span>}
          {b.text || <span style={{ fontStyle: "italic", color: "var(--graphite)" }}>Button label</span>}
        </div>
      ))}
    </div>
  );

  const authBtnEl = isAuth && (
    <div style={{ borderTop: "1px solid #e5e5e5" }}>
      <div style={{ padding: "8px 14px", textAlign: "center", color: "#1a73e8", fontSize: 14, fontWeight: 500 }}>
        {p.otpType === "COPY_CODE" ? "📋 Copy code" : "✅ Autofill"}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "20px 16px", background: "#e5ddd5", borderRadius: 8, minHeight: 200, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={bubble}>
        {headerEl}
        {bodyEl}
        {footerEl}
        {timestampEl}
        {btnEls}
        {authBtnEl}
      </div>
      {p.category === "MARKETING" && (
        <div style={{ fontSize: 11, color: "#666", background: "rgba(255,255,255,0.5)", padding: "4px 8px", borderRadius: 4 }}>
          Meta may reclassify MARKETING → UTILITY or vice versa after review
        </div>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type HeaderFormat = "NONE" | "TEXT" | "LOCATION" | "IMAGE" | "VIDEO" | "DOCUMENT";
type BtnType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

interface ButtonEntry {
  id: string;
  type: BtnType;
  text: string;
  url: string;
  urlHasVar: boolean;
  urlExample: string;
  phoneNumber: string;
}

function blankButton(type: BtnType): ButtonEntry {
  return { id: Math.random().toString(36).slice(2), type, text: "", url: "", urlHasVar: false, urlExample: "", phoneNumber: "" };
}

interface Props {
  onSaved: () => void;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TemplateBuilder({ onSaved, onCancel }: Props) {
  const [category, setCategory] = useState<WaCategory | "">("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en_ZA");

  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerHasVar, setHeaderHasVar] = useState(false);
  const [headerVarName, setHeaderVarName] = useState("");
  const [headerVarExample, setHeaderVarExample] = useState("");

  const [bodyText, setBodyText] = useState("");
  const [bodyExamples, setBodyExamples] = useState<Record<string, string>>({});

  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<ButtonEntry[]>([]);

  const [addSecurityRec, setAddSecurityRec] = useState(true);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryMinutes, setExpiryMinutes] = useState(10);
  const [otpType, setOtpType] = useState<"COPY_CODE" | "ONE_TAP" | "ZERO_TAP">("COPY_CODE");
  const [androidPackage, setAndroidPackage] = useState("");
  const [androidHash, setAndroidHash] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Variable insertion
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number>(0);
  const [showVarInsert, setShowVarInsert] = useState(false);
  const [newVarName, setNewVarName] = useState("");
  const varInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showVarInsert) setTimeout(() => varInputRef.current?.focus(), 0);
  }, [showVarInsert]);

  // Sync body examples when variables change
  useEffect(() => {
    const varNames = extractVarNames(bodyText);
    setBodyExamples((prev) => Object.fromEntries(varNames.map((n) => [n, prev[n] ?? ""])));
  }, [bodyText]);

  function trackCursor(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    cursorPosRef.current = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
  }

  function insertVariable() {
    const raw = newVarName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/, "");
    if (!raw) return;
    const token = `{{${raw}}}`;
    const pos = cursorPosRef.current;
    const before = bodyText.slice(0, pos);
    const after = bodyText.slice(pos);
    const newText = before + token + after;
    setBodyText(newText);
    const newPos = pos + token.length;
    cursorPosRef.current = newPos;
    setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.focus();
        bodyRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
    setNewVarName("");
    setShowVarInsert(false);
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!category) return "Select a category";
    if (!name.trim()) return "Template name is required";
    if (!/^[a-z0-9_]+$/.test(name)) return "Name must be lowercase letters, numbers, and underscores only";
    if (category !== "AUTHENTICATION") {
      if (!bodyText.trim()) return "Body text is required";
      if (bodyText.length > 1024) return "Body text must be 1024 characters or fewer";
      if (headerFormat === "TEXT" && headerText.length > 60) return "Header text must be 60 characters or fewer";
      if (footerText.length > 60) return "Footer must be 60 characters or fewer";
      if (/\{\{/.test(footerText)) return "Footer text cannot contain variables";
      if (headerFormat === "TEXT" && headerHasVar && !headerVarName.trim()) return "Header variable name is required";
      const bodyVars = extractVarNames(bodyText);
      for (const v of bodyVars) {
        if (!bodyExamples[v]?.trim()) return `Sample value required for {{${v}}}`;
      }
      if (headerHasVar && headerVarName && !headerVarExample.trim()) return "Sample value required for header variable";
      if (buttons.length > 10) return "Maximum 10 buttons allowed";
      for (const b of buttons) {
        if (!b.text.trim()) return "All buttons require label text";
        if (b.text.length > 25) return "Button text must be 25 characters or fewer";
        if (b.type === "URL" && !b.url.trim()) return "URL button requires a URL";
        if (b.type === "PHONE_NUMBER" && !b.phoneNumber.trim()) return "Phone button requires a phone number";
        if (b.type === "URL" && b.urlHasVar && !b.urlExample.trim()) return "URL button variable requires a sample value";
      }
      const types = buttons.map((b) => b.type);
      const qrIndices = types.map((t, i) => (t === "QUICK_REPLY" ? i : -1)).filter((i) => i >= 0);
      for (let i = 1; i < qrIndices.length; i++) {
        if (qrIndices[i]! - qrIndices[i - 1]! > 1) return "Quick reply buttons must be grouped together";
      }
    }
    return null;
  }

  // ── Build WaComponents ──────────────────────────────────────────────────────

  function buildComponents(): WaComponents {
    if (category === "AUTHENTICATION") {
      return {
        body: { addSecurityRecommendation: addSecurityRec },
        footer: hasExpiry ? { codeExpirationMinutes: expiryMinutes } : null,
        buttons: [{ type: "OTP", text: otpType === "COPY_CODE" ? "Copy code" : "Autofill", otpType, ...(otpType === "ONE_TAP" && androidPackage ? { packageName: androidPackage, signatureHash: androidHash } : {}) }],
      };
    }
    const header = (() => {
      if (headerFormat === "NONE") return null;
      if (headerFormat === "LOCATION") return { format: "LOCATION" as const };
      if (headerFormat === "TEXT") return { format: "TEXT" as const, text: headerText, varName: headerHasVar ? headerVarName : undefined, varExample: headerHasVar ? headerVarExample : undefined };
      return { format: headerFormat as "IMAGE" | "VIDEO" | "DOCUMENT" };
    })();
    const waButtons: WaButton[] = buttons.map((b) => {
      if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
      if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phoneNumber: b.phoneNumber };
      return { type: "URL", text: b.text, url: b.urlHasVar ? `${b.url}{{1}}` : b.url, urlExample: b.urlHasVar ? b.urlExample : undefined };
    });
    return {
      header,
      body: { text: bodyText, examples: { ...bodyExamples } },
      footer: footerText ? { text: footerText } : null,
      buttons: waButtons.length > 0 ? waButtons : null,
    };
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError("");
    try {
      const components = buildComponents();
      await api.templates.create({
        channel: "whatsapp",
        name,
        body: category === "AUTHENTICATION" ? "" : (components.body.text ?? ""),
        whatsappCategory: category,
        whatsappLanguage: language,
        components,
        parameterFormat: "named",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const bodyVarNames = extractVarNames(bodyText);
  const isMU = category === "MARKETING" || category === "UTILITY";
  const isAuth = category === "AUTHENTICATION";

  function addButton(type: BtnType) {
    if (buttons.length >= 10) return;
    setButtons((prev) => [...prev, blankButton(type)]);
  }
  function updateButton(id: string, patch: Partial<ButtonEntry>) {
    setButtons((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function removeButton(id: string) {
    setButtons((prev) => prev.filter((b) => b.id !== id));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head"><span className="panel-title">New WhatsApp template</span></div>
      <div className="panel-body">
        <form onSubmit={handleSubmit}>
          {/* Two-column layout: form left, preview right */}
          <div style={{ display: "grid", gridTemplateColumns: category ? "1fr 300px" : "1fr", gap: "0 32px", alignItems: "start" }}>

            {/* ── Left: form ── */}
            <div>
              {/* Category */}
              <div className="field">
                <label>Category</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {WA_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`btn${category === c ? " primary" : ""}`}
                      onClick={() => setCategory(c)}
                      style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 14px", height: "auto" }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c}</span>
                      <span style={{ fontSize: 11, fontWeight: 400, color: category === c ? "inherit" : "var(--graphite)", textAlign: "left" }}>
                        {CATEGORY_DESCRIPTIONS[c]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {category && (
                <>
                  {/* Name + Language */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                    <div className="field">
                      <label>Template name <span style={{ color: "var(--graphite)", fontWeight: 400 }}>(lowercase, underscores)</span></label>
                      <input
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                        placeholder="order_confirmation"
                        required
                      />
                    </div>
                    <div className="field">
                      <label>Language</label>
                      <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
                      </select>
                    </div>
                  </div>

                  {/* AUTHENTICATION */}
                  {isAuth && (
                    <>
                      <div className="field">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={addSecurityRec} onChange={(e) => setAddSecurityRec(e.target.checked)} />
                          Add security recommendation
                          <span style={{ fontSize: 12, color: "var(--graphite)", fontWeight: 400 }}>"For your security, do not share this code."</span>
                        </label>
                      </div>
                      <div className="field">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={hasExpiry} onChange={(e) => setHasExpiry(e.target.checked)} />
                          Code expiry warning
                        </label>
                        {hasExpiry && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <input type="number" className="input" style={{ width: 80 }} min={1} max={90} value={expiryMinutes} onChange={(e) => setExpiryMinutes(Math.max(1, Math.min(90, parseInt(e.target.value) || 10)))} />
                            <span style={{ fontSize: 13, color: "var(--graphite)" }}>minutes</span>
                          </div>
                        )}
                      </div>
                      <div className="field">
                        <label>Button type</label>
                        <select className="select" value={otpType} onChange={(e) => setOtpType(e.target.value as typeof otpType)}>
                          {OTP_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                        </select>
                      </div>
                      {otpType === "ONE_TAP" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                          <div className="field">
                            <label>Android package name</label>
                            <input className="input" value={androidPackage} onChange={(e) => setAndroidPackage(e.target.value)} placeholder="com.example.app" />
                          </div>
                          <div className="field">
                            <label>Signature hash</label>
                            <input className="input" value={androidHash} onChange={(e) => setAndroidHash(e.target.value)} placeholder="K8a/AINcGX7" />
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: "var(--graphite)", padding: "10px 12px", background: "var(--surface-alt, #f5f5f5)", borderRadius: 4, marginBottom: 16 }}>
                        Auth templates are auto-approved. Body text is fixed by Meta. Pass the OTP as <code>code</code> at send time.
                      </div>
                    </>
                  )}

                  {/* MARKETING / UTILITY */}
                  {isMU && (
                    <>
                      {/* Header */}
                      <div className="field">
                        <label>Header <span style={{ color: "var(--graphite)", fontWeight: 400 }}>(optional)</span></label>
                        <select className="select" style={{ marginBottom: 8 }} value={headerFormat} onChange={(e) => setHeaderFormat(e.target.value as HeaderFormat)}>
                          <option value="NONE">None</option>
                          <option value="TEXT">Text</option>
                          <option value="LOCATION">Location</option>
                          <option value="IMAGE" disabled>Image (coming soon)</option>
                          <option value="VIDEO" disabled>Video (coming soon)</option>
                          <option value="DOCUMENT" disabled>Document (coming soon)</option>
                        </select>
                        {headerFormat === "TEXT" && (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <input className="input" value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Header text" maxLength={60} style={{ flex: 1 }} />
                              {charCount(headerText, 60)}
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                              <input type="checkbox" checked={headerHasVar} onChange={(e) => setHeaderHasVar(e.target.checked)} />
                              Include a variable in the header
                            </label>
                            {headerHasVar && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px", marginTop: 8 }}>
                                <div className="field" style={{ margin: 0 }}>
                                  <label style={{ fontSize: 12 }}>Variable name</label>
                                  <input className="input" value={headerVarName} onChange={(e) => setHeaderVarName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="sale_name" />
                                </div>
                                <div className="field" style={{ margin: 0 }}>
                                  <label style={{ fontSize: 12 }}>Sample value</label>
                                  <input className="input" value={headerVarExample} onChange={(e) => setHeaderVarExample(e.target.value)} placeholder="Summer Sale" />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="field">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <label style={{ margin: 0 }}>Body</label>
                            {charCount(bodyText, 1024)}
                          </div>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => setShowVarInsert((v) => !v)}
                            style={{ fontSize: 12 }}
                          >
                            + Insert variable
                          </button>
                        </div>

                        {showVarInsert && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 10px", background: "var(--surface-alt, #f5f5f5)", borderRadius: 4, marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "var(--graphite)", whiteSpace: "nowrap" }}>Variable name:</span>
                            <input
                              ref={varInputRef}
                              className="input"
                              style={{ fontSize: 13, flex: 1 }}
                              value={newVarName}
                              onChange={(e) => setNewVarName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                              placeholder="first_name"
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertVariable(); } if (e.key === "Escape") setShowVarInsert(false); }}
                            />
                            <button type="button" className="btn sm primary" onClick={insertVariable} disabled={!newVarName.trim()}>Insert</button>
                            <button type="button" className="btn sm ghost" onClick={() => setShowVarInsert(false)}>✕</button>
                          </div>
                        )}

                        <textarea
                          ref={bodyRef}
                          className="textarea"
                          rows={5}
                          value={bodyText}
                          onChange={(e) => { setBodyText(e.target.value); trackCursor(e); }}
                          onKeyUp={trackCursor}
                          onClick={trackCursor}
                          onFocus={trackCursor}
                          placeholder={"Hi {{first_name}}, your order {{order_id}} is ready."}
                          required
                        />

                        {bodyVarNames.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--graphite)", marginBottom: 8 }}>
                              Sample values — appear in preview and are required by Meta
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                              {bodyVarNames.map((v) => (
                                <div key={v}>
                                  <label style={{ fontSize: 12, fontWeight: 500, color: "#1a73e8" }}>{`{{${v}}}`}</label>
                                  <input
                                    className="input"
                                    style={{ fontSize: 13 }}
                                    value={bodyExamples[v] ?? ""}
                                    onChange={(e) => setBodyExamples((prev) => ({ ...prev, [v]: e.target.value }))}
                                    placeholder="Sample value"
                                    required
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="field">
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <label>Footer <span style={{ color: "var(--graphite)", fontWeight: 400 }}>(optional)</span></label>
                          {charCount(footerText, 60)}
                        </div>
                        <input className="input" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Reply STOP to unsubscribe" maxLength={60} />
                        {/\{\{/.test(footerText) && <div style={{ fontSize: 12, color: "var(--status-red)", marginTop: 4 }}>Footer cannot contain variables</div>}
                      </div>

                      {/* Buttons */}
                      <div className="field">
                        <label>Buttons <span style={{ color: "var(--graphite)", fontWeight: 400 }}>(optional, max 10)</span></label>
                        {buttons.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                            {buttons.map((b, idx) => (
                              <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "var(--surface-alt, #f5f5f5)", borderRadius: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--graphite)", minWidth: 90, paddingTop: 8 }}>{b.type.replace("_", " ")}</span>
                                <div style={{ flex: 1, display: "grid", gridTemplateColumns: b.type === "QUICK_REPLY" ? "1fr" : "1fr 1fr", gap: 8 }}>
                                  <input className="input" style={{ fontSize: 13 }} placeholder="Label (25 chars max)" maxLength={25} value={b.text} onChange={(e) => updateButton(b.id, { text: e.target.value })} />
                                  {b.type === "URL" && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <input className="input" style={{ fontSize: 13, flex: 1 }} placeholder={b.urlHasVar ? "https://example.com/track/" : "https://example.com"} value={b.url} onChange={(e) => updateButton(b.id, { url: e.target.value })} />
                                        {b.urlHasVar && <span style={{ fontSize: 12, color: "var(--graphite)", whiteSpace: "nowrap" }}>+{"{{1}}"}</span>}
                                      </div>
                                      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                        <input type="checkbox" checked={b.urlHasVar} onChange={(e) => updateButton(b.id, { urlHasVar: e.target.checked })} />
                                        Append dynamic suffix {"{{1}}"}
                                      </label>
                                      {b.urlHasVar && <input className="input" style={{ fontSize: 13 }} placeholder="Sample suffix (e.g. ORDER-123)" value={b.urlExample} onChange={(e) => updateButton(b.id, { urlExample: e.target.value })} />}
                                    </div>
                                  )}
                                  {b.type === "PHONE_NUMBER" && (
                                    <input className="input" style={{ fontSize: 13 }} placeholder="+27831234567" value={b.phoneNumber} onChange={(e) => updateButton(b.id, { phoneNumber: e.target.value })} />
                                  )}
                                </div>
                                <button type="button" onClick={() => removeButton(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--graphite)", fontSize: 18, paddingTop: 4, lineHeight: 1 }}>×</button>
                                <span style={{ fontSize: 11, color: "var(--graphite)", paddingTop: 10 }}>#{idx + 1}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {buttons.length < 10 && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button type="button" className="btn sm" onClick={() => addButton("QUICK_REPLY")}>+ Quick reply</button>
                            <button type="button" className="btn sm" onClick={() => addButton("URL")}>+ URL</button>
                            <button type="button" className="btn sm" onClick={() => addButton("PHONE_NUMBER")}>+ Phone number</button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {error && <div style={{ color: "var(--status-red)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" disabled={saving || !category}>{saving ? "Saving…" : "Create template"}</button>
                <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
              </div>
            </div>

            {/* ── Right: live preview ── */}
            {category && (
              <div style={{ position: "sticky", top: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--graphite)", marginBottom: 8 }}>
                  Preview
                </div>
                <WaPreview
                  category={category}
                  headerFormat={headerFormat}
                  headerText={headerText}
                  headerHasVar={headerHasVar}
                  headerVarName={headerVarName}
                  headerVarExample={headerVarExample}
                  bodyText={bodyText}
                  bodyExamples={bodyExamples}
                  footerText={footerText}
                  buttons={buttons}
                  addSecurityRec={addSecurityRec}
                  hasExpiry={hasExpiry}
                  expiryMinutes={expiryMinutes}
                  otpType={otpType}
                />
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
