export type Magazine = {
  /** File name inside /public/magazines, e.g. "2026-08-revista-tenis.pdf" */
  filename: string;
  /** Public URL to the PDF, e.g. "/magazines/2026-08-revista-tenis.pdf" */
  url: string;
  /** Full year, e.g. 2026 */
  year: number;
  /** Month, 1-12 */
  month: number;
  /** Human readable label, e.g. "Agosto 2026" */
  editionLabel: string;
  /** Canonical slug used in routes, e.g. "2026-08" */
  slug: string;
  /** Position in the archive, 0 = most recent */
  position: number;
  /** Whether this is the most recent edition */
  isCurrent: boolean;
  /** Optional cover image, populated if /public/magazines/covers/<slug>.jpg exists */
  coverUrl: string | null;
  /** Reserved for future use — not populated in the MVP */
  description?: string;
  publishedAt?: string;
};

export type MagazineManifest = {
  generatedAt: string;
  editions: Magazine[];
};
