export type EbtCity = { city: string; country: string; top_zipcode: string; nrlocations: number };
export type EbtComment = { comment: string; amount: number };
export type SubmissionResult = { status?: number | string; billId?: string | number; alreadyDate?: string; alreadyDenom?: string | number };
export type Receipt = { id: string; serial: string; denomination: string; result: SubmissionResult | null };
export type EbtProfile = {
  user_name: string; join_date: string; total_notes: number; total_hits: number;
  img_url_notes_europe: string | null; img_url_notes_world: string | null; img_url_hits_europe: string | null;
};
export type JourneyStep = { step_id: number; timestamp: string; user_name: string; location_name: string; country_name: string; comment: string; hit_km: number; hit_days: number };
export type EbtJourney = { steps: JourneyStep[]; total_km: number; total_days: number; img_url_europe: string | null; img_url_world: string | null };

// API list responses may be JSON arrays or objects keyed by a numeric ID.
export function rows(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

export function ebtImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value, "https://www.eurobilltracker.com/");
    if (!(url.hostname === "eurobilltracker.com" || url.hostname.endsWith(".eurobilltracker.com")) || url.username || url.password) return null;
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:") return null;
    return url.href;
  } catch { return null; }
}

// Upstream JSON is untrusted. Never coerce null, booleans or empty strings to success.
export function submissionStatus(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) return null;
  const status = Number(value);
  return Number.isSafeInteger(status) && status >= 0 ? status : null;
}

export function submissionMessage(result: SubmissionResult | null): string {
  const status = submissionStatus(result?.status);
  if (status === 0) return "Submitted successfully.";
  if (status === 1) return "Hit! This note has been found before.";
  if (status === null) return "EBT did not confirm this note. It remains queued; check EBT before retrying.";
  const reasons: string[] = [];
  const errors: Array<[number, string]> = [
    [2, "Check the denomination"], [4, "Check the country (use its English name)"],
    [8, "Check the serial number"], [16, "Check the printer code"],
    [32, "Enter both city and postal code"], [64, "You already entered this note"],
    [128, "You already entered this serial number"],
    [32768, "The serial or printer code does not match this denomination"],
  ];
  for (const [bit, text] of errors) if (status & bit) reasons.push(text);
  const known = errors.reduce((mask, [bit]) => mask | bit, 0);
  if (status & ~known || reasons.length === 0) reasons.push(`EBT returned error ${status}`);
  if ((status & (64 | 128)) && result?.alreadyDate) reasons.push(`Previous entry: ${result.alreadyDate}`);
  if ((status & 128) && result?.alreadyDenom) reasons.push(`Previous denomination: €${result.alreadyDenom}`);
  return `${reasons.join(". ")}.`;
}
export type EbtAccount = {
  username: string; my_city: string; my_country: string; my_zip: string;
  totalbills: number; totalhits: number;
};

// Explicitly whitelist public account fields; upstream session IDs stay server-side.
export function publicAccount(account: EbtAccount): EbtAccount {
  return { username: account.username, my_city: account.my_city, my_country: account.my_country, my_zip: account.my_zip, totalbills: account.totalbills, totalhits: account.totalhits };
}
