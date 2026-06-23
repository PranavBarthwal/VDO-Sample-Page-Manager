import { notFound } from "next/navigation";
import { getMeta } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The generated route for a clone. The captured snapshot is a complete HTML
 * document with its own <head>, so we serve it inside a full-viewport iframe
 * pointing at the static file (public/clones/{slug}/index.html). This isolates
 * the cloned page's styles from the app shell and gives a faithful render.
 */
export default async function ClonePage({ params }: { params: { slug: string } }) {
  const meta = await getMeta(params.slug);
  if (!meta || meta.status === "failed") notFound();

  return (
    <>
      <iframe
        src={meta.htmlPath}
        title={meta.title || meta.slug}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          border: "none",
        }}
      />
      {/* In-page toggle: jump into the drag-and-drop ad editor for this page. */}
      <a
        href={`/editor/${meta.slug}`}
        style={{
          position: "fixed",
          left: 18,
          bottom: 18,
          zIndex: 2147483647,
          background: "#5b8cff",
          color: "#fff",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 700,
          padding: "10px 16px",
          borderRadius: 999,
          textDecoration: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        ✏️ Edit Ads
      </a>
    </>
  );
}
