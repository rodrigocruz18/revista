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
import { del } from "@vercel/blob";
import { readBlobJson, writeBlobJson } from "@/lib/blobJson";
import type { Sponsor, SponsorsManifest } from "@/types/sponsor";
import { isBlobConfigured } from "@/lib/blobManifest";

const SPONSORS_MANIFEST_PATHNAME = "sponsors.json";

/** Strict read for admin routes that modify the list: throws if Blob can't
 * be read, so a failed read is never saved back as "no sponsors". */
export async function loadSponsorsManifest(): Promise<Sponsor[]> {
  if (!isBlobConfigured()) return [];
  const data = await readBlobJson<SponsorsManifest>(SPONSORS_MANIFEST_PATHNAME);
  return Array.isArray(data?.sponsors) ? data.sponsors : [];
}

/** Lenient read for pages: on error, logs and shows no sponsors. */
export async function readSponsorsManifest(): Promise<Sponsor[]> {
  try {
    return await loadSponsorsManifest();
  } catch (err) {
    console.error("[sponsorsManifest] Error leyendo auspiciadores:", err);
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
  await writeBlobJson(SPONSORS_MANIFEST_PATHNAME, manifest);
}

/** Best-effort delete of a sponsor's uploaded images. Never throws — a
 * failure here shouldn't block removing the sponsor from the manifest. */
export async function deleteSponsorBlobs(sponsor: Sponsor): Promise<void> {
  const targets = [sponsor.horizontalImageUrl, sponsor.verticalImageUrl, sponsor.fullPageImageUrl, sponsor.iconUrl].filter(
    (url): url is string => Boolean(url),
  );
  await Promise.allSettled(targets.map((url) => del(url)));
}
