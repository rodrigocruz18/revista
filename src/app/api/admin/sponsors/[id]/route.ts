import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/adminAuth";
import { del } from "@vercel/blob";
import { deleteSponsorBlobs, readSponsorsManifest, writeSponsorsManifest } from "@/lib/sponsorsManifest";
import type { Sponsor, SponsorStatus } from "@/types/sponsor";

type PatchBody = { status?: unknown; iconUrl?: unknown };

/** In-place changes from the admin list: pause/resume, and setting or
 * replacing the icon (the browser has already uploaded it to Blob; this
 * only records the URL). Editing name/url/banners goes through POST
 * /api/admin/sponsors (upsert by the same id) instead. */
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

  const changes: Partial<Pick<Sponsor, "status" | "iconUrl">> = {};
  if (body.status !== undefined) {
    const status = body.status as SponsorStatus;
    if (status !== "active" && status !== "paused") {
      return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
    }
    changes.status = status;
  }
  if (body.iconUrl !== undefined) {
    if (typeof body.iconUrl !== "string" || !body.iconUrl.startsWith("https://")) {
      return NextResponse.json({ error: "URL de icono invalida." }, { status: 400 });
    }
    changes.iconUrl = body.iconUrl;
  }
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  try {
    const sponsors = await readSponsorsManifest();
    const target = sponsors.find((s) => s.id === id);
    if (!target) {
      return NextResponse.json({ error: "Auspiciador no encontrado." }, { status: 404 });
    }
    const updated = sponsors.map((s) => (s.id === id ? { ...s, ...changes, updatedAt: new Date().toISOString() } : s));
    await writeSponsorsManifest(updated);
    // Best-effort cleanup of a replaced icon (each upload gets a fresh
    // pathname, so the old file would otherwise linger in the store).
    if (changes.iconUrl && target.iconUrl && target.iconUrl !== changes.iconUrl) {
      await del(target.iconUrl).catch(() => {});
    }
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
