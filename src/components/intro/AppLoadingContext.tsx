"use client";

import { createContext, useContext } from "react";

export type AppLoadingApi = {
  /** Registers `key` as something the splash's loading phase should wait
   * for. Call once, as early as possible (e.g. in a mount effect), before
   * any async work starts — this cancels the "nothing is loading" fallback
   * that would otherwise let the splash move on immediately. */
  begin: (key: string) => void;
  /** Reports 0..1 progress for `key`. Progress only ever moves forward — a
   * lower value than what's already recorded is ignored, so a page can call
   * this as loosely/often as it likes without the bar visibly rewinding. */
  setProgress: (key: string, value: number) => void;
  /** Marks `key` as fully loaded. Once every registered key has finished,
   * the splash's loading phase ends and the cinematic reveal begins. */
  finish: (key: string) => void;
};

export const AppLoadingContext = createContext<AppLoadingApi | null>(null);

/**
 * Lets a page report real loading progress to the `LogoIntro` splash
 * mounted above it in the root layout (via `IntroGate`), so the splash's
 * loading phase — the circular mark with a percentage — reflects actual
 * work instead of a fixed timer.
 *
 * Returns `null` if called outside `IntroGate` (shouldn't happen — it wraps
 * the whole app in the root layout — but callers should tolerate it rather
 * than crash: reporting load progress is a nice-to-have, never something a
 * page's core functionality should depend on).
 */
export function useAppLoading() {
  return useContext(AppLoadingContext);
}
