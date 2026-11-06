import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { mutationError } from "../request-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const blocked = mutationError(request);
  if (blocked) return blocked;
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    try {
      await ebtRequest({ m: "logout", v: "1", PHPSESSID: session });
    } catch {
      // Clear the browser session even if EBT is temporarily unreachable.
    }
  }
  return clearSession(noStoreJson({ ok: true }));
}
