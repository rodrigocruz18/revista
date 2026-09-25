"use client";

import { useState } from "react";
import {
  DEFAULT_SPONSOR_SETTINGS,
  normalizeSponsorSettings,
  SPONSOR_SETTINGS_LIMITS,
  type SponsorSettings,
} from "@/lib/sponsorSettings";
import type { Sponsor } from "@/types/sponsor";
import { buildSponsorCycle, seededRandom } from "@/lib/sponsorCycle";
import { brandKey } from "@/lib/sponsorBrands";
import { cn } from "@/lib/utils";

type Props = {
  initialSettings: SponsorSettings;
  /** For the tape preview: the real active banner sponsors. */
  sponsors: Sponsor[];
  blobConfigured: boolean;
};

type Field = { key: keyof SponsorSettings; label: string; hint: string; unit: string };

const BANNER_FIELDS: Field[] = [
  { key: "initialDelaySec", label: "Tiempo inicial sin publicidad", hint: "Desde que el lector abre la revista hasta el primer banner.", unit: "seg" },
  { key: "restSec", label: "Descanso entre auspiciadores", hint: "Tiempo sin banner entre uno y el siguiente.", unit: "seg" },
  { key: "lightExposureSec", label: "Exposicion Light", hint: "Cuanto tiempo queda visible un auspiciador Light.", unit: "seg" },
  { key: "premiumExposureSec", label: "Exposicion Premium", hint: "Cuanto tiempo queda visible un auspiciador Premium.", unit: "seg" },
  {
    key: "premiumRepeats",
    label: "Apariciones Premium por vuelta",
    hint: "Cada Light aparece 1 vez por vuelta; cada Premium, esta cantidad.",
    unit: "veces",
  },
];

const FULLPAGE_FIELDS: Field[] = [
  { key: "fullpageEdgePages", label: "Paginas libres al inicio y al final", hint: "No se inserta publicidad tan cerca de la portada ni del cierre.", unit: "pag" },
  { key: "fullpageSpacingPages", label: "Separacion minima", hint: "Paginas minimas entre dos publicidades de pagina completa.", unit: "pag" },
  { key: "fullpageMaxPerEdition", label: "Maximo por edicion", hint: "0 = una por cada auspiciador de pagina completa activo.", unit: "" },
];

const PREVIEW_SECONDS = 180;

/**
 * Admin form for the reader's sponsor timing and placement (SponsorSettings).
 * Values are clamped to SPONSOR_SETTINGS_LIMITS both here and on the server;
 * a saved change applies to readers on their next page load.
 */
