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
  );
}
