"use client";

import { forwardRef } from "react";

/**
 * The blank "back" companion to a full-page sponsor ad in a two-page
 * spread (see fullPageSpots.ts) — a real page like any other, so it turns
 * exactly like the rest of the book, just with nothing on it. Only ever
 * inserted in landscape/desktop spreads; mobile shows the ad alone (see
 * Flipbook's sequence builder) since there's no second slot to fill.
 */
export const FlipbookFillerPage = forwardRef<HTMLDivElement>(function FlipbookFillerPage(_props, ref) {
  return (
    <div className="page" ref={ref}>
      <div className="h-full w-full border border-white/10 bg-[#181c1a]" />
    </div>
  );
});
