"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfDocumentManager, SearchHit } from "@/lib/pdf";
import { normalizeForSearch } from "@/lib/utils";

export type SearchPanelProps = {
  manager: PdfDocumentManager;
  open: boolean;
  onClose: () => void;
  onJump: (page: number, query: string) => void;
};

export function SearchPanel({ manager, open, onClose, onJump }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results when the query is emptied
      setResults(null);
      setProgress(null);
      return;
    }
    const id = ++requestId.current;
    setProgress({ done: 0, total: 0 });
    const timeout = setTimeout(() => {
      manager
        .searchAll(query, normalizeForSearch, (done, total) => {
          if (requestId.current === id) setProgress({ done, total });
        })
        .then((hits) => {
          if (requestId.current === id) setResults(hits);
        });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, manager]);

  if (!open) return null;

  const pagesWithHits = results
    ? Array.from(new Set(results.map((hit) => hit.page))).sort((a, b) => a - b)
    : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/50 px-4 pt-20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-fit max-h-[70vh] w-full max-w-lg overflow-hidden rounded-2xl bg-[#141613] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 p-3">
          <span aria-hidden className="text-white/50">
            🔎
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la revista…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar busqueda"
            className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {!query.trim() && (
            <p className="p-3 text-sm text-white/40">
              Escribe un termino, por ejemplo un jugador o torneo.
            </p>
          )}
          {query.trim() && progress && !results && (
            <p className="p-3 text-sm text-white/40">
              Buscando… {progress.total ? `${progress.done}/${progress.total}` : ""}
            </p>
          )}
          {results && results.length === 0 && (
            <p className="p-3 text-sm text-white/40">Sin resultados para “{query}”.</p>
          )}
          {results && results.length > 0 && (
            <div>
              <p className="px-3 py-1 text-xs text-white/40">
                {results.length} resultado{results.length === 1 ? "" : "s"} en {pagesWithHits.length} pagina
                {pagesWithHits.length === 1 ? "" : "s"}
              </p>
              <ul>
                {results.slice(0, 60).map((hit, i) => (
                  <li key={`${hit.page}-${i}`}>
                    <button
                      type="button"
                      onClick={() => onJump(hit.page, query)}
                      className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition hover:bg-white/10"
                    >
                      <span className="font-serif text-xs uppercase tracking-wide text-lime-300/90">
                        Pagina {String(hit.page).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-white/80">{hit.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
