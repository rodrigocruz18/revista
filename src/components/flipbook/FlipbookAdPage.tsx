"use client";

import { forwardRef } from "react";
import type { Sponsor } from "@/types/sponsor";

export type FlipbookAdPageProps = {
  sponsor: Sponsor;
  /** Matches Flipbook's own edge tap-to-turn zone width exactly (see
   * `edgeZoneWidth` there), so this page's clickable link area never sits
   * under the same pixels as the container's tap-to-turn strips. Without
   * this inset, a tap meant to turn the page could also land on the link
   * underneath it (or vice-versa) — the bug where pressing "back" onto a
   * sponsor page fired its link instead of just showing the page. */
  edgeInset: number;
};

/**
 * A full-page sponsor placement, rendered as a genuine page inside the
 * book (see fullPageSpots.ts's doc comment) rather than an overlay on top
 * of it — so react-pageflip turns it with exactly the same engine, timing
 * and shadow rendering as every other page, forward or backward, on
 * mobile and desktop alike. An earlier version approximated the turn with
 * a bespoke CSS animation; it never quite matched a real page turn.
 *
 * Structured just like FlipbookPage: an outer `.page` div (react-pageflip
 * clones/measures this directly, so the ref must land on it) wrapping the
 * actual content.
 */
export const FlipbookAdPage = forwardRef<HTMLDivElement, FlipbookAdPageProps>(function FlipbookAdPage(
  { sponsor, edgeInset },
  ref,
) {
  return (
    <div className="page" ref={ref} data-sponsor-page={sponsor.id}>
      <div className="relative h-full w-full overflow-hidden bg-[#f6f3ea] shadow-inner">
        {sponsor.fullPageImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sponsor.fullPageImageUrl}
            alt={sponsor.name}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        )}
        {/* The clickable link is inset from both edges by `edgeInset` — see
            the prop doc comment above — while the image itself still
            bleeds edge to edge. */}
        <a
          href={sponsor.targetUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          aria-label={`Publicidad de ${sponsor.name}`}
          className="absolute inset-y-0 block"
          style={{ left: edgeInset, right: edgeInset }}
        />
        <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 select-none font-sans text-[10px] uppercase tracking-wide text-black/40">
          Publicidad
        </div>
      </div>
    </div>
  );
});
