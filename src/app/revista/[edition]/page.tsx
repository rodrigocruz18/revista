import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAllEditions, getEditionBySlug } from "@/lib/magazines";
import { Reader } from "@/components/reader/Reader";
import { Preloader } from "@/components/ui/Preloader";

export function generateStaticParams() {
  return getAllEditions().map((edition) => ({ edition: edition.slug }));
}

export default async function EditionPage({ params }: PageProps<"/revista/[edition]">) {
  const { edition: slug } = await params;
  const edition = getEditionBySlug(slug);
  const allEditions = getAllEditions();

  if (!edition) notFound();

  return (
    <Suspense fallback={<Preloader editionLabel={edition.editionLabel} />}>
      <Reader edition={edition} allEditions={allEditions} />
    </Suspense>
  );
}
