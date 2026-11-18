import { locationCountry } from "../lib/banknote-country";

export default function CountryFlag({ country, decorative = false }: { country: string; decorative?: boolean }) {
  const match = locationCountry(country);
  if (!match) return null;
  return <img className="banknote-flag" src={`/flags/${match.code}.svg`} width="20" height="15" alt={decorative ? "" : match.name} title={match.name} />;
}
