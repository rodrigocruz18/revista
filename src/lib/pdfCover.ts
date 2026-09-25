import { loadPdfjs } from "@/lib/pdf";

export type CoverImage = { src: string; ratio: number };

/** Width of the cover JPG generated at publish time (see AdminDashboard) —
 * enough for the widget's largest cover on a retina screen. */
export const COVER_IMAGE_WIDTH = 1000;

const CACHE_NAME = "revista-covers-v1";
const RATIO_HEADER = "x-cover-ratio";

const covers = new Map<string, Promise<CoverImage>>();

/**
 * Rasterizes page 1 of a PDF to a JPEG. Opens the document with
 * `disableAutoFetch` + `disableStream`, so for a URL pdf.js only pulls the
 * byte ranges page 1 needs (static files and Vercel Blob both serve Range
 * requests) instead of streaming a 10-13MB edition just to show its front
 * page. Also accepts the PDF's bytes directly (admin: the file being
 * published, before it is uploaded).
 */
export async function renderPdfCoverBlob(
  source: string | ArrayBuffer,
  targetWidth: number,
): Promise<{ blob: Blob; ratio: number }> {
  const pdfjs = await loadPdfjs();
  const params = typeof source === "string" ? { url: source } : { data: new Uint8Array(source) };
  const doc = await pdfjs.getDocument({ ...params, disableAutoFetch: true, disableStream: true }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob fallo"))), "image/jpeg", 0.86),
    );
    return { blob, ratio: base.width / base.height };
  } finally {
    void doc.destroy();
  }
}

/**
 * Cover for an edition that has no stored cover image yet (the admin
 * normally generates one at publish time — this is the fallback). The
 * rendered JPEG is kept in the browser's Cache Storage, so it is only ever
 * rendered once per browser, not on every visit. Also memoized per URL for
 * the life of the page; a failed render is evicted so it can be retried.
 */
export function renderPdfCover(url: string, targetWidth: number): Promise<CoverImage> {
  const key = `${url}#w=${targetWidth}`;
  const cached = covers.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const stored = await readCachedCover(key);
    if (stored) return stored;
    const { blob, ratio } = await renderPdfCoverBlob(url, targetWidth);
    void writeCachedCover(key, blob, ratio);
    return { src: URL.createObjectURL(blob), ratio };
  })();

  covers.set(key, promise);
  promise.catch(() => covers.delete(key));
  return promise;
}

// Cache Storage needs a secure context (https or localhost); anywhere else
// these quietly do nothing and the cover is just rendered again.
async function readCachedCover(key: string): Promise<CoverImage | null> {
  try {
    if (typeof caches === "undefined") return null;
    const response = await (await caches.open(CACHE_NAME)).match(cacheRequest(key));
    if (!response) return null;
    const ratio = Number(response.headers.get(RATIO_HEADER));
    const blob = await response.blob();
    return { src: URL.createObjectURL(blob), ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : 595.5 / 842.25 };
  } catch {
    return null;
  }
}

async function writeCachedCover(key: string, blob: Blob, ratio: number): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const response = new Response(blob, { headers: { "content-type": "image/jpeg", [RATIO_HEADER]: String(ratio) } });
    await (await caches.open(CACHE_NAME)).put(cacheRequest(key), response);
  } catch {
    // Quota or privacy mode: fine, it just renders again next time.
  }
}

/** Cache keys must be http(s) URLs; the PDF URL may be relative. */
function cacheRequest(key: string): Request {
  return new Request(`${location.origin}/__cover-cache/${encodeURIComponent(key)}`);
}
