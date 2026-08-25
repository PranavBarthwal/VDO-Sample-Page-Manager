import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeta } from "@/lib/storage";
import type { CloneMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: { slug: string } }) {
  const meta = await getMeta(params.slug);
  if (!meta) notFound();

  const cacheBust = `?t=${encodeURIComponent(meta.createdAt)}`;
  const matchPct = meta.similarity ? Math.round(meta.similarity.overall * 100) : null;

  return (
    <main className="container">
      <div className="preview-head">
        <div>
          <Link href="/">← Dashboard</Link>
          <h1 style={{ margin: "8px 0 2px", fontSize: 22 }}>{meta.slug}</h1>
          <div style={{ color: "var(--muted)", fontSize: 13, wordBreak: "break-all" }}>
            {meta.url}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={meta.status} />
          {meta.status !== "failed" && (
            <a className="btn btn-sm" href={meta.clonePath} target="_blank" rel="noreferrer">
              Open generated route ↗
            </a>
          )}
          {meta.status !== "failed" && (
            <Link className="btn btn-sm btn-primary" href={`/editor/${meta.slug}`}>
              🎯 Edit ads
            </Link>
          )}
          <a className="btn btn-sm" href={meta.url} target="_blank" rel="noreferrer">
            Open original ↗
          </a>
        </div>
      </div>

      {meta.error && <div className="error-banner">Error: {meta.error}</div>}

      <div className="stats">
        <Stat label="Visual Match" value={matchPct !== null ? `${matchPct}%` : "—"} accent />
        <Stat
          label="Structural (SSIM)"
          value={meta.similarity ? `${Math.round(meta.similarity.ssim * 100)}%` : "—"}
        />
        <Stat
          label="Pixel Similarity"
          value={meta.similarity ? `${Math.round(meta.similarity.pixel * 100)}%` : "—"}
        />
        <Stat label="Assets" value={String(meta.assetCount)} />
        <Stat label="Generation Time" value={`${(meta.generationMs / 1000).toFixed(1)}s`} />
        <Stat label="Route" value={meta.clonePath} small />
      </div>

      <div className="compare">
        <div className="pane">
          <h3>
            Original page screenshot
            <a href={meta.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              source ↗
            </a>
          </h3>
          <div className="shot">
            {meta.status !== "failed" ? (
              <img src={`${meta.screenshotPath}${cacheBust}`} alt="Original screenshot" />
            ) : (
              <div style={{ padding: 24, color: "var(--muted)" }}>Not captured.</div>
            )}
          </div>
        </div>
        <div className="pane">
          <h3>
            Generated route screenshot
            <a href={meta.clonePath} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              {meta.clonePath} ↗
            </a>
          </h3>
          <div className="shot">
            {meta.cloneScreenshotPath && meta.status !== "failed" ? (
              <img src={`${meta.cloneScreenshotPath}${cacheBust}`} alt="Clone screenshot" />
            ) : (
              <div style={{ padding: 24, color: "var(--muted)" }}>Not captured.</div>
            )}
          </div>
        </div>
      </div>

      {meta.diffPath && (
        <div className="pane" style={{ marginTop: 16 }}>
          <h3>Pixel diff (highlighted differences)</h3>
          <div className="shot">
            <img src={`${meta.diffPath}${cacheBust}`} alt="Diff" />
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div
        className="value"
        style={{
          color: accent ? "var(--accent-2)" : undefined,
          fontSize: small ? 14 : undefined,
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CloneMeta["status"] }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}
