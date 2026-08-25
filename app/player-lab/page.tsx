"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

declare global {
  interface Window {
    VdoPlayer: any;
    VdoSkin: any;
    VdoAds: any;
  }
}

const PRESETS = [
  "glass", "minimal", "neon", "editorial", "cinematic",
  "youtube", "broadcast", "connatix", "teads", "reels", "spotlight", "vapor", "mono",
] as const;
const ASPECTS = ["9:16", "1:1", "4:5", "16:9", "4:3"] as const;
const ENTRANCES = ["none", "fade", "slide", "scale", "flip"] as const;

const SAMPLE_PLAYLIST = [
  { title: "Top Story", thumb: "https://picsum.photos/seed/v1/160/90", src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4" },
  { title: "Trending", thumb: "https://picsum.photos/seed/v2/160/90", src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4" },
  { title: "Watch Next", thumb: "https://picsum.photos/seed/v3/160/90", src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4" },
  { title: "Popular", thumb: "https://picsum.photos/seed/v4/160/90", src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" },
];

function ensureLink(href: string, id: string) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.id = id;
  document.head.appendChild(link);
}
function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any)._loaded) resolve();
      else existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.id = id;
    s.onload = () => { (s as any)._loaded = true; resolve(); };
    document.body.appendChild(s);
  });
}

/** (Re)load the custom-preset stylesheet, cache-busted so new presets apply. */
function reloadPresetsCss() {
  document.getElementById("vdo-css-presets")?.remove();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/api/presets/css?t=${Date.now()}`;
  link.id = "vdo-css-presets";
  document.head.appendChild(link);
}

function useVdoAssets() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensureLink("/vdo/vdo-player.css", "vdo-css-player");
    ensureLink("/vdo/vdo-ads.css", "vdo-css-ads");
    reloadPresetsCss();
    if (window.VdoPlayer && window.VdoAds) {
      setReady(true);
      return;
    }
    loadScript("/vdo/vdo-player.js", "vdo-js-player")
      .then(() => loadScript("/vdo/vdo-ads.js", "vdo-js-ads"))
      .then(() => setReady(true));
  }, []);
  return ready;
}

interface CustomPreset {
  id: string;
  name: string;
  config: { accent?: string; contentAspect?: string; entrance?: string; glow?: boolean; storyBar?: boolean };
}

export default function PlayerLab() {
  const ready = useVdoAssets();

  // Configurable main player
  const [preset, setPreset] = useState<string>("glass");
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);

  async function refreshPresets() {
    reloadPresetsCss();
    try {
      const res = await fetch("/api/presets", { cache: "no-store" });
      const data = await res.json();
      setCustomPresets(data.presets || []);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => { refreshPresets(); }, []);
  const [contentAspect, setContentAspect] = useState<string>("9:16");
  const [adAspect, setAdAspect] = useState<string>("16:9");
  const [width, setWidth] = useState(340);
  const [accent, setAccent] = useState("#e1306c");
  const [entrance, setEntrance] = useState<string>("slide");
  const [glow, setGlow] = useState(false);
  const [storyBar, setStoryBar] = useState(false);
  const [cta, setCta] = useState(true);
  const [playlist, setPlaylist] = useState(false);

  const mainRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  // (Re)build the main player whenever config changes.
  useEffect(() => {
    if (!ready || !mainRef.current) return;
    mainRef.current.innerHTML = "";
    playerRef.current = new window.VdoPlayer(mainRef.current, {
      preset,
      contentAspect,
      adAspect,
      width,
      accent,
      title: "Now Playing",
      autoplay: true,
      muted: true,
      loop: true,
      closeable: true,
      expandable: true,
      adSkipSeconds: 5,
      entrance: entrance === "none" ? null : entrance,
      glow,
      storyBar,
      cta: cta ? { text: "Learn More", url: "#", showAt: 2 } : null,
      playlist: playlist ? SAMPLE_PLAYLIST : null,
    });
    return () => {
      playerRef.current?.destroy?.();
    };
  }, [ready, preset, contentAspect, adAspect, width, accent, entrance, glow, storyBar, cta, playlist]);

  return (
    <main className="container">
      <div className="preview-head">
        <div>
          <Link href="/">← Dashboard</Link>
          <h1 style={{ margin: "8px 0 2px", fontSize: 22 }}>Player Lab</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Phase 1 — design & behavior of the injectable video player. Hit{" "}
            <b>Fire Ad</b> to see the aspect-ratio morph ({contentAspect} → {adAspect} → back).
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        {/* Controls */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Preset">
            <select className="lab-input" value={preset} onChange={(e) => setPreset(e.target.value as any)}>
              <optgroup label="Built-in">
                {PRESETS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </optgroup>
              {customPresets.length > 0 && (
                <optgroup label="AI-generated">
                  {customPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <Field label={`Content aspect — ${contentAspect}`}>
            <select className="lab-input" value={contentAspect} onChange={(e) => setContentAspect(e.target.value)}>
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label={`Ad aspect — ${adAspect}`}>
            <select className="lab-input" value={adAspect} onChange={(e) => setAdAspect(e.target.value)}>
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label={`Width — ${width}px`}>
            <input type="range" min={220} max={520} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: "100%" }} />
          </Field>
          <Field label="Accent">
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 56, height: 32, background: "none", border: "none" }} />
          </Field>
          <Field label="Entrance animation">
            <select className="lab-input" value={entrance} onChange={(e) => setEntrance(e.target.value)}>
              {ENTRANCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Toggle label="Glow ring" on={glow} set={setGlow} />
            <Toggle label="Story bar" on={storyBar} set={setStoryBar} />
            <Toggle label="CTA button" on={cta} set={setCta} />
            <Toggle label="Up-Next list" on={playlist} set={setPlaylist} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => playerRef.current?.fireAd?.()}>▶ Fire Ad</button>
            <button className="btn" onClick={() => playerRef.current?.togglePlay?.()}>Play / Pause</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            The 9:16 → 16:9 morph mirrors the brief: reel-style content that swaps to a
            widescreen player when an ad fires, then returns.
          </p>
        </div>

        {/* Main player stage */}
        <div className="card" style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: 480, padding: 28, background: "#0a0c12" }}>
          <div ref={mainRef} />
        </div>
      </div>

      {/* AI player generator */}
      <div className="section-title" style={{ marginTop: 36 }}>AI player generator</div>
      <AiGenerator
        ready={ready}
        customPresets={customPresets}
        onGenerated={async (id) => { await refreshPresets(); setPreset(id); }}
        onChanged={refreshPresets}
      />

      {/* Variant gallery */}
      <div className="section-title" style={{ marginTop: 36 }}>Aesthetic variants — “vibecoded” presets</div>
      <Gallery ready={ready} customPresets={customPresets} />

      <style>{`
        .lab-input{width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 10px;font-size:14px}
        .lab-field-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
        .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}
        .gallery .card{display:flex;flex-direction:column;align-items:center;gap:12px;background:#0a0c12}
        .gallery h4{margin:0;text-transform:capitalize;font-size:14px}
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="lab-field-label">{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => set(!on)}
      style={{
        borderColor: on ? "var(--accent)" : "var(--border)",
        color: on ? "var(--accent)" : "var(--text)",
        textAlign: "left",
      }}
    >
      {on ? "● " : "○ "}{label}
    </button>
  );
}

