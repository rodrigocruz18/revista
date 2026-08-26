/**
 * Copies pdf.js's web worker into /public so the browser can load it from a
 * plain, bundler-independent static URL (/pdf-worker/pdf.worker.min.mjs)
 * instead of relying on a `new URL(..., import.meta.url)` asset reference,
 * which behaves slightly differently between webpack and Turbopack. Runs
 * before `next dev` and `next build` alongside the manifest generator.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const DEST_DIR = path.join(ROOT, "public", "pdf-worker");
const DEST = path.join(DEST_DIR, "pdf.worker.min.mjs");

if (!existsSync(SOURCE)) {
  console.warn("[copy-pdf-worker] pdfjs-dist worker not found — run npm install first.");
  process.exit(0);
}

mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SOURCE, DEST);
console.log("[copy-pdf-worker] pdf.worker.min.mjs copied to /public/pdf-worker/.");
