"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Magazine } from "@/types/magazine";
import { MONTHS_ES } from "@/config/magazine";
import { renderPdfCover, type CoverImage } from "@/lib/pdfCover";
import { cn } from "@/lib/utils";

/** A4 — what the current editions use; replaced by the real ratio as soon
 * as the newest cover has rendered. */
const DEFAULT_RATIO = 595.5 / 842.25;
/** Extra width the deck reserves beside the front cover for the cards
 * peeking out behind it. */
const DECK_SPREAD = 1.28;
/** Cards behind the front one that stay visible. */
const MAX_BEHIND = 3;
const SWIPE_THRESHOLD_PX = 40;

type CoverState = CoverImage | "error";

/**
 * Embeddable "latest edition" widget, served at /embed for third-party
 * iframes. The newest cover sits at the front of a small deck of physical
 * magazines; older editions peek out behind it and the deck is dealt
 * through with arrows, swipe or keyboard (a card that goes past flies off
 * to the left and comes back when navigating the other way).
 *
 * "Alive" cues, all on the front card only: a slow float with a breathing
 * ground shadow, a periodic light sweep, a page corner that peels up as if
 * inviting a flip (the product *is* a flipbook), and pointer-driven 3D
 * tilt on desktop.
 *
 * Sizing is entirely viewport-relative (the iframe's viewport), with the
 * deck sized by container query units, so any iframe dimensions fit with
 * no scrollbars. Every click opens the edition on the public site in a new
 * tab — navigating the host page from inside an iframe would be hostile.
 */
