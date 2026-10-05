import { NextRequest } from "next/server";
import { EbtAccount, SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";

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
    return noStoreJson({ account: { username: account.username, my_city: account.my_city, my_country: account.my_country, my_zip: account.my_zip, totalbills: account.totalbills, totalhits: account.totalhits } });
  } catch {
    return noStoreJson({ error: "Could not check your EBT session." }, { status: 502 });
  }
}
