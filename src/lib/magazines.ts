import type { Magazine } from "@/types/magazine";
import { readManifestEditions } from "@/lib/blobManifest";

/**
 * Thin accessors over the manifest (see @/lib/blobManifest for where it
 * actually comes from — Vercel Blob in production once /admin is set up,
 * or the static build-time file otherwise). Async because reading the
 * Blob-backed manifest is a network call; callers (Server Components,
 * generateStaticParams, route handlers) all support awaiting it.
 */

export async function getAllEditions(): Promise<Magazine[]> {
  return readManifestEditions();
}

export async function getCurrentEdition(): Promise<Magazine | null> {
  const editions = await getAllEditions();
  return editions.find((edition) => edition.isCurrent) ?? editions[0] ?? null;
}

export async function getEditionBySlug(slug: string): Promise<Magazine | null> {
  const editions = await getAllEditions();
  return editions.find((edition) => edition.slug === slug) ?? null;
}

export async function getPreviousEdition(slug: string): Promise<Magazine | null> {
  const editions = await getAllEditions();
  const index = editions.findIndex((edition) => edition.slug === slug);
  if (index === -1 || index === editions.length - 1) return null;
  return editions[index + 1];
}

export async function getNextEdition(slug: string): Promise<Magazine | null> {
  const editions = await getAllEditions();
  const index = editions.findIndex((edition) => edition.slug === slug);
  if (index <= 0) return null;
  return editions[index - 1];
}

export async function hasAnyEdition(): Promise<boolean> {
  const editions = await getAllEditions();
  return editions.length > 0;
}
