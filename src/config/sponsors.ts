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
/** +/-12% around that reference ratio — real magazine pages vary a little. */
export const SPONSOR_FULLPAGE_RATIO_TOLERANCE = 0.12;

/** Error message if an image can't pass as a full magazine page, else null. */
export function fullPageImageProblem(width: number, height: number): string | null {
  const { width: minW, height: minH } = SPONSOR_FULLPAGE_MIN_SIZE;
  const reference = minW / minH;
  const ratioOk = Math.abs(width / height - reference) / reference <= SPONSOR_FULLPAGE_RATIO_TOLERANCE;
  if (width >= minW && height >= minH && ratioOk) return null;
  return `La imagen de pagina completa debe ser al menos ${minW}x${minH}px, en formato vertical similar a una hoja de revista (esta imagen mide ${width}x${height}px). Se recorta levemente para encajar, pero la proporcion debe ser parecida.`;
}

/** The sponsor icon (public "Auspiciadores" list) must be square and at
 * least this many pixels per side — it's displayed at ~48px, so this keeps
 * it sharp on 3x screens without demanding a huge file. */
export const SPONSOR_ICON_MIN_SIZE = 144;

export const SPONSOR_CATEGORY_LABEL: Record<SponsorCategory, string> = {
  light: "Light",
  premium: "Premium",
  fullpage: "Pagina completa",
};
