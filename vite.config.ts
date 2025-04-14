import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from 'path';
import { loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        external: ["google"],
      },
      assetsInlineLimit: 0, // Ensure images are not inlined
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
        // Allow proper handling of Leaflet assets
        leaflet: resolve(__dirname, 'node_modules/leaflet')
      }
    },
    // Pass environment variables to client
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY),
      'import.meta.env.VITE_MAPBOX_TOKEN': JSON.stringify(env.MAPBOX_TOKEN),
    }
  };
});
