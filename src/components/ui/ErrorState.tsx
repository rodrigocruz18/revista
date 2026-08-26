"use client";

export type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ title = "No pudimos cargar esta edicion.", message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-3 bg-[#0b0f0d] px-6 text-center text-white">
      <span className="text-3xl" aria-hidden>
        🎾
      </span>
      <h1 className="font-serif text-xl">{title}</h1>
      <p className="max-w-sm text-sm text-white/50">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full bg-lime-300 px-5 py-2 text-sm font-medium text-black transition hover:bg-lime-200"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
