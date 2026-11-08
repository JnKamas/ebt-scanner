import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

// Bind a displayed sign-in to its cookie without exposing the upstream token.
export function sessionKey(session: string) {
  return createHash("sha256").update(`ebt-scanner-session:${session}`).digest("hex");
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
