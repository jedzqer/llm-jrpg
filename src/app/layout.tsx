import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM JRPG",
  description: "A Next.js starter for building an LLM-powered role-playing game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
