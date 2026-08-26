"use client";

import { useEffect, useState } from "react";

export type ContextMenuProps = {
  containerRef: React.RefObject<HTMLElement | null>;
  onRead: (text: string) => void;
};

/**
 * Appears next to the browser's native text selection inside the reader.
 * Copy uses the OS clipboard directly; translate/explain are stubbed for a
 * future AI-assisted release (see project spec section 45).
 */
export function ContextMenu({ containerRef, onRead }: ContextMenuProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleUp() {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!text || !selection || selection.rangeCount === 0) {
        setMenu(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setMenu(null);
        return;
      }
      setMenu({ x: rect.left + rect.width / 2, y: rect.top, text });
    }

    function handleDown(e: MouseEvent) {
      if (e.target instanceof HTMLElement && e.target.closest("[data-context-menu]")) return;
      setMenu(null);
    }

    document.addEventListener("mouseup", handleUp);
    document.addEventListener("mousedown", handleDown);
    return () => {
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("mousedown", handleDown);
    };
  }, [containerRef]);

  if (!menu) return null;

  return (
    <div
      data-context-menu
      className="fixed z-50 -translate-x-1/2 -translate-y-full overflow-hidden rounded-xl border border-white/10 bg-[#141613] text-sm text-white shadow-2xl"
      style={{ left: menu.x, top: menu.y - 8 }}
    >
      <button
        type="button"
        className="block w-full px-4 py-2 text-left hover:bg-white/10"
        onClick={() => {
          void navigator.clipboard?.writeText(menu.text);
          setMenu(null);
        }}
      >
        Copiar
      </button>
      <button
        type="button"
        className="block w-full px-4 py-2 text-left hover:bg-white/10"
        onClick={() => {
          onRead(menu.text);
          setMenu(null);
        }}
      >
        🔊 Leer
      </button>
      <button type="button" disabled className="block w-full cursor-not-allowed px-4 py-2 text-left text-white/30">
        🌎 Traducir (proximamente)
      </button>
      <button type="button" disabled className="block w-full cursor-not-allowed px-4 py-2 text-left text-white/30">
        ✨ Explicar (proximamente)
      </button>
    </div>
  );
}
