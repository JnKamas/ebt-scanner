import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export function sessionBindingConfigured() {
  return /^[a-f0-9]{64}$/i.test(process.env.EBT_SESSION_BINDING_SECRET ?? "");
}

// Bind a displayed sign-in to its cookie without exposing the upstream token.
export function sessionKey(session: string) {
  if (!sessionBindingConfigured()) throw new Error("Session binding is not configured.");
  const secret = Buffer.from(process.env.EBT_SESSION_BINDING_SECRET!, "hex");
  return createHmac("sha256", secret).update(`ebt-scanner-session:v1:${session}`).digest("hex");
}

export function matchesSessionKey(session: string, key: string | null) {
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) return false;
  return timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(sessionKey(session), "hex"));
}

export const EBT_API_URL = "https://api.eurobilltracker.com/";
export const SESSION_COOKIE = "ebt-web-session";
export const SESSION_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: true, path: "/" } as const;

export function loginCookieOptions(rememberMe: boolean) {
  if (!rememberMe) return { ...SESSION_COOKIE_OPTIONS };
  return { ...SESSION_COOKIE_OPTIONS, maxAge: 30 * 86400 };
}

export async function ebtRequest(parameters: Record<string, string>) {
  const body = new URLSearchParams(parameters);
  const response = await fetch(EBT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "EBT-Scanner/0.1 (Vercel; independent EBT API client)"
    },
    body: body.toString(),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`EBT API returned ${response.status}`);
  return response.json() as Promise<unknown>;
}

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
