import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EBT Scanner",
  description: "Fast, private EuroBillTracker note entry.",
  applicationName: "EBT Scanner",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "EBT Scanner" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" }
};

export const viewport: Viewport = {
  themeColor: "#071b2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions may add a class to the root element before React hydrates.
  // The app does not depend on root attributes, so avoid a false hydration warning.
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
