"use client";

import { FlipbookControls } from "@/components/flipbook/FlipbookControls";
import { cn } from "@/lib/utils";

export type ToolbarProps = {
  visible: boolean;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  /** "floating" (default): the original fixed-to-viewport pill that fades
   * out on inactivity — works well on desktop, where it floats over empty
   * margin either side of the book. "inline" renders the same pill as a
   * normal, static block instead — no fixed positioning, always shown
   * (the `visible` auto-hide fade doesn't apply). Mobile uses this: with
   * the book and the horizontal sponsor strip already stacked tightly
   * below each other, a fixed-bottom pill has nowhere to float without
   * landing on top of one of them, and toggling it in/out of a normal
   * flow position would shove the sponsor strip up and down every time it
   * auto-hides. Placed in the document flow between the book and the
   * sponsor strip instead, it just claims its own fixed spot once. */
  variant?: "floating" | "inline";
};

export function Toolbar({ visible, currentPage, totalPages, onPrev, onNext, variant = "floating" }: ToolbarProps) {
  // A brighter border + a soft outward glow (on top of the original drop
  // shadow) instead of the original border-white/10 — the floating variant
  // normally sits over a light PDF page, where even a faint dark pill reads
  // fine, but it also has to stay legible over the full-page sponsor's dark
  // filler "page" (see FullPageSponsorAd), whose near-black tone is close
  // enough to this pill's own that a subtle border used to disappear into
  // it almost completely. The glow keeps it readable against either.
  const pillClass =
    "rounded-2xl border border-white/25 bg-[#0d0f0c]/95 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_0_24px_2px_rgba(255,255,255,0.07),0_20px_60px_-15px_rgba(0,0,0,0.85)]";

  if (variant === "inline") {
    return (
      <div className="flex shrink-0 justify-center py-2">
        <div className={cn(pillClass, "px-4 py-2")}>
          <FlipbookControls currentPage={currentPage} totalPages={totalPages} onPrev={onPrev} onNext={onNext} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        // z-50: above the full-page sponsor interstitial's own z-40 (see
        // FullPageSponsorAd) — without this the pill was being painted
        // *behind* that overlay's opaque fake "page" wherever the two
        // happened to overlap, effectively hiding it completely rather
        // than just blending into it.
        "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 transition-all duration-300",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      )}
    >
      <div className={cn(pillClass, "pointer-events-auto px-4 py-2.5 backdrop-blur-md")}>
        <FlipbookControls currentPage={currentPage} totalPages={totalPages} onPrev={onPrev} onNext={onNext} />
      </div>
    </div>
  );
}
