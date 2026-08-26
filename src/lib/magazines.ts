import manifest from "@/data/magazines.json";
import type { Magazine } from "@/types/magazine";

/**
 * Thin, framework-agnostic accessors over the build-time manifest. Nothing
 * here does I/O — the manifest is a static JSON import, so these are safe to
 * call from Server Components, Client Components, and route handlers alike.
 */

export function getAllEditions(): Magazine[] {
  return manifest.editions as Magazine[];
}

export function getCurrentEdition(): Magazine | null {
  const editions = getAllEditions();
  return editions.find((edition) => edition.isCurrent) ?? editions[0] ?? null;
}

export function getEditionBySlug(slug: string): Magazine | null {
  return getAllEditions().find((edition) => edition.slug === slug) ?? null;
}

export function getPreviousEdition(slug: string): Magazine | null {
  const editions = getAllEditions();
  const index = editions.findIndex((edition) => edition.slug === slug);
  if (index === -1 || index === editions.length - 1) return null;
  return editions[index + 1];
}

export function getNextEdition(slug: string): Magazine | null {
  const editions = getAllEditions();
  const index = editions.findIndex((edition) => edition.slug === slug);
  if (index <= 0) return null;
  return editions[index - 1];
}

export function hasAnyEdition(): boolean {
  return getAllEditions().length > 0;
}
