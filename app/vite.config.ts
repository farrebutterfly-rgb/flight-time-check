import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One HTML file with every screenshot inlined, so the program opens with a double click.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: { fs: { allow: [".."] } },
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 10_000 },
});
