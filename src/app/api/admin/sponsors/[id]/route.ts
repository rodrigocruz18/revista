import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/adminAuth";
import { deleteSponsorBlobs, readSponsorsManifest, writeSponsorsManifest } from "@/lib/sponsorsManifest";
import type { SponsorStatus } from "@/types/sponsor";

type PatchBody = { status?: unknown };

/** Pause/resume — the only field the admin UI ever changes in place. Editing
 * a sponsor's name/url/images goes through POST /api/admin/sponsors (upsert
 * by the same id) instead, since a new image upload is involved anyway. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/sponsors/[id]">) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await context.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  }

  const status = body.status as SponsorStatus;
  if (status !== "active" && status !== "paused") {
    return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
  }

  try {
    const sponsors = await readSponsorsManifest();
    const target = sponsors.find((s) => s.id === id);
    if (!target) {
      return NextResponse.json({ error: "Auspiciador no encontrado." }, { status: 404 });
    }
    const updated = sponsors.map((s) => (s.id === id ? { ...s, status, updatedAt: new Date().toISOString() } : s));
    await writeSponsorsManifest(updated);
    return NextResponse.json({ ok: true, sponsors: updated });
  } catch (err) {
    console.error("[admin/sponsors PATCH]", err);
    const message = err instanceof Error ? err.message : "Error actualizando el auspiciador.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/sponsors/[id]">) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const sponsors = await readSponsorsManifest();
    const target = sponsors.find((s) => s.id === id);
    if (!target) {
      return NextResponse.json({ error: "Auspiciador no encontrado." }, { status: 404 });
    }

    const remaining = sponsors.filter((s) => s.id !== id);
    await writeSponsorsManifest(remaining);
    // Best-effort — the manifest is the source of truth for what the site
    // shows, so it's already correctly updated even if this cleanup fails.
    await deleteSponsorBlobs(target);

    return NextResponse.json({ ok: true, sponsors: remaining });
  } catch (err) {
    console.error("[admin/sponsors DELETE]", err);
    const message = err instanceof Error ? err.message : "Error eliminando el auspiciador.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
