import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { ebtImageUrl, rows } from "../../../lib/ebt";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) return noStoreJson({ error: "Sign in to view this note's journey." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^\d{1,12}$/.test(id)) return noStoreJson({ error: "Invalid EBT note ID." }, { status: 400 });
  try {
    const result = await ebtRequest({ m: "globalstats_profile_note", v: "1", PHPSESSID: session, note_id: id, language: "en", time_offset: "1" });
    if (result === false) return clearSession(noStoreJson({ error: "Your EBT session expired. Sign in again." }, { status: 401 }));
    if (!result || typeof result !== "object" || !("data" in result) || !result.data || typeof result.data !== "object") throw new Error("Invalid journey");
    const note = result.data as Record<string, unknown>;
    if (String(note.note_id) !== id) return noStoreJson({ error: "This note's journey is not available yet. Retry shortly." }, { status: 404 });
    return noStoreJson({ journey: { total_km: Number(note.total_km) || 0, total_days: Number(note.total_days) || 0,
      img_url_europe: ebtImageUrl(note.img_url_europe), img_url_world: ebtImageUrl(note.img_url_world),
      steps: rows(note.steps).map((step) => ({ step_id: Number(step.step_id) || 0, timestamp: String(step.timestamp_adjusted ?? step.timestamp ?? ""), user_name: String(step.user_name ?? ""), location_name: String(step.location_name ?? step.city_name ?? ""), country_name: String(step.country_name ?? ""), comment: String(step.comment ?? ""), hit_km: Number(step.hit_km) || 0, hit_days: Number(step.hit_days) || 0 })).sort((a, b) => a.step_id - b.step_id) } });
  } catch { return noStoreJson({ error: "Could not load the note journey. Retry shortly." }, { status: 502 }); }
}
