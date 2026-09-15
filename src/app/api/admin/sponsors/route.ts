import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/adminAuth";
import { readSponsorsManifest, writeSponsorsManifest } from "@/lib/sponsorsManifest";
import type { Sponsor, SponsorCategory } from "@/types/sponsor";

type UpsertBody = {
  id?: unknown;
  name?: unknown;
  targetUrl?: unknown;
  category?: unknown;
  horizontalImageUrl?: unknown;
  verticalImageUrl?: unknown;
  fullPageImageUrl?: unknown;
};

const CATEGORIES: SponsorCategory[] = ["light", "premium", "fullpage"];

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Upserts one sponsor into the manifest. Mirrors POST /api/admin/editions:
 * the admin UI uploads images straight to Vercel Blob first (via the
 * existing /api/admin/upload token route, under `sponsors/<id>/...`), then
 * calls this route with the resulting URLs — this route only ever handles
 * small JSON, never the file bytes.
 *
 * Unlike editions, the id here is generated client-side (crypto.randomUUID())
 * *before* the image upload step, because the images' own blob pathnames are
 * keyed by that id — see Sponsor.id's doc comment in @/types/sponsor. So a
 * POST with a fresh id creates, and a POST reusing an existing id updates
 * (e.g. replacing an image without losing createdAt/status).
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

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim() : "";
  const category = typeof body.category === "string" ? (body.category as SponsorCategory) : undefined;
  const horizontalImageUrl = typeof body.horizontalImageUrl === "string" && body.horizontalImageUrl ? body.horizontalImageUrl : null;
  const verticalImageUrl = typeof body.verticalImageUrl === "string" && body.verticalImageUrl ? body.verticalImageUrl : null;
  const fullPageImageUrl = typeof body.fullPageImageUrl === "string" && body.fullPageImageUrl ? body.fullPageImageUrl : null;

  if (!id) {
    return NextResponse.json({ error: "Falta el identificador del auspiciador." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (!targetUrl || !isValidUrl(targetUrl)) {
    return NextResponse.json({ error: "La URL de destino no es valida (debe incluir http:// o https://)." }, { status: 400 });
  }
  if (!category || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Categoria invalida." }, { status: 400 });
  }
  if (category === "fullpage") {
    if (!fullPageImageUrl) {
      return NextResponse.json({ error: "Falta la imagen de pagina completa." }, { status: 400 });
    }
  } else if (!horizontalImageUrl || !verticalImageUrl) {
    return NextResponse.json(
      { error: "Faltan las imagenes horizontal y/o vertical (ambas son obligatorias para Light/Premium)." },
      { status: 400 },
    );
  }

  try {
    const sponsors = await readSponsorsManifest();
    const existing = sponsors.find((s) => s.id === id);
    const now = new Date().toISOString();
    const upserted: Sponsor = {
      id,
      name,
      targetUrl,
      category,
      status: existing?.status ?? "active",
      horizontalImageUrl: category === "fullpage" ? null : horizontalImageUrl,
      verticalImageUrl: category === "fullpage" ? null : verticalImageUrl,
      fullPageImageUrl: category === "fullpage" ? fullPageImageUrl : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const merged = [...sponsors.filter((s) => s.id !== id), upserted];
    await writeSponsorsManifest(merged);
    return NextResponse.json({ ok: true, sponsors: merged });
  } catch (err) {
    console.error("[admin/sponsors POST]", err);
    const message = err instanceof Error ? err.message : "Error guardando el auspiciador.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const sponsors = await readSponsorsManifest();
  return NextResponse.json({ sponsors });
}
