import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VvibeCoder Sim",
  description: "A vibe-coding simulator: keep your balance and ship the project to production.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className="antialiased">{children}</body>
    </html>
  );
}
