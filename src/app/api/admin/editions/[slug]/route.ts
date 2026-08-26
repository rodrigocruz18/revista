import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/adminAuth";
import { deleteEditionBlobs, normalizeEditions, readManifestEditions, writeManifestEditions } from "@/lib/blobManifest";

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/editions/[slug]">) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await context.params;

  try {
    const editions = await readManifestEditions();
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
