"use client";

import { useEffect, useRef, useState } from "react";
import { cropAt, cropImageStyle, minZoom, type ImageCrop } from "@/lib/imageCrop";
import { cn } from "@/lib/utils";

const MAX_ZOOM = 4;
const BG_SWATCHES = ["#ffffff", "#000000", "#0b0f0d"];

type Props = {
  src: string;
  imageWidth: number;
  imageHeight: number;
  /** The standard frame the image has to fill (e.g. 640x200 for the
   * horizontal banner). Only its ratio shapes the crop; its width is the
   * resolution below which the result is flagged as blurry. */
  target: { width: number; height: number };
  /** CSS sizing for the on-screen frame (its aspect ratio is set here). */
  frameClassName: string;
  onChange: (crop: ImageCrop) => void;
};

/**
 * Pan/zoom cropper: a frame with the banner's exact proportions over the
 * uploaded image — drag to choose what shows, zoom with the slider or the
 * mouse wheel. Zooming out past "fill" fits the whole image and fills the
 * rest of the frame with a background color. Nothing is re-encoded: the
 * result is an ImageCrop applied to the original file at display time, with
 * the same cropImageStyle() the reader uses, so this preview is exact.
 *
 * Mount with a `key` per picked file — initial framing (centered fill) is
 * taken on mount.
 */
export function ImageCropper({ src, imageWidth, imageHeight, target, frameClassName, onChange }: Props) {
  const ratio = target.width / target.height;
  const zoomFloor = Math.min(1, minZoom(imageWidth, imageHeight, ratio));
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [bg, setBg] = useState("#ffffff");
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);

  const base = cropAt(imageWidth, imageHeight, ratio, zoom, center.x, center.y);
  const showsBackground = base.w > 1.0001 || base.h > 1.0001;
  const crop: ImageCrop = showsBackground ? { ...base, bg } : base;
  const usefulWidth = Math.round(base.w * imageWidth);
  const lowResolution = usefulWidth < target.width * 0.9;

  // Report every change; parent stores it alongside the picked file.
  const cropKey = `${crop.x},${crop.y},${crop.w},${crop.h},${crop.bg ?? ""}`;
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current(crop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cropKey captures crop by value
  }, [cropKey]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((z) => clampZoom(z * Math.exp(-event.deltaY * 0.0015), zoomFloor));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomFloor]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    // Start from the clamped position, so dragging never has to "undo"
    // overshoot accumulated against an edge.
    dragRef.current = { px: event.clientX, py: event.clientY, cx: base.x + base.w / 2, cy: base.y + base.h / 2 };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const rect = frame.getBoundingClientRect();
    // One frame-width of drag moves the view by exactly one crop-width.
    setCenter({
      x: drag.cx - ((event.clientX - drag.px) / rect.width) * base.w,
      y: drag.cy - ((event.clientY - drag.py) / rect.height) * base.h,
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
    setCenter({ x: base.x + base.w / 2, y: base.y + base.h / 2 });
  };

  const nudge = (dx: number, dy: number) =>
    setCenter({ x: base.x + base.w / 2 + dx * base.w, y: base.y + base.h / 2 + dy * base.h });

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        tabIndex={0}
        role="application"
        aria-label="Encuadre del banner: arrastra para mover, rueda o flechas para ajustar"
        className={cn(
          "relative touch-none select-none overflow-hidden rounded-lg outline-none ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-lime-300",
          dragging ? "cursor-grabbing" : "cursor-grab",
          frameClassName,
        )}
        style={{ aspectRatio: `${target.width} / ${target.height}`, background: crop.bg ?? "transparent" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.02;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          if (moves[event.key]) {
            event.preventDefault();
            nudge(...moves[event.key]);
          } else if (event.key === "+" || event.key === "=") {
            setZoom((z) => clampZoom(z * 1.1, zoomFloor));
          } else if (event.key === "-") {
            setZoom((z) => clampZoom(z / 1.1, zoomFloor));
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} style={cropImageStyle(crop)} />
        {/* Rule-of-thirds guide while dragging. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-200",
            dragging ? "opacity-100" : "opacity-0",
          )}
          style={{
            backgroundImage:
              "linear-gradient(to right, transparent calc(33.33% - 0.5px), rgba(255,255,255,0.45) calc(33.33% - 0.5px), rgba(255,255,255,0.45) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgba(255,255,255,0.45) calc(66.66% - 0.5px), rgba(255,255,255,0.45) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px)), linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgba(255,255,255,0.45) calc(33.33% - 0.5px), rgba(255,255,255,0.45) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgba(255,255,255,0.45) calc(66.66% - 0.5px), rgba(255,255,255,0.45) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px))",
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-white/60">
        <label className="flex items-center gap-2">
          <span>Zoom</span>
          <input
            type="range"
            min={zoomFloor}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-28 accent-lime-300"
          />
        </label>
        <button type="button" onClick={() => setCenter({ x: 0.5, y: 0.5 })} className={chipClass}>
          Centrar
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setCenter({ x: 0.5, y: 0.5 });
          }}
          className={chipClass}
        >
          Llenar
        </button>
        {zoomFloor < 0.999 && (
          <button
            type="button"
            onClick={() => {
              setZoom(zoomFloor);
              setCenter({ x: 0.5, y: 0.5 });
            }}
            className={chipClass}
          >
            Imagen completa
          </button>
        )}
      </div>

      {showsBackground && (
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span>Fondo</span>
          {BG_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setBg(color)}
              aria-label={`Fondo ${color}`}
              className={cn("h-6 w-6 rounded-full ring-1 ring-white/20", bg === color && "ring-2 ring-lime-300")}
              style={{ background: color }}
            />
          ))}
          <input
            type="color"
            value={bg}
            onChange={(e) => setBg(e.target.value)}
            aria-label="Otro color de fondo"
            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          />
        </div>
      )}

      {lowResolution && (
        <p className="text-[11px] text-amber-300/90">
          Resolucion baja para este formato: el encuadre usa {usefulWidth}px de ancho de la imagen y se recomiendan al
          menos {target.width}px. Puede verse algo borrosa; reduce el zoom o sube una imagen mas grande.
        </p>
      )}
    </div>
  );
}

const chipClass =
  "rounded-full border border-white/15 px-2.5 py-1 text-white/70 transition hover:border-white/30 hover:text-white";

function clampZoom(zoom: number, floor: number): number {
  return Math.min(MAX_ZOOM, Math.max(floor, zoom));
}
