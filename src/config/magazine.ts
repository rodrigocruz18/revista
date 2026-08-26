/**
 * Central brand configuration. Every component should read the magazine's
 * name/description from here instead of hardcoding copy, so a rebrand is a
 * one-file change.
 */
export const magazineConfig = {
  name: "Revista Tenis",
  shortName: "Revista Tenis",
  description: "Revista digital de tenis",
  locale: "es-CL",
  themeColor: "#0b0f0d",
  magazinesDir: "/magazines",
  coversDir: "/magazines/covers",
} as const;

/** Continuous zoom range for the desktop wheel / mobile pinch reading zoom.
 * ZOOM_MAX is deliberately generous: a page's aspect ratio rarely matches the
 * reader viewport's, so one axis (e.g. width, on a portrait page in a wide
 * window) overflows and becomes pannable well before the other — a low max
 * can leave the "shorter" axis never reaching scrollable territory at all,
 * which reads as "I can't reach that corner" even though nothing is broken. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;
