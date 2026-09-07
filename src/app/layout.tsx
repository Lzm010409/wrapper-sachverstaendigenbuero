import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fallakte — Sachverständigenbüro",
  description:
    "Wrapper für autoiXpert, Pipedrive und sevDesk: Fallakte, WBW-Recherche und Kürzungsübersicht an einer Stelle.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
