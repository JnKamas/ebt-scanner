import Link from "next/link";

export default function AppInformation({ version, showAbout = true }: { version: string; showAbout?: boolean }) {
  return <div className="app-information" aria-label="App information">
    <span className="app-version">v{version}</span>
    {showAbout && <Link href="/about" target="_blank" rel="noopener noreferrer">About &amp; privacy</Link>}
  </div>;
}
