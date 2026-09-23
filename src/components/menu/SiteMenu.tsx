"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Sponsor } from "@/types/sponsor";
import { cn } from "@/lib/utils";

type View = "menu" | "sponsors";

const DRAG_CLOSE_PX = 90;

/**
 * Reader's hamburger menu. The trigger lives in the header; the panel is
 * portaled to <body> because the mobile header is a transformed, fixed
 * element, which would otherwise become the containing block for (and
 * clip) a fixed overlay rendered inside it.
 *
 * One surface, two views: the menu itself, and the sponsors list it pushes
 * to (iOS-style, with a back arrow) — so reaching the list never stacks a
 * second modal over the first. Mobile gets a bottom sheet that can be
 * dragged down to dismiss; desktop a right-hand drawer.
 *
 * The sponsor order is reshuffled every time the list is opened, so no
 * sponsor is permanently first.
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
  const [view, setView] = useState<View>("menu");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
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

  const openMenu = () => {
    setView("menu");
    setDirection("forward");
    onOpenChange(true);
  };
  const close = () => onOpenChange(false);
  const showSponsors = () => {
    setOrder(shuffle(sponsors));
    setDirection("forward");
    setView("sponsors");
  };
  const showMenu = () => {
    setDirection("back");
    setView("menu");
  };

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
        onClick={() => (open ? close() : openMenu())}
        aria-label={open ? "Cerrar menu" : "Abrir menu"}
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
            <div className="site-menu-backdrop absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={close} />
            <div
              id="site-menu"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              tabIndex={-1}
              className="site-menu-panel absolute flex flex-col overflow-hidden border-white/10 bg-[#0b0f0d]/95 text-white shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.8)] outline-none backdrop-blur-xl"
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
                <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20 md:hidden" aria-hidden />
                <div className="flex items-center gap-2 px-5 pb-3 pt-3 md:px-7 md:pt-6">
                  {view === "sponsors" ? (
                    <button
                      type="button"
                      onClick={showMenu}
                      aria-label="Volver al menu"
                      className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                        <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ) : null}
                  <p className="flex-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                    {view === "sponsors" ? "Auspiciadores" : "Menu"}
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Cerrar menu"
                    className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div key={view} className={cn("site-menu-view flex min-h-0 flex-1 flex-col", `site-menu-view--${direction}`)}>
                {view === "menu" ? (
                  <nav className="px-3 pb-6 md:px-5">
                    <button
                      type="button"
                      onClick={showSponsors}
                      className="group flex w-full items-center gap-4 rounded-2xl px-3 py-4 text-left transition hover:bg-white/[0.06]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-300/10 text-lime-300 ring-1 ring-lime-300/20">
                        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
                          <path
                            d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1">
                        <span className="block font-serif text-2xl leading-tight">Auspiciadores</span>
                        <span className="block text-xs text-white/45">Las marcas que hacen posible Ace Tenis</span>
                      </span>
                      {sponsors.length > 0 && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums text-white/60">
                          {sponsors.length}
                        </span>
                      )}
                      <svg viewBox="0 0 16 16" className="h-4 w-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden>
                        <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </nav>
                ) : (
                  <SponsorList sponsors={order} />
                )}
              </div>

              <p className="shrink-0 border-t border-white/5 px-5 py-4 text-[10px] uppercase tracking-[0.2em] text-white/25 md:px-7 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
                Ace Tenis · La revista del tenis chileno
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SponsorList({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) {
    return <p className="px-5 pb-8 pt-2 text-sm text-white/50 md:px-7">Muy pronto conoceras a nuestros auspiciadores.</p>;
  }
  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-4 md:px-5">
      {sponsors.map((sponsor, index) => (
        <li
          key={sponsor.id}
          className="site-menu-item flex items-center gap-4 rounded-2xl px-3 py-2.5 transition hover:bg-white/[0.05]"
          style={{ animationDelay: `${60 + index * 45}ms` }}
        >
          <SponsorIcon sponsor={sponsor} />
          <span className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold leading-snug tracking-[0.08em]">
            {sponsor.name.toLocaleUpperCase("es-CL")}
          </span>
          <a
            href={sponsor.targetUrl}
            target="_blank"
            rel="noopener sponsored"
            aria-label={`Ver ${sponsor.name}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white/80 transition hover:border-lime-300 hover:bg-lime-300 hover:text-black"
          >
            Ver
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
              <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </li>
      ))}
    </ul>
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
        className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-1.5 ring-1 ring-white/10"
      />
    );
  }
  // Sponsors created before icons existed: a monogram tile instead.
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
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-300/25 to-emerald-500/10 font-serif text-lg text-lime-200 ring-1 ring-white/10"
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
