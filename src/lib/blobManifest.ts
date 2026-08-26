/**
 * Reads/writes the magazine manifest from Vercel Blob storage, so new
 * editions can be published by the /admin panel at runtime — no git commit,
 * no redeploy.
 *
 * The manifest itself is just a small JSON blob (`manifest.json`) at the
 * root of the store, shaped exactly like the old build-time
 * `src/data/magazines.json` (see MagazineManifest in @/types/magazine). The
 * admin routes read it, add/remove an edition, and write it back — there's
 * no real database here, which is intentional: a single operator publishing
 * a handful of editions a year doesn't need one.
 *
 * IMPORTANT fallback: when BLOB_READ_WRITE_TOKEN isn't set (no Vercel Blob
 * store connected — e.g. local dev, or a deploy that hasn't opted into the
 * admin feature yet), this falls back to the original static
 * `src/data/magazines.json` import. That keeps `npm run dev` / `next build`
 * working exactly as before with zero setup, and is also why this project's
 * existing `scripts/generate-magazine-manifest.ts` (which builds that file
 * from /public/magazines) was left untouched.
 */
import { del, get, put } from "@vercel/blob";
import type { Magazine, MagazineManifest } from "@/types/magazine";
import localManifest from "@/data/magazines.json";

const MANIFEST_PATHNAME = "manifest.json";

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Recomputes `position` (0 = newest) and `isCurrent` after any add/remove. */
export function normalizeEditions(editions: Magazine[]): Magazine[] {
  const sorted = [...editions].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.month !== a.month) return b.month - a.month;
    return b.slug.localeCompare(a.slug);
  });
  return sorted.map((edition, index) => ({
    ...edition,
    position: index,
    isCurrent: index === 0,
  }));
}

export async function readManifestEditions(): Promise<Magazine[]> {
  if (!isBlobConfigured()) {
    return (localManifest as MagazineManifest).editions;
  }
  try {
    // `useCache: false` bypasses the CDN edge cache and reads straight from
    // origin storage — worth the small latency hit for this tiny file so an
    // edition uploaded a moment ago is never masked by a stale cached read.
    const result = await get(MANIFEST_PATHNAME, { access: "public", useCache: false });
    if (!result) return [];
    const text = await new Response(result.stream).text();
    const data = JSON.parse(text) as MagazineManifest;
    return Array.isArray(data.editions) ? data.editions : [];
  } catch (err) {
    console.error("[blobManifest] Error leyendo manifest.json:", err);
    return [];
  }
}

export async function writeManifestEditions(editions: Magazine[]): Promise<void> {
  if (!isBlobConfigured()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN no esta configurado: conecta un almacen de Vercel Blob al proyecto para poder publicar ediciones desde /admin.",
    );
  }
  const manifest: MagazineManifest = { generatedAt: new Date().toISOString(), editions };
  await put(MANIFEST_PATHNAME, JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60, // the SDK's minimum; readManifestEditions() bypasses it anyway via useCache:false
  });
}

/** Best-effort delete of an edition's PDF + cover blobs. Never throws — a
 * failure here shouldn't block removing the edition from the manifest. */
export async function deleteEditionBlobs(edition: Magazine): Promise<void> {
  const targets = [edition.url, edition.coverUrl].filter((url): url is string => Boolean(url));
  await Promise.allSettled(targets.map((url) => del(url)));
}
