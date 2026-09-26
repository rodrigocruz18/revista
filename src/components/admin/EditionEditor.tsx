"use client";

import { useState } from "react";
import { MONTHS_ES } from "@/config/magazine";
import type { Magazine } from "@/types/magazine";
import { uploadAdminFile } from "@/lib/adminUpload";
import { COVER_IMAGE_WIDTH, renderPdfCoverBlob } from "@/lib/pdfCover";
import { cn } from "@/lib/utils";

type CoverMode = "keep" | "generate" | "upload";
type Stage = "idle" | "pdf" | "cover" | "saving";

const inputClass =
  "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40";
const fileClass =
  "w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20";

/**
 * Inline editor for a published edition: title, month/year, and replacing
 * its PDF and/or cover. New files are uploaded straight to Blob first; the
 * PATCH then swaps the URLs and deletes the replaced files.
 */
export function EditionEditor({
  edition,
  onSaved,
  onCancel,
}: {
  edition: Magazine;
  onSaved: (editions: Magazine[], message: string) => void;
  onCancel: () => void;
}) {
  const defaultLabel = `${MONTHS_ES[edition.month - 1]} ${edition.year}`;
  const [label, setLabel] = useState(edition.editionLabel === defaultLabel ? "" : edition.editionLabel);
  const [year, setYear] = useState(String(edition.year));
  const [month, setMonth] = useState(String(edition.month));
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverMode, setCoverMode] = useState<CoverMode>("keep");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== "idle";
  const yearNum = Number(year);
  const monthNum = Number(month);
  const newSlug = `${yearNum}-${String(monthNum).padStart(2, "0")}`;
  const movesUrl = newSlug !== edition.slug;

  async function handleSave() {
    setError(null);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      setError("Ano invalido.");
      return;
    }
    if (coverMode === "upload" && !coverFile) {
      setError("Selecciona la imagen de portada o elige otra opcion.");
      return;
    }

    try {
      const changes: Record<string, unknown> = {
        editionLabel: label.trim() || `${MONTHS_ES[monthNum - 1]} ${yearNum}`,
        year: yearNum,
        month: monthNum,
      };

      if (pdfFile) {
        setStage("pdf");
        setProgress(0);
        const pdf = await uploadAdminFile(`magazines/${newSlug}`, pdfFile, setProgress);
        changes.pdfUrl = pdf.url;
        changes.pdfFilename = pdf.pathname.split("/").pop();
      }

      if (coverMode === "upload" && coverFile) {
        setStage("cover");
        setProgress(0);
        changes.coverUrl = (await uploadAdminFile(`magazines/covers/${newSlug}`, coverFile, setProgress)).url;
      } else if (coverMode === "generate") {
        setStage("cover");
        setProgress(100);
        const source = pdfFile ? await pdfFile.arrayBuffer() : edition.url;
        const { blob } = await renderPdfCoverBlob(source, COVER_IMAGE_WIDTH);
        const file = new File([blob], `${newSlug}.jpg`, { type: "image/jpeg" });
        changes.coverUrl = (await uploadAdminFile(`magazines/covers/${newSlug}`, file)).url;
      }

      setStage("saving");
      const res = await fetch(`/api/admin/editions/${edition.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; editions?: Magazine[] };
      if (!res.ok || !data.editions) throw new Error(data.error ?? "No se pudo guardar la edicion.");
      onSaved(data.editions, `"${String(changes.editionLabel)}" se actualizo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando la edicion.");
      setStage("idle");
    }
  }

  return (
    <div className="mt-3 space-y-5 border-t border-white/10 pt-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor={`ed-label-${edition.slug}`}>
            Titulo
          </label>
          <input
            id={`ed-label-${edition.slug}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`${MONTHS_ES[monthNum - 1] ?? ""} ${year}`}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor={`ed-month-${edition.slug}`}>
            Mes
          </label>
          <select
            id={`ed-month-${edition.slug}`}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={inputClass}
          >
            {MONTHS_ES.map((name, i) => (
              <option key={name} value={i + 1} className="bg-[#0b0f0d]">
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor={`ed-year-${edition.slug}`}>
            Ano
          </label>
          <input
            id={`ed-year-${edition.slug}`}
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={cn(inputClass, "w-28")}
          />
        </div>
      </div>
      {movesUrl && (
        <p className="-mt-2 text-[11px] text-amber-200/80">
          La edicion pasara a /revista/{newSlug}. Los enlaces compartidos a /revista/{edition.slug} dejaran de funcionar.
        </p>
      )}

      <div>
        <label className="mb-1 block text-xs text-white/60" htmlFor={`ed-pdf-${edition.slug}`}>
          Reemplazar PDF <span className="text-white/35">(actual: {edition.filename})</span>
        </label>
        <input
          id={`ed-pdf-${edition.slug}`}
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setPdfFile(file);
            // A new PDF usually means a new front page: regenerate unless the admin chose otherwise.
            if (file && coverMode === "keep") setCoverMode("generate");
          }}
          className={fileClass}
        />
      </div>

      <div>
        <p className="mb-2 text-xs text-white/60">Portada</p>
        <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={edition.coverUrl ?? "/brand/ace-icon.png"}
            alt=""
            className="h-24 w-[4.25rem] shrink-0 rounded object-cover ring-1 ring-white/10"
          />
          <div className="space-y-2 text-sm text-white/75">
            {(
              [
                ["keep", "Mantener la actual"],
                ["generate", pdfFile ? "Generar desde la pagina 1 del nuevo PDF" : "Regenerar desde la pagina 1 del PDF"],
                ["upload", "Subir una imagen"],
              ] as [CoverMode, string][]
            ).map(([mode, text]) => (
              <label key={mode} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`ed-cover-${edition.slug}`}
                  checked={coverMode === mode}
                  onChange={() => setCoverMode(mode)}
                  className="accent-lime-300"
                />
                {text}
              </label>
            ))}
            {coverMode === "upload" && (
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                className={fileClass}
              />
            )}
          </div>
        </div>
      </div>

      {busy && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-white/60">
            <span>
              {stage === "pdf" && "Subiendo PDF..."}
              {stage === "cover" && (coverMode === "generate" ? "Generando portada..." : "Subiendo portada...")}
              {stage === "saving" && "Guardando..."}
            </span>
            {stage !== "saving" && <span>{Math.round(progress)}%</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${stage === "saving" ? 100 : progress}%` }} />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-lg bg-white px-5 py-2 font-medium text-[#0b0f0d] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Guardando..." : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm text-white/60 transition hover:text-white disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
