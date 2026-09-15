/**
 * Public (reader-facing) accessor for sponsors — thin on purpose. The admin
 * routes read/write the full manifest directly via @/lib/sponsorsManifest;
 * this is the one function the actual reader pages (revista/[edition],
 * archivo's "current edition" redirect, etc.) need: the subset of sponsors
 * that should actually be eligible to show right now.
 */
import { readSponsorsManifest } from "@/lib/sponsorsManifest";
import type { Sponsor } from "@/types/sponsor";

export async function getActiveSponsors(): Promise<Sponsor[]> {
  const sponsors = await readSponsorsManifest();
  return sponsors.filter((sponsor) => sponsor.status === "active");
}
