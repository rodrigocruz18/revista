/**
 * Thin wrapper around pdf.js. Everything here is loaded lazily (dynamic
 * `import("pdfjs-dist")`) and only ever called from client-side effects or
 * event handlers, never from a component's top-level render — pdf.js talks
 * to <canvas> and the DOM, which don't exist during the server render pass.
 *
 * Rendering is intentionally on-demand and cached: with magazines that can
 * run 100+ pages we never want to rasterize the whole document up front.
 */

export type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Served as a static file (see scripts/copy-pdf-worker.ts) so the
      // worker URL is bundler-independent and works the same under webpack
      // and Turbopack.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
};

export type PageTextContent = {
  items: TextItem[];
  fullText: string;
};

export type TextLayoutItem = {
  id: string;
  str: string;
  left: number;
  top: number;
  fontSize: number;
  width: number;
  angle: number;
};

type CacheEntry<V> = { key: string; value: V };

/** Small LRU-ish cache: evicts the least-recently-used entry once `max` is exceeded. */
class RenderCache<V> {
  private entries: CacheEntry<V>[] = [];
  constructor(
    private max: number,
    private dispose?: (value: V) => void,
  ) {}

  get(key: string): V | undefined {
    const idx = this.entries.findIndex((e) => e.key === key);
    if (idx === -1) return undefined;
    const [entry] = this.entries.splice(idx, 1);
    this.entries.push(entry);
    return entry.value;
  }

  set(key: string, value: V) {
    const idx = this.entries.findIndex((e) => e.key === key);
    if (idx !== -1) this.entries.splice(idx, 1);
    this.entries.push({ key, value });
    while (this.entries.length > this.max) {
      const evicted = this.entries.shift();
      if (evicted) this.dispose?.(evicted.value);
    }
  }

  has(key: string): boolean {
    return this.entries.some((e) => e.key === key);
  }
}

export type RenderResult = {
  canvas: HTMLCanvasElement;
  scale: number;
  width: number;
  height: number;
};

export type SearchHit = {
  page: number;
  snippet: string;
  index: number;
};

/**
 * Owns a single PDF document: page proxies, rendered canvases (normal +
 * high-res for the magnifier), extracted text, and full-document search.
 * One instance per open edition.
 */
export class PdfDocumentManager {
  private docPromise: Promise<import("pdfjs-dist").PDFDocumentProxy> | null = null;
  private pageCache = new RenderCache<import("pdfjs-dist").PDFPageProxy>(12, (page) =>
    page.cleanup(),
  );
  private renderCache = new RenderCache<RenderResult>(6);
  private highResCache = new RenderCache<RenderResult>(8);
  private thumbnailCache = new RenderCache<RenderResult>(60);
  private textCache = new Map<number, Promise<PageTextContent>>();
  private renderTokens = new Map<number, symbol>();

  constructor(private url: string) {}

  async getDocument(): Promise<import("pdfjs-dist").PDFDocumentProxy> {
    if (!this.docPromise) {
      this.docPromise = loadPdfjs().then((pdfjs) =>
        pdfjs.getDocument(this.url).promise,
      );
    }
    return this.docPromise;
  }

  async getNumPages(): Promise<number> {
    const doc = await this.getDocument();
    return doc.numPages;
  }

  private async getPage(pageNumber: number) {
    const key = String(pageNumber);
    const cached = this.pageCache.get(key);
    if (cached) return cached;
    const doc = await this.getDocument();
    const page = await doc.getPage(pageNumber);
    this.pageCache.set(key, page);
    return page;
  }

  private async renderAtScale(pageNumber: number, scale: number): Promise<RenderResult> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el contexto de canvas.");

    // Cancel any in-flight render for this page slot before starting a new one.
    const token = Symbol("render");
    this.renderTokens.set(pageNumber, token);

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (this.renderTokens.get(pageNumber) !== token) {
      // A newer render superseded this one; still return it, caller will re-request if stale.
    }

