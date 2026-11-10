// ECB serial-code tables:
// https://www.ecb.europa.eu/euro/banknotes/current/design/html/index.en.html
type Country = { code: string; name: string };
const countries: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", CY: "Cyprus", DE: "Germany",
  EE: "Estonia", ES: "Spain", FI: "Finland", FR: "France", GB: "United Kingdom",
  GR: "Greece", IE: "Ireland", IT: "Italy", LT: "Lithuania", LV: "Latvia",
  MT: "Malta", NL: "Netherlands", PL: "Poland", PT: "Portugal", SI: "Slovenia", SK: "Slovakia",
};

export function locationCountry(value: string): Country | null {
  const location = value.trim().toLowerCase();
  const entry = Object.entries(countries).find(([code, name]) => code.toLowerCase() === location || name.toLowerCase() === location);
  return entry ? { code: entry[0].toLowerCase(), name: entry[1] } : null;
}
const firstSeriesIssuers: Record<string, string> = {
  B: "LT", C: "LV", D: "EE", E: "SK", F: "MT", G: "CY", H: "SI", L: "FI",
  M: "PT", N: "AT", P: "NL", S: "IT", T: "IE", U: "FR", V: "ES", X: "DE", Y: "GR", Z: "BE",
};
const firstSeriesPrinters: Record<string, string> = {
  D: "FI", E: "FR", F: "AT", G: "NL", H: "GB", J: "IT", K: "IE", L: "FR",
  M: "ES", N: "GR", P: "DE", R: "DE", T: "BE", U: "PT",
};
const europaPrinters: Record<string, string> = {
  D: "PL", E: "FR", F: "BG", H: "GB", J: "GB", M: "PT", N: "AT", P: "NL",
  R: "DE", S: "IT", T: "IE", U: "FR", V: "ES", W: "DE", X: "DE", Y: "GR", Z: "BE",
};

export function banknoteCountry(serial: string, printerCode?: string): (Country & { description: string }) | null {
  const value = serial.toUpperCase().replace(/\s+/g, "");
  if (value && !/^[A-Z](?:\d{0,11}|[A-Z]\d{0,10})$/.test(value)) return null;
  const firstSeries = /^[A-Z]\d/.test(value);
  const europa = /^[A-Z]{2}/.test(value);
  const printer = printerCode?.toUpperCase().replace(/\s+/g, "");
  if (printer !== undefined && !/^(?:[A-Z]\d{0,3}|[A-Z]\d{3}[A-Z][1-9]?)$/.test(printer)) return null;
  const isPrinter = printerCode !== undefined || europa;
  const letter = (printer ?? value)[0];
  if (!letter) return null;
  let code: string | undefined;
  if (firstSeries || europa) {
    code = (europa ? europaPrinters : isPrinter ? firstSeriesPrinters : firstSeriesIssuers)[letter];
  } else {
    // Until the serial prefix identifies the series, show only an unambiguous country.
    const candidates = [
      (isPrinter ? firstSeriesPrinters : firstSeriesIssuers)[letter],
      europaPrinters[letter],
    ].filter(Boolean);
    if (new Set(candidates).size === 1) code = candidates[0];
  }
  if (!code) return null;
  const name = countries[code];
  return { code: code.toLowerCase(), name, description: `${isPrinter ? "Printed in" : firstSeries ? "Commissioned by" : "Country"}: ${name}` };
}
