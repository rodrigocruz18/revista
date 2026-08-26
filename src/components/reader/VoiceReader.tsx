"use client";

import { useEffect, useState } from "react";
import { SPEECH_RATES } from "@/config/magazine";
import { isSpeechSupported, pauseSpeech, resumeSpeech, speakText, stopSpeech } from "@/lib/speech";
import { cn } from "@/lib/utils";

export type VoiceReaderProps = {
  open: boolean;
  onClose: () => void;
  currentPage: number;
  getPageText: (page: number) => Promise<string>;
  rate: number;
  onRateChange: (rate: number) => void;
};

export function VoiceReader({ open, onClose, currentPage, getPageText, rate, onRateChange }: VoiceReaderProps) {
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const supported = isSpeechSupported();

  useEffect(() => {
    if (!open) {
      stopSpeech();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing with the imperative speechSynthesis API being cancelled
      setStatus("idle");
    }
  }, [open]);

  useEffect(() => {
    // Stop reading if the user flips away from the page being read.
    if (status !== "idle") {
      stopSpeech();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing with the imperative speechSynthesis API being cancelled
      setStatus("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  async function playPage() {
    const text = await getPageText(currentPage);
    if (!text.trim()) return;
    speakText(text, {
      rate,
      onEnd: () => setStatus("idle"),
      onStart: () => setStatus("playing"),
    });
  }

  function playSelection() {
    const text = window.getSelection()?.toString() ?? "";
    if (!text.trim()) return;
    speakText(text, {
      rate,
      onEnd: () => setStatus("idle"),
      onStart: () => setStatus("playing"),
    });
  }

  function togglePause() {
    if (status === "playing") {
      pauseSpeech();
      setStatus("paused");
    } else if (status === "paused") {
      resumeSpeech();
      setStatus("playing");
    }
  }

  function stop() {
    stopSpeech();
    setStatus("idle");
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/10 bg-[#141613]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-sm tracking-wide text-white">Lectura en voz alta</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </div>

      {!supported ? (
        <p className="mt-3 text-sm text-white/50">
          Tu navegador no soporta lectura en voz alta.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={status === "idle" ? playPage : togglePause}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-lime-300 text-lg text-black transition hover:bg-lime-200"
              aria-label={status === "playing" ? "Pausar" : "Reproducir"}
            >
              {status === "playing" ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={status === "idle"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:bg-white/10 disabled:opacity-30"
              aria-label="Detener"
            >
              ■
            </button>
            <button
              type="button"
              onClick={playSelection}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
            >
              Leer seleccion
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1">
            {SPEECH_RATES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRateChange(r)}
                className={cn(
                  "rounded-full px-2 py-1 text-xs transition",
                  r === rate ? "bg-white text-black" : "text-white/60 hover:bg-white/10",
                )}
              >
                {r}×
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
