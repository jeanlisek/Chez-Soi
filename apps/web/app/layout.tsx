import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chez Soi · Mieux, chez soi !",
  description:
    "Mieux, chez soi ! Filmez le logement, recevez un plan de sécurité adapté à ses occupants, et laissez l'agent préparer les actions.",
};

export const viewport: Viewport = {
  themeColor: "#9DB2F2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preload" href="/fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
