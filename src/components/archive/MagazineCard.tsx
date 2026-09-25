"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Magazine } from "@/types/magazine";
import { renderPdfCover } from "@/lib/pdfCover";

// A thumbnail-sized render is plenty for a card a few hundred pixels wide —
// no need to rasterize at reading resolution just to show a cover.
const THUMBNAIL_WIDTH = 480;

/**
 * Renders each edition's actual cover — page 1 of its PDF — instead of a
 * generic placeholder, so the archive grid looks like a real magazine shelf
 * instead of a wall of identical tennis-ball icons.
 *
 * A manually-provided cover (`/public/magazines/covers/<slug>.jpg`, wired up
 * in scripts/generate-magazine-manifest.ts) always wins when present — it's
 * cheaper to load and lets someone swap in a nicer crop later. Otherwise the
 * cover is rendered client-side from the PDF itself, on demand (only the
 * byte ranges page 1 needs, cached in the browser afterwards — see
 * @/lib/pdfCover): an IntersectionObserver defers that cost until the card
 * actually scrolls into view. Editions published from /admin get a stored
 * cover image at publish time, so this fallback is the exception.
 */
export function MagazineCard({ edition }: { edition: Magazine }) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [renderedCover, setRenderedCover] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (edition.coverUrl) return;
    const el = cardRef.current;
    if (!el) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        renderPdfCover(edition.url, THUMBNAIL_WIDTH)
          .then((cover) => {
            if (!cancelled) setRenderedCover(cover.src);
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [edition.coverUrl, edition.url]);

  const coverSrc = edition.coverUrl ?? renderedCover;

  return (
    <Link
      ref={cardRef}
      href={edition.isCurrent ? "/revista" : `/revista/${edition.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141613] transition hover:-translate-y-1 hover:border-lime-300/40 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-[#1c211b] to-[#0b0f0d]">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt={`Portada ${edition.editionLabel}`}
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : failed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-2xl opacity-60" aria-hidden>
              🎾
            </span>
            <span className="px-4 font-serif text-lg leading-tight text-white/80">
              {edition.editionLabel}
            </span>
          </div>
        ) : (
          <div className="h-full w-full animate-pulse bg-white/5" />
        )}
        {edition.isCurrent && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-lime-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
            ● Edicion actual
          </span>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <p className="font-serif text-sm text-white">{edition.editionLabel}</p>
          {!edition.isCurrent && <p className="text-[11px] uppercase tracking-wide text-white/40">Edicion anterior</p>}
        </div>
        <span className="text-xs text-lime-300/90 opacity-0 transition group-hover:opacity-100">Leer →</span>
      </div>
    </Link>
  );
}
