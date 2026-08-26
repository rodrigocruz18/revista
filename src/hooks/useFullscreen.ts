"use client";

import { useCallback, useSyncExternalStore } from "react";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void>;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

function subscribeFullscreenChange(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}

function getFullscreenSnapshot() {
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null);
}

function getServerFullscreenSnapshot() {
  return false;
}

function subscribeNever() {
  return () => {};
}

export function useFullscreen(targetRef: React.RefObject<HTMLElement | null>) {
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreenChange,
    getFullscreenSnapshot,
    getServerFullscreenSnapshot,
  );

  const isSupported = useSyncExternalStore(
    subscribeNever,
    () =>
      Boolean(document.fullscreenEnabled) ||
      Boolean((document as FullscreenDocument).webkitFullscreenEnabled),
    () => false,
  );

  const enter = useCallback(async () => {
    const el = targetRef.current as FullscreenElement | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      // Fullscreen can be denied by the browser/OS — fail silently, the
      // reader still works without it.
    }
  }, [targetRef]);

  const exit = useCallback(async () => {
    const doc = document as FullscreenDocument;
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    if (isFullscreen) void exit();
    else void enter();
  }, [isFullscreen, enter, exit]);

  return { isFullscreen, isSupported, enter, exit, toggle };
}
