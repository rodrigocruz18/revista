/**
 * Small JSON documents in Vercel Blob (editions manifest, sponsors, sponsor
 * settings), stored as immutable versions instead of one overwritten file.
 *
 * Why: public blobs are served through Vercel's CDN, and the SDK's
 * `get(..., { useCache: false })` only bypasses that cache for *private*
 * blobs. Overwriting one public `sponsors.json` meant reads could return
 * the previous content for up to ~60s — so a pause/delete looked undone on
 * reload, and a second change inside that window was applied on top of the
 * stale copy, silently reverting the first one.
 *
 * Now every write creates `data/<name>/<timestamp>-<rand>.json` (never
 * overwritten, so never stale in any cache) and reads pick the newest via
 * `list()`, which queries Blob's API rather than the CDN. The last few
 * versions are kept; older ones are pruned.
 *
 * Reads throw on failure: callers that go on to *write* must never mistake
 * "couldn't read" for "empty" and save over real data.
 */
import { del, get, list, put } from "@vercel/blob";

const KEEP_VERSIONS = 5;

function versionPrefix(name: string): string {
  return `data/${name.replace(/\.json$/, "")}/`;
}

/** Newest first — pathnames start with a zero-padded timestamp. */
function byNewest<T extends { pathname: string }>(blobs: T[]): T[] {
  return [...blobs].sort((a, b) => b.pathname.localeCompare(a.pathname));
}

/**
 * Latest saved version of document `name` (e.g. "sponsors.json"), or null
 * if it has never been saved. Falls back to the legacy single file at the
 * store root, so data saved before versioning still loads (and is migrated
 * by the next write).
 */
export async function readBlobJson<T>(name: string): Promise<T | null> {
  const { blobs } = await list({ prefix: versionPrefix(name), limit: 1000 });
  const latest = byNewest(blobs)[0];
  if (latest) {
    const response = await fetch(latest.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo leer ${latest.pathname} (HTTP ${response.status}).`);
    return (await response.json()) as T;
  }

  const legacy = await get(name, { access: "public" });
  if (!legacy?.stream) return null;
  return JSON.parse(await new Response(legacy.stream).text()) as T;
}

/** Saves a new version of document `name`, then prunes old versions (best-effort). */
export async function writeBlobJson(name: string, data: unknown): Promise<void> {
  const prefix = versionPrefix(name);
  const stamp = String(Date.now()).padStart(15, "0");
  await put(`${prefix}${stamp}-${crypto.randomUUID().slice(0, 8)}.json`, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
    // Each version is immutable, so it can be cached indefinitely.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  try {
    const { blobs } = await list({ prefix, limit: 1000 });
    const stale = byNewest(blobs).slice(KEEP_VERSIONS);
    if (stale.length > 0) await del(stale.map((blob) => blob.url));
  } catch (err) {
    console.error(`[blobJson] No se pudieron limpiar versiones antiguas de ${name}:`, err);
  }
}
