/**
 * A sponsor/advertiser managed from /admin. Three categories, each with a
 * different role:
 *
 *  - "light" / "premium": rotate through the banner slot (horizontal strip
 *    on mobile, vertical column on desktop) — see @/config/sponsors for the
 *    probability/exposure-time difference between the two.
 *  - "fullpage": a separate, higher-tier placement — one or two fixed spots
 *    per edition/session, inserted as genuine pages directly in the book's
 *    own page sequence (see @/lib/fullPageSpots and the Flipbook*Page
 *    components), so they turn with exactly the same engine as every real
 *    page instead of an overlay imitating one.
 *
 * Only the images relevant to a sponsor's category are ever populated —
 * a "light"/"premium" sponsor has horizontalImageUrl/verticalImageUrl, a
 * "fullpage" sponsor has fullPageImageUrl, the other fields stay null.
 */
import type { ImageCrop } from "@/lib/imageCrop";

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
  /** Any size; framed into the 640x200 slot shown below the magazine on
   * narrow (mobile) screens via `horizontalCrop`. */
  horizontalImageUrl: string | null;
  /** Any size; framed into the 600x1200 slot shown beside the magazine on
   * wide (desktop) screens via `verticalCrop`. */
  verticalImageUrl: string | null;
  /** Which part of the original banner image fills its slot (chosen in the
   * admin cropper). Absent on banners uploaded at the exact size before the
   * cropper existed — those are shown centered with object-fit: cover. */
  horizontalCrop?: ImageCrop | null;
  verticalCrop?: ImageCrop | null;
  /** Full simulated magazine page — desktop and mobile both use this one
   * image, sized to the page's own aspect ratio with a slight center-crop. */
  fullPageImageUrl: string | null;
  /** Square logo/icon shown in the public "Auspiciadores" list (reader
   * menu), for every category. Optional on records created before this
   * field existed — the list falls back to a monogram. */
  iconUrl?: string | null;
  /** Groups the placements of one advertiser (see @/lib/sponsorBrands).
   * Name, link and icon are shared across a brand's records. Absent on
   * records created before brands existed. */
  brandId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SponsorsManifest = {
  generatedAt: string;
  sponsors: Sponsor[];
};
