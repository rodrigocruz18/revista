import type { CSSProperties } from "react";

/**
 * Which part of an uploaded image fills a fixed-ratio frame (the sponsor
 * banner slots). The original file is stored untouched; the crop is applied
 * at display time, so re-framing never means re-uploading.
 *
 * Coordinates are fractions of the source image: `x`/`y` is the frame's
 * top-left corner and `w`/`h` its size. They may go outside 0..1 when the
 * image is zoomed out past "cover" — the uncovered part of the frame then
 * shows `bg`.
 */
export type ImageCrop = { x: number; y: number; w: number; h: number; bg?: string };

/** Style for an <img> inside a `position: relative; overflow: hidden`
 * frame of the target aspect ratio (the frame's own background should be
 * `crop.bg`). The same function drives the admin editor and the reader, so
 * what the admin frames is exactly what readers see. */
export function cropImageStyle(crop: ImageCrop): CSSProperties {
  return {
    position: "absolute",
    maxWidth: "none",
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-crop.x / crop.w) * 100}%`,
    top: `${(-crop.y / crop.h) * 100}%`,
  };
}

/** Centered "cover" crop — the default framing, and what legacy banners
 * (uploaded at the exact size, without a crop) effectively use. */
export function coverCrop(imageW: number, imageH: number, frameRatio: number): ImageCrop {
  return cropAt(imageW, imageH, frameRatio, 1, 0.5, 0.5);
}

/** Largest zoom-out allowed: the whole image fits inside the frame. */
export function minZoom(imageW: number, imageH: number, frameRatio: number): number {
  const imageRatio = imageW / imageH;
  return Math.min(imageRatio / frameRatio, frameRatio / imageRatio);
}

/**
 * Crop for a zoom level (1 = cover, <1 = zoomed out down to minZoom, >1 =
 * zoomed in) centered as close to (cx, cy) as the edges allow: the frame
 * never shows empty space on a side where the image could still cover it.
 */
export function cropAt(imageW: number, imageH: number, frameRatio: number, zoom: number, cx: number, cy: number): ImageCrop {
  const imageRatio = imageW / imageH;
  // At zoom 1 ("cover") the image's limiting side exactly fills the frame.
  const coverW = imageRatio > frameRatio ? frameRatio / imageRatio : 1;
  const coverH = imageRatio > frameRatio ? 1 : imageRatio / frameRatio;
  const w = coverW / zoom;
  const h = coverH / zoom;
  const x = clampAxis(cx - w / 2, w);
  const y = clampAxis(cy - h / 2, h);
  return { x, y, w, h };
}

function clampAxis(start: number, size: number): number {
  const lo = Math.min(0, 1 - size);
  const hi = Math.max(0, 1 - size);
  return Math.min(hi, Math.max(lo, start));
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Validates an untrusted crop (API input). Returns null when absent or malformed. */
export function parseCrop(value: unknown): ImageCrop | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, w, h, bg } = value as Record<string, unknown>;
  const nums = [x, y, w, h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if ((w as number) <= 0 || (h as number) <= 0 || (w as number) > 20 || (h as number) > 20) return null;
  if (Math.abs(x as number) > 20 || Math.abs(y as number) > 20) return null;
  const crop: ImageCrop = { x: x as number, y: y as number, w: w as number, h: h as number };
  if (typeof bg === "string" && HEX_COLOR.test(bg)) crop.bg = bg;
  return crop;
}
