import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & privacy | EBT Scanner",
  description: "Who maintains EBT Scanner, how banknote scans, passwords and sessions are handled, and what you can verify."
};

export default function About() {
  return <main className="shell about-page">
    <Link href="/" className="about-back">← Back to scanner</Link>
    <p className="eyebrow">ABOUT & PRIVACY</p>
    <h1>Who runs EBT Scanner, and where your data goes.</h1>
    <p className="about-intro">An independent EuroBillTracker client for scanning banknotes and preparing entries. You can scan, edit and queue notes without signing in.</p>

    <section aria-labelledby="author-heading">
      <h2 id="author-heading">Who maintains it</h2>
      <p>Created and maintained by <strong>Labrador10</strong>, with the project repository at <a href="https://github.com/JnKamas/ebt-web" target="_blank" rel="noopener noreferrer">JnKamas/ebt-web on GitHub</a>. Hosted on Vercel at <a href="https://ebt.eurocoins.cc">ebt.eurocoins.cc</a>. It is a community project, independently operated and not the official EuroBillTracker application.</p>
    </section>

    <section aria-labelledby="scan-privacy-heading">
      <h2 id="scan-privacy-heading">Scanning and local storage</h2>
      <p>Text recognition uses PaddleOCR with PP-OCRv6 tiny models in your browser. The recognition models download on first use. Camera frames and captured scan images are processed on your device; the app does not upload them.</p>
      <p>Drafts, queued notes, saved locations, comments and camera preferences stay in this browser’s local storage. They are not synced between devices. Clearing this site’s data removes them. When you submit a batch, its note codes, denominations, locations and comments pass through the app’s server to EBT.</p>
    </section>

    <section aria-labelledby="login-privacy-heading">
      <h2 id="login-privacy-heading">Before you sign in</h2>
      <p>Your EBT email and password travel over HTTPS to this app’s server on Vercel, which forwards them over HTTPS to <a href="https://api.eurobilltracker.com/">api.eurobilltracker.com</a>. The app’s server handles your password during that request. This is a password-based login through an independent client, not an EBT-hosted sign-in page.</p>
      <p>The application code does not save or log your password. It remains in the form’s memory while you enter it and after a failed sign-in; a successful sign-in clears the field. Your browser’s password manager may separately offer to save it.</p>
      <p>After a successful login, EBT returns a session ID. The app stores it in a Secure, HttpOnly, SameSite=Lax cookie on this site. HttpOnly prevents the app’s browser JavaScript from reading that cookie; the browser sends it to the app’s server for authenticated EBT requests.</p>
      <p>By default, the cookie has no persistent expiry. Browser session restoration may retain session cookies. The unchecked “Remember me for up to 30 days” option adds a 30-day lifetime. EBT can expire the session sooner. Sign out requests EBT logout and checks that the old session is rejected before clearing the cookie. If EBT confirmation fails, you can retry or explicitly sign out on this device only; local-only sign-out does not confirm upstream invalidation. Older remember-me cookies keep their original lifetime until you sign out and sign in again.</p>
      <p>While signed in, the app can retrieve your EBT profile, previous locations and comments, and note journeys, and submit batches you choose to send. Account responses and submission receipts stay in page memory; the app has no database for these records. EBT handles submitted data under its own policies.</p>
    </section>

    <section aria-labelledby="services-heading">
      <h2 id="services-heading">Other services involved</h2>
      <p>Vercel serves the app and runs its server routes. Hosting infrastructure receives request information such as IP addresses, URLs and browser headers and may retain operational or security logs. Local OCR does not make visiting the site anonymous.</p>
      <p>Only when you click “Use my location” does the app request your position and send coordinates rounded to four decimal places directly to Photon (photon.komoot.io) for an address lookup. Photon also receives your IP address. Coordinates are not routed through the app server or saved by the app; the resulting address is saved with your draft.</p>
      <p>When EBT maps are displayed, your browser requests those images from EBT. External links open the linked service. The application code includes no advertising or analytics SDK.</p>
    </section>

    <section aria-labelledby="source-heading">
      <h2 id="source-heading">Source code and review status</h2>
      <p>The frontend and backend source are public under the MIT license in <a href="https://github.com/JnKamas/ebt-web" target="_blank" rel="noopener noreferrer">JnKamas/ebt-web</a>. Bundled dependencies and model files retain their upstream licenses. Production uses the main branch; development previews use develop.</p>
      <ul className="source-links">
        <li><a href="https://github.com/JnKamas/ebt-web/blob/main/app/api/ebt/login/route.ts" target="_blank" rel="noopener noreferrer">Login route: how credentials are forwarded</a></li>
        <li><a href="https://github.com/JnKamas/ebt-web/blob/main/app/api/ebt/shared.ts" target="_blank" rel="noopener noreferrer">EBT transport and session cookie settings</a></li>
        <li><a href="https://github.com/JnKamas/ebt-web/tree/main/app/api/ebt" target="_blank" rel="noopener noreferrer">Backend routes, including submission and logout</a></li>
        <li><a href="https://github.com/JnKamas/ebt-web/blob/main/REVIEW.md" target="_blank" rel="noopener noreferrer">Internal review, tests and known limitations</a></li>
        <li><a href="https://github.com/JnKamas/ebt-web/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">How to report a security concern</a></li>
      </ul>
      <p>The project has automated tests and an internal code review. These are not an independent security audit. No independent audit is published here, and this explanation is not proof of how a deployed server is configured.</p>
      <p>If you prefer to evaluate the scanner before trusting it with your EBT account, leave sign-in unused. You can prepare notes locally and use the official <a href="https://www.eurobilltracker.com/" target="_blank" rel="noopener noreferrer">EuroBillTracker website</a> to enter them.</p>
    </section>
  </main>;
}
