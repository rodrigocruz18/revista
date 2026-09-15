import type { Sponsor } from "@/types/sponsor";
import { FULLPAGE_MIN_EDGE_PAGES, FULLPAGE_MIN_SPACING_PAGES } from "@/config/sponsors";

/**
 * A full-page sponsor placement fixed to a specific spot in this edition's
 * page sequence for the current reading session — see the module doc below
 * for the model this replaces and why.
 */
export type FullPageSpot = {
  /** The sponsor id — also this spot's stable identity. */
  id: string;
  sponsor: Sponsor;
  /** The real page immediately *before* the spot, moving forward — e.g. 4
   * means "between real page 4 (or the 4-5 spread) and whatever page comes
   * next, there's a spot here." Always an even number (or the implicit
   * first boundary), so it's a real, reachable `currentPage` value in BOTH
   * single-page and two-page-spread display modes (see the doc comment on
   * `isPassed` in Reader.tsx for why that constraint matters). */
  beforePage: number;
  /** The real page immediately *after* the spot. Starts as a same-session
   * best guess (see `estimateFirstPageAfter`) and gets overwritten with the
   * exact observed value the first time the reader actually flips forward
   * through this spot for real — from then on it's exact for the rest of
   * the session, which is what lets the spot reappear correctly if the
   * reader later flips back over the same boundary from far away. */
  firstPageAfter: number;
};

/** Serializable shape for sessionStorage — just enough to rebuild a
 * FullPageSpot[] against whatever `sponsors` prop the next mount has,
 * rather than storing whole Sponsor objects that could go stale. */
export type StoredFullPageSpot = { sponsorId: string; beforePage: number };

export function eligibleFullPageSponsors(sponsors: Sponsor[]): Sponsor[] {
  return sponsors.filter((s) => s.category === "fullpage" && s.status === "active" && s.fullPageImageUrl);
}

function estimateFirstPageAfter(beforePage: number, isMobile: boolean): number {
  // Single-page mode visits every page number one at a time; two-page
  // spread mode shows (2,3), (4,5), (6,7)... so the page right after
  // beforePage is two higher, not one — except coming off the lone cover
  // (beforePage === 1), which is always followed by page 2 either way.
  if (beforePage <= 1) return 2;
  return beforePage + (isMobile ? 1 : 2);
}

/** Picks fixed, randomized positions for however many full-page sponsors
 * are currently eligible, spread across this edition's real pages with
 * some minimum breathing room at each edge and between one another. Pure
 * and deterministic-shape (only Math.random is impure) so it's easy to
 * call once per edition-open and persist the result — see
 * sponsorFullPageStorage.ts. */
export function pickFullPageSpots(numPages: number, sponsors: Sponsor[], isMobile: boolean): FullPageSpot[] {
  const eligible = eligibleFullPageSponsors(sponsors);
  if (eligible.length === 0) return [];

  const edge = FULLPAGE_MIN_EDGE_PAGES;
  const candidates: number[] = [];
  for (let p = edge; p <= numPages - edge; p += 2) candidates.push(p);
  if (candidates.length === 0) return [];

  const shuffledCandidates = shuffle(candidates);
  const chosen: number[] = [];
  for (const candidate of shuffledCandidates) {
    if (chosen.length >= eligible.length) break;
    if (chosen.every((existing) => Math.abs(existing - candidate) >= FULLPAGE_MIN_SPACING_PAGES)) {
      chosen.push(candidate);
    }
  }
  chosen.sort((a, b) => a - b);

  const shuffledSponsors = shuffle(eligible);

  return chosen.map((beforePage, i) => ({
    id: shuffledSponsors[i].id,
    sponsor: shuffledSponsors[i],
    beforePage,
    firstPageAfter: estimateFirstPageAfter(beforePage, isMobile),
  }));
}

export function toStoredSpots(spots: FullPageSpot[]): StoredFullPageSpot[] {
  return spots.map((s) => ({ sponsorId: s.id, beforePage: s.beforePage }));
}

/** Rehydrates a previously-stored layout against the *current* sponsors
 * list, dropping any spot whose sponsor is no longer active/eligible (e.g.
 * paused mid-session from /admin) rather than showing a stale sponsor. */
export function fromStoredSpots(stored: StoredFullPageSpot[], sponsors: Sponsor[], isMobile: boolean): FullPageSpot[] {
  const eligible = eligibleFullPageSponsors(sponsors);
  const byId = new Map(eligible.map((s) => [s.id, s]));
  const spots: FullPageSpot[] = [];
  for (const entry of stored) {
    const sponsor = byId.get(entry.sponsorId);
    if (!sponsor) continue;
    spots.push({
      id: sponsor.id,
      sponsor,
      beforePage: entry.beforePage,
      firstPageAfter: estimateFirstPageAfter(entry.beforePage, isMobile),
    });
  }
  return spots;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
