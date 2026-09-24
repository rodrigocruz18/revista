import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAllEditions, getEditionBySlug } from "@/lib/magazines";
import { getActiveSponsors } from "@/lib/sponsors";
import { readSponsorSettings } from "@/lib/sponsorSettingsStore";
import { Reader } from "@/components/reader/Reader";
import { Preloader } from "@/components/ui/Preloader";

// No generateStaticParams here on purpose: editions are runtime data from
// Blob now (published any time via /admin), not something known at build
// time. force-dynamic makes every request read the live manifest instead of
// Next prerendering a snapshot from whatever existed at the last deploy.
export const dynamic = "force-dynamic";

export default async function EditionPage({ params }: PageProps<"/revista/[edition]">) {
  const { edition: slug } = await params;
  const edition = await getEditionBySlug(slug);
  const allEditions = await getAllEditions();

  if (!edition) notFound();

  const [sponsors, sponsorSettings] = await Promise.all([getActiveSponsors(), readSponsorSettings()]);

  return (
    <Suspense fallback={<Preloader editionLabel={edition.editionLabel} />}>
      <Reader edition={edition} allEditions={allEditions} sponsors={sponsors} sponsorSettings={sponsorSettings} />
    </Suspense>
  );
}
