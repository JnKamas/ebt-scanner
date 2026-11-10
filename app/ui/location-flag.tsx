import { locationCountry } from "../lib/banknote-country";

export default function LocationFlag({ country }: { country: string }) {
  const location = locationCountry(country);
  if (!location) return null;
  return <img className="banknote-flag" src={`/flags/${location.code}.svg`} width="20" height="15" alt={`Location: ${location.name}`} title={location.name} />;
}
