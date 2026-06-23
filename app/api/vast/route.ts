import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxies a VAST ad-tag request server-side so the player can parse the XML
 * without hitting browser CORS restrictions. Follows one level of VAST wrapper
 * (VASTAdTagURI) so wrapped tags resolve to an inline ad.
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return NextResponse.json({ error: "url required" }, { status: 400 });

  let u: URL;
  try {
    u = new URL(target);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    let xml = await fetchText(u.toString());
    // Resolve up to 3 levels of wrapper.
    for (let i = 0; i < 3; i++) {
      const wrapped = xml.match(/<VASTAdTagURI>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/VASTAdTagURI>/i);
      if (!wrapped) break;
      const next = wrapped[1].trim();
      if (!/^https?:\/\//i.test(next)) break;
      xml = await fetchText(next);
    }
    return new Response(xml, {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `VAST fetch failed: ${msg}` }, { status: 502 });
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/xml,text/xml,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