    return { canvas, scale, width: canvas.width, height: canvas.height };
  }

  /** Normal-resolution render for on-page display. Cached per (page, roundedScale). */
  async renderPage(pageNumber: number, scale: number): Promise<RenderResult> {
    const key = `${pageNumber}:${scale.toFixed(2)}`;
    const cached = this.renderCache.get(key);
    if (cached) return cached;
    const result = await this.renderAtScale(pageNumber, scale);
    this.renderCache.set(key, result);
    return result;
  }

  /** High-resolution render reserved for the magnifier lens. */
  async renderHighRes(pageNumber: number, scale: number): Promise<RenderResult> {
    const key = `${pageNumber}:${scale.toFixed(2)}`;
    const cached = this.highResCache.get(key);
    if (cached) return cached;
    const result = await this.renderAtScale(pageNumber, scale);
    this.highResCache.set(key, result);
    return result;
  }

  /** Tiny render used by the thumbnail rail. */
  async renderThumbnail(pageNumber: number, scale = 0.2): Promise<RenderResult> {
    const key = `${pageNumber}:${scale.toFixed(2)}`;
    const cached = this.thumbnailCache.get(key);
    if (cached) return cached;
    const result = await this.renderAtScale(pageNumber, scale);
    this.thumbnailCache.set(key, result);
    return result;
  }

  async getTextContent(pageNumber: number): Promise<PageTextContent> {
    const cached = this.textCache.get(pageNumber);
    if (cached) return cached;
    const promise = (async () => {
      const page = await this.getPage(pageNumber);
      const raw = await page.getTextContent();
      const items: TextItem[] = raw.items.map((item) => {
        const textItem = item as {
          str?: string;
          transform: number[];
          width: number;
          height: number;
          fontName: string;
          hasEOL?: boolean;
        };
        return {
          str: textItem.str ?? "",
          transform: textItem.transform,
          width: textItem.width,
          height: textItem.height,
          fontName: textItem.fontName,
          hasEOL: Boolean(textItem.hasEOL),
        };
      });
      const fullText = items
        .map((item) => item.str + (item.hasEOL ? "\n" : ""))
        .join("");
      return { items, fullText };
    })();
    this.textCache.set(pageNumber, promise);
    return promise;
  }

  async getViewportSize(pageNumber: number, scale = 1) {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    return { width: viewport.width, height: viewport.height };
  }

  /**
   * Computes on-screen layout (position, size, rotation) for every text
   * item on a page, at a given scale — everything a caller needs to draw an
   * invisible-but-selectable text layer on top of the canvas, without
   * leaking pdf.js internals (Util.transform, viewport math) outside this
   * module.
   */
  async getLayoutItems(pageNumber: number, scale: number): Promise<TextLayoutItem[]> {
    const [pdfjs, page, { items }] = await Promise.all([
      loadPdfjs(),
      this.getPage(pageNumber),
      this.getTextContent(pageNumber),
    ]);
    const viewport = page.getViewport({ scale });

    return items
      .filter((item) => item.str.length > 0)
      .map((item, index) => {
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        const angle = Math.atan2(tx[1], tx[0]);
        const width = item.width * Math.hypot(viewport.transform[0], viewport.transform[1]);
        return {
          id: `${pageNumber}-${index}`,
          str: item.str,
          left: tx[4],
          top: tx[5] - fontHeight,
          fontSize: fontHeight,
          width,
          angle,
        };
      });
  }

  /**
   * Searches every page for `query` (accent/case-insensitive). Yields
   * control back to the event loop between pages so a 100-page search never
   * blocks the UI thread.
   */
  async searchAll(
    query: string,
    normalize: (s: string) => string,
    onProgress?: (donePages: number, totalPages: number) => void,
  ): Promise<SearchHit[]> {
    const numPages = await this.getNumPages();
    const needle = normalize(query);
    if (!needle) return [];
    const hits: SearchHit[] = [];

    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
      const { fullText } = await this.getTextContent(pageNumber);
      const haystack = normalize(fullText);
      let fromIndex = 0;
      let idx = haystack.indexOf(needle, fromIndex);
      while (idx !== -1) {
        const start = Math.max(0, idx - 24);
        const end = Math.min(fullText.length, idx + needle.length + 24);
        hits.push({
          page: pageNumber,
          snippet: `…${fullText.slice(start, end).trim()}…`,
          index: idx,
        });
        fromIndex = idx + needle.length;
        idx = haystack.indexOf(needle, fromIndex);
      }
      onProgress?.(pageNumber, numPages);
      // Let the main thread breathe between pages.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return hits;
  }

  destroy() {
    this.docPromise?.then((doc) => doc.destroy()).catch(() => {});
    this.docPromise = null;
    this.textCache.clear();
  }
}

const managers = new Map<string, PdfDocumentManager>();

/** One manager per URL, reused across component remounts within a session. */
export function getPdfDocumentManager(url: string): PdfDocumentManager {
  let manager = managers.get(url);
  if (!manager) {
    manager = new PdfDocumentManager(url);
    managers.set(url, manager);
  }
  return manager;
}
