import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import "./globals.css";

// Figtree for UI: humanist and friendly without being cute. Fraunces for the
// few display moments ("Ellie is with you this weekend") where warmth matters
// more than density.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CoNest",
  description:
    "A calm, shared home for your family's schedule across two homes.",
  applicationName: "CoNest",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CoNest",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#232120" },
  ],
  width: "device-width",
  initialScale: 1,
  // Phone-primary app: pinch-zoom stays enabled on purpose. Locking it is a
  // common PWA reflex and an accessibility regression.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
