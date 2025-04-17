import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from 'path';
import { loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      // Custom plugin to prevent Playwright from being bundled
      {
        name: 'exclude-playwright',
        enforce: 'pre',
        resolveId(id) {
          if (id.includes('playwright') || id.includes('chromium-bidi')) {
            return { id: 'virtual:empty-module', external: true };
          }
          return null;
        },
        load(id) {
          if (id === 'virtual:empty-module') {
            return 'export default {}; export const chromium = {};';
          }
          return null;
        }
      }
    ],
    build: {
      rollupOptions: {
        external: [
          "google",
          "playwright",
          "playwright-core",
          "@playwright/test",
          "chromium-bidi",
          "chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
          "chromium-bidi/lib/cjs/cdp/CdpConnection"
        ],
      },
      assetsInlineLimit: 0, // Ensure images are not inlined
    },
    optimizeDeps: {
      exclude: [
        "playwright",
        "playwright-core",
        "@playwright/test",
        "chromium-bidi"
      ]
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          secure: false
        },
      },
      hmr: {
        overlay: true
      }
    },
    resolve: {
      alias: {
        // Create empty modules for Playwright-related imports
        'playwright': resolve(__dirname, 'src/utils/empty-module.js'),
        'playwright-core': resolve(__dirname, 'src/utils/empty-module.js'),
        '@playwright/test': resolve(__dirname, 'src/utils/empty-module.js'),
        'chromium-bidi': resolve(__dirname, 'src/utils/empty-module.js'),
        // Allow proper handling of Leaflet assets
        'leaflet': resolve(__dirname, 'node_modules/leaflet')
      }
    },
    // Pass environment variables to client
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY),
      'import.meta.env.VITE_MAPBOX_TOKEN': JSON.stringify(env.MAPBOX_TOKEN),
    }
  };
});
