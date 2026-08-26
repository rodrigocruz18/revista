import Link from "next/link";
import { getAllEditions } from "@/lib/magazines";
import { MagazineArchive } from "@/components/archive/MagazineArchive";
import { magazineConfig } from "@/config/magazine";

export const metadata = {
  title: `Ediciones anteriores · ${magazineConfig.name}`,
};

export default async function ArchivoPage() {
  const editions = await getAllEditions();

  return (
    <main className="min-h-screen bg-[#0b0f0d] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <Link href="/revista" className="flex items-center gap-2 font-serif text-sm text-white/70 transition hover:text-white">
            <span aria-hidden>←</span> Volver a la revista
          </Link>
          <h1 className="font-serif text-2xl tracking-wide text-white sm:text-3xl">Ediciones anteriores</h1>
          <span className="w-24" />
        </header>
        <MagazineArchive editions={editions} />
      </div>
    </main>
  );
}
