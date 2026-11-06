import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { EbtAccount, publicAccount } from "../../../lib/ebt";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) return noStoreJson({ account: null });

  try {
    const result = await ebtRequest({ m: "sessioncheck", v: "2", autologin: "0", PHPSESSID: session });
    if (!result || typeof result !== "object" || !("sessionid" in result)) {
      return clearSession(noStoreJson({ account: null }));
    }
    const account = result as unknown as EbtAccount;
    return noStoreJson({ account: publicAccount(account) });
  } catch {
    return noStoreJson({ error: "Could not check your EBT session." }, { status: 502 });
  }
}
