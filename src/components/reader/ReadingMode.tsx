"use client";

import { useEffect, useState } from "react";
import type { PdfDocumentManager } from "@/lib/pdf";
import type { ReadingPreferences } from "@/lib/reader-storage";
import { cn } from "@/lib/utils";

export type ReadingModeProps = {
  open: boolean;
  manager: PdfDocumentManager;
  pageCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
  preferences: ReadingPreferences;
  onPreferencesChange: (prefs: ReadingPreferences) => void;
};

export function ReadingMode({
  open,
  manager,
  pageCount,
  currentPage,
  onPageChange,
  onClose,
  preferences,
  onPreferencesChange,
}: ReadingModeProps) {
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off async text extraction for the newly opened page
    setLoading(true);
    manager.getTextContent(currentPage).then(({ fullText }) => {
      if (cancelled) return;
      const blocks = fullText
        .split(/\n{1,}/)
        .map((line) => line.trim())
        .filter(Boolean);
      setParagraphs(blocks.length > 0 ? blocks : ["Esta pagina no tiene texto seleccionable."]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, manager, currentPage]);

  if (!open) return null;

  const isDark = preferences.theme === "dark";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col",
        isDark ? "bg-[#141311] text-zinc-100" : "bg-[#faf7ee] text-zinc-900",
      )}
    >
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-medium opacity-80 transition hover:opacity-100"
        >
          <span aria-hidden>←</span> Volver a la revista
        </button>
        <span className="font-serif text-xs uppercase tracking-widest opacity-50">
          Pagina {currentPage} / {pageCount}
        </span>
      </header>

      <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10">
        <article
          style={{
            fontSize: `${preferences.fontSize}px`,
            lineHeight: preferences.lineHeight,
            maxWidth: `${preferences.measure}ch`,
          }}
          className="font-serif"
        >
          {loading ? (
            <p className="opacity-50">Cargando texto…</p>
          ) : (
            paragraphs.map((paragraph, i) => (
              <p key={i} className="mb-4">
                {paragraph}
              </p>
            ))
          )}
        </article>
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-4 border-t border-black/10 px-4 py-3 text-xs dark:border-white/10">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="rounded-full border border-current/20 px-3 py-1 disabled:opacity-30"
        >
          ‹ Anterior
        </button>

        <label className="flex items-center gap-2">
          Aa
          <input
            type="range"
            min={14}
            max={28}
            value={preferences.fontSize}
            onChange={(e) => onPreferencesChange({ ...preferences, fontSize: Number(e.target.value) })}
          />
        </label>

        <label className="flex items-center gap-2">
          Interlineado
          <input
            type="range"
            min={1.2}
            max={2.2}
            step={0.1}
            value={preferences.lineHeight}
            onChange={(e) => onPreferencesChange({ ...preferences, lineHeight: Number(e.target.value) })}
          />
        </label>

        <label className="flex items-center gap-2">
          Ancho
          <input
            type="range"
            min={40}
            max={90}
            value={preferences.measure}
            onChange={(e) => onPreferencesChange({ ...preferences, measure: Number(e.target.value) })}
          />
        </label>

        <button
          type="button"
          onClick={() =>
            onPreferencesChange({ ...preferences, theme: isDark ? "light" : "dark" })
          }
          className="rounded-full border border-current/20 px-3 py-1"
        >
          {isDark ? "☀ Claro" : "☾ Oscuro"}
        </button>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
          disabled={currentPage >= pageCount}
          className="rounded-full border border-current/20 px-3 py-1 disabled:opacity-30"
        >
          Siguiente ›
        </button>
      </footer>
    </div>
  );
}
