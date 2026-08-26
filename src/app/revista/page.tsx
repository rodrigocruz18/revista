import { Suspense } from "react";
import { getAllEditions, getCurrentEdition } from "@/lib/magazines";
import { Reader } from "@/components/reader/Reader";
import { Preloader } from "@/components/ui/Preloader";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * The magazine's permanent front door. Always renders whichever edition has
 * the newest YYYY-MM prefix in /public/magazines — nothing here hardcodes a
 * date, so publishing next month's PDF is the only thing that has to change.
 */
export default function RevistaPage() {
  const edition = getCurrentEdition();
  const allEditions = getAllEditions();

  if (!edition) {
    return (
      <ErrorState
        title="Aun no hay ediciones publicadas"
        message="No hay ediciones disponibles. Agrega un PDF en /public/magazines con el formato YYYY-MM-nombre.pdf."
      />
    );
  }

  return (
    <Suspense fallback={<Preloader editionLabel={edition.editionLabel} />}>
      <Reader edition={edition} allEditions={allEditions} />
    </Suspense>
  );
}
