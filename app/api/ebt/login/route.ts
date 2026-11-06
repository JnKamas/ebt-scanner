import { NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ebtRequest, noStoreJson } from "../shared";
import { EbtAccount, publicAccount } from "../../../lib/ebt";
import { mutationError, readJsonObject } from "../request-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const blocked = mutationError(request);
  if (blocked) return blocked;
  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await readJsonObject(request, 4096);
  } catch {
    return noStoreJson({ error: "Enter your EBT email address and password." }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!email || !password || email.length > 254 || password.length > 512) {
    return noStoreJson({ error: "Enter your EBT email address and password." }, { status: 400 });
  }

  try {
    const result = await ebtRequest({ m: "login", v: "2", my_email: email, my_password: password });
    if (!result || typeof result !== "object" || !("sessionid" in result) || typeof result.sessionid !== "string") {
      return noStoreJson({ error: "EBT did not accept those login details." }, { status: 401 });
    }

    const account = result as EbtAccount & { sessionid: string };
    const response = noStoreJson({ account: publicAccount(account) });
    response.cookies.set(SESSION_COOKIE, account.sessionid, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 14
    });
    return response;
  } catch {
    return noStoreJson({ error: "EBT could not be reached. Your password was not saved; try again shortly." }, { status: 502 });
  }
}
