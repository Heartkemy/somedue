import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [solid(), tailwind()],
  build: { target: "safari16" },
  server: { port: 1420, strictPort: true },
  preview: { allowedHosts: ["host.docker.internal"] },
  clearScreen: false,
});