export function EditionsWidget({ editions, siteUrl }: { editions: Magazine[]; siteUrl: string }) {
  const [active, setActive] = useState(0);
  const [covers, setCovers] = useState<Record<string, CoverState>>({});
  // The deal-in entrance plays once, on first load; cards that join the
  // deck later (while navigating) just fade in via the regular transition.
  const [dealt, setDealt] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const requestedRef = useRef(new Set<string>());
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const count = editions.length;
  const go = useCallback((index: number) => setActive(Math.max(0, Math.min(count - 1, index))), [count]);

  // Render covers lazily: only the cards currently on screen, plus one
  // either side, so a long archive never opens every PDF up front.
  useEffect(() => {
    const targetWidth = Math.round(
      Math.max(360, Math.min(1100, Math.min(window.innerWidth * 0.6, window.innerHeight * 0.9 * DEFAULT_RATIO) * (window.devicePixelRatio || 1))),
    );
    for (let i = Math.max(0, active - 1); i <= Math.min(count - 1, active + MAX_BEHIND + 1); i++) {
      const edition = editions[i];
      // A manually uploaded cover is used as-is (see coverFor below).
      if (edition.coverUrl || requestedRef.current.has(edition.slug)) continue;
      requestedRef.current.add(edition.slug);
      renderPdfCover(edition.url, targetWidth)
        .then((cover) => setCovers((prev) => ({ ...prev, [edition.slug]: cover })))
        .catch(() => setCovers((prev) => ({ ...prev, [edition.slug]: "error" })));
    }
  }, [active, count, editions]);

  useEffect(() => {
    const timer = setTimeout(() => setDealt(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(active + 1);
      else if (event.key === "ArrowLeft") go(active - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const deck = deckRef.current;
    if (!deck) return;
    if (event.pointerType !== "mouse") return;
    const rect = deck.getBoundingClientRect();
    deck.style.setProperty("--px", (((event.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
    deck.style.setProperty("--py", (((event.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
  };
  const onPointerLeave = () => {
    deckRef.current?.style.setProperty("--px", "0");
    deckRef.current?.style.setProperty("--py", "0");
    swipeRef.current = null;
  };
  const onPointerDown = (event: React.PointerEvent) => {
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      suppressClickRef.current = true;
      go(dx < 0 ? active + 1 : active - 1);
    }
  };

  if (count === 0) {
    return (
      <main className="ew ew--empty">
        <p className="ew-kicker">Ace Tenis</p>
        <p className="ew-empty-title">Muy pronto, nueva edición</p>
      </main>
    );
  }

  const current = editions[active];
  const coverFor = (edition: Magazine): CoverState | undefined =>
    edition.coverUrl ? { src: edition.coverUrl, ratio: DEFAULT_RATIO } : covers[edition.slug];
  const newestCover = coverFor(editions[0]);
  const ratio = newestCover && newestCover !== "error" ? newestCover.ratio : DEFAULT_RATIO;
  const hrefFor = (edition: Magazine) => (edition.isCurrent ? `${siteUrl}/revista` : `${siteUrl}/revista/${edition.slug}`);

  return (
    <main
      className={cn("ew", dealt && "ew--dealt")}
      style={{ "--ratio": ratio, "--deck-ratio": ratio * DECK_SPREAD } as CSSProperties}
      aria-roledescription="carrusel"
      aria-label="Ediciones de la revista Ace Tenis"
    >
      <div className="ew-stage">
        <div
          ref={deckRef}
          className="ew-deck"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <span className="ew-ground" aria-hidden />
          {editions.map((edition, index) => {
            const offset = index - active;
            if (offset < -1 || offset > MAX_BEHIND + 1) return null;
            const isFront = offset === 0;
            const cover = coverFor(edition);
            return (
              <a
                key={edition.slug}
                href={hrefFor(edition)}
                target="_blank"
                rel="noopener"
                className={cn("ew-card", isFront && "ew-card--front")}
                style={cardStyle(offset, index)}
                aria-hidden={!isFront}
                tabIndex={isFront ? 0 : -1}
                title={isFront ? `Leer ${edition.editionLabel} en acetenis.cl` : undefined}
                draggable={false}
                onClick={(event) => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    event.preventDefault();
                    return;
                  }
                  if (!isFront) {
                    event.preventDefault();
                    go(index);
                  }
                }}
              >
                <span className="ew-deal">
                  <span className="ew-float">
                    <span className="ew-face">
                      {cover && cover !== "error" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover.src}
                          alt={`Portada ${edition.editionLabel}`}
                          draggable={false}
                          decoding="async"
                          fetchPriority={index === 0 ? "high" : "low"}
                        />
                      ) : cover === "error" ? (
                        <span className="ew-fallback">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/brand/ace-tenis-logo.png" alt="" />
                          <span>{edition.editionLabel}</span>
                        </span>
                      ) : (
                        <span className="ew-skeleton" />
                      )}
                      <span className="ew-shine" aria-hidden />
                      <span className="ew-curl" aria-hidden />
                      <span className="ew-dim" aria-hidden />
                    </span>
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </div>

      <div className="ew-info">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ew-logo" src="/brand/ace-tenis-logo.png" alt="Ace Tenis" />
        <div key={current.slug} className="ew-copy" aria-live="polite">
          <p className="ew-kicker">
            {current.isCurrent ? (
              <>
                <span className="ew-live" aria-hidden /> Nueva edición
              </>
            ) : (
              "Edición anterior"
            )}
          </p>
          <h1 className="ew-title">
            <span className="ew-month">{MONTHS_ES[current.month - 1]}</span>
            <span className="ew-year">{current.year}</span>
          </h1>
        </div>
        <div className="ew-actions">
          <a className="ew-cta" href={hrefFor(current)} target="_blank" rel="noopener">
            {current.isCurrent ? "Leer ahora" : "Leer edición"}
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          {count > 1 && (
            <div className="ew-nav">
              <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Edición más reciente">
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="ew-count">
                {String(active + 1).padStart(2, "0")}
                <span className="ew-track" aria-hidden>
                  <span style={{ width: `${100 / count}%`, transform: `translateX(${active * 100}%)` }} />
                </span>
                {String(count).padStart(2, "0")}
              </span>
              <button type="button" onClick={() => go(active + 1)} disabled={active === count - 1} aria-label="Edición anterior">
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Deck position for a card `offset` places from the front (negative =
 * already dealt past, flown off to the left). */
function cardStyle(offset: number, index: number): CSSProperties {
  if (offset < 0) {
    return { transform: "translate3d(-125%, 6%, 0) rotate(-12deg)", opacity: 0, zIndex: 60, pointerEvents: "none", "--i": index } as CSSProperties;
  }
  const k = Math.min(offset, MAX_BEHIND);
  return {
    transform: `translate3d(${k * 10.5}%, ${-k * 1.5}%, 0) scale(${1 - k * 0.075}) rotate(${k * 2.4}deg)`,
    opacity: offset > MAX_BEHIND ? 0 : 1,
    zIndex: 50 - offset,
    "--dim": k * 0.16,
    "--i": index,
  } as CSSProperties;
}
