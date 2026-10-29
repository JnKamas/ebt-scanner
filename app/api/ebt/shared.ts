import { NextResponse } from "next/server";

export const EBT_API_URL = "https://api.eurobilltracker.com/";
export const SESSION_COOKIE = "ebt-web-session";

export type EbtAccount = {
  username: string;
  my_city: string;
  my_country: string;
  my_zip: string;
  totalbills: number;
  totalhits: number;
};

export async function ebtRequest(parameters: Record<string, string>) {
  const body = new URLSearchParams(parameters);
  const response = await fetch(EBT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "EBT-Web/0.1 (Vercel; official EBT API client)"
    },
    body: body.toString(),
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
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: true, maxAge: 0, path: "/" });
  return response;
}
