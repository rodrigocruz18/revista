import type { Sponsor } from "@/types/sponsor";
import { FULLPAGE_MIN_EDGE_PAGES, FULLPAGE_MIN_SPACING_PAGES } from "@/config/sponsors";

/**
 * A full-page sponsor placement fixed to a specific spot in this edition's
 * page sequence for the current reading session — inserted as a genuine
 * page (or two, in a two-page spread — see Flipbook's sequence builder)
 * right after `beforePage`, so react-pageflip turns it with exactly the
 * same engine, timing and shadow rendering as every other page. An earlier
 * version faked this with a CSS overlay instead; it never quite matched a
 * real page turn (different-looking entry/exit, a visible gap during the
 * swing, a tap zone that could double as the sponsor's own link) — hence
 * moving it into the book's actual page list.
 */
export type FullPageSpot = {
  /** The sponsor id — also this spot's stable identity. */
  id: string;
  sponsor: Sponsor;
  /** The real page immediately *before* the spot, moving forward — e.g. 4
   * means "the ad is inserted right after real page 4". Always an even
   * number (or the implicit first boundary), so on a two-page spread it
   * always lands exactly on a spread boundary rather than splitting one. */
  beforePage: number;
};

/** Serializable shape for sessionStorage — just enough to rebuild a
 * FullPageSpot[] against whatever `sponsors` prop the next mount has,
 * rather than storing whole Sponsor objects that could go stale. */
export type StoredFullPageSpot = { sponsorId: string; beforePage: number };

export function eligibleFullPageSponsors(sponsors: Sponsor[]): Sponsor[] {
  return sponsors.filter((s) => s.category === "fullpage" && s.status === "active" && s.fullPageImageUrl);
}

/** Picks fixed, randomized positions for however many full-page sponsors
 * are currently eligible, spread across this edition's real pages with
 * some minimum breathing room at each edge and between one another. Pure
 * and deterministic-shape (only Math.random is impure) so it's easy to
 * call once per edition-open and persist the result — see
 * sponsorFullPageStorage.ts. */
export function pickFullPageSpots(numPages: number, sponsors: Sponsor[]): FullPageSpot[] {
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
  }));
}

export function toStoredSpots(spots: FullPageSpot[]): StoredFullPageSpot[] {
  return spots.map((s) => ({ sponsorId: s.id, beforePage: s.beforePage }));
}

/** Rehydrates a previously-stored layout against the *current* sponsors
 * list, dropping any spot whose sponsor is no longer active/eligible (e.g.
 * paused mid-session from /admin) rather than showing a stale sponsor. */
export function fromStoredSpots(stored: StoredFullPageSpot[], sponsors: Sponsor[]): FullPageSpot[] {
  const eligible = eligibleFullPageSponsors(sponsors);
  const byId = new Map(eligible.map((s) => [s.id, s]));
  const spots: FullPageSpot[] = [];
  for (const entry of stored) {
    const sponsor = byId.get(entry.sponsorId);
    if (!sponsor) continue;
    spots.push({ id: sponsor.id, sponsor, beforePage: entry.beforePage });
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
