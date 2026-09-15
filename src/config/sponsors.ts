import type { SponsorCategory } from "@/types/sponsor";

/**
 * Tuning knobs for the sponsor system. Every number here is a deliberate
 * product decision (see the /admin proposal discussion), kept in one place
 * so they can be adjusted without touching the rotation/rendering logic.
 */

/** Relative odds of being drawn for the rotating banner slot. Premium is 3x
 * more likely than Light on any given draw, without excluding Light
 * entirely — both categories keep showing up, Premium just shows up more
 * often. */
export const SPONSOR_DRAW_WEIGHT: Record<"light" | "premium", number> = {
  light: 1,
  premium: 3,
};

/** How long a drawn sponsor stays visible in the banner slot before the
 * next rotation. Premium's higher weight (more likely to be picked) is
 * paired with more time on screen once it is. */
export const SPONSOR_EXPOSURE_MS: Record<"light" | "premium", number> = {
  light: 15_000,
  premium: 40_000,
};

/** Quiet gap with no banner shown between one sponsor's exposure ending and
 * the next draw — keeps the rotation from feeling like a nonstop ticker. */
export const SPONSOR_REST_MS = 8_000;

/** Nothing shows at all for this long after the reader first opens, so the
 * page doesn't greet the reader with an ad before they've even started
 * reading. */
export const SPONSOR_INITIAL_DELAY_MS = 12_000;

/** How often the tick that drives the rotation state machine re-evaluates.
 * Small enough to feel responsive, large enough to be cheap; also the unit
 * the "paused while tab is hidden" behavior is granular to. */
export const SPONSOR_TICK_MS = 500;

/** Real page turns (in either direction) the reader must make before the
 * full-page sponsor is allowed to appear — never on the very first pages,
 * and only once per session even if the reader keeps flipping past it. */
export const FULLPAGE_TRIGGER_AFTER_TURNS = 5;

/** Exact pixel dimensions required for the two rotating-banner images.
 * Double the common 320x100 / 300x600 ad-slot sizes so they stay crisp on
 * high-density (retina) screens; enforced exactly (see admin upload form),
 * per the requirement that these match our format precisely. */
export const SPONSOR_IMAGE_SPECS = {
  horizontal: { width: 640, height: 200 },
  vertical: { width: 600, height: 1200 },
} as const;

/** The full-page placement isn't held to an exact pixel match — it has to
 * visually pass as "a page of the magazine", and real editions could vary
 * slightly in page proportions. Instead we require a minimum resolution at
 * a reference portrait-page ratio (close to Letter/A4) and display it with
 * object-fit: cover, center-cropping a little rather than ever showing
 * empty bars. */
export const SPONSOR_FULLPAGE_MIN_SIZE = { width: 1275, height: 1650 } as const;

export function sponsorDrawWeight(category: "light" | "premium"): number {
  return SPONSOR_DRAW_WEIGHT[category] ?? 1;
}

export function sponsorExposureMs(category: "light" | "premium"): number {
  return SPONSOR_EXPOSURE_MS[category] ?? SPONSOR_EXPOSURE_MS.light;
}

export const SPONSOR_CATEGORY_LABEL: Record<SponsorCategory, string> = {
  light: "Light",
  premium: "Premium",
  fullpage: "Pagina completa",
};
