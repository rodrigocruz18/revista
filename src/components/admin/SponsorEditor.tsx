"use client";

import { useEffect, useState } from "react";
import {
  SPONSOR_CATEGORY_LABEL,
  SPONSOR_ICON_MIN_SIZE,
  SPONSOR_IMAGE_SPECS,
  fullPageImageProblem,
} from "@/config/sponsors";
import type { Sponsor, SponsorCategory } from "@/types/sponsor";
import { coverCrop, type ImageCrop } from "@/lib/imageCrop";
import { readImageSize, uploadAdminFile } from "@/lib/adminUpload";
import { ImageCropper } from "@/components/admin/ImageCropper";

type Slot = "horizontal" | "vertical";

/** A banner in the editor: the saved image, or a newly picked file. */
type Banner = { src: string; width: number; height: number; file: File | null };

const IMAGE_TYPES = "image/png,image/jpeg,image/webp";
const BANNER_MAX_BYTES = 10 * 1024 * 1024;
const inputClass =
  "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40";
const fileClass =
  "w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20";

/**
 * Inline editor for an existing sponsor placement: name and link (shared by
 * every placement of the advertiser), icon, category, and its images —
 * banners can be re-framed from their saved crop or replaced; the full-page
 * image can be replaced. New files upload straight to Blob; the PATCH then
 * records them and deletes whatever is no longer used.
 */
