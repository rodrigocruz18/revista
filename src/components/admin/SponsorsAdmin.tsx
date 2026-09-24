"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  SPONSOR_CATEGORY_LABEL,
  SPONSOR_FULLPAGE_MIN_SIZE,
  SPONSOR_ICON_MIN_SIZE,
  SPONSOR_IMAGE_SPECS,
} from "@/config/sponsors";
import type { Sponsor, SponsorCategory } from "@/types/sponsor";
import { brandKey, sponsorDomain, uniqueBrands } from "@/lib/sponsorBrands";
import { coverCrop, type ImageCrop } from "@/lib/imageCrop";
import { ImageCropper } from "@/components/admin/ImageCropper";

type Props = {
  initialSponsors: Sponsor[];
  blobConfigured: boolean;
};

type UploadStage = "idle" | "icon" | "horizontal" | "vertical" | "fullpage" | "saving" | "done";

type PickedImage = { file: File; width: number; height: number };
/** A banner picked for cropping: `src` is a local object URL for preview. */
type PickedBanner = PickedImage & { src: string };

const BANNER_TYPES = "image/png,image/jpeg,image/webp";
const BANNER_MAX_BYTES = 10 * 1024 * 1024;

const FULLPAGE_RATIO = SPONSOR_FULLPAGE_MIN_SIZE.width / SPONSOR_FULLPAGE_MIN_SIZE.height;
const FULLPAGE_RATIO_TOLERANCE = 0.12; // +/-12% — real magazine pages vary a little, this isn't pixel-exact like the banners

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

/** Square within 3%, at least SPONSOR_ICON_MIN_SIZE per side. Returns an
 * error message, or null when the icon is acceptable. */
function iconProblem(width: number, height: number): string | null {
  const square = Math.abs(width - height) / Math.max(width, height) <= 0.03;
  if (!square || width < SPONSOR_ICON_MIN_SIZE || height < SPONSOR_ICON_MIN_SIZE) {
    return `El icono debe ser cuadrado y de al menos ${SPONSOR_ICON_MIN_SIZE}x${SPONSOR_ICON_MIN_SIZE}px (esta imagen mide ${width}x${height}px).`;
  }
  return null;
}

/** Each icon upload gets a fresh pathname, so replacing one is never masked
 * by a CDN-cached copy of the previous file at the same URL. */
