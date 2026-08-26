import Link from "next/link";

export default function EditionNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0f0d] px-6 text-center text-white">
      <span className="text-3xl" aria-hidden>
        🎾
      </span>
      <h1 className="font-serif text-xl">Edicion no encontrada</h1>
      <p className="max-w-sm text-sm text-white/50">
        Esta edicion no existe o ya no esta disponible.
      </p>
      <Link
        href="/archivo"
        className="mt-2 rounded-full bg-lime-300 px-5 py-2 text-sm font-medium text-black transition hover:bg-lime-200"
      >
        Ver ediciones anteriores
      </Link>
    </div>
  );
}
