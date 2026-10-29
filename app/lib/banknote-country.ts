// ECB serial-code tables:
// https://www.ecb.europa.eu/euro/banknotes/current/design/html/index.en.html
type Country = { code: string; name: string };
const countries: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", CY: "Cyprus", DE: "Germany",
  EE: "Estonia", ES: "Spain", FI: "Finland", FR: "France", GB: "United Kingdom",
  GR: "Greece", IE: "Ireland", IT: "Italy", LT: "Lithuania", LV: "Latvia",
  MT: "Malta", NL: "Netherlands", PL: "Poland", PT: "Portugal", SI: "Slovenia", SK: "Slovakia",
};
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
  const firstSeries = /^[A-Z]\d{11}$/.test(value);
  const europa = /^[A-Z]{2}\d{10}$/.test(value);
  if (!firstSeries && !europa) return null;
  if (printerCode !== undefined && !/^[A-Z]\d{3}[A-Z][1-9]$/.test(printerCode.toUpperCase())) return null;
  const isPrinter = printerCode !== undefined || europa;
  const letter = (printerCode ?? value)[0]?.toUpperCase();
  const code = (europa ? europaPrinters : isPrinter ? firstSeriesPrinters : firstSeriesIssuers)[letter];
  if (!code) return null;
  const name = countries[code];
  return { code: code.toLowerCase(), name, description: `${isPrinter ? "Printed in" : "Commissioned by"}: ${name}` };
}
