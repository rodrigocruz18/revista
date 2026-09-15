"use client";

import { useMemo } from "react";
import { clamp } from "@/lib/utils";
import type { Sponsor } from "@/types/sponsor";

export type PageBox = { left: number; top: number; width: number; height: number };

type Props = {
  sponsor: Sponsor;
  /** The real book's own current bounding box (see Flipbook's onGutterChange)
   * — the fake page(s) below are sized and positioned to exactly match it,
   * so the transition in and out never jumps or resizes anything. */
  pageBox: PageBox;
  /** Whether the book currently shows two pages side by side. When true this
   * renders as a fake two-page spread (ad + a plain "back" page); when false,
   * a single fake page (just the ad) — matching whatever the real book was
   * showing the moment this triggered. */
  isSpread: boolean;
  reduceMotion: boolean;
  /** A forward "turn" past this interstitial — tapping/clicking its outer
   * edge, same zones and same intent as a real page turn. Reader wires this
   * to the real flip once this dismisses. */
  onAdvance: () => void;
  /** A backward "turn" — cancels the interstitial and returns to whatever
   * real page was already showing underneath (no real flip happens). */
  onCancel: () => void;
};

/**
 * The "pagina completa" placement, take two: instead of a modal-style popup
 * (the original implementation — felt like an interruption, per user
 * feedback), this renders as fake page(s) inserted into the *visual* flow of
 * turning pages, sized and positioned exactly where the real book already
 * is. It never touches the real page count or numbering (see
 * @/types/sponsor's doc comment) — Reader.tsx intercepts one forward "turn"
 * request to show this instead of the real flip, then lets the *next*
 * turn request through to the real book, so from the reader's perspective
 * it's indistinguishable from an extra page they flipped past.
 *
 * Tap zones mirror the real book's own: an outer-edge strip on each side
 * turns "the page" (cancel on the left, advance on the right); the ad image
 * itself is a real link out to the sponsor (opened in a new tab), the same
 * click-to-visit behavior any other ad placement gets. The filler "back"
 * page in spread mode has no link — its whole area advances, since there's
 * nothing else useful for it to do.
 */
export function FullPageSponsorAd({ sponsor, pageBox, isSpread, reduceMotion, onAdvance, onCancel }: Props) {
  const edgeZoneWidth = useMemo(() => {
    const singleWidth = isSpread ? pageBox.width / 2 : pageBox.width;
    return clamp(Math.round(singleWidth * 0.15), 48, 120);
  }, [isSpread, pageBox.width]);

  if (!sponsor.fullPageImageUrl) return null;

  const animClass = reduceMotion ? "fullpage-flip--reduced" : "fullpage-flip";
  const halfWidth = pageBox.width / 2;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40"
      style={{ perspective: 2200 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Publicidad de ${sponsor.name}`}
    >
      {/* Ad page — the left half of a fake spread, or the whole fake page
          when only one page is shown at a time. */}
      <div
        className={`pointer-events-auto absolute overflow-hidden bg-[#f6f3ea] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ${animClass}`}
        style={{
          left: pageBox.left,
          top: pageBox.top,
          width: isSpread ? halfWidth : pageBox.width,
          height: pageBox.height,
          transformOrigin: isSpread ? "100% 50%" : "0% 50%",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Volver a la pagina anterior"
          className="absolute inset-y-0 left-0 z-10"
          style={{ width: edgeZoneWidth }}
        />
        <a
          href={sponsor.targetUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="absolute inset-0 block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sponsor.fullPageImageUrl} alt={sponsor.name} className="h-full w-full object-cover" draggable={false} />
        </a>
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wide text-black/40">
          Publicidad
        </span>
        {!isSpread && (
          <button
            type="button"
            onClick={onAdvance}
            aria-label="Continuar a la revista"
            className="absolute inset-y-0 right-0 z-10"
            style={{ width: edgeZoneWidth }}
          />
        )}
      </div>

      {/* Filler "back" page — only in spread mode, the right half. Plain and
          dark on purpose (a deliberate blank beat, not more ad content), but
          bordered so it still reads as a page rather than a hole in the
          layout. */}
      {isSpread && (
        <button
          type="button"
          onClick={onAdvance}
          aria-label="Continuar a la revista"
          className={`pointer-events-auto absolute border border-white/20 bg-[#181c1a] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ${animClass}`}
          style={{
            left: pageBox.left + halfWidth,
            top: pageBox.top,
            width: halfWidth,
            height: pageBox.height,
            transformOrigin: "0% 50%",
          }}
        />
      )}
    </div>
  );
}
