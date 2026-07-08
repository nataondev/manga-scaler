import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [
    svelte({
      onwarn: (warning, handler) => {
        if (warning.code.startsWith("a11y")) return;
        handler(warning);
      },
    }),
  ],
  publicDir: "static",
  build: {
    outDir: "../public",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
      "/public": "http://localhost:5000",
    },
  },
});
