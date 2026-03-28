import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plan4Eagles",
  description: "Academic planning platform for Boston College students",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
