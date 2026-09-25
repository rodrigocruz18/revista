/**
 * Blob persistence for SponsorSettings (`sponsor-settings.json`), mirroring
 * @/lib/sponsorsManifest. Without Blob configured — or before anything has
 * been saved — the defaults apply, so the reader behaves exactly as it did
 * when these numbers were hardcoded.
 */
import { readBlobJson, writeBlobJson } from "@/lib/blobJson";
import { isBlobConfigured } from "@/lib/blobManifest";
import { DEFAULT_SPONSOR_SETTINGS, normalizeSponsorSettings, type SponsorSettings } from "@/lib/sponsorSettings";

const SETTINGS_PATHNAME = "sponsor-settings.json";

export async function readSponsorSettings(): Promise<SponsorSettings> {
  if (!isBlobConfigured()) return DEFAULT_SPONSOR_SETTINGS;
  try {
    const data = await readBlobJson<unknown>(SETTINGS_PATHNAME);
    return data ? normalizeSponsorSettings(data) : DEFAULT_SPONSOR_SETTINGS;
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
  await writeBlobJson(SETTINGS_PATHNAME, { updatedAt: new Date().toISOString(), ...settings });
}
