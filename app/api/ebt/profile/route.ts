import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { ebtImageUrl, rows } from "../../../lib/ebt";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) return noStoreJson({ error: "Sign in to view your EBT profile." }, { status: 401 });
  try {
    const identity = await ebtRequest({ m: "sessioncheck", v: "2", autologin: "0", PHPSESSID: session });
    if (identity === false) return clearSession(noStoreJson({ error: "Your EBT session expired. Sign in again." }, { status: 401 }));
    if (!identity || typeof identity !== "object" || !("username" in identity) || typeof identity.username !== "string") throw new Error("Invalid session");
    // Login does not provide a user ID. Resolve only the authenticated username,
    // never a user-supplied profile ID, and require an exact match.
    const username = identity.username;
    if (username.length < 3) return noStoreJson({ error: "EBT profile search requires a username of at least three characters. Basic totals remain available." }, { status: 422 });
    let userId = "";
    for (let page = 0; page < 100; page++) {
      const found = await ebtRequest({ m: "search", v: "1", PHPSESSID: session, find: username, what: "1", pp: "50", c: String(page) });
      if (!found || typeof found !== "object" || !("users" in found)) throw new Error("Profile search failed");
      const users = rows(found.users);
      const own = users.find((user) => user.name === username);
      if (own) { userId = String(own.id); break; }
      if (users.length < 50) break;
    }
    if (!/^\d+$/.test(userId)) return noStoreJson({ error: "Could not find your exact EBT profile. Basic totals remain available." }, { status: 404 });
    const result = await ebtRequest({ m: "globalstats_profile_user", v: "1", PHPSESSID: session, user_id: userId, language: "en", time_offset: "1" });
    if (!result || typeof result !== "object" || !("data" in result) || !result.data || typeof result.data !== "object") throw new Error("Invalid profile");
    const profile = result.data as Record<string, unknown>;
    if (String(profile.user_id) !== userId || !Number.isFinite(Number(profile.total_notes)) || !Number.isFinite(Number(profile.total_hits))) throw new Error("Unexpected profile");
    return noStoreJson({ profile: { user_name: String(profile.user_name ?? username), join_date: String(profile.join_date ?? ""), total_notes: Number(profile.total_notes) || 0, total_hits: Number(profile.total_hits) || 0,
      img_url_notes_europe: ebtImageUrl(profile.img_url_notes_europe), img_url_notes_world: ebtImageUrl(profile.img_url_notes_world), img_url_hits_europe: ebtImageUrl(profile.img_url_hits_europe) } });
  } catch { return noStoreJson({ error: "Could not load your EBT profile. Retry in a moment." }, { status: 502 }); }
}
