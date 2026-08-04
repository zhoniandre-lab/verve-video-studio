import type { Metadata, Viewport } from "next";
import "./globals.css";
import PengumumanBanner from "./pengumuman-banner";

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
          (function(){
            var VERSION_KEY = 'verve_app_version_v1';
            var RELOAD_KEY = 'verve_app_reloaded_for_version_v1';
            function checkVersion(){
              try {
                fetch('/api/version?t=' + Date.now(), { cache: 'no-store' })
                  .then(function(r){ return r.ok ? r.json() : null; })
                  .then(function(j){
                    if (!j || !j.version) return;
                    var old = localStorage.getItem(VERSION_KEY);
                    if (old && old !== j.version && sessionStorage.getItem(RELOAD_KEY) !== j.version) {
                      sessionStorage.setItem(RELOAD_KEY, j.version);
                      if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.getRegistrations().then(function(regs){
                          return Promise.all(regs.map(function(reg){ return reg.update().catch(function(){}); }));
                        }).finally(function(){ location.reload(); });
                      } else location.reload();
                    }
                    localStorage.setItem(VERSION_KEY, j.version);
                  }).catch(function(){});
              } catch(e) {}
            }
            window.addEventListener('load', function(){ setTimeout(checkVersion, 1200); });
            document.addEventListener('visibilitychange', function(){ if (!document.hidden) checkVersion(); });
            setInterval(checkVersion, 60000);

            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function(reg) {
                  try { reg.update(); } catch(e) {}
                  reg.addEventListener('updatefound', function() {
                    var newWorker = reg.installing;
                    if (newWorker) {
                      newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                          window.location.reload();
                        }
                      });
                    }
                  });
                }).catch(function() {});
                var refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                  if (!refreshing) { refreshing = true; window.location.reload(); }
                });
              });
            }
          })();
        ` }} />
      </head>
      <body className="antialiased">
        <PengumumanBanner />
        {children}
      </body>
    </html>
  );
}
