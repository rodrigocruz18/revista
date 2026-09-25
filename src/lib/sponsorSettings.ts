/**
 * Tunable sponsor parameters, editable from /admin ("Configuracion de
 * publicidad") and stored as a small JSON blob next to sponsors.json. The
 * reader receives them as a prop, so a change applies to the next page load
 * without a redeploy.
 *
 * Pure (no Blob imports) so both the admin form (client) and the server
 * share the same defaults, limits and validation — Blob access lives in
 * @/lib/sponsorSettingsStore.
 */
export type SponsorSettings = {
  /** Silence right after the reader opens, before the first banner. */
  initialDelaySec: number;
  /** Gap with no banner between one sponsor and the next. */
  restSec: number;
  /** How long a drawn sponsor stays on screen, per category. */
  lightExposureSec: number;
  premiumExposureSec: number;
  /** Times each Premium sponsor appears per cycle of the banner tape (Light
   * appears once) — see @/lib/sponsorCycle. */
  premiumRepeats: number;
  /** Full-page ads: real pages kept ad-free at the start and end of an edition. */
  fullpageEdgePages: number;
  /** Full-page ads: minimum pages between two of them. */
  fullpageSpacingPages: number;
  /** Full-page ads per edition and session; 0 = one per active full-page sponsor. */
  fullpageMaxPerEdition: number;
};

export const DEFAULT_SPONSOR_SETTINGS: SponsorSettings = {
  initialDelaySec: 12,
  restSec: 8,
  lightExposureSec: 15,
  premiumExposureSec: 40,
  premiumRepeats: 2,
  fullpageEdgePages: 4,
  fullpageSpacingPages: 4,
  fullpageMaxPerEdition: 0,
};

/** Inclusive bounds per field; out-of-range input is clamped, not rejected. */
export const SPONSOR_SETTINGS_LIMITS: Record<keyof SponsorSettings, { min: number; max: number }> = {
  initialDelaySec: { min: 0, max: 600 },
  restSec: { min: 0, max: 600 },
  lightExposureSec: { min: 3, max: 600 },
  premiumExposureSec: { min: 3, max: 600 },
  premiumRepeats: { min: 1, max: 5 },
  fullpageEdgePages: { min: 0, max: 40 },
  fullpageSpacingPages: { min: 2, max: 40 },
  fullpageMaxPerEdition: { min: 0, max: 20 },
};

/** Fills missing fields with defaults and clamps everything to its limits,
 * so a partial or older stored file (or untrusted API input) is always safe. */
export function normalizeSponsorSettings(value: unknown): SponsorSettings {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_SPONSOR_SETTINGS };
  for (const key of Object.keys(DEFAULT_SPONSOR_SETTINGS) as (keyof SponsorSettings)[]) {
    const raw = input[key];
    const num = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isFinite(num)) continue;
    const { min, max } = SPONSOR_SETTINGS_LIMITS[key];
    result[key] = Math.min(max, Math.max(min, Math.round(num)));
  }
  return result;
}
