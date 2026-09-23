"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Sponsor } from "@/types/sponsor";
import { sponsorDomain, uniqueBrands } from "@/lib/sponsorBrands";

const DRAG_CLOSE_PX = 90;

/**
 * Reader's hamburger, which opens the sponsors panel directly. The panel is
 * portaled to <body> because the mobile header is a transformed, fixed
 * element, which would otherwise become the containing block for (and
 * clip) a fixed overlay rendered inside it.
 *
 * Mobile gets a bottom sheet that can be dragged down to dismiss; desktop a
 * right-hand drawer. Each brand appears once (a sponsor with several
 * placements has several records — see @/lib/sponsorBrands), and the order
 * is reshuffled every time the panel opens, so no one is permanently first.
 */
export function SiteMenu({
  sponsors,
  open,
  onOpenChange,
}: {
  sponsors: Sponsor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rendered, setRendered] = useState(open);
  const [order, setOrder] = useState<Sponsor[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; dy: number } | null>(null);

  // Mount on open; unmounting waits for the exit animation (onAnimationEnd).
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const openPanel = () => {
    setOrder(shuffle(uniqueBrands(sponsors)));
    onOpenChange(true);
  };
  const close = () => onOpenChange(false);

  const onDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    dragRef.current = { y: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;
    drag.dy = Math.max(0, event.clientY - drag.y);
    panel.style.transition = "none";
    panel.style.transform = `translateY(${drag.dy}px)`;
  };
  const onDragEnd = () => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    dragRef.current = null;
    if (!drag || !panel) return;
    panel.style.transition = "";
    panel.style.transform = "";
    if (drag.dy > DRAG_CLOSE_PX) close();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-label={open ? "Cerrar auspiciadores" : "Ver auspiciadores"}
        aria-expanded={open}
        aria-controls="site-menu"
        className="site-menu-trigger group relative -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/5 hover:text-white"
        data-open={open || undefined}
      >
        <span className="site-menu-bar site-menu-bar--top" />
        <span className="site-menu-bar site-menu-bar--bottom" />
      </button>

      {rendered &&
        createPortal(
          <div className="site-menu fixed inset-0 z-[80]" data-state={open ? "open" : "closed"}>
            <div className="site-menu-backdrop absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={close} />
            <div
              id="site-menu"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="site-menu-title"
              tabIndex={-1}
              className="site-menu-panel absolute flex flex-col overflow-hidden bg-[#0b0f0d] text-white shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.8)] outline-none"
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && !open) {
                  setRendered(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              <div
                className="shrink-0 touch-none md:touch-auto"
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
              >
                <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15 md:hidden" aria-hidden />
                <div className="flex items-start gap-4 px-5 pb-5 pt-4 md:px-8 md:pb-7 md:pt-9">
                  <div className="flex-1">
                    <h2 id="site-menu-title" className="font-serif text-[28px] leading-none tracking-tight md:text-[34px]">
                      Auspiciadores
                    </h2>
                    <p className="mt-2 text-[13px] text-white/45">Las marcas que hacen posible Ace Tenis.</p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Cerrar"
                    className="-mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {order.length === 0 ? (
                <p className="px-5 pb-10 text-sm text-white/50 md:px-8">Muy pronto conoceras a nuestros auspiciadores.</p>
              ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 md:px-8 [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))]">
                  {order.map((sponsor, index) => (
                    <SponsorRow key={sponsor.id} sponsor={sponsor} index={index} />
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SponsorRow({ sponsor, index }: { sponsor: Sponsor; index: number }) {
  return (
    <li
      className="site-menu-item group relative flex items-center gap-4 border-t border-white/[0.07] py-4 first:border-t-0 md:gap-5 md:py-5"
      style={{ animationDelay: `${80 + index * 45}ms` }}
    >
      <SponsorIcon sponsor={sponsor} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[13px] font-semibold leading-snug tracking-[0.12em] text-white/90 transition-colors group-hover:text-white">
          {sponsor.name.toLocaleUpperCase("es-CL")}
        </p>
        <p className="mt-1 truncate text-xs text-white/35">{sponsorDomain(sponsor.targetUrl)}</p>
      </div>
      {/* The link stretches over the whole row (after:inset-0), so tapping
          anywhere on it works — "Ver" is just its visible label. */}
      <a
        href={sponsor.targetUrl}
        target="_blank"
        rel="noopener sponsored"
        aria-label={`Ver ${sponsor.name}`}
        className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-[0.16em] text-white/50 transition-colors after:absolute after:inset-0 group-hover:text-lime-300"
      >
        Ver
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden>
          <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </li>
  );
}

function SponsorIcon({ sponsor }: { sponsor: Sponsor }) {
  if (sponsor.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sponsor.iconUrl}
        alt=""
        loading="lazy"
        className="h-12 w-12 shrink-0 rounded-xl object-cover transition-transform duration-300 group-hover:scale-[1.04] md:h-14 md:w-14"
      />
    );
  }
  // Sponsors created before icons existed: a monogram instead.
  const initials = sponsor.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("es-CL");
  return (
    <span
      aria-hidden
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] font-serif text-lg text-white/70 md:h-14 md:w-14"
    >
      {initials}
    </span>
  );
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
