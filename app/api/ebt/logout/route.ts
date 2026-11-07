import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { mutationError, readJsonObject } from "../request-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const blocked = mutationError(request);
  if (blocked) return blocked;
  let localOnly = false;
  try {
    // Existing open tabs from 1.1.0 send no body. That remains a remote logout,
    // never an implicit request to clear only the browser cookie.
    if (request.body) {
      const body = await readJsonObject(request, 1024);
      if (body.localOnly !== undefined && typeof body.localOnly !== "boolean") throw new Error("Invalid choice");
      localOnly = body.localOnly === true;
    }
  } catch {
    return noStoreJson({ error: "Send a valid sign-out choice." }, { status: 400 });
  }
  if (localOnly) return clearSession(noStoreJson({ ok: true, upstreamInvalidated: false }));
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    try {
      await ebtRequest({ m: "logout", v: "1", PHPSESSID: session });
      // An acknowledgement alone is insufficient: verify the token is rejected.
      const remaining = await ebtRequest({ m: "sessioncheck", v: "2", autologin: "0", PHPSESSID: session });
      if (remaining !== false) throw new Error("Session invalidation not confirmed");
    } catch {
      // Retain the cookie so the user can retry remote invalidation.
      return noStoreJson({ error: "EBT has not confirmed sign-out. Retry, or sign out on this device only.", upstreamInvalidated: false }, { status: 502 });
    }
  }
  return clearSession(noStoreJson({ ok: true, upstreamInvalidated: Boolean(session), noSession: !session }));
}
