import type { Sponsor } from "@/types/sponsor";
import { brandKey } from "@/lib/sponsorBrands";

/**
 * The banner "tape": one full cycle (vuelta) through every eligible banner
 * sponsor in random order before anything repeats. Light sponsors appear
 * once per cycle, Premium ones `premiumRepeats` times (their other perk is
 * a longer exposure).
 *
 * The order never shows the same advertiser twice in a row — neither inside
 * a cycle (Premium repeats are spread out) nor across the seam between one
 * cycle and the next (`previousKey` = the last one shown). Adjacency is by
 * brand (see @/lib/sponsorBrands), so two placements of one advertiser
 * don't run back to back either. Only when that is mathematically
 * impossible (e.g. a single sponsor, or one Premium repeated more times
 * than there are others to separate it) does a repeat happen.
 */
export function buildSponsorCycle<T extends Sponsor>(
  sponsors: T[],
  premiumRepeats: number,
  previousKey: string | null = null,
  random: () => number = Math.random,
): T[] {
  // Group the cycle's slots by advertiser: key -> remaining copies to place.
  const pools = new Map<string, T[]>();
  for (const sponsor of sponsors) {
    const copies = sponsor.category === "premium" ? Math.max(1, premiumRepeats) : 1;
    const key = brandKey(sponsor);
    const pool = pools.get(key) ?? [];
    for (let i = 0; i < copies; i++) pool.push(sponsor);
    pools.set(key, pool);
  }
  for (const pool of pools.values()) shuffleInPlace(pool, random);

  const cycle: T[] = [];
  let remaining = [...pools.values()].reduce((sum, pool) => sum + pool.length, 0);
  let prev = previousKey;

  while (remaining > 0) {
    const candidates = [...pools.entries()].filter(([key, pool]) => pool.length > 0 && key !== prev);
    let chosenKey: string;
    if (candidates.length === 0) {
      // Only the previous advertiser is left: a repeat can't be avoided.
      chosenKey = [...pools.entries()].find(([, pool]) => pool.length > 0)![0];
    } else {
      // An advertiser holding more than half of what's left must go now,
      // or there won't be enough others left to keep its copies apart.
      const forced = candidates.find(([, pool]) => pool.length * 2 > remaining);
      chosenKey = forced ? forced[0] : weightedPick(candidates, random);
    }
    cycle.push(pools.get(chosenKey)!.pop()!);
    prev = chosenKey;
    remaining--;
  }
  return cycle;
}

/** Random advertiser, weighted by how many copies it still has to place —
 * keeps Premium repeats spread across the whole cycle instead of piling up
 * at the end. */
function weightedPick<T>(candidates: [string, T[]][], random: () => number): string {
  const total = candidates.reduce((sum, [, pool]) => sum + pool.length, 0);
  let ticket = random() * total;
  for (const [key, pool] of candidates) {
    ticket -= pool.length;
    if (ticket < 0) return key;
  }
  return candidates[candidates.length - 1][0];
}

function shuffleInPlace<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/** Small deterministic PRNG, so the admin preview doesn't reshuffle on every keystroke. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
