import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/admin-dashboard",
  build: {
    outDir: "build",
  },
  plugins: [nodePolyfills()],
});
