import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/adminAuth";
import { del } from "@vercel/blob";
import { deleteSponsorBlobs, loadSponsorsManifest, writeSponsorsManifest } from "@/lib/sponsorsManifest";
import { brandKey } from "@/lib/sponsorBrands";
import { parseCrop } from "@/lib/imageCrop";
import type { Sponsor, SponsorCategory, SponsorStatus } from "@/types/sponsor";

type PatchBody = {
  status?: unknown;
  iconUrl?: unknown;
  name?: unknown;
  targetUrl?: unknown;
  category?: unknown;
  horizontalImageUrl?: unknown;
  verticalImageUrl?: unknown;
  horizontalCrop?: unknown;
  verticalCrop?: unknown;
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

/** Only fields present in the body change. */
function optionalImage(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" && isValidUrl(value) ? value : null;
}

/**
 * Edits a sponsor in place — anything from pause/resume to a full edit
 * (the browser has already uploaded any new image to Blob; this only
 * records URLs and crops).
 *
 * Name, link and icon belong to the advertiser, so they're applied to every
 * placement of the same brand (see @/lib/sponsorBrands); status, category,
 * banners and crops belong to this placement only. Images no record points
 * to anymore are deleted from the store.
 */
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

  const own: Partial<Sponsor> = {};
  const brand: Partial<Pick<Sponsor, "name" | "targetUrl" | "iconUrl">> = {};

  if (body.status !== undefined) {
    const status = body.status as SponsorStatus;
    if (status !== "active" && status !== "paused") {
      return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
    }
    own.status = status;
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !CATEGORIES.includes(body.category as SponsorCategory)) {
      return NextResponse.json({ error: "Categoria invalida." }, { status: 400 });
    }
    own.category = body.category as SponsorCategory;
  }
  for (const key of ["horizontalImageUrl", "verticalImageUrl", "fullPageImageUrl"] as const) {
    const value = optionalImage(body[key]);
    if (value !== undefined) own[key] = value;
  }
  if (body.horizontalCrop !== undefined) own.horizontalCrop = parseCrop(body.horizontalCrop);
  if (body.verticalCrop !== undefined) own.verticalCrop = parseCrop(body.verticalCrop);

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
    brand.name = name;
  }
  if (body.targetUrl !== undefined) {
    const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim() : "";
    if (!isValidUrl(targetUrl)) {
      return NextResponse.json({ error: "La URL de destino no es valida (debe incluir http:// o https://)." }, { status: 400 });
    }
    brand.targetUrl = targetUrl;
  }
  if (body.iconUrl !== undefined) {
    if (typeof body.iconUrl !== "string" || !body.iconUrl.startsWith("https://")) {
      return NextResponse.json({ error: "URL de icono invalida." }, { status: 400 });
    }
    brand.iconUrl = body.iconUrl;
  }
  if (Object.keys(own).length === 0 && Object.keys(brand).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  try {
    const sponsors = await loadSponsorsManifest();
    const target = sponsors.find((s) => s.id === id);
    if (!target) {
      return NextResponse.json({ error: "Auspiciador no encontrado." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const targetBrand = brandKey(target);
    // Pin the group to an explicit brandId first: for records grouped only
    // by their link, changing the link would otherwise split the group.
    const brandId = target.brandId ?? target.id;
    const updated = sponsors.map((s) => {
      if (brandKey(s) !== targetBrand) return s;
      const next: Sponsor = { ...s, brandId, ...brand, updatedAt: now };
      return s.id === id ? { ...next, ...own } : next;
    });

    // The placement must still have the images its category needs.
    const result = updated.find((s) => s.id === id)!;
    if (result.category === "fullpage") {
      if (!result.fullPageImageUrl) {
        return NextResponse.json({ error: "Falta la imagen de pagina completa." }, { status: 400 });
      }
      Object.assign(result, { horizontalImageUrl: null, verticalImageUrl: null, horizontalCrop: null, verticalCrop: null });
    } else {
      if (!result.horizontalImageUrl || !result.verticalImageUrl) {
        return NextResponse.json(
          { error: "Faltan las imagenes horizontal y/o vertical (ambas son obligatorias para Light/Premium)." },
          { status: 400 },
        );
      }
      result.fullPageImageUrl = null;
    }

    await writeSponsorsManifest(updated);

    // Best-effort cleanup of files no record uses anymore (every upload gets
    // a fresh pathname, so they'd otherwise linger in the store).
    const fileUrls = (s: Sponsor) => [s.horizontalImageUrl, s.verticalImageUrl, s.fullPageImageUrl, s.iconUrl];
    const stillUsed = new Set(updated.flatMap(fileUrls));
    const before = new Set(sponsors.filter((s) => brandKey(s) === targetBrand).flatMap(fileUrls));
    const orphaned = [...before].filter((url): url is string => Boolean(url) && !stillUsed.has(url));
    if (orphaned.length > 0) await Promise.allSettled(orphaned.map((url) => del(url)));

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
    const sponsors = await loadSponsorsManifest();
    const target = sponsors.find((s) => s.id === id);
    if (!target) {
      return NextResponse.json({ error: "Auspiciador no encontrado." }, { status: 404 });
    }

    const remaining = sponsors.filter((s) => s.id !== id);
    await writeSponsorsManifest(remaining);
    // Best-effort — the manifest is the source of truth for what the site
    // shows, so it's already correctly updated even if this cleanup fails.
    // The icon is shared by the brand's other placements — keep it if any
    // remaining record still points to it.
    const iconInUse = remaining.some((s) => s.iconUrl && s.iconUrl === target.iconUrl);
    await deleteSponsorBlobs(iconInUse ? { ...target, iconUrl: null } : target);

    return NextResponse.json({ ok: true, sponsors: remaining });
  } catch (err) {
    console.error("[admin/sponsors DELETE]", err);
    const message = err instanceof Error ? err.message : "Error eliminando el auspiciador.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
