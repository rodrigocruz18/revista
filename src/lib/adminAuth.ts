/**
 * Minimal auth for the /admin panel: a single shared password (env var
 * `ADMIN_PASSWORD`) instead of a full user/database system — this is a
 * one-operator tool, not a multi-user app.
 *
 * A successful login gets a signed session cookie: base64url(payload) + "."
 * + base64url(HMAC-SHA256(payload, ADMIN_PASSWORD)), where payload is just
 * `{ exp }`. Verifying it means recomputing the HMAC and checking it matches
 * (constant-time) plus that `exp` hasn't passed — no server-side session
 * store needed, which keeps this compatible with Vercel's serverless model
 * (no shared memory between invocations).
 *
 * Uses Web Crypto (`crypto.subtle`) rather than Node's `crypto` module so
 * this works the same whether a route runs on the Node or Edge runtime.
 *
 * `cookies()` from next/headers is async in this Next.js version and can
 * only be written from a Server Function or Route Handler (never during
 * Server Component rendering) — see node_modules/next/dist/docs/.../cookies.md.
 * Every write here happens inside a Route Handler (login/logout), and reads
 * happen either there or in the /admin Server Component, both of which are
 * fine per that doc.
 */
import { cookies } from "next/headers";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h — long enough for one publishing session, short enough to not linger forever on a shared machine

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD no esta configurada. Agregala en las variables de entorno del proyecto (Vercel: Settings > Environment Variables) y vuelve a desplegar.",
    );
  }
  return password;
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Buffer.from(signature).toString("base64url");
}

export function checkPassword(candidate: string): boolean {
  return timingSafeEqual(candidate, getPassword());
}

export async function createSessionToken(): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_SECONDS * 1000 });
  const encodedPayload = Buffer.from(payload, "utf-8").toString("base64url");
  const signature = await hmac(encodedPayload, getPassword());
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;
  try {
    const expected = await hmac(encodedPayload, getPassword());
    if (!timingSafeEqual(signature, expected)) return false;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8")) as {
      exp?: number;
    };
    return typeof payload.exp === "number" && Date.now() < payload.exp;
  } catch {
    return false;
  }
}

/** Convenience for Server Components / Route Handlers that just need a yes/no. */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_SECONDS;
