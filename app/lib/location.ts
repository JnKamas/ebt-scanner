export type LocatedAddress = { city: string; country: string; postalCode: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function addressFromPhoton(value: unknown): LocatedAddress {
  const body = value as { features?: Array<{ properties?: Record<string, unknown> }> } | null;
  if (!Array.isArray(body?.features)) throw new Error("The location lookup returned an unreadable address. Enter your location manually or retry.");
  // Use one result's address throughout; mixing nearby results can pair the
  // wrong town with a postcode across a municipal or national boundary.
  for (const feature of body.features) {
    const properties = feature?.properties;
    if (!properties) continue;
    const city = text(properties.city) || (properties.osm_key === "place" && ["city", "town", "village", "hamlet", "municipality"].includes(text(properties.osm_value)) ? text(properties.name) : "");
    const countryCode = text(properties.countrycode).toUpperCase();
    // EBT expects English country names. Use the ISO code when available so a
    // localised country label cannot accidentally be submitted instead.
    let country = text(properties.country);
    if (/^[A-Z]{2}$/.test(countryCode)) {
      country = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) || country;
      if (country === "Czechia") country = "Czech Republic";
      if (country === "Türkiye") country = "Turkey";
    }
    if (city && country) return { city, country, postalCode: text(properties.postcode).replace(/\s+/g, "") };
  }
  throw new Error("No town or city was found near this position. Enter your location manually or retry outdoors.");
}

export async function locateAddress(latitude: number, longitude: number): Promise<LocatedAddress> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("The browser returned an invalid position. Try again or enter your location manually.");
  const url = new URL("https://photon.komoot.io/reverse");
  url.search = new URLSearchParams({ lat: latitude.toFixed(4), lon: longitude.toFixed(4), lang: "en", limit: "1" }).toString();
  // User-triggered requests sent directly from the browser. Coordinates are
  // never passed through the app server or saved in browser storage.
  const signal = AbortSignal.timeout(12000);
  const read = async () => {
    const response = await fetch(url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal });
    if (!response.ok) throw new Error("The address lookup is unavailable. Try again shortly or enter your location manually.");
    return response.json();
  };
  const nearest = await read();
  try { return addressFromPhoton(nearest); } catch {
    // Some places (including Bratislava) omit the city from street addresses.
    // Ask for the nearest settlement, without using its central postcode.
    url.searchParams.set("layer", "city");
    url.searchParams.set("radius", "10");
    const settlement = await read();
    const location = addressFromPhoton(settlement);
    const address = nearest?.features?.[0]?.properties;
    const city = settlement?.features?.[0]?.properties;
    const sameArea = text(address?.countrycode) && text(address?.countrycode) === text(city?.countrycode) && text(address?.county) && text(address?.county) === text(city?.county);
    return { ...location, postalCode: sameArea ? text(address?.postcode).replace(/\s+/g, "") : "" };
  }
}

export function locationPermissionMessage(code: number): string {
  if (code === 1) return "Location access was blocked. Allow location for this site in browser settings, then click Use my location again, or enter it manually.";
  if (code === 2) return "Your browser could not determine your position. Check your device's location services or enter the location manually.";
  return "Finding your position timed out. Try again near a window or enter the location manually.";
}
