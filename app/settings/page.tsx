"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<{ hasKey: boolean; fromEnv: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/settings", { cache: "no-store" });
    setStatus(await res.json());
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (res.ok) { setMsg("Saved ✓"); setApiKey(""); await refresh(); }
      else setMsg("Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2500);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 640 }}>
      <div className="header">
        <Link href="/" style={{ fontSize: 13 }}>← Dashboard</Link>
        <h1 style={{ marginTop: 8 }}>Settings</h1>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>Anthropic API Key</div>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
            Used by the AI Player Generator. Stored server-side in <code>data/config.json</code>.
            {status && (
              <>
                {" "}Status:{" "}
                {status.hasKey ? (
                  <b style={{ color: "var(--accent-2)" }}>
                    key set{status.fromEnv ? " (from environment)" : ""}
                  </b>
                ) : (
                  <b style={{ color: "var(--warn)" }}>not set</b>
                )}
              </>
            )}
          </p>
        </div>
        <input
          className="lab-input"
          type="password"
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={save} disabled={saving || !apiKey.trim()}>
            {saving ? "Saving…" : "Save key"}
          </button>
          {msg && <span style={{ fontSize: 13, color: "var(--accent-2)" }}>{msg}</span>}
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          The key is write-only here — it's never returned to the browser. You can also set
          <code> ANTHROPIC_API_KEY</code> in the environment instead.
        </p>
      </div>
    </main>
  );
}
