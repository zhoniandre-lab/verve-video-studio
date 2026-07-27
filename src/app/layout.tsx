import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VERVE — Studio Video & Musik AI",
  description: "Editor video ala profesional langsung dari HP: timeline, transisi, teks, stiker, keterangan otomatis, musik AI, dan Spectrum Studio.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0b0b10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="apple-touch-icon" href="/icons/icon-512x512.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Bangers&family=Bebas+Neue&family=Caveat:wght@700&family=Dancing+Script:wght@700&family=Lobster&family=Lora:ital,wght@0,700;1,600&family=Merriweather:wght@900&family=Montserrat:ital,wght@0,800;0,900;1,700&family=Oswald:wght@600;700&family=Pacifico&family=Playfair+Display:ital,wght@0,800;1,700&family=Poppins:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Quicksand:wght@700&family=Righteous&family=Rubik:ital,wght@0,800;1,700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function() {});
            });
          }
        ` }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
