import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
export default defineConfig({
  envDir: "../..",
  plugins: [
    react(),
    {
      name: "precache-build-assets",
      closeBundle() {
        const assets = readdirSync("dist/assets").map(
          (name) => "/assets/" + name,
        );
        const file = "dist/sw.js";
        writeFileSync(
          file,
          readFileSync(file, "utf8").replace(
            "['/','/icon.svg','/manifest.webmanifest']",
            JSON.stringify([
              "/",
              "/icon.svg",
              "/icon-192.png",
              "/icon-512.png",
              "/manifest.webmanifest",
              ...assets,
            ]),
          ),
        );
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
