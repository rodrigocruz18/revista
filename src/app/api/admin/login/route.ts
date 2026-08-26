import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  }

  let ok = false;
  try {
    ok = checkPassword(password);
  } catch (err) {
    // getPassword() throws when ADMIN_PASSWORD isn't configured at all —
    // surface that clearly instead of a generic "wrong password".
    const message = err instanceof Error ? err.message : "Error de configuracion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!ok) {
    return NextResponse.json({ error: "Contrasena incorrecta." }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
