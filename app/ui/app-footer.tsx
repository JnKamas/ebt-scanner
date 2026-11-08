import Link from "next/link";

export default function AppFooter({ version, showAbout = true }: { version: string; showAbout?: boolean }) {
  return <footer className="app-footer" aria-label="App information">
    <span>EBT Scanner <span className="app-version">v{version}</span></span>
    {showAbout && <Link href="/about" target="_blank" rel="noopener noreferrer">About &amp; privacy</Link>}
  </footer>;
}