function Gallery({ ready, customPresets }: { ready: boolean; customPresets: CustomPreset[] }) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const players = useRef<Record<string, any>>({});

  const items = [
    ...PRESETS.map((p) => ({ id: p, label: p as string, config: {} as CustomPreset["config"] })),
    ...customPresets.map((p) => ({ id: p.id, label: `✨ ${p.name}`, config: p.config })),
  ];
  const key = items.map((i) => i.id).join(",");

  useEffect(() => {
    if (!ready) return;
    items.forEach((it) => {
      const host = refs.current[it.id];
      if (!host) return;
      host.innerHTML = "";
      players.current[it.id] = new window.VdoPlayer(host, {
        preset: it.id,
        contentAspect: it.config.contentAspect || "9:16",
        adAspect: "16:9",
        width: 230,
        title: it.label,
        autoplay: true,
        muted: true,
        loop: true,
        adSkipSeconds: 5,
        accent: it.config.accent,
        entrance: it.config.entrance && it.config.entrance !== "none" ? it.config.entrance : null,
        glow: it.config.glow,
        storyBar: it.config.storyBar,
      });
    });
    return () => {
      Object.values(players.current).forEach((pl: any) => pl?.destroy?.());
      players.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button
          className="btn btn-primary"
          onClick={() => Object.values(players.current).forEach((pl: any) => pl?.fireAd?.())}
        >
          ▶ Fire Ad on all
        </button>
      </div>
      <div className="gallery">
        {items.map((it) => (
          <div className="card" key={it.id}>
            <h4>{it.label}</h4>
            <div ref={(node) => { refs.current[it.id] = node; }} />
            <button className="btn btn-sm" onClick={() => players.current[it.id]?.fireAd?.()}>Fire Ad</button>
          </div>
        ))}
      </div>
    </>
  );
}

function AiGenerator({
  ready,
  customPresets,
  onGenerated,
  onChanged,
}: {
  ready: boolean;
  customPresets: CustomPreset[];
  onGenerated: (id: string) => void;
  onChanged: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/generate-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error || "Generation failed");
      else { setPrompt(""); onGenerated(data.preset.id); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/presets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>
        Describe a player look and Claude designs a new preset (needs an API key in{" "}
        <Link href="/settings">Settings</Link>). e.g. <i>“sleek dark glass player, teal accent, rounded, subtle glow, reels story bar”</i>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="lab-input"
          style={{ flex: 1 }}
          placeholder="Describe the player aesthetic…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
          disabled={busy}
        />
        <button className="btn btn-primary" onClick={generate} disabled={busy || !ready}>
          {busy ? "Generating…" : "✨ Generate"}
        </button>
      </div>
      {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
      {customPresets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {customPresets.map((p) => (
            <span key={p.id} className="badge" style={{ background: "var(--panel-2)", display: "inline-flex", gap: 6, alignItems: "center" }}>
              ✨ {p.name}
              <button onClick={() => remove(p.id)} style={{ border: "none", background: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
