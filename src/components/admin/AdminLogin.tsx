"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { magazineConfig } from "@/config/magazine";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar sesion.");
        return;
      }
      // Re-runs the /admin Server Component so it picks up the new cookie
      // and renders the dashboard instead of this form.
      router.refresh();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f0d] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl"
      >
        <h1 className="mb-1 font-serif text-2xl text-white">Panel de administracion</h1>
        <p className="mb-6 text-sm text-white/50">{magazineConfig.name}</p>

        <label className="mb-2 block text-sm text-white/70" htmlFor="admin-password">
          Contrasena
        </label>
        <input
          id="admin-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-4 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
        />

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full rounded-lg bg-white py-2 font-medium text-[#0b0f0d] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Verificando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
