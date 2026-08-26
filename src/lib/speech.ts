"use client";

/**
 * Thin wrapper around the Web Speech API (SpeechSynthesis). Kept dependency
 * free and framework agnostic so it can be swapped for a higher quality TTS
 * backend later without touching the components that call it.
 */

export type SpeechController = {
  isSupported: boolean;
  speak: (text: string, opts?: { rate?: number; onBoundary?: (charIndex: number) => void }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("es")) ??
    voices[0] ??
    null
  );
}

export function speakText(
  text: string,
  options: {
    rate?: number;
    onBoundary?: (charIndex: number, charLength: number) => void;
    onEnd?: () => void;
    onStart?: () => void;
  } = {},
): void {
  if (!isSpeechSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? 1;
  utterance.lang = "es-CL";
  const voice = pickSpanishVoice();
  if (voice) utterance.voice = voice;

  if (options.onBoundary) {
    utterance.onboundary = (event) => {
      options.onBoundary?.(event.charIndex, event.charLength ?? 1);
    };
  }
  utterance.onend = () => options.onEnd?.();
  utterance.onstart = () => options.onStart?.();

  window.speechSynthesis.speak(utterance);
}

export function pauseSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.pause();
}

export function resumeSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.resume();
}

export function stopSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return isSpeechSupported() && window.speechSynthesis.speaking;
}
