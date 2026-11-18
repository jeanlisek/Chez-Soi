import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chez Soi",
  description:
    "Mieux, chez soi ! Filmez le logement, recevez un plan de sécurité adapté à ses occupants, et laissez l'agent préparer les actions.",
};

export const viewport: Viewport = {
  themeColor: "#9db0f2",
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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
