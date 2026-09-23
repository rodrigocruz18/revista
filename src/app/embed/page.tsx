import { getAllEditions } from "@/lib/magazines";
import { EditionsWidget } from "@/components/embed/EditionsWidget";
import { magazineConfig } from "@/config/magazine";
import "./embed.css";

export const metadata = {
  title: `${magazineConfig.name} · Widget`,
  robots: { index: false, follow: false },
};

// Same as /revista: the manifest can change at any time from /admin, so a
// newly published edition must show up in every embed without a redeploy.
export const dynamic = "force-dynamic";

/**
 * Embeddable widget for third-party sites:
 *   <iframe src="https://<deploy>/embed" style="border:0;width:100%;height:420px"></iframe>
 * Framing is explicitly allowed for this route in next.config.ts.
 */
export default async function EmbedPage() {
  const editions = await getAllEditions();
  return <EditionsWidget editions={editions} siteUrl={magazineConfig.siteUrl} />;
}
