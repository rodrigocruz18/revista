"use client";

import type { StoredFullPageSpot } from "@/lib/fullPageSpots";

/**
 * Persists this session's randomized full-page sponsor spot layout (see
 * fullPageSpots.ts) per edition, so it survives a Reader remount within the
 * same tab session — navigating to /archivo and back, or a soft
 * client-side re-render — without re-rolling different positions each
 * time. sessionStorage (not localStorage) matches the intro splash's
 * "revista-tenis:intro-seen" flag: fixed for this tab session, re-rolled
 * fresh in a brand new one.
 */
const STORAGE_PREFIX = "revista-tenis:fullpage-spots:";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

export function loadFullPageSpotLayout(editionSlug: string): StoredFullPageSpot[] | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + editionSlug);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (entry): entry is StoredFullPageSpot =>
        entry && typeof entry.sponsorId === "string" && typeof entry.beforePage === "number",
    );
  } catch {
    return null;
  }
}

export function saveFullPageSpotLayout(editionSlug: string, layout: StoredFullPageSpot[]): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + editionSlug, JSON.stringify(layout));
  } catch {
    // Private browsing / storage disabled — worst case the layout gets
    // re-rolled on the next mount; not worth failing anything over.
  }
}
