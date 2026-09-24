/**
 * Blob persistence for SponsorSettings (`sponsor-settings.json`), mirroring
 * @/lib/sponsorsManifest. Without Blob configured — or before anything has
 * been saved — the defaults apply, so the reader behaves exactly as it did
 * when these numbers were hardcoded.
 */
import { get, put } from "@vercel/blob";
import { isBlobConfigured } from "@/lib/blobManifest";
import { DEFAULT_SPONSOR_SETTINGS, normalizeSponsorSettings, type SponsorSettings } from "@/lib/sponsorSettings";

const SETTINGS_PATHNAME = "sponsor-settings.json";

export async function readSponsorSettings(): Promise<SponsorSettings> {
  if (!isBlobConfigured()) return DEFAULT_SPONSOR_SETTINGS;
  try {
    // `useCache: false`: a change saved from /admin must show up on the very next page load.
    const result = await get(SETTINGS_PATHNAME, { access: "public", useCache: false });
    if (!result) return DEFAULT_SPONSOR_SETTINGS;
    const text = await new Response(result.stream).text();
    return normalizeSponsorSettings(JSON.parse(text));
  } catch (err) {
    console.error("[sponsorSettings] Error leyendo sponsor-settings.json:", err);
    return DEFAULT_SPONSOR_SETTINGS;
  }
}

export async function writeSponsorSettings(settings: SponsorSettings): Promise<void> {
  if (!isBlobConfigured()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN no esta configurado: conecta un almacen de Vercel Blob al proyecto para poder guardar la configuracion.",
    );
  }
  await put(SETTINGS_PATHNAME, JSON.stringify({ updatedAt: new Date().toISOString(), ...settings }, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60, // the SDK's minimum; reads bypass it via useCache:false
  });
}