export function SponsorSettingsAdmin({ initialSettings, sponsors, blobConfigured }: Props) {
  const [saved, setSaved] = useState(initialSettings);
  const [draft, setDraft] = useState<Record<keyof SponsorSettings, string>>(() => toDraft(initialSettings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const settings = normalizeSponsorSettings(draft);
  const dirty = (Object.keys(saved) as (keyof SponsorSettings)[]).some((key) => settings[key] !== saved[key]);
  const isDefault = (Object.keys(DEFAULT_SPONSOR_SETTINGS) as (keyof SponsorSettings)[]).every(
    (key) => settings[key] === DEFAULT_SPONSOR_SETTINGS[key],
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/sponsor-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; settings?: SponsorSettings };
      if (!res.ok || !data.settings) throw new Error(data.error ?? "No se pudo guardar la configuracion.");
      setSaved(data.settings);
      setDraft(toDraft(data.settings));
      setNotice("Configuracion guardada. Se aplica a los lectores desde su proxima carga de la revista.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando la configuracion.");
    } finally {
      setSaving(false);
    }
  }

  const renderField = (field: Field) => {
    const { min, max } = SPONSOR_SETTINGS_LIMITS[field.key];
    return (
      <div key={field.key}>
        <label className="mb-1 block text-xs text-white/60" htmlFor={`setting-${field.key}`}>
          {field.label}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`setting-${field.key}`}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={draft[field.key]}
            onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
            onBlur={() => setDraft((prev) => ({ ...prev, [field.key]: String(settings[field.key]) }))}
            className="w-24 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-right tabular-nums text-white outline-none focus:border-white/40"
          />
          {field.unit && <span className="text-xs text-white/40">{field.unit}</span>}
        </div>
        <p className="mt-1 text-[11px] text-white/40">{field.hint}</p>
      </div>
    );
  };

  return (
    <section className="mt-10 border-t border-white/10 pt-10">
      <h2 className="mb-1 font-serif text-xl text-white">Configuracion de publicidad</h2>
      <p className="mb-6 text-sm text-white/50">
        Tiempos y frecuencia de los banners, y ubicacion de la publicidad de pagina completa.
      </p>

      <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Banners rotativos</h3>
          <div className="grid gap-5 sm:grid-cols-2">{BANNER_FIELDS.map(renderField)}</div>
          <p className="mt-4 text-[11px] leading-relaxed text-white/40">
            Los banners forman una cinta: al abrir la revista se arma un orden aleatorio y se recorren todos antes de
            repetir. Cada vuelta nueva se vuelve a mezclar, nunca empieza con el ultimo que se mostro y no pone al mismo
            auspiciador dos veces seguidas.
          </p>
        </div>

        <BannerTape settings={settings} sponsors={sponsors} />

        <div className="border-t border-white/10 pt-6">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Pagina completa</h3>
          <div className="grid gap-5 sm:grid-cols-3">{FULLPAGE_FIELDS.map(renderField)}</div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || !blobConfigured}
            className="rounded-lg bg-white px-5 py-2 font-medium text-[#0b0f0d] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => setDraft(toDraft(saved))}
              className="rounded-lg px-3 py-2 text-sm text-white/60 transition hover:text-white"
            >
              Descartar
            </button>
          )}
          {!isDefault && (
            <button
              type="button"
              onClick={() => setDraft(toDraft(DEFAULT_SPONSOR_SETTINGS))}
              className="ml-auto rounded-lg px-3 py-2 text-sm text-white/50 transition hover:text-white"
            >
              Usar valores recomendados
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

type TapeSponsor = Pick<Sponsor, "id" | "name" | "targetUrl" | "category" | "brandId">;

/** Stand-ins for the preview when no banner sponsor is active yet. */
const EXAMPLE_SPONSORS: TapeSponsor[] = [
  { id: "ej-a", name: "Auspiciador A", targetUrl: "https://a.example", category: "premium" },
  { id: "ej-b", name: "Auspiciador B", targetUrl: "https://b.example", category: "light" },
  { id: "ej-c", name: "Auspiciador C", targetUrl: "https://c.example", category: "light" },
  { id: "ej-d", name: "Auspiciador D", targetUrl: "https://d.example", category: "light" },
];

/**
 * Preview of the banner tape with the admin's real active sponsors (or
 * examples): two cycles as the reader would get them — same algorithm as
 * the reader (@/lib/sponsorCycle), with a fixed seed so it doesn't reshuffle
 * on every keystroke — plus the first 3 minutes as a timeline.
 */
function BannerTape({ settings, sponsors }: { settings: SponsorSettings; sponsors: Sponsor[] }) {
  const { initialDelaySec, restSec, lightExposureSec, premiumExposureSec, premiumRepeats } = settings;
  const active = sponsors.filter((s) => (s.category === "light" || s.category === "premium") && s.status === "active");
  const usingExamples = active.length === 0;
  const pool = (usingExamples ? EXAMPLE_SPONSORS : active) as Sponsor[];

  const random = seededRandom(7);
  const first = buildSponsorCycle(pool, premiumRepeats, null, random);
  const second = buildSponsorCycle(pool, premiumRepeats, first.length ? brandKey(first[first.length - 1]) : null, random);
  const exposure = (s: Sponsor) => (s.category === "premium" ? premiumExposureSec : lightExposureSec);
  const cycleSeconds = first.reduce((sum, s) => sum + exposure(s) + restSec, 0);

  const segments: { kind: "initial" | "rest" | "light" | "premium"; seconds: number; label?: string }[] = [];
  let t = 0;
  const push = (kind: (typeof segments)[number]["kind"], seconds: number, label?: string) => {
    const len = Math.min(seconds, PREVIEW_SECONDS - t);
    if (len > 0) segments.push({ kind, seconds: len, label });
    t += len;
  };
  push("initial", initialDelaySec);
  const timelineTape = [...first, ...second];
  for (let i = 0; t < PREVIEW_SECONDS && i < 400; i++) {
    const sponsor = timelineTape[i % timelineTape.length];
    push(sponsor.category === "premium" ? "premium" : "light", exposure(sponsor), sponsor.name);
    push("rest", restSec);
  }

  const color: Record<(typeof segments)[number]["kind"], string> = {
    initial: "bg-white/[0.06]",
    rest: "bg-transparent",
    light: "bg-lime-300/45",
    premium: "bg-lime-300",
  };

  return (
    <div className="space-y-4 rounded-xl bg-black/20 p-4">
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-white/70">
            Cinta publicitaria {usingExamples ? "(ejemplo: aun no hay banners activos)" : "con los auspiciadores activos"}
          </p>
          <p className="text-[11px] text-white/45">
            {first.length} apariciones por vuelta · una vuelta dura ~{formatDuration(cycleSeconds)}
          </p>
        </div>
        <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {first.map((sponsor, i) => (
            <TapeChip key={`a-${i}`} sponsor={sponsor} />
          ))}
          <li className="px-1 text-white/35" aria-label="Nueva vuelta, nuevo orden">
            ↻
          </li>
          {second.map((sponsor, i) => (
            <TapeChip key={`b-${i}`} sponsor={sponsor} dim />
          ))}
        </ol>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-white/70">Primeros 3 minutos de lectura</p>
        <div className="flex h-3 overflow-hidden rounded-full ring-1 ring-white/10" aria-hidden>
          {segments.map((segment, i) => (
            <div
              key={i}
              className={color[segment.kind]}
              style={{ width: `${(segment.seconds / PREVIEW_SECONDS) * 100}%` }}
              title={segment.label ? `${segment.label} · ${segment.seconds}s` : `${segment.seconds}s`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-white/30">
          <span>0:00</span>
          <span>1:00</span>
          <span>2:00</span>
          <span>3:00</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
          <Legend className="bg-white/[0.12]" label="Sin publicidad" />
          <Legend className="bg-lime-300" label="Premium" />
          <Legend className="bg-lime-300/45" label="Light" />
          <Legend className="ring-1 ring-white/20" label="Descanso" />
        </div>
      </div>
    </div>
  );
}

function TapeChip({ sponsor, dim = false }: { sponsor: Sponsor; dim?: boolean }) {
  const premium = sponsor.category === "premium";
  return (
    <li
      className={cn(
        "max-w-[11rem] truncate rounded-full px-2.5 py-1",
        premium ? "bg-lime-300 font-medium text-black" : "bg-white/10 text-white/75",
        dim && "opacity-45",
      )}
      title={`${sponsor.name} · ${premium ? "Premium" : "Light"}`}
    >
      {sponsor.name}
    </li>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s > 0 ? `${s} s` : ""}`.trim() : `${s} s`;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function toDraft(settings: SponsorSettings): Record<keyof SponsorSettings, string> {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])) as Record<
    keyof SponsorSettings,
    string
  >;
}