export function SponsorEditor({
  sponsor,
  placements,
  onSaved,
  onCancel,
}: {
  sponsor: Sponsor;
  /** How many placements this advertiser has (name/link/icon apply to all). */
  placements: number;
  onSaved: (sponsors: Sponsor[], message: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(sponsor.name);
  const [targetUrl, setTargetUrl] = useState(sponsor.targetUrl);
  const [category, setCategory] = useState<SponsorCategory>(sponsor.category);
  const [icon, setIcon] = useState<File | null>(null);
  const [banners, setBanners] = useState<Record<Slot, Banner | null>>({ horizontal: null, vertical: null });
  const [crops, setCrops] = useState<Record<Slot, ImageCrop | null>>({
    horizontal: sponsor.horizontalCrop ?? null,
    vertical: sponsor.verticalCrop ?? null,
  });
  const [loadingBanners, setLoadingBanners] = useState(Boolean(sponsor.horizontalImageUrl || sponsor.verticalImageUrl));
  const [fullPage, setFullPage] = useState<File | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The cropper needs the saved banners' pixel size before it can reopen them.
  useEffect(() => {
    let cancelled = false;
    const load = async (url: string | null): Promise<Banner | null> =>
      url ? { src: url, file: null, ...(await readImageSize(url)) } : null;
    Promise.all([load(sponsor.horizontalImageUrl), load(sponsor.verticalImageUrl)])
      .then(([horizontal, vertical]) => {
        if (!cancelled) setBanners({ horizontal, vertical });
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar los banners actuales; puedes reemplazarlos.");
      })
      .finally(() => {
        if (!cancelled) setLoadingBanners(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sponsor.horizontalImageUrl, sponsor.verticalImageUrl]);

  function pickBanner(slot: Slot, banner: Banner) {
    const spec = SPONSOR_IMAGE_SPECS[slot];
    setBanners((prev) => ({ ...prev, [slot]: banner }));
    setCrops((prev) => ({ ...prev, [slot]: coverCrop(banner.width, banner.height, spec.width / spec.height) }));
  }

  async function handleBannerFile(slot: Slot, file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > BANNER_MAX_BYTES) {
      setError("La imagen supera los 10 MB. Usa una version mas liviana (JPG o WebP).");
      return;
    }
    const size = await readImageSize(file);
    pickBanner(slot, { src: URL.createObjectURL(file), file, ...size });
  }

  async function handleSave() {
    setError(null);
    const trimmedName = name.trim();
    const trimmedUrl = targetUrl.trim();
    if (!trimmedName) return setError("El nombre es obligatorio.");
    try {
      const url = new URL(trimmedUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      return setError("La URL de destino no es valida (debe empezar con http:// o https://).");
    }

    try {
      if (icon) {
        const { width, height } = await readImageSize(icon);
        const square = Math.abs(width - height) / Math.max(width, height) <= 0.03;
        if (!square || width < SPONSOR_ICON_MIN_SIZE) {
          return setError(`El icono debe ser cuadrado y de al menos ${SPONSOR_ICON_MIN_SIZE}x${SPONSOR_ICON_MIN_SIZE}px.`);
        }
      }
      if (category === "fullpage") {
        if (!fullPage && !sponsor.fullPageImageUrl) return setError("Falta la imagen de pagina completa.");
        if (fullPage) {
          const size = await readImageSize(fullPage);
          const problem = fullPageImageProblem(size.width, size.height);
          if (problem) return setError(problem);
        }
      } else if (!banners.horizontal || !banners.vertical) {
        return setError("Faltan las 2 imagenes (horizontal y vertical) — ambas son obligatorias para Light/Premium.");
      }

      const changes: Record<string, unknown> = { category };
      if (trimmedName !== sponsor.name) changes.name = trimmedName;
      if (trimmedUrl !== sponsor.targetUrl) changes.targetUrl = trimmedUrl;
      if (icon) {
        setSaving("Subiendo icono...");
        changes.iconUrl = (await uploadAdminFile(`sponsors/${sponsor.id}/icon`, icon)).url;
      }

      if (category === "fullpage") {
        if (fullPage) {
          setSaving("Subiendo imagen de pagina completa...");
          changes.fullPageImageUrl = (await uploadAdminFile(`sponsors/${sponsor.id}/fullpage`, fullPage)).url;
        }
      } else {
        const uploaded = new Map<File, string>();
        for (const slot of ["horizontal", "vertical"] as const) {
          const banner = banners[slot]!;
          let src = banner.src;
          if (banner.file) {
            // The same picked file framed twice is uploaded once.
            src = uploaded.get(banner.file) ?? "";
            if (!src) {
              setSaving(`Subiendo banner ${slot}...`);
              src = (await uploadAdminFile(`sponsors/${sponsor.id}/${slot}`, banner.file)).url;
              uploaded.set(banner.file, src);
            }
          }
          changes[`${slot}ImageUrl`] = src;
          changes[`${slot}Crop`] = crops[slot];
        }
      }

      setSaving("Guardando...");
      const res = await fetch(`/api/admin/sponsors/${sponsor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sponsors?: Sponsor[] };
      if (!res.ok || !data.sponsors) throw new Error(data.error ?? "No se pudo guardar el auspiciador.");
      onSaved(data.sponsors, `"${trimmedName}" se actualizo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando el auspiciador.");
    } finally {
      setSaving(null);
    }
  }

  const bannerField = (slot: Slot, label: string, hint: string, frameClassName: string) => {
    const banner = banners[slot];
    const spec = SPONSOR_IMAGE_SPECS[slot];
    return (
      <div>
        <p className="mb-1 text-xs text-white/60">
          {label} <span className="text-white/35">(se encuadra en formato {spec.width}x{spec.height})</span>
        </p>
        <input type="file" accept={IMAGE_TYPES} onChange={(e) => handleBannerFile(slot, e.target.files?.[0])} className={fileClass} />
        {slot === "vertical" && banners.horizontal && banner?.src !== banners.horizontal.src && (
          <button
            type="button"
            onClick={() => pickBanner("vertical", banners.horizontal!)}
            className="mt-2 text-xs text-lime-300/90 underline-offset-2 hover:underline"
          >
            Usar la misma imagen del banner horizontal
          </button>
        )}
        <p className="mb-3 mt-1 text-[11px] text-white/40">{hint}</p>
        {loadingBanners ? (
          <p className="text-xs text-white/40">Cargando imagen actual...</p>
        ) : banner ? (
          <ImageCropper
            key={`${banner.src}-${slot}`}
            src={banner.src}
            imageWidth={banner.width}
            imageHeight={banner.height}
            target={spec}
            frameClassName={frameClassName}
            initialCrop={banner.file ? null : crops[slot]}
            onChange={(crop) => setCrops((prev) => ({ ...prev, [slot]: crop }))}
          />
        ) : (
          <p className="text-xs text-amber-200/80">Sin imagen: sube una para este formato.</p>
        )}
      </div>
    );
  };

  return (
    <div className="mt-3 space-y-5 border-t border-white/10 pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor={`sp-name-${sponsor.id}`}>
            Nombre
          </label>
          <input id={`sp-name-${sponsor.id}`} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor={`sp-url-${sponsor.id}`}>
            URL de destino
          </label>
          <input
            id={`sp-url-${sponsor.id}`}
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {placements > 1 && (
        <p className="-mt-2 text-[11px] text-white/45">
          Nombre, link e icono se aplican a las {placements} publicidades de este auspiciador.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor={`sp-cat-${sponsor.id}`}>
            Categoria
          </label>
          <select
            id={`sp-cat-${sponsor.id}`}
            value={category}
            onChange={(e) => setCategory(e.target.value as SponsorCategory)}
            className={inputClass}
          >
            {(Object.keys(SPONSOR_CATEGORY_LABEL) as SponsorCategory[]).map((value) => (
              <option key={value} value={value} className="bg-[#0b0f0d]">
                {SPONSOR_CATEGORY_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs text-white/60">Reemplazar icono (opcional)</p>
          <input type="file" accept={IMAGE_TYPES} onChange={(e) => setIcon(e.target.files?.[0] ?? null)} className={fileClass} />
        </div>
      </div>

      {category === "fullpage" ? (
        <div>
          <p className="mb-1 text-xs text-white/60">
            Imagen de pagina completa {sponsor.fullPageImageUrl ? "(opcional: reemplaza la actual)" : "*"}
          </p>
          <div className="flex items-start gap-4">
            {sponsor.fullPageImageUrl && !fullPage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sponsor.fullPageImageUrl} alt="" className="h-28 w-20 shrink-0 rounded object-cover ring-1 ring-white/10" />
            )}
            <input type="file" accept={IMAGE_TYPES} onChange={(e) => setFullPage(e.target.files?.[0] ?? null)} className={fileClass} />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {bannerField("horizontal", "Banner horizontal", "Arrastra para re-encuadrar, o sube otra imagen.", "w-full max-w-xl")}
          {bannerField("vertical", "Banner vertical", "Arrastra para re-encuadrar, o sube otra imagen.", "h-80")}
        </div>
      )}

      {saving && <p className="text-xs text-white/60">{saving}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={Boolean(saving) || loadingBanners}
          className="rounded-lg bg-white px-5 py-2 font-medium text-[#0b0f0d] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={Boolean(saving)}
          className="rounded-lg px-3 py-2 text-sm text-white/60 transition hover:text-white disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
