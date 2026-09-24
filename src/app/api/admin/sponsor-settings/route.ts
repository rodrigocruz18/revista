import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/adminAuth";
import { normalizeSponsorSettings } from "@/lib/sponsorSettings";
import { readSponsorSettings, writeSponsorSettings } from "@/lib/sponsorSettingsStore";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json({ settings: await readSponsorSettings() });
}

/** Saves the full settings object; every field is clamped to its limits. */
export async function PUT(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  }

  const settings = normalizeSponsorSettings((body as { settings?: unknown })?.settings);
  try {
    await writeSponsorSettings(settings);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    console.error("[admin/sponsor-settings PUT]", err);
    const message = err instanceof Error ? err.message : "Error guardando la configuracion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
