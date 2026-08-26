"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { MONTHS_ES } from "@/config/magazine";
import type { Magazine } from "@/types/magazine";

type Props = {
  initialEditions: Magazine[];
  blobConfigured: boolean;
};

type UploadStage = "idle" | "pdf" | "cover" | "saving" | "done";

const currentYear = () => new Date().getFullYear();

export function AdminDashboard({ initialEditions, blobConfigured }: Props) {
  const router = useRouter();
  const [editions, setEditions] = useState(initialEditions);
  const [year, setYear] = useState(() => String(currentYear()));
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1));
  const [label, setLabel] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const busy = stage !== "idle" && stage !== "done";
  const existingSlug = `${year}-${String(month).padStart(2, "0")}`;
  const willReplace = editions.some((edition) => edition.slug === existingSlug);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const yearNum = Number(year);
    const monthNum = Number(month);
    if (!pdfFile) {
      setError("Selecciona el archivo PDF de la edicion.");
      return;
    }
    if (!Number.isInteger(yearNum) || !Number.isInteger(monthNum)) {
      setError("Ano y mes son obligatorios.");
      return;
    }

    const slug = `${yearNum}-${String(monthNum).padStart(2, "0")}`;
    const editionLabel = label.trim() || `${MONTHS_ES[monthNum - 1]} ${yearNum}`;

    try {
      setStage("pdf");
      setProgress(0);
      const pdfBlob = await upload(`magazines/${slug}.pdf`, pdfFile, {
        access: "public",
        handleUploadUrl: "/api/admin/upload",
        contentType: "application/pdf",
        multipart: true,
        onUploadProgress: (p) => setProgress(p.percentage),
      });

      let coverUrl: string | null = null;
      if (coverFile) {
        setStage("cover");
        setProgress(0);
        const ext = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const coverBlob = await upload(`magazines/covers/${slug}.${ext}`, coverFile, {
          access: "public",
          handleUploadUrl: "/api/admin/upload",
          contentType: coverFile.type || undefined,
          onUploadProgress: (p) => setProgress(p.percentage),
        });
        coverUrl = coverBlob.url;
      }

      setStage("saving");
      const res = await fetch("/api/admin/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: yearNum,
          month: monthNum,
          editionLabel,
          pdfUrl: pdfBlob.url,
          pdfFilename: pdfBlob.pathname.split("/").pop(),
          coverUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; editions?: Magazine[] };
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la edicion.");

      setEditions(data.editions ?? editions);
      setNotice(`"${editionLabel}" se publico correctamente.`);
      setStage("done");
      formRef.current?.reset();
      setPdfFile(null);
      setCoverFile(null);
      setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo la edicion.");
    } finally {
      setStage((prev) => (prev === "done" ? "done" : "idle"));
      setTimeout(() => setStage("idle"), 1500);
    }
  }

  async function handleDelete(slug: string, editionLabel: string) {
    if (!window.confirm(`Eliminar "${editionLabel}"? Esta accion no se puede deshacer.`)) return;
    setDeletingSlug(slug);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/editions/${slug}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; editions?: Magazine[] };
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar la edicion.");
      setEditions(data.editions ?? editions.filter((e) => e.slug !== slug));
      setNotice(`"${editionLabel}" se elimino.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando la edicion.");
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f0d] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="font-serif text-2xl text-white sm:text-3xl">Panel de administracion</h1>
            <p className="text-sm text-white/50">Publica y elimina ediciones sin pasar por GitHub/Vercel.</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Cerrar sesion
          </button>
        </header>

        {!blobConfigured && (
          <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
            <strong className="block">Vercel Blob no esta configurado.</strong>
            Conecta un almacen de Blob al proyecto en Vercel (Storage → Create Database → Blob) para
            poder publicar ediciones desde aqui. Sin eso, esta pagina puede mostrar el listado actual
            pero no puede guardar cambios.
          </div>
        )}

        <section className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 font-serif text-xl text-white">Publicar nueva edicion</h2>
          <form ref={formRef} onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-white/60" htmlFor="admin-year">
                  Ano
                </label>
                <input
                  id="admin-year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/60" htmlFor="admin-month">
                  Mes
                </label>
                <select
                  id="admin-month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
                >
                  {MONTHS_ES.map((name, index) => (
                    <option key={name} value={index + 1} className="bg-[#0b0f0d]">
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-white/60" htmlFor="admin-label">
                  Etiqueta (opcional)
                </label>
                <input
                  id="admin-label"
                  type="text"
                  placeholder={`${MONTHS_ES[Number(month) - 1]} ${year}`}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
                />
              </div>
            </div>

            {willReplace && (
              <p className="text-xs text-amber-300">
                Ya existe una edicion para este mes — se reemplazara.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-white/60" htmlFor="admin-pdf">
                  PDF de la revista *
                </label>
                <input
                  id="admin-pdf"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/60" htmlFor="admin-cover">
                  Portada (opcional)
                </label>
                <input
                  id="admin-cover"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20"
                />
              </div>
            </div>

            {busy && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-white/60">
                  <span>
                    {stage === "pdf" && "Subiendo PDF..."}
                    {stage === "cover" && "Subiendo portada..."}
                    {stage === "saving" && "Guardando edicion..."}
                  </span>
                  {(stage === "pdf" || stage === "cover") && <span>{Math.round(progress)}%</span>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-white transition-[width]"
                    style={{ width: `${stage === "saving" ? 100 : progress}%` }}
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            {notice && <p className="text-sm text-emerald-400">{notice}</p>}

            <button
              type="submit"
              disabled={busy || !blobConfigured || !pdfFile}
              className="rounded-lg bg-white px-5 py-2 font-medium text-[#0b0f0d] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Publicando..." : "Publicar edicion"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 font-serif text-xl text-white">Ediciones publicadas ({editions.length})</h2>
          {editions.length === 0 ? (
            <p className="text-sm text-white/50">Aun no hay ediciones publicadas.</p>
          ) : (
            <ul className="space-y-3">
              {editions.map((edition) => (
                <li
                  key={edition.slug}
                  className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={edition.coverUrl ?? "/brand/ace-icon.png"}
                    alt=""
                    className="h-16 w-12 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-white">
                      {edition.editionLabel}
                      {edition.isCurrent && (
                        <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs text-white/70">
                          Actual
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-white/40">{edition.slug} · {edition.filename}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(edition.slug, edition.editionLabel)}
                    disabled={deletingSlug === edition.slug}
                    className="shrink-0 rounded-lg border border-red-400/30 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingSlug === edition.slug ? "Eliminando..." : "Eliminar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
