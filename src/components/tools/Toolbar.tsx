"use client";

import { FlipbookControls } from "@/components/flipbook/FlipbookControls";
import { cn } from "@/lib/utils";

export type ToolbarProps = {
  visible: boolean;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  /** "floating" (default): the fixed-to-viewport pill that fades out on
   * inactivity. "inline" renders the same pill as a normal, static block
   * instead — no fixed positioning, always shown (the `visible` auto-hide
   * fade doesn't apply). Currently unused (mobile also floats, see Reader),
   * kept available for a layout where the book and a banner are stacked too
   * tightly for a floating pill to land without covering one of them. */
  variant?: "floating" | "inline";
  /** Floating variant only: a lower-opacity pill for contexts where it sits
   * directly on top of the page content itself rather than in its own
   * reserved margin — mobile's full-screen PDF, in particular, per the
   * explicit request to keep the control light-touch there. Still keeps
   * its border + glow (see `pillClass` below) so it stays legible over the
   * full-page sponsor's dark filler page even at lower opacity. */
  translucent?: boolean;
};

export function Toolbar({
  visible,
  currentPage,
  totalPages,
  onPrev,
  onNext,
  variant = "floating",
  translucent = false,
}: ToolbarProps) {
  // A brighter border + a soft outward glow (on top of the original drop
  // shadow) instead of a plain border-white/10 — the floating variant sits
  // over a light PDF page most of the time, where even a faint dark pill
  // reads fine, but it also has to stay legible over the full-page
  // sponsor's dark filler page (see FlipbookFillerPage), whose near-black
  // tone is close enough to this pill's own that a subtle border used to
  // disappear into it almost completely — the glow keeps it readable
  // against either, even at the lower `translucent` opacity.
  const pillClass = cn(
    "rounded-2xl border shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_0_24px_2px_rgba(255,255,255,0.07),0_20px_60px_-15px_rgba(0,0,0,0.85)]",
    translucent ? "border-white/15 bg-[#0d0f0c]/55" : "border-white/25 bg-[#0d0f0c]/95",
  );

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
