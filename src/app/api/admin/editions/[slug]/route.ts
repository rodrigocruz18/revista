import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { isAuthenticated } from "@/lib/adminAuth";
import { deleteEditionBlobs, normalizeEditions, loadManifestEditions, writeManifestEditions } from "@/lib/blobManifest";
import { MONTHS_ES } from "@/config/magazine";
import type { Magazine } from "@/types/magazine";

type PatchBody = {
  editionLabel?: unknown;
  year?: unknown;
  month?: unknown;
  pdfUrl?: unknown;
  pdfFilename?: unknown;
  /** New cover URL; null removes the stored cover. Omit to keep it. */
  coverUrl?: unknown;
};

/**
 * Edits an existing edition: title, month/year (which moves its URL to the
 * new /revista/YYYY-MM), and/or replaces its PDF and cover. The browser has
 * already uploaded any new file to Blob; this only records the URLs, then
 * deletes the files the edition no longer points to.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/editions/[slug]">) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await context.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  }

  try {
    const editions = await loadManifestEditions();
    const target = editions.find((edition) => edition.slug === slug);
    if (!target) {
      return NextResponse.json({ error: "Edicion no encontrada." }, { status: 404 });
    }

    const year = body.year === undefined ? target.year : Number(body.year);
    const month = body.month === undefined ? target.month : Number(body.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Ano invalido." }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Mes invalido." }, { status: 400 });
    }
    const newSlug = `${year}-${String(month).padStart(2, "0")}`;
    if (newSlug !== slug && editions.some((edition) => edition.slug === newSlug)) {
      return NextResponse.json(
        { error: `Ya existe una edicion para ${MONTHS_ES[month - 1]} ${year}. Eliminala o editala primero.` },
        { status: 409 },
      );
    }

    const pdfUrl = typeof body.pdfUrl === "string" && body.pdfUrl ? body.pdfUrl : target.url;
    const pdfFilename = typeof body.pdfFilename === "string" && body.pdfFilename ? body.pdfFilename : target.filename;
    const coverUrl =
      body.coverUrl === undefined ? target.coverUrl : typeof body.coverUrl === "string" && body.coverUrl ? body.coverUrl : null;
    // A label that was just the default ("Agosto 2026") follows a month/year change.
    const defaultLabel = `${MONTHS_ES[target.month - 1]} ${target.year}`;
    const requestedLabel = typeof body.editionLabel === "string" ? body.editionLabel.trim() : undefined;
    const editionLabel =
      requestedLabel || (target.editionLabel === defaultLabel ? `${MONTHS_ES[month - 1]} ${year}` : target.editionLabel);

    const updated: Magazine = { ...target, year, month, slug: newSlug, editionLabel, url: pdfUrl, filename: pdfFilename, coverUrl };
    const merged = normalizeEditions([...editions.filter((edition) => edition.slug !== slug), updated]);
    await writeManifestEditions(merged);

    const replaced = [target.url, target.coverUrl].filter(
      (url): url is string => Boolean(url) && url !== pdfUrl && url !== coverUrl && url!.startsWith("https://"),
    );
    if (replaced.length > 0) await Promise.allSettled(replaced.map((url) => del(url)));

    return NextResponse.json({ ok: true, editions: merged, slug: newSlug });
  } catch (err) {
    console.error("[admin/editions PATCH]", err);
    const message = err instanceof Error ? err.message : "Error guardando la edicion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/editions/[slug]">) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await context.params;

  try {
    const editions = await loadManifestEditions();
    const target = editions.find((edition) => edition.slug === slug);
    if (!target) {
      return NextResponse.json({ error: "Edicion no encontrada." }, { status: 404 });
    }

    const remaining = normalizeEditions(editions.filter((edition) => edition.slug !== slug));
    await writeManifestEditions(remaining);
    // Best-effort — the manifest is the source of truth for what the site
    // shows, so it's already correctly updated even if this cleanup fails.
    await deleteEditionBlobs(target);

    return NextResponse.json({ ok: true, editions: remaining });
  } catch (err) {
    console.error("[admin/editions DELETE]", err);
    const message = err instanceof Error ? err.message : "Error eliminando la edicion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
