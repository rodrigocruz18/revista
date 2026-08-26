"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfDocumentManager, TextLayoutItem } from "@/lib/pdf";
import { normalizeForSearch } from "@/lib/utils";

export type TextLayerProps = {
  manager: PdfDocumentManager;
  pageNumber: number;
  scale: number;
  /** When set, matching spans get a highlight background. */
  highlightQuery?: string;
};

/**
 * Invisible, selectable text sitting exactly on top of the rendered canvas.
 * Powers copy, browser find, our own search-and-jump, and the read-aloud
 * highlight.
 *
 * Layout items come back in the same pixel space as the canvas render (at
 * `scale`), but react-pageflip's "stretch" sizing displays that canvas at a
 * different CSS size depending on viewport width. So the positioned spans
 * live in an inner box sized to the *intrinsic* render dimensions, and a
 * single CSS transform (tracked via ResizeObserver) scales that whole box
 * to match however big the page is actually being shown — otherwise every
 * span drifts away from its glyph the moment the book isn't shown at 1:1.
 */
export function TextLayer({ manager, pageNumber, scale, highlightQuery }: TextLayerProps) {
  const [items, setItems] = useState<TextLayoutItem[] | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([manager.getLayoutItems(pageNumber, scale), manager.getViewportSize(pageNumber, scale)]).then(
      ([layout, size]) => {
        if (cancelled) return;
        setItems(layout);
        setPageSize(size);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [manager, pageNumber, scale]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || !pageSize) return;
    const updateScale = () => {
      const width = el.clientWidth;
      if (width > 0 && pageSize.width > 0) setDisplayScale(width / pageSize.width);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageSize]);

  const needle = highlightQuery ? normalizeForSearch(highlightQuery) : "";

  return (
    <div
      ref={outerRef}
      className="revista-text-layer pointer-events-auto absolute inset-0 select-text overflow-hidden"
      aria-label={`Texto de la pagina ${pageNumber}`}
    >
      {items && pageSize && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: pageSize.width,
            height: pageSize.height,
            transform: `scale(${displayScale})`,
            transformOrigin: "0 0",
          }}
        >
          {items.map((item) => {
            const isMatch = needle.length > 0 && normalizeForSearch(item.str).includes(needle);
            return (
              <span
                key={item.id}
                data-page={pageNumber}
                className={isMatch ? "revista-text-hit" : undefined}
                style={{
                  position: "absolute",
                  left: `${item.left}px`,
                  top: `${item.top}px`,
                  fontSize: `${item.fontSize}px`,
                  transform: item.angle ? `rotate(${item.angle}rad)` : undefined,
                  transformOrigin: "0% 100%",
                  whiteSpace: "pre",
                  color: "transparent",
                  lineHeight: 1,
                  cursor: "text",
                }}
              >
                {item.str}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
