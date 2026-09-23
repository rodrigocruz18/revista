/**
 * Reads/writes the sponsors manifest from Vercel Blob storage, mirroring
 * @/lib/blobManifest.ts's approach for magazine editions — a single small
 * JSON blob (`sponsors.json`) at the root of the store, read and rewritten
 * in full by the /admin sponsor routes. No real database, on purpose: a
 * handful of sponsors managed by one operator doesn't need one.
 *
 * Unlike magazine editions there is no build-time fallback file — sponsors
 * are a purely runtime-optional feature. When Blob isn't configured,
 * `readSponsorsManifest()` returns an empty list (the reader simply shows no
 * sponsors) rather than throwing, so the rest of the app keeps working
 * exactly as before this feature existed.
 */
import { del, get, put } from "@vercel/blob";
import type { Sponsor, SponsorsManifest } from "@/types/sponsor";
import { isBlobConfigured } from "@/lib/blobManifest";

const SPONSORS_MANIFEST_PATHNAME = "sponsors.json";

export async function readSponsorsManifest(): Promise<Sponsor[]> {
  if (!isBlobConfigured()) return [];
  try {
    // `useCache: false` bypasses the CDN edge cache — same reasoning as the
    // magazine manifest: worth the small latency hit so a sponsor just
    // added/paused/deleted from /admin is never masked by a stale read.
    const result = await get(SPONSORS_MANIFEST_PATHNAME, { access: "public", useCache: false });
    if (!result) return [];
    const text = await new Response(result.stream).text();
    const data = JSON.parse(text) as SponsorsManifest;
    return Array.isArray(data.sponsors) ? data.sponsors : [];
  } catch (err) {
    console.error("[sponsorsManifest] Error leyendo sponsors.json:", err);
    return [];
  }
}

export async function writeSponsorsManifest(sponsors: Sponsor[]): Promise<void> {
  if (!isBlobConfigured()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN no esta configurado: conecta un almacen de Vercel Blob al proyecto para poder administrar auspiciadores desde /admin.",
    );
  }
  const manifest: SponsorsManifest = { generatedAt: new Date().toISOString(), sponsors };
  await put(SPONSORS_MANIFEST_PATHNAME, JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60, // the SDK's minimum; readSponsorsManifest() bypasses it anyway via useCache:false
  });
}

/** Best-effort delete of a sponsor's uploaded images. Never throws — a
 * failure here shouldn't block removing the sponsor from the manifest. */
export async function deleteSponsorBlobs(sponsor: Sponsor): Promise<void> {
  const targets = [sponsor.horizontalImageUrl, sponsor.verticalImageUrl, sponsor.fullPageImageUrl, sponsor.iconUrl].filter(
    (url): url is string => Boolean(url),
  );
  await Promise.allSettled(targets.map((url) => del(url)));
}
