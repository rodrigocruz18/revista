/**
 * Generates src/data/magazines.json from the PDF files found in
 * /public/magazines. Runs automatically before `next dev` and `next build`
 * (see the "predev"/"prebuild" scripts in package.json) so the current
 * edition is always whatever file has the newest YYYY-MM prefix — nobody
 * has to touch code to publish a new issue.
 *
 * Expected file name format: YYYY-MM-nombre.pdf
 *   e.g. 2026-08-revista-tenis.pdf
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MAGAZINES_DIR = path.join(ROOT, "public", "magazines");
const COVERS_DIR = path.join(MAGAZINES_DIR, "covers");
const OUTPUT_FILE = path.join(ROOT, "src", "data", "magazines.json");

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const FILENAME_PATTERN = /^(\d{4})-(\d{2})-(.+)\.pdf$/i;
const COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

type RawMagazine = {
  filename: string;
  url: string;
  year: number;
  month: number;
  editionLabel: string;
  slug: string;
};

function readMagazineFiles(): string[] {
  if (!existsSync(MAGAZINES_DIR)) {
    mkdirSync(MAGAZINES_DIR, { recursive: true });
    return [];
  }
  return readdirSync(MAGAZINES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => FILENAME_PATTERN.test(name));
}

function findCover(slug: string): string | null {
  if (!existsSync(COVERS_DIR)) return null;
  for (const ext of COVER_EXTENSIONS) {
    const candidate = path.join(COVERS_DIR, `${slug}${ext}`);
    if (existsSync(candidate)) {
      return `/magazines/covers/${slug}${ext}`;
    }
  }
  return null;
}

function buildManifest() {
  const files = readMagazineFiles();

  const parsed: RawMagazine[] = [];
  for (const filename of files) {
    const match = filename.match(FILENAME_PATTERN);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      console.warn(
        `[generate-magazine-manifest] Ignorando "${filename}": mes invalido (${match[2]}).`,
      );
      continue;
    }
    const slug = `${match[1]}-${match[2]}`;
    const monthName = MONTHS_ES[month - 1];
    parsed.push({
      filename,
      url: `/magazines/${filename}`,
      year,
      month,
      editionLabel: `${monthName} ${year}`,
      slug,
    });
  }

  // Most recent first. Same year/month collisions fall back to filename so
  // the manifest stays deterministic.
  parsed.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.month !== a.month) return b.month - a.month;
    return b.filename.localeCompare(a.filename);
  });

  const editions = parsed.map((magazine, index) => ({
    ...magazine,
    position: index,
    isCurrent: index === 0,
    coverUrl: findCover(magazine.slug),
  }));

  const manifest = {
    generatedAt: new Date().toISOString(),
    editions,
  };

  mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  if (editions.length === 0) {
    console.warn(
      "[generate-magazine-manifest] No se encontraron revistas en /public/magazines. " +
        "Agrega un PDF con el formato YYYY-MM-nombre.pdf (ej: 2026-08-revista-tenis.pdf).",
    );
  } else {
    console.log(
      `[generate-magazine-manifest] ${editions.length} edicion(es) detectada(s). ` +
        `Edicion actual: ${editions[0].editionLabel} (${editions[0].filename}).`,
    );
  }
}

buildManifest();
