import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VDO Sample Page Manager",
  description: "Clone any public webpage into a local, served route.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
