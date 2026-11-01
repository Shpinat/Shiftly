import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const lucideUpstream = fileURLToPath(import.meta.resolve("lucide-react"));
const rechartsUpstream = fileURLToPath(import.meta.resolve("recharts"));

export default defineConfig({
  base: "/Shiftly/",
  resolve: {
    alias: {
      "@": rootDir,
      "lucide-react": fileURLToPath(new URL("./lib/lucide-react.tsx", import.meta.url)),
      "lucide-react-upstream": lucideUpstream,
      "recharts": fileURLToPath(new URL("./lib/recharts.tsx", import.meta.url)),
      "recharts-upstream": rechartsUpstream
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        id: "/Shiftly/",
        name: "Shiftly — Shift Tracker",
        short_name: "Shiftly",
        description: "Offline shift, break and earnings tracker",
        theme_color: "#1A5CE5",
        background_color: "#FAF8FF",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/Shiftly/",
        scope: "/Shiftly/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        cleanupOutdatedCaches: true
      }
    })
  ],
  build: { outDir: "dist", sourcemap: true }
});