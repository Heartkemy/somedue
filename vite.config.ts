import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [solid(), tailwind()],
  server: { port: 1420, strictPort: true },
  preview: { allowedHosts: ["host.docker.internal"] },
  clearScreen: false,
});
