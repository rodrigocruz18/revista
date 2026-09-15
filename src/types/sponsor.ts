/**
 * A sponsor/advertiser managed from /admin. Three categories, each with a
 * different role:
 *
 *  - "light" / "premium": rotate through the banner slot (horizontal strip
 *    on mobile, vertical column on desktop) — see @/config/sponsors for the
 *    probability/exposure-time difference between the two.
 *  - "fullpage": a separate, higher-tier placement that simulates one extra
 *    page of the magazine, shown once per reading session as an overlay on
 *    top of a real page turn (never inserted into the actual page count —
 *    see FullPageSponsorAd).
 *
 * Only the images relevant to a sponsor's category are ever populated —
 * a "light"/"premium" sponsor has horizontalImageUrl/verticalImageUrl, a
 * "fullpage" sponsor has fullPageImageUrl, the other fields stay null.
 */
export type SponsorCategory = "light" | "premium" | "fullpage";
export type SponsorStatus = "active" | "paused";

export type Sponsor = {
  /** Stable id (client-generated UUID) — also the folder name under
   * sponsors/<id>/ in Blob storage for this sponsor's images. */
  id: string;
  name: string;
  /** Where a click on the banner/page leads. Always opened in a new tab. */
  targetUrl: string;
  category: SponsorCategory;
  status: SponsorStatus;
  /** 640x200px — shown below the magazine on narrow (mobile) screens. */
  horizontalImageUrl: string | null;
  /** 600x1200px — shown beside the magazine on wide (desktop) screens. */
  verticalImageUrl: string | null;
  /** Full simulated magazine page — desktop and mobile both use this one
   * image, sized to the page's own aspect ratio with a slight center-crop. */
  fullPageImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SponsorsManifest = {
  generatedAt: string;
  sponsors: Sponsor[];
};
