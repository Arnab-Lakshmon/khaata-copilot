import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Khaata Copilot",
  description: "A clear command centre for Indian shop owners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