function uploadIcon(sponsorId: string, file: File, onProgress?: (percentage: number) => void) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  return upload(`sponsors/${sponsorId}/icon-${Date.now()}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/admin/upload",
    contentType: file.type || undefined,
    onUploadProgress: onProgress ? (p) => onProgress(p.percentage) : undefined,
  });
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function SponsorsAdmin({ initialSponsors, blobConfigured }: Props) {
  const router = useRouter();
  const [sponsors, setSponsors] = useState(initialSponsors);
  // "" = new sponsor; otherwise the id of a record of an existing brand,
  // whose name/link/icon the new placement reuses.
  const [brandOf, setBrandOf] = useState("");
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [category, setCategory] = useState<SponsorCategory>("light");
  const [horizontal, setHorizontal] = useState<PickedBanner | null>(null);
  const [vertical, setVertical] = useState<PickedBanner | null>(null);
  const [horizontalCrop, setHorizontalCrop] = useState<ImageCrop | null>(null);
  const [verticalCrop, setVerticalCrop] = useState<ImageCrop | null>(null);
  const [fullPage, setFullPage] = useState<PickedImage | null>(null);
  const [icon, setIcon] = useState<PickedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const iconTargetRef = useRef<Sponsor | null>(null);

  const busy = stage !== "idle" && stage !== "done";
  const brands = uniqueBrands(sponsors).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const selectedBrand = brandOf ? sponsors.find((s) => s.id === brandOf) ?? null : null;
  // Placements of the same brand listed together.
  const sortedSponsors = [...sponsors].sort(
    (a, b) => a.name.localeCompare(b.name, "es") || brandKey(a).localeCompare(brandKey(b)) || a.category.localeCompare(b.category),
  );

  async function handlePickImage(
    event: ChangeEvent<HTMLInputElement>,
    slot: "icon" | "horizontal" | "vertical" | "fullpage",
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError(null);
    try {
      const { width, height } = await readImageDimensions(file);
      if (slot === "icon") {
        const problem = iconProblem(width, height);
        if (problem) {
          setImageError(problem);
          setIcon(null);
          event.target.value = "";
          return;
        }
        setIcon({ file, width, height });
      } else if (slot === "horizontal" || slot === "vertical") {
        if (file.size > BANNER_MAX_BYTES) {
          setImageError("La imagen supera los 10 MB. Usa una version mas liviana (JPG o WebP).");
          event.target.value = "";
          return;
        }
        // Any size is fine: the admin frames it in the cropper below.
        const banner: PickedBanner = { file, width, height, src: URL.createObjectURL(file) };
        pickBanner(slot, banner);
      } else {
        const { width: minW, height: minH } = SPONSOR_FULLPAGE_MIN_SIZE;
        const ratio = width / height;
        const ratioOk = Math.abs(ratio - FULLPAGE_RATIO) / FULLPAGE_RATIO <= FULLPAGE_RATIO_TOLERANCE;
        if (width < minW || height < minH || !ratioOk) {
          setImageError(
            `La imagen de pagina completa debe ser al menos ${minW}x${minH}px, en formato vertical similar a una hoja de revista (esta imagen mide ${width}x${height}px). Se recorta levemente para encajar, pero la proporcion debe ser parecida.`,
          );
          setFullPage(null);
          event.target.value = "";
          return;
        }
        setFullPage({ file, width, height });
      }
    } catch {
      setImageError("No se pudo leer la imagen seleccionada.");
      event.target.value = "";
    }
  }

  function pickBanner(slot: "horizontal" | "vertical", banner: PickedBanner) {
    const spec = SPONSOR_IMAGE_SPECS[slot];
    const crop = coverCrop(banner.width, banner.height, spec.width / spec.height);
    if (slot === "horizontal") {
      setHorizontal(banner);
      setHorizontalCrop(crop);
    } else {
      setVertical(banner);
      setVerticalCrop(crop);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedName = selectedBrand ? selectedBrand.name : name.trim();
    const trimmedUrl = targetUrl.trim();
    if (!selectedBrand) {
      if (!trimmedName) {
        setError("El nombre del auspiciador es obligatorio.");
        return;
      }
      if (!trimmedUrl || !isValidUrl(trimmedUrl)) {
        setError("La URL de destino no es valida (debe empezar con http:// o https://).");
        return;
      }
      if (!icon) {
        setError("Falta el icono del auspiciador.");
        return;
      }
    }
    if (category === "fullpage") {
      if (!fullPage) {
        setError("Falta la imagen de pagina completa.");
        return;
      }
    } else if (!horizontal || !vertical || !horizontalCrop || !verticalCrop) {
      setError("Faltan las 2 imagenes (horizontal y vertical) — ambas son obligatorias para Light/Premium.");
      return;
    }

    const id = crypto.randomUUID();

    try {
      let horizontalUrl: string | null = null;
      let verticalUrl: string | null = null;
      let fullPageUrl: string | null = null;

      let iconUrl: string | null = null;
      if (!selectedBrand && icon) {
        setStage("icon");
        setProgress(0);
        iconUrl = (await uploadIcon(id, icon.file, setProgress)).url;
      }

      if (category === "fullpage" && fullPage) {
        setStage("fullpage");
        setProgress(0);
        const ext = fullPage.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const blob = await upload(`sponsors/${id}/fullpage.${ext}`, fullPage.file, {
          access: "public",
          handleUploadUrl: "/api/admin/upload",
          contentType: fullPage.file.type || undefined,
          onUploadProgress: (p) => setProgress(p.percentage),
        });
        fullPageUrl = blob.url;
      } else if (horizontal && vertical) {
        setStage("horizontal");
        setProgress(0);
        const hExt = horizontal.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const hBlob = await upload(`sponsors/${id}/horizontal.${hExt}`, horizontal.file, {
          access: "public",
          handleUploadUrl: "/api/admin/upload",
          contentType: horizontal.file.type || undefined,
          onUploadProgress: (p) => setProgress(p.percentage),
        });
        horizontalUrl = hBlob.url;

        if (vertical.file === horizontal.file) {
          // Same original framed twice: upload it once, two crops.
          verticalUrl = horizontalUrl;
        } else {
          setStage("vertical");
          setProgress(0);
          const vExt = vertical.file.name.split(".").pop()?.toLowerCase() || "jpg";
          const vBlob = await upload(`sponsors/${id}/vertical.${vExt}`, vertical.file, {
            access: "public",
            handleUploadUrl: "/api/admin/upload",
            contentType: vertical.file.type || undefined,
            onUploadProgress: (p) => setProgress(p.percentage),
          });
          verticalUrl = vBlob.url;
        }
      }

      setStage("saving");
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: trimmedName,
          targetUrl: trimmedUrl,
          category,
          horizontalImageUrl: horizontalUrl,
          verticalImageUrl: verticalUrl,
          horizontalCrop: horizontalUrl ? horizontalCrop : null,
          verticalCrop: verticalUrl ? verticalCrop : null,
          fullPageImageUrl: fullPageUrl,
          iconUrl,
          brandOf: selectedBrand?.id,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sponsors?: Sponsor[] };
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el auspiciador.");

      setSponsors(data.sponsors ?? sponsors);
      setNotice(`"${trimmedName}" se agrego correctamente.`);
      setStage("done");
      formRef.current?.reset();
      setName("");
      setTargetUrl("");
      setCategory("light");
      setHorizontal(null);
      setVertical(null);
      setHorizontalCrop(null);
      setVerticalCrop(null);
      setFullPage(null);
      setIcon(null);
      setBrandOf("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo el auspiciador.");
    } finally {
      setStage((prev) => (prev === "done" ? "done" : "idle"));
      setTimeout(() => setStage("idle"), 1500);
    }
  }

  async function handleTogglePause(sponsor: Sponsor) {
    setBusyId(sponsor.id);
    setError(null);
    setNotice(null);
    const nextStatus = sponsor.status === "active" ? "paused" : "active";
    try {
      const res = await fetch(`/api/admin/sponsors/${sponsor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sponsors?: Sponsor[] };
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar el auspiciador.");
      setSponsors(data.sponsors ?? sponsors);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando el auspiciador.");
    } finally {
      setBusyId(null);
    }
  }

  function pickIconFor(sponsor: Sponsor) {
    iconTargetRef.current = sponsor;
    iconInputRef.current?.click();
  }

  async function handleReplaceIcon(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sponsor = iconTargetRef.current;
    event.target.value = "";
    if (!file || !sponsor) return;
    setError(null);
    setNotice(null);
    setBusyId(sponsor.id);
    try {
      const { width, height } = await readImageDimensions(file);
      const problem = iconProblem(width, height);
      if (problem) throw new Error(problem);
      const { url } = await uploadIcon(sponsor.id, file);
      const res = await fetch(`/api/admin/sponsors/${sponsor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconUrl: url }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sponsors?: Sponsor[] };
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el icono.");
      setSponsors(data.sponsors ?? sponsors);
      setNotice(`Icono de "${sponsor.name}" actualizado.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo el icono.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(sponsor: Sponsor) {
    if (!window.confirm(`Eliminar "${sponsor.name}"? Esta accion no se puede deshacer.`)) return;
    setBusyId(sponsor.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/sponsors/${sponsor.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sponsors?: Sponsor[] };
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar el auspiciador.");
      setSponsors(data.sponsors ?? sponsors.filter((s) => s.id !== sponsor.id));
      setNotice(`"${sponsor.name}" se elimino.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando el auspiciador.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-10">
      <h2 className="mb-1 font-serif text-xl text-white">Auspiciadores</h2>
      <p className="mb-4 text-sm text-white/50">
        Rotan en un banner junto a la revista. Light y Premium requieren 2 imagenes (de cualquier tamaño: eliges el encuadre al subirlas); Premium
        aparece con mayor frecuencia y mas tiempo en pantalla. Pagina completa simula una hoja extra de
        la revista al pasar de pagina (una sola imagen, sin medida exacta pero con proporcion vertical
        similar a una pagina).
      </p>

      {!blobConfigured && (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          <strong className="block">Vercel Blob no esta configurado.</strong>
          Sin un almacen de Blob conectado no se pueden guardar auspiciadores desde aqui.
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-brand">
            Auspiciador
          </label>
          <select
            id="sponsor-brand"
            value={brandOf}
            onChange={(e) => setBrandOf(e.target.value)}
            className="w-full max-w-md rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
          >
            <option value="" className="bg-[#0b0f0d]">+ Nuevo auspiciador</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id} className="bg-[#0b0f0d]">
                {brand.name} — {sponsorDomain(brand.targetUrl)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-white/40">
            Si el auspiciador ya existe y contrata otro tipo de publicidad, eligelo aqui: se usan su nombre, link e
            icono, y en el listado publico aparece una sola vez.
          </p>
        </div>

        {selectedBrand ? (
          <div className="flex items-center gap-3 rounded-xl bg-black/20 p-3">
            {selectedBrand.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedBrand.iconUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{selectedBrand.name}</p>
              <p className="truncate text-xs text-white/40">{selectedBrand.targetUrl}</p>
            </div>
          </div>
        ) : (
        <>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-name">
              Nombre *
            </label>
            <input
              id="sponsor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-url">
              URL de destino *
            </label>
            <input
              id="sponsor-url"
              type="url"
              placeholder="https://..."
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
            />
          </div>
        </div>

        </>
        )}

        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-category">
            Categoria *
          </label>
          <select
            id="sponsor-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as SponsorCategory);
              setImageError(null);
            }}
            className="w-full max-w-xs rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
          >
            <option value="light" className="bg-[#0b0f0d]">Light</option>
            <option value="premium" className="bg-[#0b0f0d]">Premium</option>
            <option value="fullpage" className="bg-[#0b0f0d]">Pagina completa (pagada)</option>
          </select>
        </div>

        {!selectedBrand && (
        <div>
          <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-icon">
            Icono * (cuadrado, minimo {SPONSOR_ICON_MIN_SIZE}x{SPONSOR_ICON_MIN_SIZE}px — PNG con fondo transparente recomendado)
          </label>
          <input
            id="sponsor-icon"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => handlePickImage(e, "icon")}
            className="w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20"
          />
          {icon && <p className="mt-1 text-xs text-emerald-400">Listo: {icon.width}x{icon.height}px</p>}
          <p className="mt-1 text-[11px] text-white/40">Se muestra en el listado publico de Auspiciadores (menu de la revista).</p>
        </div>
        )}

        {category === "fullpage" ? (
          <div>
            <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-fullpage">
              Imagen de pagina completa * (minimo {SPONSOR_FULLPAGE_MIN_SIZE.width}x{SPONSOR_FULLPAGE_MIN_SIZE.height}px, proporcion vertical de revista)
            </label>
            <input
              id="sponsor-fullpage"
              type="file"
              accept="image/*"
              onChange={(e) => handlePickImage(e, "fullpage")}
              className="w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20"
            />
            {fullPage && <p className="mt-1 text-xs text-emerald-400">Lista: {fullPage.width}x{fullPage.height}px</p>}
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-horizontal">
                Banner horizontal * (cualquier tamaño — se encuadra en formato {SPONSOR_IMAGE_SPECS.horizontal.width}x
                {SPONSOR_IMAGE_SPECS.horizontal.height})
              </label>
              <input
                id="sponsor-horizontal"
                type="file"
                accept={BANNER_TYPES}
                onChange={(e) => handlePickImage(e, "horizontal")}
                className="w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20"
              />
              <p className="mb-3 mt-1 text-[11px] text-white/40">Se muestra debajo de la revista en pantallas moviles.</p>
              {horizontal && (
                <ImageCropper
                  key={horizontal.src}
                  src={horizontal.src}
                  imageWidth={horizontal.width}
                  imageHeight={horizontal.height}
                  target={SPONSOR_IMAGE_SPECS.horizontal}
                  frameClassName="w-full max-w-xl"
                  onChange={setHorizontalCrop}
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60" htmlFor="sponsor-vertical">
                Banner vertical * (cualquier tamaño — se encuadra en formato {SPONSOR_IMAGE_SPECS.vertical.width}x
                {SPONSOR_IMAGE_SPECS.vertical.height})
              </label>
              <input
                id="sponsor-vertical"
                type="file"
                accept={BANNER_TYPES}
                onChange={(e) => handlePickImage(e, "vertical")}
                className="w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:transition hover:file:bg-white/20"
              />
              {horizontal && vertical?.file !== horizontal.file && (
                <button
                  type="button"
                  onClick={() => pickBanner("vertical", horizontal)}
                  className="mt-2 text-xs text-lime-300/90 underline-offset-2 hover:underline"
                >
                  Usar la misma imagen del banner horizontal
                </button>
              )}
              <p className="mb-3 mt-1 text-[11px] text-white/40">Se muestra a la izquierda de la revista en escritorio.</p>
              {vertical && (
                <ImageCropper
                  key={`${vertical.src}-vertical`}
                  src={vertical.src}
                  imageWidth={vertical.width}
                  imageHeight={vertical.height}
                  target={SPONSOR_IMAGE_SPECS.vertical}
                  frameClassName="h-80"
                  onChange={setVerticalCrop}
                />
              )}
            </div>
          </div>
        )}

        {imageError && <p className="text-sm text-red-400">{imageError}</p>}

        {busy && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-white/60">
              <span>
                {stage === "icon" && "Subiendo icono..."}
                {stage === "horizontal" && "Subiendo banner horizontal..."}
                {stage === "vertical" && "Subiendo banner vertical..."}
                {stage === "fullpage" && "Subiendo imagen de pagina completa..."}
                {stage === "saving" && "Guardando auspiciador..."}
              </span>
              {stage !== "saving" && <span>{Math.round(progress)}%</span>}
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
          disabled={busy || !blobConfigured}
          className="rounded-lg bg-white px-5 py-2 font-medium text-[#0b0f0d] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Guardando..." : "Agregar auspiciador"}
        </button>
      </form>

      <input
        ref={iconInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleReplaceIcon}
      />
      <h3 className="mb-4 font-serif text-lg text-white">Auspiciadores cargados ({sponsors.length})</h3>
      {sponsors.length === 0 ? (
        <p className="text-sm text-white/50">Aun no hay auspiciadores.</p>
      ) : (
        <ul className="space-y-3">
          {sortedSponsors.map((sponsor) => {
            const thumb = sponsor.horizontalImageUrl ?? sponsor.fullPageImageUrl ?? sponsor.verticalImageUrl;
            return (
              <li
                key={sponsor.id}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                {sponsor.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sponsor.iconUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-amber-300/40 text-center text-[10px] leading-tight text-amber-200/80">
                    Sin icono
                  </span>
                )}
                {thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="hidden h-14 w-20 rounded object-cover sm:block" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-white">
                    {sponsor.name}
                    <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs text-white/70">
                      {SPONSOR_CATEGORY_LABEL[sponsor.category]}
                    </span>
                    {sponsor.status === "paused" && (
                      <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
                        Pausado
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-white/40">{sponsor.targetUrl}</p>
                </div>
                <button
                  onClick={() => pickIconFor(sponsor)}
                  disabled={busyId === sponsor.id || !blobConfigured}
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sponsor.iconUrl ? "Cambiar icono" : "Subir icono"}
                </button>
                <button
                  onClick={() => handleTogglePause(sponsor)}
                  disabled={busyId === sponsor.id}
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sponsor.status === "active" ? "Pausar" : "Reanudar"}
                </button>
                <button
                  onClick={() => handleDelete(sponsor)}
                  disabled={busyId === sponsor.id}
                  className="shrink-0 rounded-lg border border-red-400/30 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Eliminar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
