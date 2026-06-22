"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CloneMeta } from "@/lib/types";

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [clones, setClones] = useState<CloneMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/clones", { cache: "no-store" });
    const data = await res.json();
    setClones(data.clones ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleClone(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Clone failed");
      } else {
        setUrl("");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm(`Delete clone "${slug}"? This removes its assets and route.`)) return;
    setBusySlug(slug);
    await fetch(`/api/clones/${slug}`, { method: "DELETE" });
    await refresh();
    setBusySlug(null);
  }

  async function handleRegenerate(slug: string) {
    setBusySlug(slug);
    setError(null);
    try {
      const res = await fetch(`/api/clones/${slug}/regenerate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Regenerate failed");
      await refresh();
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <main className="container">
      <div className="header">
        <h1>VDO Sample Page Manager</h1>
        <p>
          Enter any public URL — we render it, capture the DOM, CSS, images and
          fonts, store them locally, and serve a clone at <code>/clones/&#123;slug&#125;</code>.
        </p>
      </div>

      <form className="clone-form" onSubmit={handleClone}>
        <input
          type="text"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <><span className="spinner" />Cloning…</> : "Clone"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      <div className="section-title">Clone History ({clones.length})</div>

      {clones.length === 0 ? (
        <div className="empty">No clones yet. Paste a URL above to create your first clone.</div>
      ) : (
        <div className="clone-grid">
          {clones.map((c) => (
            <div className="card clone-item" key={c.slug}>
              <Link href={`/preview/${c.slug}`} className="clone-thumb">
                {c.status !== "failed" ? (
                  <img src={`${c.screenshotPath}?t=${encodeURIComponent(c.createdAt)}`} alt={c.slug} />
                ) : (
                  <div style={{ padding: 20, color: "var(--muted)" }}>No screenshot</div>
                )}
              </Link>
              <div className="clone-body">
                <div className="slug">
                  {c.slug} <StatusBadge status={c.status} />
                </div>
                <div className="url">{c.url}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                  {c.assetCount} assets · {(c.generationMs / 1000).toFixed(1)}s
                  {c.similarity && (
                    <> · <span className="match">{Math.round(c.similarity.overall * 100)}% match</span></>
                  )}
                </div>
                <div className="clone-actions">
                  <Link className="btn btn-sm" href={`/preview/${c.slug}`}>Preview</Link>
                  {c.status !== "failed" && (
                    <a className="btn btn-sm" href={c.clonePath} target="_blank" rel="noreferrer">
                      Open route
                    </a>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => handleRegenerate(c.slug)}
                    disabled={busySlug === c.slug}
                  >
                    {busySlug === c.slug ? "…" : "Regenerate"}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(c.slug)}
                    disabled={busySlug === c.slug}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: CloneMeta["status"] }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}
