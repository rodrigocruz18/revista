export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Normalizes text for accent/case-insensitive search:
 * "Alcaraz" and "alcáraz" both become "alcaraz".
 */
const COMBINING_DIACRITICS = new RegExp("[̀-ͯ]", "g");

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .trim();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function formatPageCount(current: number, total: number): string {
  return `${current} / ${total}`;
}
