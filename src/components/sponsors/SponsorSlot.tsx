"use client";

import type { Sponsor } from "@/types/sponsor";

type Props = {
  /** The sponsor currently drawn by useSponsorRotation, or null during the
   * initial silent delay / a rest gap between sponsors — both render nothing. */
  sponsor: Sponsor | null;
  /** Which of the sponsor's two images to show — see Sponsor's doc comment
   * in @/types/sponsor for the horizontal/vertical size and placement. */
  variant: "horizontal" | "vertical";
  reduceMotion: boolean;
};

/**
 * Renders one rotation slot: a link-wrapped banner image with an entrance
 * animation and a periodic shine sweep (see the `.sponsor-slot` rules in
 * globals.css). Stateless by design — the rotation timing lives in
 * @/lib/sponsorRotation's `useSponsorRotation` hook, called once by Reader
 * and passed down here (and to the sibling variant) so both breakpoints'
 * slots always show the same pick in lock-step instead of drifting apart on
 * independent timers.
 *
 * IMPORTANT for callers: render this with `key={sponsor?.id ?? "empty"}` (or
 * similar) so React remounts it — and thus replays the entrance animation —
 * every time the rotation draws a new sponsor, not just on first mount.
 */
export function SponsorSlot({ sponsor, variant, reduceMotion }: Props) {
  if (!sponsor) return null;
  const imageUrl = variant === "horizontal" ? sponsor.horizontalImageUrl : sponsor.verticalImageUrl;
  if (!imageUrl) return null;

  return (
    <a
      href={sponsor.targetUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={`Auspiciador: ${sponsor.name}`}
      className={`sponsor-slot h-full w-full rounded-xl ${reduceMotion ? "sponsor-slot--reduced" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={sponsor.name} className="h-full w-full object-cover" draggable={false} />
    </a>
  );
}
