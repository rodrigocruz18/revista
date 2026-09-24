import type { SponsorCategory } from "@/types/sponsor";

/**
 * Tuning knobs for the sponsor system. Every number here is a deliberate
 * product decision (see the /admin proposal discussion), kept in one place
 * so they can be adjusted without touching the rotation/rendering logic.
 */

/* Rotation timing, draw odds and full-page placement are admin-editable
 * now — see @/lib/sponsorSettings (defaults and limits live there). */

/** How often the tick that drives the rotation state machine re-evaluates.
 * Small enough to feel responsive, large enough to be cheap; also the unit
 * the "paused while tab is hidden" behavior is granular to. */
export const SPONSOR_TICK_MS = 500;

/** Standard frame for the two rotating-banner slots: the aspect ratio every
 * banner is shown at, and the recommended resolution (double the common
 * 320x100 / 300x600 ad-slot sizes, for retina screens). Uploads can be any
 * size — the admin frames them into this ratio with the cropper, and the
 * original file is stored untouched (see @/lib/imageCrop). */
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

/** The sponsor icon (public "Auspiciadores" list) must be square and at
 * least this many pixels per side — it's displayed at ~48px, so this keeps
 * it sharp on 3x screens without demanding a huge file. */
export const SPONSOR_ICON_MIN_SIZE = 144;

export const SPONSOR_CATEGORY_LABEL: Record<SponsorCategory, string> = {
  light: "Light",
  premium: "Premium",
  fullpage: "Pagina completa",
};
