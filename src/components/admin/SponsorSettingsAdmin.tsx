"use client";

import { useState } from "react";
import {
  DEFAULT_SPONSOR_SETTINGS,
  normalizeSponsorSettings,
  SPONSOR_SETTINGS_LIMITS,
  type SponsorSettings,
} from "@/lib/sponsorSettings";

type Props = {
  initialSettings: SponsorSettings;
  blobConfigured: boolean;
};

type Field = { key: keyof SponsorSettings; label: string; hint: string; unit: string };

const BANNER_FIELDS: Field[] = [
  { key: "initialDelaySec", label: "Tiempo inicial sin publicidad", hint: "Desde que el lector abre la revista hasta el primer banner.", unit: "seg" },
  { key: "restSec", label: "Descanso entre auspiciadores", hint: "Tiempo sin banner entre uno y el siguiente.", unit: "seg" },
  { key: "lightExposureSec", label: "Exposicion Light", hint: "Cuanto tiempo queda visible un auspiciador Light.", unit: "seg" },
  { key: "premiumExposureSec", label: "Exposicion Premium", hint: "Cuanto tiempo queda visible un auspiciador Premium.", unit: "seg" },
];

const FULLPAGE_FIELDS: Field[] = [
  { key: "fullpageEdgePages", label: "Paginas libres al inicio y al final", hint: "No se inserta publicidad tan cerca de la portada ni del cierre.", unit: "pag" },
  { key: "fullpageSpacingPages", label: "Separacion minima", hint: "Paginas minimas entre dos publicidades de pagina completa.", unit: "pag" },
  { key: "fullpageMaxPerEdition", label: "Maximo por edicion", hint: "0 = una por cada auspiciador de pagina completa activo.", unit: "" },
];

const PREVIEW_SECONDS = 180;
const SUMMARY_SECONDS = 300;

/**
 * Admin form for the reader's sponsor timing and placement (SponsorSettings).
 * Values are clamped to SPONSOR_SETTINGS_LIMITS both here and on the server;
 * a saved change applies to readers on their next page load.
 */
export function SponsorSettingsAdmin({ initialSettings, blobConfigured }: Props) {
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
          <ProbabilityField
            value={settings.premiumProbability}
            onChange={(value) => setDraft((prev) => ({ ...prev, premiumProbability: String(value) }))}
          />
        </div>

        <BannerTimeline settings={settings} />

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

/**
 * What a reader sees during the first minutes, given these settings: the
 * initial silence, then banners alternating with rests. Assumes both
 * categories have active sponsors, split by the configured probability.
 */
function BannerTimeline({ settings }: { settings: SponsorSettings }) {
  const { initialDelaySec, restSec, lightExposureSec, premiumExposureSec, premiumProbability } = settings;
  const premiumShare = premiumProbability / 100;
  const avgExposure = premiumShare * premiumExposureSec + (1 - premiumShare) * lightExposureSec;
  const cycle = avgExposure + restSec;
  const appearances =
    SUMMARY_SECONDS <= initialDelaySec ? 0 : Math.ceil((SUMMARY_SECONDS - initialDelaySec) / cycle);
  const bannerTimeShare = Math.min(1, (appearances * avgExposure) / SUMMARY_SECONDS);

  // Deterministic sequence following the probability (e.g. 75% → P P L P ...).
  const segments: { kind: "initial" | "rest" | "light" | "premium"; seconds: number }[] = [];
  let t = 0;
  const push = (kind: (typeof segments)[number]["kind"], seconds: number) => {
    const s = Math.min(seconds, PREVIEW_SECONDS - t);
    if (s > 0) segments.push({ kind, seconds: s });
    t += s;
  };
  push("initial", initialDelaySec);
  let credit = 0;
  while (t < PREVIEW_SECONDS && segments.length < 200) {
    credit += premiumShare;
    const premium = credit >= 0.5;
    if (premium) credit -= 1;
    push(premium ? "premium" : "light", premium ? premiumExposureSec : lightExposureSec);
    push("rest", restSec);
  }

  const color: Record<(typeof segments)[number]["kind"], string> = {
    initial: "bg-white/[0.06]",
    rest: "bg-transparent",
    light: "bg-lime-300/45",
    premium: "bg-lime-300",
  };

  return (
    <div className="rounded-xl bg-black/20 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-white/70">Asi se ve en los primeros 3 minutos de lectura</p>
        <p className="text-[11px] text-white/45">
          En 5 min: ~{appearances} {appearances === 1 ? "aparicion" : "apariciones"} · banner visible ~
          {Math.round(bannerTimeShare * 100)}% del tiempo
        </p>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full ring-1 ring-white/10" aria-hidden>
        {segments.map((segment, i) => (
          <div
            key={i}
            className={color[segment.kind]}
            style={{ width: `${(segment.seconds / PREVIEW_SECONDS) * 100}%` }}
            title={`${segment.kind} ${segment.seconds}s`}
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
  );
}

/** Premium/Light split as one slider: the two always add up to 100%. */
function ProbabilityField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor="setting-premiumProbability" className="text-xs text-white/60">
          Probabilidad de aparicion por categoria
        </label>
        <span className="text-xs tabular-nums text-white/70">
          Premium <strong className="text-lime-300">{value}%</strong> · Light{" "}
          <strong className="text-lime-300/70">{100 - value}%</strong>
        </span>
      </div>
      <input
        id="setting-premiumProbability"
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-lime-300"
      />
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full" aria-hidden>
        <div className="bg-lime-300 transition-all" style={{ width: `${value}%` }} />
        <div className="bg-lime-300/35 transition-all" style={{ width: `${100 - value}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-white/40">
        Cada vez que aparece un banner, se sortea primero la categoria con este porcentaje y luego un auspiciador al
        azar dentro de ella. Si una categoria no tiene auspiciadores activos, se usa la otra.
      </p>
    </div>
  );
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
