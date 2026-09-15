"use client";

import { SPONSOR_FULLPAGE_MIN_SIZE } from "@/config/sponsors";
import type { Sponsor } from "@/types/sponsor";

type Props = {
  sponsor: Sponsor;
  onDismiss: () => void;
  reduceMotion: boolean;
};

/**
 * The "pagina completa" placement: a paid tier that simulates one extra page
 * of the magazine, shown as an overlay above the Flipbook rather than an
 * actual inserted page — see @/types/sponsor's doc comment for why. It's
 * triggered once per session after a few real page turns (see Reader.tsx /
 * FULLPAGE_TRIGGER_AFTER_TURNS) and dismissed with the button below; the
 * real page underneath is untouched the whole time; this only ever sits on
 * top of it.
 *
 * Sized to SPONSOR_FULLPAGE_MIN_SIZE's aspect ratio with object-fit: cover —
 * per the "fixed ratio + automatic crop" decision, the uploaded image only
 * has to be close to a magazine page's proportions, never pixel-exact like
 * the rotating banners, and a small center-crop is preferable to ever
 * showing empty bars around it.
 */
export function FullPageSponsorAd({ sponsor, onDismiss, reduceMotion }: Props) {
  if (!sponsor.fullPageImageUrl) return null;

  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/92 p-4 ${
        reduceMotion ? "fullpage-ad--reduced" : "fullpage-ad"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Publicidad de ${sponsor.name}`}
    >
      <a
        href={sponsor.targetUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="fullpage-ad-frame relative block h-full max-h-[80vh] w-auto overflow-hidden rounded-lg shadow-2xl"
        style={{ aspectRatio: `${SPONSOR_FULLPAGE_MIN_SIZE.width} / ${SPONSOR_FULLPAGE_MIN_SIZE.height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sponsor.fullPageImageUrl}
          alt={sponsor.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </a>
      <button
        onClick={onDismiss}
        className="rounded-full bg-white px-6 py-2 text-sm font-medium text-[#0b0f0d] transition hover:bg-white/90"
      >
        Continuar a la revista
      </button>
      <span className="text-xs uppercase tracking-wide text-white/40">Publicidad</span>
    </div>
  );
}
