import type { Magazine } from "@/types/magazine";
import { MagazineCard } from "@/components/archive/MagazineCard";

export function MagazineArchive({ editions }: { editions: Magazine[] }) {
  if (editions.length === 0) {
    return (
      <p className="py-16 text-center text-white/50">No hay ediciones disponibles.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {editions.map((edition) => (
        <MagazineCard key={edition.slug} edition={edition} />
      ))}
    </div>
  );
}
