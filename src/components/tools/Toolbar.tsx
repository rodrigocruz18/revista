"use client";

import { FlipbookControls } from "@/components/flipbook/FlipbookControls";
import { cn } from "@/lib/utils";

export type ToolbarProps = {
  visible: boolean;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
};

export function Toolbar({ visible, currentPage, totalPages, onPrev, onNext }: ToolbarProps) {
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
