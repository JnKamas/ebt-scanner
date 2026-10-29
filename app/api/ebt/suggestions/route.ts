import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { rows } from "../../../lib/ebt";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) return noStoreJson({ error: "Sign in to load your EBT suggestions." }, { status: 401 });
  const query = request.nextUrl.searchParams;
  const kind = query.get("kind");
  if (!["cities", "zipcodes", "comments"].includes(kind || "")) return noStoreJson({ error: "Unknown suggestion type." }, { status: 400 });
  const city = query.get("city") || "", country = query.get("country") || "", zip = query.get("zip") || "";
  if (kind !== "cities" && (!city.trim() || !country.trim() || city.length > 100 || country.length > 100 || zip.length > 50)) {
    return noStoreJson({ error: "Enter a city and country to load suggestions." }, { status: 400 });
  }
  try {
    const parameters: Record<string, string> = { m: `my${kind}`, v: "1", PHPSESSID: session };
    if (kind !== "cities") Object.assign(parameters, { city, country });
    if (kind === "comments") parameters.zip = zip;
    const result = await ebtRequest(parameters);
    if (result === false) return clearSession(noStoreJson({ error: "Your EBT session expired. Sign in again." }, { status: 401 }));
    if (!result || typeof result !== "object" || !("data" in result)) throw new Error("Invalid response");
    const data = rows(result.data);
    return noStoreJson({ data: kind === "cities" ? data.map((row) => ({ city: String(row.city ?? ""), country: String(row.country ?? ""), top_zipcode: String(row.top_zipcode ?? ""), nrlocations: Number(row.nrlocations) || 0 }))
      : kind === "zipcodes" ? data.map((row) => String(row.zipcode ?? ""))
      : data.map((row) => ({ comment: String(row.comment ?? ""), amount: Number(row.amount) || 0 })).sort((a, b) => b.amount - a.amount) });
  } catch { return noStoreJson({ error: "Could not load EBT suggestions. Keep entering manually or retry." }, { status: 502 }); }
}
