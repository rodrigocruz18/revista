"use client";

import { useEffect, useRef, useState } from "react";
import type { Sponsor } from "@/types/sponsor";
import { SPONSOR_TICK_MS } from "@/config/sponsors";
import { DEFAULT_SPONSOR_SETTINGS, type SponsorSettings } from "@/lib/sponsorSettings";
import { buildSponsorCycle } from "@/lib/sponsorCycle";
import { brandKey } from "@/lib/sponsorBrands";

type RotationCategory = "light" | "premium";
export type BannerSponsor = Sponsor & { category: RotationCategory };

function isBannerSponsor(sponsor: Sponsor): sponsor is BannerSponsor {
  return sponsor.category === "light" || sponsor.category === "premium";
}

type Phase = "initial" | "resting" | "showing";

/**
 * Drives the rotating banner slot: a silent delay right after the reader
 * opens (settings.initialDelaySec, so the very first thing a reader sees
 * isn't an ad), then alternates between showing the next sponsor of the
 * banner tape (for its category's exposure time) and a quiet rest gap
 * (settings.restSec) with nothing shown between sponsors.
 *
 * The tape (see @/lib/sponsorCycle) goes through every eligible sponsor in
 * random order before repeating — Premium ones `premiumRepeats` times per
 * cycle — and the next cycle is reshuffled so its first sponsor is never the
 * one just shown.
 *
 * Ticks every SPONSOR_TICK_MS instead of one long setTimeout per phase so
 * the whole thing can cleanly pause: while the tab is hidden (document.hidden
 * via the Page Visibility API), ticks are skipped entirely, so a reader who
 * tabs away mid-exposure comes back to the same remaining time rather than a
 * rotation that silently burned through while they weren't looking.
 *
 * Phase/remaining-time/tape bookkeeping lives in refs, not state — the
 * interval callback is created once and reads/writes them directly, so a
 * tick never has to worry about a stale closure over a state value from N
 * renders ago. `current` is the only piece that needs to trigger a render,
 * so it's the only state.
 */
export function useSponsorRotation(
  sponsors: Sponsor[],
  settings: SponsorSettings = DEFAULT_SPONSOR_SETTINGS,
): Sponsor | null {
  const [current, setCurrent] = useState<BannerSponsor | null>(null);

  const sponsorsRef = useRef(sponsors);
  const settingsRef = useRef(settings);
  useEffect(() => {
    sponsorsRef.current = sponsors;
    settingsRef.current = settings;
  }, [sponsors, settings]);

  const phaseRef = useRef<Phase>("initial");
  const remainingRef = useRef(settings.initialDelaySec * 1000);
  const currentRef = useRef<BannerSponsor | null>(null);
  const tapeRef = useRef<BannerSponsor[]>([]);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;

      // If the sponsor currently on screen got paused/deleted by the admin
      // mid-exposure, cut away immediately instead of waiting out a timer
      // for a sponsor that's no longer supposed to be shown.
      if (phaseRef.current === "showing" && currentRef.current) {
        const stillEligible = sponsorsRef.current.some(
          (s) => s.id === currentRef.current!.id && s.status === "active",
        );
        if (!stillEligible) {
          phaseRef.current = "resting";
          remainingRef.current = settingsRef.current.restSec * 1000;
          currentRef.current = null;
          setCurrent(null);
          return;
        }
      }

      remainingRef.current -= SPONSOR_TICK_MS;
      if (remainingRef.current > 0) return;

      if (phaseRef.current === "showing") {
        phaseRef.current = "resting";
        remainingRef.current = settingsRef.current.restSec * 1000;
        currentRef.current = null;
        setCurrent(null);
        return;
      }

      // "initial" or "resting" just elapsed — draw the next sponsor.
      const eligible = sponsorsRef.current.filter(
        (s): s is BannerSponsor => isBannerSponsor(s) && s.status === "active",
      );
      // Next in the tape, skipping anyone paused/removed since the cycle was
      // built; an exhausted tape starts a fresh shuffled cycle whose first
      // sponsor differs from the last one shown.
      const eligibleIds = new Set(eligible.map((s) => s.id));
      let picked: BannerSponsor | null = null;
      while (!picked && tapeRef.current.length > 0) {
        const next = tapeRef.current.shift()!;
        if (eligibleIds.has(next.id)) picked = eligible.find((s) => s.id === next.id) ?? null;
      }
      if (!picked && eligible.length > 0) {
        tapeRef.current = buildSponsorCycle(eligible, settingsRef.current.premiumRepeats, lastKeyRef.current);
        picked = tapeRef.current.shift() ?? null;
      }
      if (!picked) {
        // Nobody eligible right now — stay in "resting" and keep checking
        // every tick (e.g. the admin might activate one while this session
        // is open; `sponsors` is whatever the page passed in as a prop).
        phaseRef.current = "resting";
        remainingRef.current = settingsRef.current.restSec * 1000;
        return;
      }
      lastKeyRef.current = brandKey(picked);
      phaseRef.current = "showing";
      const { premiumExposureSec, lightExposureSec } = settingsRef.current;
      remainingRef.current = (picked.category === "premium" ? premiumExposureSec : lightExposureSec) * 1000;
      currentRef.current = picked;
      setCurrent(picked);
    }, SPONSOR_TICK_MS);

    return () => clearInterval(interval);
    // Intentionally empty deps: this effect sets up the interval exactly
    // once per mount. It reads live sponsor data through `sponsorsRef`
    // rather than depending on `sponsors` directly, so a new sponsors array
    // on every parent render never tears down and restarts the rotation
    // (which would otherwise reset the reader back to the silent initial
    // delay on every unrelated re-render).
  }, []);

  return current;
}
