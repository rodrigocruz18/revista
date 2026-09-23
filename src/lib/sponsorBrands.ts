import type { Sponsor } from "@/types/sponsor";

/**
 * A "brand" is the advertiser behind one or more sponsor records — each
 * record is one placement (Light / Premium / Página completa), so a brand
 * that buys two placements has two records. The public "Auspiciadores"
 * list must show each brand once.
 *
 * Identity is `brandId`, assigned by the admin when a new placement is
 * added to an existing sponsor (picked from a list, never retyped). Records
 * created before brandId existed fall back to their normalized link, so
 * duplicates that already exist with the same URL still merge.
 */
export function brandKey(sponsor: Sponsor): string {
  return sponsor.brandId ?? `url:${normalizeSponsorUrl(sponsor.targetUrl)}`;
}

/** "https://www.Nike.cl/promo/?utm=x" → "nike.cl/promo". Protocol, "www.",
 * query, hash, case and trailing slash never distinguish two brands. */
export function normalizeSponsorUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return host + path;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Display-friendly domain for a sponsor link ("nike.cl"). */
export function sponsorDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One record per brand, keeping the best representative: one with an
 * icon if any has it, then the most recently updated. */
export function uniqueBrands(sponsors: Sponsor[]): Sponsor[] {
  const byBrand = new Map<string, Sponsor>();
  for (const sponsor of sponsors) {
    const key = brandKey(sponsor);
    const current = byBrand.get(key);
    if (!current || isBetterRepresentative(sponsor, current)) byBrand.set(key, sponsor);
  }
  return [...byBrand.values()];
}

function isBetterRepresentative(candidate: Sponsor, current: Sponsor): boolean {
  if (Boolean(candidate.iconUrl) !== Boolean(current.iconUrl)) return Boolean(candidate.iconUrl);
  return candidate.updatedAt > current.updatedAt;
}
