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
  if (variant === "inline") {
    return (
      <div className="flex shrink-0 justify-center py-2">
        <div className="rounded-2xl border border-white/10 bg-[#0d0f0c]/90 px-4 py-2 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)]">
          <FlipbookControls currentPage={currentPage} totalPages={totalPages} onPrev={onPrev} onNext={onNext} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 transition-all duration-300",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      )}
    >
      <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0d0f0c]/90 px-4 py-2.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-md">
        <FlipbookControls currentPage={currentPage} totalPages={totalPages} onPrev={onPrev} onNext={onNext} />
      </div>
    </div>
  );
}
