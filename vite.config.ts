import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { seoPlugin } from "./scripts/vite-plugin-seo.ts";

// "@" → "src/" path alias. Mirrors the "paths" mapping in tsconfig.app.json.
// Manual alias per Prompt #2 §6 (vite-tsconfig-paths OR manual resolve.alias).
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

const allowedDevtoolsPlugins = new Set([
  "@tanstack/devtools:inject-source",
  "@tanstack/devtools:custom-server",
  "@tanstack/devtools:remove-devtools-on-build",
]);

const tanstackDevtools = devtools({
  injectSource: { enabled: true },
  removeDevtoolsOnBuild: true,
  eventBusConfig: { enabled: false },
  enhancedLogs: { enabled: false },
  consolePiping: { enabled: false },
  editor: {
    name: "VSCode",
    open: async (filePath, lineNumber, columnNumber) => {
      const target = `${filePath}${lineNumber ? `:${lineNumber}` : ""}${columnNumber ? `:${columnNumber}` : ""}`;
      if (process.platform === "win32") {
        execFile("cmd.exe", ["/d", "/s", "/c", "code", "-r", "-g", target], { windowsHide: true });
      } else {
        execFile("code", ["-r", "-g", target]);
      }
    },
  },
}).filter((plugin) => allowedDevtoolsPlugins.has(plugin.name));

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(
      JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version,
    ),
  },
  plugins: [
    ...tanstackDevtools,
    react(),
    tailwindcss(),
    seoPlugin(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: false,
      includeAssets: [
        "favicon.ico",
        "favicon.svg",
        "apple-touch-icon.png",
        "android-chrome-192x192.png",
        "android-chrome-512x512.png",
        "web-app-manifest-192x192.png",
        "web-app-manifest-512x512.png",
        "icons/*.png",
        "sounds/*.mp3",
      ],
      workbox: {
        importScripts: ["/sw-custom.js"],
        globPatterns: ["**/*.{js,css,html,svg,woff2,mp3}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//, /^\/\.netlify\//],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" &&
              !url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/functions/") &&
              !url.pathname.startsWith("/.netlify/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "app-shell",
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin &&
              (request.destination === "script" ||
                request.destination === "style" ||
                request.destination === "font"),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/avatars\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "avatars",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/functions\/v1\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: { alias },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
