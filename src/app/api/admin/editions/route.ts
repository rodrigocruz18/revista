import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { isAuthenticated } from "@/lib/adminAuth";
import { normalizeEditions, loadManifestEditions, writeManifestEditions } from "@/lib/blobManifest";
import { MONTHS_ES } from "@/config/magazine";
import type { Magazine } from "@/types/magazine";

type UpsertBody = {
  year?: unknown;
  month?: unknown;
  editionLabel?: unknown;
  pdfUrl?: unknown;
  pdfFilename?: unknown;
  coverUrl?: unknown;
};

/**
 * Upserts one edition into the manifest. Called by the admin UI right after
 * the browser finishes uploading the PDF (and optional cover) straight to
 * Vercel Blob via /api/admin/upload — this route only ever handles small
 * JSON, never the file itself.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  }

  const year = Number(body.year);
  const month = Number(body.month);
  const pdfUrl = typeof body.pdfUrl === "string" ? body.pdfUrl : "";
  const pdfFilename = typeof body.pdfFilename === "string" ? body.pdfFilename : "";
  const coverUrl = typeof body.coverUrl === "string" && body.coverUrl ? body.coverUrl : null;
  const customLabel = typeof body.editionLabel === "string" ? body.editionLabel.trim() : "";

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Ano invalido." }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Mes invalido." }, { status: 400 });
  }
  if (!pdfUrl) {
    return NextResponse.json({ error: "Falta la URL del PDF subido." }, { status: 400 });
  }

  const slug = `${year}-${String(month).padStart(2, "0")}`;
  const editionLabel = customLabel || `${MONTHS_ES[month - 1]} ${year}`;

  try {
    const editions = await loadManifestEditions();
    const upserted: Magazine = {
      filename: pdfFilename || `${slug}.pdf`,
      url: pdfUrl,
      year,
      month,
      editionLabel,
      slug,
      position: 0,
      isCurrent: false,
      coverUrl,
    };
    const previous = editions.find((e) => e.slug === slug);
    const merged = normalizeEditions([...editions.filter((e) => e.slug !== slug), upserted]);
    await writeManifestEditions(merged);
    // Replacing an edition: uploads get unique names now, so the files it
    // no longer points to would otherwise stay in the store forever.
    const replaced = [previous?.url, previous?.coverUrl].filter(
      (url): url is string => Boolean(url) && url !== pdfUrl && url !== coverUrl && url!.startsWith("https://"),
    );
    if (replaced.length > 0) await Promise.allSettled(replaced.map((url) => del(url)));
    return NextResponse.json({ ok: true, editions: merged });
  } catch (err) {
    console.error("[admin/editions POST]", err);
    const message = err instanceof Error ? err.message : "Error guardando la edicion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const editions = await loadManifestEditions();
  return NextResponse.json({ editions });
}
