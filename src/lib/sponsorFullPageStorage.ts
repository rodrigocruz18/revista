"use client";

/**
 * Whether the full-page sponsor interstitial (see FullPageSponsorAd) has
 * already been shown this browser session. sessionStorage (not
 * localStorage) is the deliberate choice here, matching the intro splash's
 * "revista-tenis:intro-seen" flag: "once per session" means once per tab
 * session, not once ever and not reset on every edition/page navigation
 * within that same tab.
 */
const FULLPAGE_SEEN_KEY = "revista-tenis:fullpage-ad-seen";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

export function hasSeenFullPageAd(): boolean {
  if (!canUseStorage()) return false;
  try {
    return window.sessionStorage.getItem(FULLPAGE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFullPageAdSeen(): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(FULLPAGE_SEEN_KEY, "1");
  } catch {
    // Private browsing / storage disabled — worst case the interstitial can
    // show again; not worth failing anything over.
  }
}
