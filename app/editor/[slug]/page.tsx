"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

declare global {
  interface Window {
    VdoPlayer: any;
    VdoAds: any;
  }
}

interface Placement {
  id: string;
  unitId: string;
  placement: "in-flow" | "viewport";
  selector: string | null;
  position: "after" | "before";
  config: Record<string, any>;
}

const BLOCK_SEL = "p,h1,h2,h3,h4,h5,h6,figure,img,ul,ol,blockquote,section,article,div";

let _idc = 0;
const newId = () => `pl_${Date.now()}_${_idc++}`;

export default function Editor({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handles = useRef<Record<string, any>>({});
  const [ready, setReady] = useState(false); // parent VdoAds (metadata)
  const [frameReady, setFrameReady] = useState(false); // iframe VdoAds + listeners
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [armed, setArmed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const armedRef = useRef<string | null>(null);
  armedRef.current = armed;
  const dragUnitRef = useRef<string | null>(null);

  // Load VdoAds in the PARENT for palette metadata.
  useEffect(() => {
    ensureLink("/vdo/vdo-player.css", "ed-css-player");
    ensureLink("/vdo/vdo-ads.css", "ed-css-ads");
    if (window.VdoAds) { setReady(true); return; }
    loadScript("/vdo/vdo-player.js", "ed-js-player")
      .then(() => loadScript("/vdo/vdo-ads.js", "ed-js-ads"))
      .then(() => setReady(true));
  }, []);

  const iframeWin = () => iframeRef.current?.contentWindow as any;
  const iframeDoc = () => iframeRef.current?.contentDocument as Document | null;

  // Render one placement into the iframe; returns the handle.
  const renderOne = useCallback((pl: Placement) => {
    const win = iframeWin();
    const doc = iframeDoc();
    if (!win?.VdoAds || !doc) return null;
    try {
      if (pl.placement === "viewport" || !pl.selector) {
        return win.VdoAds.render(pl.unitId, doc.body, pl.config || {});
      }
      const anchor = doc.querySelector(pl.selector);
      if (!anchor || !anchor.parentNode) return null;
      let holder = doc.querySelector(`[data-vdo-id="${pl.id}"]`) as HTMLElement | null;
      if (!holder) {
        holder = doc.createElement("div");
        holder.setAttribute("data-vdo-id", pl.id);
        holder.className = "vdo-slot";
        holder.style.margin = "18px 0";
        if (pl.position === "before") anchor.parentNode.insertBefore(holder, anchor);
        else anchor.parentNode.insertBefore(holder, anchor.nextSibling);
      } else {
        holder.innerHTML = "";
      }
      return win.VdoAds.render(pl.unitId, holder, { ...pl.config, scrollRoot: null });
    } catch {
      return null;
    }
  }, []);

  // Build a stable selector for an element (ignores previously inserted vdo nodes).
  function cssPath(doc: Document, e: Element | null): string {
    if (!e || e === doc.body) return "body";
    const parts: string[] = [];
    let cur: Element | null = e;
    while (cur && cur.nodeType === 1 && cur !== doc.body && cur.parentNode) {
      const tag = cur.tagName.toLowerCase();
      const sibs = Array.prototype.filter.call(
        (cur.parentNode as Element).children,
        (c: Element) => {
          const cn = (c.getAttribute && c.getAttribute("class")) || "";
          return c.tagName === cur!.tagName && cn.indexOf("vdo-") === -1;
        }
      ) as Element[];
      let idx = sibs.indexOf(cur);
      if (idx < 0) idx = 0;
      parts.unshift(`${tag}:nth-of-type(${idx + 1})`);
      cur = cur.parentNode as Element;
    }
    return parts.length ? "body > " + parts.join(" > ") : "body";
  }

  // Set up the iframe: inject assets, render existing layout, wire edit listeners.
  const onIframeLoad = useCallback(async () => {
    const doc = iframeDoc();
    const win = iframeWin();
    if (!doc || !win) return;

    // Inject assets into the iframe.
    injectAsset(doc, "link", "/vdo/vdo-player.css");
    injectAsset(doc, "link", "/vdo/vdo-ads.css");
    await injectScript(doc, "/vdo/vdo-player.js");
    await injectScript(doc, "/vdo/vdo-ads.js");

    // Block link navigation while editing.
    doc.addEventListener(
      "click",
      (e) => {
        const a = (e.target as Element)?.closest?.("a");
        if (a && !(a as HTMLElement).closest("[data-vdo-id], .vdo-floating, .vdo-anchor, .vdo-player, .vdo-banner")) {
          // allow our own unit links? keep simple: block all navigation in editor
        }
        if (a) e.preventDefault();
      },
      true
    );

    // Hover highlight + click-to-place (only acts when a unit is armed).
    let hl: HTMLElement | null = null;
    const clearHl = () => { if (hl) { hl.style.outline = ""; hl.style.outlineOffset = ""; hl = null; } };
    doc.addEventListener("mousemove", (e) => {
      if (!armedRef.current) { clearHl(); return; }
      const blk = (e.target as Element)?.closest?.(BLOCK_SEL) as HTMLElement | null;
      if (blk === hl) return;
      clearHl();
      if (blk && !blk.closest("[data-vdo-id]")) {
        hl = blk;
        hl.style.outline = "2px solid #5b8cff";
        hl.style.outlineOffset = "2px";
      }
    });
    doc.addEventListener(
      "click",
      (e) => {
        const unitId = armedRef.current;
        if (!unitId) return;
        const blk = (e.target as Element)?.closest?.(BLOCK_SEL) as HTMLElement | null;
        if (!blk || blk.closest("[data-vdo-id]")) return;
        e.preventDefault();
        e.stopPropagation();
        const selector = cssPath(doc, blk);
        clearHl();
        addInFlow(unitId, selector);
      },
      true
    );

    // Drag-and-drop placement: drag a palette unit, drop between elements.
    doc.addEventListener("dragover", (e) => {
      if (!dragUnitRef.current) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      const blk = (e.target as Element)?.closest?.(BLOCK_SEL) as HTMLElement | null;
      if (blk === hl) return;
      clearHl();
      if (blk && !blk.closest("[data-vdo-id]")) {
        hl = blk;
        hl.style.outline = "2px dashed #36d399";
        hl.style.outlineOffset = "2px";
      }
    });
    doc.addEventListener("drop", (e) => {
      const unitId = dragUnitRef.current;
      if (!unitId) return;
      e.preventDefault();
      const blk = (e.target as Element)?.closest?.(BLOCK_SEL) as HTMLElement | null;
      clearHl();
      dragUnitRef.current = null;
      if (blk && !blk.closest("[data-vdo-id]")) addInFlow(unitId, cssPath(doc, blk));
    });

    setFrameReady(true);

    // Load + render any saved layout.
    try {
      const res = await fetch(`/api/clones/${slug}/layout`, { cache: "no-store" });
      const data = await res.json();
      const saved: Placement[] = (data.placements || []).map((p: any) => ({
        ...p,
        id: p.id || newId(),
      }));
      setPlacements(saved);
      saved.forEach((pl) => { handles.current[pl.id] = renderOne(pl); });
    } catch {
      /* no layout yet */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, renderOne]);

  function addInFlow(unitId: string, selector: string) {
    const def = window.VdoAds?.get(unitId);
    const pl: Placement = {
      id: newId(),
      unitId,
      placement: "in-flow",
      selector,
      position: "after",
      config: { ...(def?.defaults || {}) },
    };
    setPlacements((prev) => [...prev, pl]);
    handles.current[pl.id] = renderOne(pl);
    setArmed(null);
    setSelected(pl.id);
  }

  function addViewport(unitId: string) {
    const def = window.VdoAds?.get(unitId);
    const pl: Placement = {
      id: newId(),
      unitId,
      placement: "viewport",
      selector: null,
      position: "after",
      config: { ...(def?.defaults || {}) },
    };
    setPlacements((prev) => [...prev, pl]);
    handles.current[pl.id] = renderOne(pl);
    setSelected(pl.id);
  }

  function onPaletteClick(unitId: string) {
    const def = window.VdoAds?.get(unitId);
    if (def?.placement === "viewport") {
      addViewport(unitId);
    } else {
      setArmed((cur) => (cur === unitId ? null : unitId));
    }
  }

  function removePlacement(id: string) {
    handles.current[id]?.destroy?.();
    delete handles.current[id];
    const doc = iframeDoc();
    doc?.querySelector(`[data-vdo-id="${id}"]`)?.remove();
    setPlacements((prev) => prev.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
  }

  function updateConfig(id: string, patch: Record<string, any>) {
    setPlacements((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, config: { ...p.config, ...patch } } : p));
      const pl = next.find((p) => p.id === id);
      if (pl) {
        handles.current[id]?.destroy?.();
        const doc = iframeDoc();
        const holder = doc?.querySelector(`[data-vdo-id="${id}"]`) as HTMLElement | null;
        if (holder) holder.innerHTML = "";
        handles.current[id] = renderOne(pl);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const body = { placements: placements.map(({ id, ...rest }) => ({ id, ...rest })) };
      const res = await fetch(`/api/clones/${slug}/layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) setSavedMsg("Saved ✓");
      else setSavedMsg("Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(null), 2500);
    }
  }

  const units = ready && window.VdoAds ? window.VdoAds.units : [];
  const selPl = placements.find((p) => p.id === selected) || null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)" }}>
      {/* Sidebar */}
      <div style={{ width: 320, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "auto" }}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <Link href={`/preview/${slug}`} style={{ fontSize: 13 }}>← Preview</Link>
          <h2 style={{ fontSize: 17, margin: "8px 0 2px" }}>Ad Editor</h2>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>{slug}</div>
        </div>

        <div style={{ padding: 16 }}>
          <div className="section-title" style={{ margin: "0 0 10px" }}>Ad Units</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            {armed
              ? `Now click a spot between elements to drop "${armed}". Click the unit again to cancel.`
              : "Drag a unit onto the page (between paragraphs/elements), or click it then click a spot. Floating & anchor add instantly."}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {units.map((u: any) => {
              const inFlow = u.placement === "in-flow";
              return (
                <button
                  key={u.id}
                  className="btn btn-sm"
                  draggable={inFlow}
                  onDragStart={() => { if (inFlow) dragUnitRef.current = u.id; }}
                  onDragEnd={() => { dragUnitRef.current = null; }}
                  onClick={() => onPaletteClick(u.id)}
                  title={inFlow ? "Drag onto the page, or click then click a spot" : "Click to add"}
                  style={{
                    textAlign: "left",
                    cursor: inFlow ? "grab" : "pointer",
                    borderColor: armed === u.id ? "var(--accent)" : "var(--border)",
                    color: armed === u.id ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {inFlow ? "⠿ " : ""}{u.icon} {u.name}
                  <span style={{ float: "right", opacity: 0.5, fontSize: 11 }}>{u.category}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <div className="section-title" style={{ margin: "6px 0 10px" }}>Placed ({placements.length})</div>
          {placements.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>No ads placed yet.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {placements.map((p) => {
              const u = window.VdoAds?.get(p.unitId);
              return (
                <div
                  key={p.id}
                  className="card"
                  style={{
                    padding: "8px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderColor: selected === p.id ? "var(--accent)" : "var(--border)",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelected(p.id)}
                >
                  <span style={{ fontSize: 13, flex: 1 }}>{u?.icon} {u?.name}</span>
                  <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); removePlacement(p.id); }}>✕</button>
                </div>
              );
            })}
          </div>
        </div>

        {selPl && (
          <div style={{ padding: "0 16px 16px" }}>
            <div className="section-title" style={{ margin: "6px 0 10px" }}>Configure</div>
            <ConfigPanel placement={selPl} onChange={(patch) => updateConfig(selPl.id, patch)} />
          </div>
        )}

        <div style={{ marginTop: "auto", padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save layout"}
          </button>
          <a className="btn btn-sm" href={`/clones/${slug}`} target="_blank" rel="noreferrer">Open live ↗</a>
          {savedMsg && <span style={{ fontSize: 12, color: "var(--accent-2)" }}>{savedMsg}</span>}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", background: "#1a1a1a" }}>
        {!frameReady && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
            Loading clone…
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={`/clones/${slug}/index.html?edit=1`}
          onLoad={onIframeLoad}
          style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
          title="clone editor"
        />
      </div>
    </div>
  );
}

function ConfigPanel({ placement, onChange }: { placement: Placement; onChange: (patch: Record<string, any>) => void }) {
  const unit = typeof window !== "undefined" ? window.VdoAds?.get(placement.unitId) : null;
  const c = placement.config;
  const presets: string[] = unit?.presets || [];
  const sizes: string[] = unit?.sizes || [];
  const isVideo =
    placement.unitId === "floating-video" ||
    placement.unitId === "in-content" ||
    placement.unitId === "sticky-incontent";

  if (placement.unitId === "custom-tag") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Row label="Ad tag (HTML / script)">
          <textarea
            className="lab-input"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, minHeight: 120, resize: "vertical" }}
            value={c.tag || ""}
            onChange={(e) => onChange({ tag: e.target.value })}
            placeholder={'<div id="vdo_slot"></div>\n<script src="https://a.vdo.ai/core/your-tag/index.js" async></script>'}
          />
        </Row>
        <Row label="Max width (px or 'auto')">
          <input className="lab-input" value={String(c.width ?? "auto")} onChange={(e) => onChange({ width: /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value })} />
        </Row>
        <Row label="Min height (px)">
          <input className="lab-input" type="number" value={Number(c.minHeight ?? 90)} onChange={(e) => onChange({ minHeight: Number(e.target.value) })} />
        </Row>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          Scripts in the tag execute on the served page. Paste a real VDO.AI tag to demo the live product.
        </div>
        <style>{`.lab-input{width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 9px;font-size:13px}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {isVideo && presets.length > 0 && (
        <Row label="Preset">
          <select className="lab-input" value={c.preset || presets[0]} onChange={(e) => onChange({ preset: e.target.value })}>
            {presets.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Row>
      )}
      {isVideo && (
        <Row label="Content aspect">
          <select className="lab-input" value={c.contentAspect || "16:9"} onChange={(e) => onChange({ contentAspect: e.target.value })}>
            {["9:16", "1:1", "4:5", "16:9", "4:3"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Row>
      )}
      {(placement.unitId === "floating-video" || placement.unitId === "sticky-incontent") && (
        <Row label={placement.unitId === "sticky-incontent" ? "Dock corner" : "Corner"}>
          <select className="lab-input" value={c.corner || "br"} onChange={(e) => onChange({ corner: e.target.value })}>
            {[["br", "bottom-right"], ["bl", "bottom-left"], ["tr", "top-right"], ["tl", "top-left"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Row>
      )}
      {isVideo && (
        <Row label="Ad VAST tag (plays on Fire Ad)">
          <textarea
            className="lab-input"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, minHeight: 64, resize: "vertical" }}
            value={c.adVast || ""}
            onChange={(e) => onChange({ adVast: e.target.value })}
            placeholder="https://pubads.g.doubleclick.net/gampad/ads?...&output=vast"
          />
        </Row>
      )}
      {sizes.length > 0 && (
        <Row label="Size">
          <select className="lab-input" value={c.size || sizes[0]} onChange={(e) => onChange({ size: e.target.value })}>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Row>
      )}
      {(placement.unitId === "banner" || placement.unitId === "anchor") && (
        <>
          <Row label="Brand"><input className="lab-input" value={c.brand || ""} onChange={(e) => onChange({ brand: e.target.value })} /></Row>
          <Row label="Headline"><input className="lab-input" value={c.headline || ""} onChange={(e) => onChange({ headline: e.target.value })} /></Row>
        </>
      )}
      <Row label="CTA text"><input className="lab-input" value={c.cta || ""} onChange={(e) => onChange({ cta: e.target.value })} placeholder="Learn More" /></Row>
      <Row label="Click URL"><input className="lab-input" value={c.url || ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" /></Row>
      <Row label="Accent"><input type="color" value={c.accent || "#5b8cff"} onChange={(e) => onChange({ accent: e.target.value })} style={{ width: 48, height: 30, border: "none", background: "none" }} /></Row>
      <style>{`.lab-input{width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 9px;font-size:13px}`}</style>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

/* ----------------------------- asset helpers ----------------------------- */
function ensureLink(href: string, id: string) {
  if (document.getElementById(id)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href; l.id = id;
  document.head.appendChild(l);
}
function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    const ex = document.getElementById(id) as any;
    if (ex) { if (ex._loaded) resolve(); else ex.addEventListener("load", () => resolve()); return; }
    const s = document.createElement("script");
    s.src = src; s.id = id;
    s.onload = () => { (s as any)._loaded = true; resolve(); };
    document.body.appendChild(s);
  });
}
function injectAsset(doc: Document, kind: "link", href: string) {
  if (doc.querySelector(`[data-vdo-asset="${href}"]`)) return;
  const l = doc.createElement("link");
  l.rel = "stylesheet"; l.href = href; l.setAttribute("data-vdo-asset", href);
  doc.head.appendChild(l);
}
function injectScript(doc: Document, src: string): Promise<void> {
  return new Promise((resolve) => {
    if (doc.querySelector(`[data-vdo-asset="${src}"]`)) { resolve(); return; }
    const s = doc.createElement("script");
    s.src = src; s.setAttribute("data-vdo-asset", src);
    s.onload = () => resolve();
    s.onerror = () => resolve();
    doc.body.appendChild(s);
  });
}
