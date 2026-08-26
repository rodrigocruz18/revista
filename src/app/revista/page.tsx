import { Suspense } from "react";
import { getAllEditions, getCurrentEdition } from "@/lib/magazines";
import { Reader } from "@/components/reader/Reader";
import { Preloader } from "@/components/ui/Preloader";
import { ErrorState } from "@/components/ui/ErrorState";

// The manifest now lives in Vercel Blob and can change at any time via
// /admin, with no redeploy — this page has to hit it on every request
// instead of letting Next prerender a static snapshot from build time
// (which is what silently made freshly-published editions invisible until
// the next deploy).
export const dynamic = "force-dynamic";

/**
 * The magazine's permanent front door. Always renders whichever edition is
 * marked current in the manifest — nothing here hardcodes a date, so
 * publishing next month's PDF from /admin is the only thing that has to
 * change.
 */
export default async function RevistaPage() {
  const edition = await getCurrentEdition();
  const allEditions = await getAllEditions();

  if (!edition) {
    return (
      <ErrorState
        title="Aun no hay ediciones publicadas"
        message="No hay ediciones disponibles todavia. Publica una desde /admin."
      />
    );
  }

  return (
    <Suspense fallback={<Preloader editionLabel={edition.editionLabel} />}>
      <Reader edition={edition} allEditions={allEditions} />
    </Suspense>
  );
}
