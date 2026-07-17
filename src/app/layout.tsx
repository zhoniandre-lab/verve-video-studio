import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verve AI Video Studio",
  description: "AI-Powered Video Generator — Slideshow + Text-to-Video + Audio Spectrum Visualizer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
