"use client";

import { useEffect } from "react";
import { isEditableTarget } from "@/lib/utils";

export type KeyboardShortcutMap = {
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onCloseOverlay?: () => void;
};

/**
 * Global keyboard shortcuts for the reader. Never intercepts keys while the
 * user is typing into an input/textarea/contenteditable element.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;

      switch (event.key) {
        case "ArrowLeft":
          handlers.onPrevPage?.();
          break;
        case "ArrowRight":
          handlers.onNextPage?.();
          break;
        case "+":
        case "=":
          handlers.onZoomIn?.();
          break;
        case "-":
        case "_":
          handlers.onZoomOut?.();
          break;
        case "Escape":
          handlers.onCloseOverlay?.();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, handlers]);
}
