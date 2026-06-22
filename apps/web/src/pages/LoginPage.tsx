import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api, setApiKey } from "../api/client";

export function LoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setError("");
    setLoading(true);
    try {
      setApiKey(key.trim());
      // Verify the key works before accepting it.
      await api.credentials.list();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setApiKey("");
      setError(err instanceof ApiError ? err.message : "Could not authenticate. Check your API key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: "-0.02em",
              marginBottom: 6,
            }}
          >
            Qalisa
          </div>
          <div style={{ fontSize: 14, color: "var(--graphite)" }}>
            Enter your API key to continue
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="apikey">API Key</label>
                <input
                  id="apikey"
                  className="input"
                  type="password"
                  placeholder="qal_…"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
                <div className="field-hint">
                  Issued by your administrator via the provisioning API.
                </div>
              </div>

              {error && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--status-red)",
                    marginBottom: 14,
                    padding: "8px 12px",
                    background: "#faece8",
                    border: "1px solid #e7c4bd",
                    borderRadius: 4,
                  }}
                >
                  {error}
                </div>
              )}

              <button className="btn primary" style={{ width: "100%" }} disabled={loading || !key.trim()}>
                {loading ? "Checking…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
