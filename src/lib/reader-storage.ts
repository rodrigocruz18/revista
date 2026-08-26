"use client";

/**
 * The only thing worth remembering between visits is where the reader left
 * off in each edition — everything else about the reader is stateless by
 * design. Namespaced per edition so "last page" for August doesn't clobber
 * July.
 */

export type EditionProgress = {
  lastPage: number;
  updatedAt: string;
};

const EDITION_KEY_PREFIX = "revista-tenis:progress:";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function loadEditionProgress(slug: string): EditionProgress {
  const fallback: EditionProgress = {
    lastPage: 1,
    updatedAt: new Date(0).toISOString(),
  };
  if (!canUseStorage()) return fallback;
  const raw = window.localStorage.getItem(EDITION_KEY_PREFIX + slug);
  return safeParse(raw, fallback);
}

export function saveEditionProgress(
  slug: string,
  progress: Partial<EditionProgress>,
): EditionProgress {
  const current = loadEditionProgress(slug);
  const next: EditionProgress = {
    ...current,
    ...progress,
    updatedAt: new Date().toISOString(),
  };
  if (canUseStorage()) {
    window.localStorage.setItem(EDITION_KEY_PREFIX + slug, JSON.stringify(next));
  }
  return next;
}
