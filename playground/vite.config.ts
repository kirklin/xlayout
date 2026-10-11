import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3420,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      { find: /^xlayout\/(.+)$/, replacement: fileURLToPath(new URL("../src/$1/index.ts", import.meta.url)) },
      { find: /^xlayout$/, replacement: fileURLToPath(new URL("../src/index.ts", import.meta.url)) },
      // A "~/" key only matches once Vite trims it to "~", which it skips on Windows where the folder path ends in "\"
      { find: "~", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
});
