import { loadPdfjs } from "@/lib/pdf";

export type CoverImage = { src: string; ratio: number };

const covers = new Map<string, Promise<CoverImage>>();

/**
 * Renders page 1 of a PDF to an image, for places that only ever need the
 * cover (the /embed widget). Unlike PdfDocumentManager, this opens the
 * document with `disableAutoFetch` + `disableStream`, so pdf.js only pulls
 * the byte ranges page 1 needs (static files and Vercel Blob both serve
 * Range requests) instead of streaming a 10-13MB edition in the background
 * just to show its front page. The document is destroyed right after.
 *
 * Cached per URL for the life of the page; a failed render is evicted so a
 * later attempt can retry.
 */
export function renderPdfCover(url: string, targetWidth: number): Promise<CoverImage> {
  const cached = covers.get(url);
  if (cached) return cached;

  const promise = (async () => {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: true }).promise;
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
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob fallo"))), "image/jpeg", 0.88),
      );
      return { src: URL.createObjectURL(blob), ratio: base.width / base.height };
    } finally {
      void doc.destroy();
    }
  })();

  covers.set(url, promise);
  promise.catch(() => covers.delete(url));
  return promise;
}
