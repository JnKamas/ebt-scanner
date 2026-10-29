import { banknoteCountry } from "../lib/banknote-country";

export default function BanknoteFlag({ serial, printerCode }: { serial: string; printerCode?: string }) {
  const country = banknoteCountry(serial, printerCode);
  if (!country) return null;
  return <img className="banknote-flag" src={`/flags/${country.code}.svg`} width="20" height="15" alt={country.description} title={country.description} />;
}
